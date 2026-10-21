import {
  BaseCheckpointSaver,
  type ChannelVersions,
  type Checkpoint,
  type CheckpointListOptions,
  type CheckpointMetadata,
  type CheckpointTuple,
  type PendingWrite,
  type CheckpointPendingWrite,
} from "@langchain/langgraph-checkpoint";
import type { RunnableConfig } from "@langchain/core/runnables";
import { prisma } from "@/lib/db";

interface StoredBlob {
  type: string;
  data: string;
}

function isStoredBlob(v: unknown): v is StoredBlob {
  return typeof v === "object" && v !== null && "type" in v && "data" in v;
}

/**
 * A LangGraph checkpointer backed by Postgres through Prisma.
 *
 * This is what makes the human-in-the-loop interrupt real rather than
 * theatrical: when the graph pauses at `human_approval`, its entire state is
 * durable. The server can restart, the reviewer can come back on Monday, and
 * `resumeAfterApproval` picks the run up exactly where it stopped.
 */
export class PrismaCheckpointSaver extends BaseCheckpointSaver {
  private async dump(value: unknown): Promise<StoredBlob> {
    const [type, bytes] = await this.serde.dumpsTyped(value);
    return { type, data: Buffer.from(bytes).toString("base64") };
  }

  private async load<T>(blob: unknown): Promise<T> {
    if (!isStoredBlob(blob)) throw new Error("Corrupt checkpoint blob in database");
    return (await this.serde.loadsTyped(blob.type, Buffer.from(blob.data, "base64"))) as T;
  }

  private static ids(config: RunnableConfig) {
    const cfg = (config.configurable ?? {}) as Record<string, unknown>;
    return {
      threadId: String(cfg.thread_id ?? ""),
      checkpointNs: String(cfg.checkpoint_ns ?? ""),
      checkpointId: cfg.checkpoint_id ? String(cfg.checkpoint_id) : undefined,
    };
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const { threadId, checkpointNs, checkpointId } = PrismaCheckpointSaver.ids(config);
    if (!threadId) return undefined;

    const row = checkpointId
      ? await prisma.agentCheckpoint.findUnique({
          where: { threadId_checkpointNs_checkpointId: { threadId, checkpointNs, checkpointId } },
        })
      : await prisma.agentCheckpoint.findFirst({
          where: { threadId, checkpointNs },
          orderBy: [{ createdAt: "desc" }, { checkpointId: "desc" }],
        });

    if (!row) return undefined;

    const checkpoint = await this.load<Checkpoint>(row.checkpoint);
    const metadata = (row.metadata ?? {}) as CheckpointMetadata;

    const writeRows = await prisma.agentCheckpointWrite.findMany({
      where: { threadId, checkpointNs, checkpointId: row.checkpointId },
      orderBy: [{ taskId: "asc" }, { idx: "asc" }],
    });

    const pendingWrites: CheckpointPendingWrite[] = [];
    for (const w of writeRows) {
      pendingWrites.push([w.taskId, w.channel, await this.load<unknown>(w.value)]);
    }

    return {
      config: {
        configurable: { thread_id: threadId, checkpoint_ns: checkpointNs, checkpoint_id: row.checkpointId },
      },
      checkpoint,
      metadata,
      parentConfig: row.parentCheckpointId
        ? {
            configurable: {
              thread_id: threadId,
              checkpoint_ns: checkpointNs,
              checkpoint_id: row.parentCheckpointId,
            },
          }
        : undefined,
      pendingWrites,
    };
  }

  async *list(config: RunnableConfig, options?: CheckpointListOptions): AsyncGenerator<CheckpointTuple> {
    const { threadId, checkpointNs } = PrismaCheckpointSaver.ids(config);
    if (!threadId) return;

    const before = options?.before?.configurable?.checkpoint_id as string | undefined;
    const rows = await prisma.agentCheckpoint.findMany({
      where: {
        threadId,
        checkpointNs,
        ...(before ? { checkpointId: { lt: before } } : {}),
      },
      orderBy: { checkpointId: "desc" },
      take: options?.limit,
    });

    for (const row of rows) {
      yield {
        config: {
          configurable: { thread_id: threadId, checkpoint_ns: checkpointNs, checkpoint_id: row.checkpointId },
        },
        checkpoint: await this.load<Checkpoint>(row.checkpoint),
        metadata: (row.metadata ?? {}) as CheckpointMetadata,
        parentConfig: row.parentCheckpointId
          ? {
              configurable: {
                thread_id: threadId,
                checkpoint_ns: checkpointNs,
                checkpoint_id: row.parentCheckpointId,
              },
            }
          : undefined,
      };
    }
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    _newVersions: ChannelVersions,
  ): Promise<RunnableConfig> {
    const { threadId, checkpointNs, checkpointId: parentCheckpointId } = PrismaCheckpointSaver.ids(config);
    if (!threadId) throw new Error("PrismaCheckpointSaver.put requires configurable.thread_id");

    const blob = await this.dump(checkpoint);
    const key = { threadId, checkpointNs, checkpointId: checkpoint.id };

    await prisma.agentCheckpoint.upsert({
      where: { threadId_checkpointNs_checkpointId: key },
      create: {
        ...key,
        parentCheckpointId: parentCheckpointId ?? null,
        type: blob.type,
        checkpoint: blob as unknown as object,
        metadata: (metadata ?? {}) as unknown as object,
      },
      update: {
        parentCheckpointId: parentCheckpointId ?? null,
        type: blob.type,
        checkpoint: blob as unknown as object,
        metadata: (metadata ?? {}) as unknown as object,
      },
    });

    return {
      configurable: { thread_id: threadId, checkpoint_ns: checkpointNs, checkpoint_id: checkpoint.id },
    };
  }

  async putWrites(config: RunnableConfig, writes: PendingWrite[], taskId: string): Promise<void> {
    const { threadId, checkpointNs, checkpointId } = PrismaCheckpointSaver.ids(config);
    if (!threadId || !checkpointId) throw new Error("PrismaCheckpointSaver.putWrites requires a checkpoint id");

    const rows = await Promise.all(
      writes.map(async ([channel, value], idx) => {
        const blob = await this.dump(value);
        return { threadId, checkpointNs, checkpointId, taskId, idx, channel, type: blob.type, value: blob };
      }),
    );

    await prisma.$transaction(
      rows.map((row) =>
        prisma.agentCheckpointWrite.upsert({
          where: {
            threadId_checkpointNs_checkpointId_taskId_idx: {
              threadId: row.threadId,
              checkpointNs: row.checkpointNs,
              checkpointId: row.checkpointId,
              taskId: row.taskId,
              idx: row.idx,
            },
          },
          create: { ...row, value: row.value as unknown as object },
          update: { channel: row.channel, type: row.type, value: row.value as unknown as object },
        }),
      ),
    );
  }

  async deleteThread(threadId: string): Promise<void> {
    await prisma.$transaction([
      prisma.agentCheckpointWrite.deleteMany({ where: { threadId } }),
      prisma.agentCheckpoint.deleteMany({ where: { threadId } }),
    ]);
  }
}

let saver: PrismaCheckpointSaver | null = null;

export function getCheckpointer(): PrismaCheckpointSaver {
  saver ??= new PrismaCheckpointSaver();
  return saver;
}

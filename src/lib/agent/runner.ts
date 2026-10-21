import { Command, isGraphInterrupt } from "@langchain/langgraph";
import type { ApprovalDecision } from "@prisma/client";
import { AgentRunStatus, PostStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError, errorMessage, notFound } from "@/lib/errors";
import type { ContentBrief, GeneratedContent, QualityReport } from "@/lib/ai/types";
import { applyApprovalDecision } from "@/lib/services/approvals";
import { contentAgent } from "./graph";
import type { AgentNodeName, AgentStateType } from "./state";
import { upsertAgentRun } from "./persistence";
import type { ApprovalResumePayload } from "./nodes";

export interface AgentRunSummary {
  threadId: string;
  postId: string;
  status: "awaiting_approval" | "completed" | "failed";
  content: GeneratedContent | null;
  qualityReport: QualityReport | null;
  suggestedTime: string | null;
  nodeHistory: AgentNodeName[];
  approved: boolean;
  scheduleId: string | null;
  publishResult: AgentStateType["publishResult"];
  errors: AgentStateType["errors"];
  provider: string;
  model: string;
}

function threadConfig(threadId: string) {
  return { configurable: { thread_id: threadId }, recursionLimit: 25 };
}

async function summarise(threadId: string, postId: string): Promise<AgentRunSummary> {
  const snapshot = await contentAgent().getState(threadConfig(threadId));
  const state = snapshot.values as AgentStateType;
  const paused = (snapshot.tasks ?? []).some((t) => (t.interrupts?.length ?? 0) > 0) || snapshot.next.length > 0;

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { aiProvider: true, aiModel: true },
  });

  return {
    threadId,
    postId,
    status: paused ? "awaiting_approval" : "completed",
    content: state.content ?? null,
    qualityReport: state.qualityReport ?? null,
    suggestedTime: state.suggestedTime ?? null,
    nodeHistory: state.nodeHistory ?? [],
    approved: Boolean(state.approved),
    scheduleId: state.scheduleId ?? null,
    publishResult: state.publishResult ?? null,
    errors: state.errors ?? [],
    provider: post?.aiProvider ?? "unknown",
    model: post?.aiModel ?? "unknown",
  };
}

/**
 * Runs the agent from START until it reaches the human approval interrupt.
 *
 * The returned run is *paused*, not finished: its state is checkpointed in
 * Postgres and it will not advance until `resolveApproval` feeds it a real
 * human decision.
 */
export async function startContentRun(input: {
  userId: string;
  brief: ContentBrief;
  postId?: string | null;
}): Promise<AgentRunSummary> {
  const threadId = `run_${crypto.randomUUID()}`;

  await upsertAgentRun({
    threadId,
    userId: input.userId,
    postId: input.postId ?? null,
    status: AgentRunStatus.RUNNING,
    currentNode: "parse_request",
  });

  try {
    await contentAgent().invoke(
      {
        userId: input.userId,
        brief: input.brief,
        postId: input.postId ?? null,
        startedAt: new Date().toISOString(),
      },
      threadConfig(threadId),
    );
  } catch (error) {
    // A GraphInterrupt is the expected outcome: it means the workflow reached
    // the approval gate and is now waiting for a person.
    if (!isGraphInterrupt(error)) {
      const message = errorMessage(error);
      await upsertAgentRun({
        threadId,
        userId: input.userId,
        postId: input.postId ?? null,
        status: AgentRunStatus.FAILED,
        error: message,
        finished: true,
      });
      throw error instanceof AppError ? error : new AppError("PROVIDER_ERROR", message);
    }
  }

  const snapshot = await contentAgent().getState(threadConfig(threadId));
  const state = snapshot.values as AgentStateType;
  const postId = state.postId;
  if (!postId) throw new AppError("INTERNAL", "The agent finished without producing a post.");

  const summary = await summarise(threadId, postId);

  await upsertAgentRun({
    threadId,
    userId: input.userId,
    postId,
    status: summary.status === "awaiting_approval" ? AgentRunStatus.AWAITING_APPROVAL : AgentRunStatus.COMPLETED,
    currentNode: summary.status === "awaiting_approval" ? "human_approval" : (summary.nodeHistory.at(-1) ?? null),
    nodeHistory: summary.nodeHistory,
    state: {
      content: summary.content,
      qualityReport: summary.qualityReport,
      suggestedTime: summary.suggestedTime,
      approved: summary.approved,
    },
    finished: summary.status !== "awaiting_approval",
  });

  return summary;
}

/** The paused run for a post, if there is one. */
export async function findPausedRun(postId: string) {
  return prisma.agentRun.findFirst({
    where: { postId, status: AgentRunStatus.AWAITING_APPROVAL },
    orderBy: { startedAt: "desc" },
  });
}

export interface ResolveApprovalInput {
  postId: string;
  reviewerId: string;
  decision: ApprovalDecision;
  feedback?: string | null;
  scheduledFor?: Date | null;
  publishNow?: boolean;
}

/**
 * Feeds a human decision back into the workflow.
 *
 * If the post came from an agent run that is still paused, the decision resumes
 * that graph — the approval, scheduling and publishing nodes all run inside the
 * original workflow, with full checkpoint history. If it did not (a manually
 * written post, or seeded demo content), the same approval service is called
 * directly. Either way the recorded outcome is identical.
 */
export async function resolveApproval(input: ResolveApprovalInput): Promise<{
  viaAgent: boolean;
  status: PostStatus;
  summary?: AgentRunSummary;
}> {
  const post = await prisma.post.findUnique({ where: { id: input.postId }, select: { id: true, userId: true } });
  if (!post) throw notFound("Post not found.");

  const run = await findPausedRun(input.postId);

  if (!run) {
    const { status } = await applyApprovalDecision({
      postId: input.postId,
      reviewerId: input.reviewerId,
      decision: input.decision,
      feedback: input.feedback,
    });
    return { viaAgent: false, status };
  }

  const payload: ApprovalResumePayload = {
    decision: input.decision,
    reviewerId: input.reviewerId,
    feedback: input.feedback ?? undefined,
    scheduledFor: input.scheduledFor?.toISOString(),
    publishNow: input.publishNow,
  };

  try {
    await contentAgent().invoke(new Command({ resume: payload }), threadConfig(run.threadId));
  } catch (error) {
    if (!isGraphInterrupt(error)) {
      const message = errorMessage(error);
      await upsertAgentRun({
        threadId: run.threadId,
        userId: post.userId,
        postId: post.id,
        status: AgentRunStatus.FAILED,
        error: message,
        finished: true,
      });
      throw error;
    }
  }

  const summary = await summarise(run.threadId, input.postId);
  const updated = await prisma.post.findUniqueOrThrow({ where: { id: input.postId }, select: { status: true } });

  await upsertAgentRun({
    threadId: run.threadId,
    userId: post.userId,
    postId: post.id,
    status: summary.status === "awaiting_approval" ? AgentRunStatus.AWAITING_APPROVAL : AgentRunStatus.COMPLETED,
    currentNode: summary.nodeHistory.at(-1) ?? null,
    nodeHistory: summary.nodeHistory,
    state: {
      approved: summary.approved,
      publishResult: summary.publishResult,
      qualityReport: summary.qualityReport,
    },
    finished: summary.status !== "awaiting_approval",
  });

  return { viaAgent: true, status: updated.status, summary };
}

/** The agent trace shown on a post's detail page. */
export async function getAgentTrace(postId: string) {
  const runs = await prisma.agentRun.findMany({
    where: { postId },
    orderBy: { startedAt: "desc" },
    take: 5,
  });
  return runs.map((run) => ({
    id: run.id,
    threadId: run.threadId,
    status: run.status,
    currentNode: run.currentNode,
    nodeHistory: (run.nodeHistory ?? []) as AgentNodeName[],
    error: run.error,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
  }));
}

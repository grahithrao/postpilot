import { Prisma, PostStatus, RevisionSource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { sanitizeHashtags, sanitizeSingleLine, sanitizeText } from "@/lib/security/sanitize";
import type { ContentBrief, GeneratedContent, QualityReport } from "@/lib/ai/types";
import type { AgentNodeName, AgentStateType } from "./state";

/**
 * Database side effects for the agent graph.
 *
 * Kept apart from the node logic so the graph reads as a workflow rather than a
 * pile of queries, and so every write the agent performs is auditable in one file.
 */

export function toPostContentUpdate(content: GeneratedContent) {
  return {
    headline: content.headline ? sanitizeSingleLine(content.headline, 300) : null,
    caption: sanitizeText(content.caption),
    hashtags: sanitizeHashtags(content.hashtags),
    cta: content.cta ? sanitizeSingleLine(content.cta, 300) : null,
    imagePrompt: content.imagePrompt ? sanitizeText(content.imagePrompt, 2000) : null,
  };
}

export function briefFromPost(post: {
  topic: string;
  product: string | null;
  audience: string | null;
  platform: ContentBrief["platform"];
  contentType: ContentBrief["contentType"];
  tone: ContentBrief["tone"];
  length: ContentBrief["length"];
  language: string;
  ctaRequest: string | null;
  keywords: string[];
  hashtags: string[];
  notes: string | null;
}): ContentBrief {
  return {
    topic: post.topic,
    product: post.product,
    audience: post.audience,
    platform: post.platform,
    contentType: post.contentType,
    tone: post.tone,
    length: post.length,
    language: post.language,
    ctaRequest: post.ctaRequest,
    keywords: post.keywords,
    hashtags: post.hashtags,
    notes: post.notes,
  };
}

export async function createDraftPost(state: AgentStateType): Promise<string> {
  const post = await prisma.post.create({
    data: {
      userId: state.userId,
      topic: sanitizeSingleLine(state.brief.topic, 300),
      product: state.brief.product ? sanitizeSingleLine(state.brief.product, 200) : null,
      audience: state.brief.audience ? sanitizeSingleLine(state.brief.audience, 200) : null,
      contentType: state.brief.contentType,
      tone: state.brief.tone,
      length: state.brief.length,
      language: state.brief.language,
      keywords: state.brief.keywords,
      hashtags: state.brief.hashtags,
      ctaRequest: state.brief.ctaRequest ? sanitizeSingleLine(state.brief.ctaRequest, 200) : null,
      notes: state.brief.notes ? sanitizeText(state.brief.notes, 1000) : null,
      platform: state.brief.platform,
      caption: "",
      status: PostStatus.DRAFT,
      version: 0,
    },
    select: { id: true },
  });
  return post.id;
}

export async function persistGeneratedContent(opts: {
  postId: string;
  userId: string;
  content: GeneratedContent;
  source: RevisionSource;
  changeSummary: string;
  provider: string;
  model: string;
  latencyMs: number;
  suggestedTime?: Date | null;
}): Promise<number> {
  const contentUpdate = toPostContentUpdate(opts.content);

  return prisma.$transaction(async (tx) => {
    const current = await tx.post.findUniqueOrThrow({
      where: { id: opts.postId },
      select: { version: true },
    });
    const version = current.version + 1;

    await tx.post.update({
      where: { id: opts.postId },
      data: {
        ...contentUpdate,
        version,
        aiProvider: opts.provider,
        aiModel: opts.model,
        generatedMs: opts.latencyMs,
        ...(opts.suggestedTime ? { suggestedTime: opts.suggestedTime } : {}),
      },
    });

    await tx.postRevision.create({
      data: {
        postId: opts.postId,
        version,
        source: opts.source,
        changeSummary: opts.changeSummary,
        authorId: null,
        ...contentUpdate,
        snapshot: opts.content as unknown as Prisma.InputJsonValue,
      },
    });

    return version;
  });
}

export async function persistQualityReport(postId: string, report: QualityReport) {
  await prisma.post.update({
    where: { id: postId },
    data: {
      qualityScore: report.score,
      qualityReport: report as unknown as Prisma.InputJsonValue,
    },
  });
  await prisma.postRevision.updateMany({
    where: { postId, qualityScore: null },
    data: { qualityScore: report.score },
  });
}

export async function upsertAgentRun(opts: {
  threadId: string;
  userId: string;
  postId?: string | null;
  status: "RUNNING" | "AWAITING_APPROVAL" | "COMPLETED" | "FAILED" | "CANCELLED";
  currentNode?: AgentNodeName | null;
  nodeHistory?: AgentNodeName[];
  state?: unknown;
  error?: string | null;
  finished?: boolean;
}) {
  const data = {
    userId: opts.userId,
    postId: opts.postId ?? null,
    status: opts.status,
    currentNode: opts.currentNode ?? null,
    nodeHistory: (opts.nodeHistory ?? []) as unknown as Prisma.InputJsonValue,
    state: (opts.state ?? {}) as Prisma.InputJsonValue,
    error: opts.error ?? null,
    finishedAt: opts.finished ? new Date() : null,
  };

  return prisma.agentRun.upsert({
    where: { threadId: opts.threadId },
    create: { threadId: opts.threadId, ...data },
    update: data,
  });
}

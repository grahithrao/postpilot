import {
  ActivityType,
  ContentType,
  PostStatus,
  Platform,
  Prisma,
  RevisionSource,
  ScheduleStatus,
  Tone,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { forbidden, invalidState, notFound } from "@/lib/errors";
import { getProvider } from "@/lib/ai";
import { GENERATED_CONTENT_JSON_SCHEMA, parseGeneratedContent } from "@/lib/ai/schemas";
import { COPYWRITER_SYSTEM, buildRefinePrompt } from "@/lib/ai/prompts";
import { validateContent } from "@/lib/ai/validators";
import type { GeneratedContent } from "@/lib/ai/types";
import { sanitizeHashtags, sanitizeSingleLine, sanitizeText } from "@/lib/security/sanitize";
import { briefFromPost, toPostContentUpdate } from "@/lib/agent/persistence";
import type { ContentQuery, RefineAction } from "@/lib/validation/schemas";
import { logActivity } from "./activity";
import { isEditable } from "./post-status";

/** Statuses where an edit revokes a reviewer's sign-off. */
const APPROVAL_INVALIDATING_STATES: PostStatus[] = [
  PostStatus.APPROVED,
  PostStatus.SCHEDULED,
  PostStatus.FAILED,
];

const REFINE_SOURCE: Record<RefineAction["action"], RevisionSource> = {
  improve: RevisionSource.AI_IMPROVED,
  shorten: RevisionSource.AI_SHORTENED,
  expand: RevisionSource.AI_EXPANDED,
  rewrite: RevisionSource.AI_REWRITE,
  tone: RevisionSource.AI_TONE_SHIFT,
  regenerate: RevisionSource.AI_REGENERATED,
};

const REFINE_LABEL: Record<RefineAction["action"], string> = {
  improve: "Improved by the AI editor",
  shorten: "Shortened by the AI editor",
  expand: "Expanded by the AI editor",
  rewrite: "Rewritten by the AI editor",
  tone: "Tone changed by the AI editor",
  regenerate: "Regenerated from the original brief",
};

export const POST_DETAIL_INCLUDE = {
  socialAccount: true,
  revisions: {
    orderBy: { version: "desc" as const },
    include: { author: { select: { name: true } } },
  },
  approvals: { orderBy: { createdAt: "desc" as const }, include: { reviewer: { select: { name: true, email: true } } } },
  schedules: { orderBy: { createdAt: "desc" as const }, include: { socialAccount: true } },
  publishingLogs: { orderBy: { createdAt: "desc" as const }, take: 30 },
  automation: { select: { id: true, name: true } },
} satisfies Prisma.PostInclude;

export type PostDetail = Prisma.PostGetPayload<{ include: typeof POST_DETAIL_INCLUDE }>;

export async function getPost(postId: string, userId: string): Promise<PostDetail> {
  const post = await prisma.post.findUnique({ where: { id: postId }, include: POST_DETAIL_INCLUDE });
  if (!post) throw notFound("Post not found.");
  if (post.userId !== userId) throw forbidden("You do not own this post.");
  return post;
}

export async function listPosts(userId: string, query: ContentQuery) {
  const where: Prisma.PostWhereInput = { userId };

  if (query.status && query.status !== "ALL") where.status = query.status;
  if (query.platform && query.platform !== "ALL") where.platform = query.platform;

  if (query.q) {
    where.OR = [
      { topic: { contains: query.q, mode: "insensitive" } },
      { caption: { contains: query.q, mode: "insensitive" } },
      { headline: { contains: query.q, mode: "insensitive" } },
      { hashtags: { has: query.q.replace(/^#/, "") } },
    ];
  }

  const from = query.from ? new Date(query.from) : null;
  const to = query.to ? new Date(query.to) : null;
  if ((from && !Number.isNaN(from.getTime())) || (to && !Number.isNaN(to.getTime()))) {
    where.createdAt = {
      ...(from && !Number.isNaN(from.getTime()) ? { gte: from } : {}),
      ...(to && !Number.isNaN(to.getTime()) ? { lte: new Date(to.getTime() + 86_399_999) } : {}),
    };
  }

  const orderBy: Prisma.PostOrderByWithRelationInput =
    query.sort === "oldest"
      ? { createdAt: "asc" }
      : query.sort === "quality"
        ? { qualityScore: "desc" }
        : query.sort === "scheduled"
          ? { suggestedTime: "asc" }
          : { createdAt: "desc" };

  const [total, items] = await prisma.$transaction([
    prisma.post.count({ where }),
    prisma.post.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        socialAccount: { select: { handle: true, displayName: true, platform: true } },
        schedules: {
          where: { status: { in: [ScheduleStatus.PENDING, ScheduleStatus.QUEUED, ScheduleStatus.PUBLISHING] } },
          orderBy: { scheduledFor: "asc" },
          take: 1,
        },
        _count: { select: { revisions: true, approvals: true } },
      },
    }),
  ]);

  return {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export type PostListItem = Awaited<ReturnType<typeof listPosts>>["items"][number];

interface UpdatePostInput {
  headline?: string | null;
  caption?: string;
  hashtags?: string[];
  cta?: string | null;
  imagePrompt?: string | null;
  topic?: string;
  audience?: string | null;
  product?: string | null;
  tone?: Tone;
  contentType?: ContentType;
  socialAccountId?: string | null;
  changeSummary?: string;
}

/**
 * Applies a human edit.
 *
 * Editing content that a reviewer has already approved silently invalidates
 * that approval: the version is bumped, the post drops back to DRAFT, and any
 * pending schedule is cancelled. Approval is granted to a specific version of
 * the words, not to the post in the abstract.
 */
export async function updatePost(postId: string, userId: string, input: UpdatePostInput) {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw notFound("Post not found.");
  if (post.userId !== userId) throw forbidden("You do not own this post.");
  if (!isEditable(post.status)) {
    throw invalidState(`A post that is ${post.status.toLowerCase()} can no longer be edited.`);
  }

  if (input.socialAccountId) {
    const account = await prisma.socialAccount.findFirst({
      where: { id: input.socialAccountId, userId },
    });
    if (!account) throw notFound("Social account not found.");
    if (account.platform !== post.platform) {
      throw invalidState("The selected account is for a different platform.");
    }
  }

  const nextContent = {
    headline: input.headline !== undefined ? (input.headline ? sanitizeSingleLine(input.headline, 300) : null) : post.headline,
    caption: input.caption !== undefined ? sanitizeText(input.caption) : post.caption,
    hashtags: input.hashtags !== undefined ? sanitizeHashtags(input.hashtags) : post.hashtags,
    cta: input.cta !== undefined ? (input.cta ? sanitizeSingleLine(input.cta, 300) : null) : post.cta,
    imagePrompt:
      input.imagePrompt !== undefined ? (input.imagePrompt ? sanitizeText(input.imagePrompt, 2000) : null) : post.imagePrompt,
  };

  const contentChanged =
    nextContent.caption !== post.caption ||
    nextContent.headline !== post.headline ||
    nextContent.cta !== post.cta ||
    nextContent.imagePrompt !== post.imagePrompt ||
    nextContent.hashtags.join("|") !== post.hashtags.join("|");

  const wasApproved = APPROVAL_INVALIDATING_STATES.includes(post.status);
  const invalidatesApproval = contentChanged && wasApproved;

  const updated = await prisma.$transaction(async (tx) => {
    const version = contentChanged ? post.version + 1 : post.version;

    if (contentChanged) {
      await tx.postRevision.create({
        data: {
          postId,
          version,
          source: RevisionSource.HUMAN_EDIT,
          changeSummary: input.changeSummary ?? "Edited by hand.",
          authorId: userId,
          ...nextContent,
          snapshot: nextContent as unknown as Prisma.InputJsonValue,
        },
      });
    }

    if (invalidatesApproval) {
      await tx.schedule.updateMany({
        where: { postId, status: { in: [ScheduleStatus.PENDING, ScheduleStatus.QUEUED] } },
        data: { status: ScheduleStatus.CANCELLED, cancelledAt: new Date() },
      });
    }

    return tx.post.update({
      where: { id: postId },
      data: {
        ...nextContent,
        version,
        ...(input.topic ? { topic: sanitizeSingleLine(input.topic, 300) } : {}),
        ...(input.audience !== undefined
          ? { audience: input.audience ? sanitizeSingleLine(input.audience, 200) : null }
          : {}),
        ...(input.product !== undefined
          ? { product: input.product ? sanitizeSingleLine(input.product, 200) : null }
          : {}),
        ...(input.tone ? { tone: input.tone } : {}),
        ...(input.contentType ? { contentType: input.contentType } : {}),
        ...(input.socialAccountId !== undefined ? { socialAccountId: input.socialAccountId } : {}),
        ...(invalidatesApproval ? { status: PostStatus.DRAFT } : {}),
      },
      include: POST_DETAIL_INCLUDE,
    });
  });

  await logActivity({
    userId,
    postId,
    type: ActivityType.POST_EDITED,
    message: invalidatesApproval
      ? `Edited after approval. The post returned to draft at v${updated.version} and needs re-approval.`
      : contentChanged
        ? `Edited by hand (v${updated.version}).`
        : "Metadata updated.",
  });

  // Re-score the edited copy so the quality panel never shows a stale number.
  if (contentChanged) {
    const outcome = validateContent(briefFromPost(updated), {
      headline: updated.headline,
      caption: updated.caption,
      hashtags: updated.hashtags,
      cta: updated.cta ?? "",
      imagePrompt: updated.imagePrompt ?? "",
      timingRationale: "",
    });
    const existing = (updated.qualityReport ?? {}) as Record<string, unknown>;
    await prisma.post.update({
      where: { id: postId },
      data: {
        qualityScore: outcome.structuralScore,
        qualityReport: {
          ...existing,
          score: outcome.structuralScore,
          verdict: outcome.hardViolations.length ? "fail" : outcome.structuralScore >= 60 ? "pass" : "revise",
          checks: outcome.checks,
          hardViolations: outcome.hardViolations,
          scoredBy: "postpilot:rules (re-scored after a human edit)",
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  return getPost(postId, userId);
}

/** Runs one of the AI refinement actions against the current draft. */
export async function refinePost(postId: string, userId: string, action: RefineAction) {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw notFound("Post not found.");
  if (post.userId !== userId) throw forbidden("You do not own this post.");
  if (!isEditable(post.status)) {
    throw invalidState(`A post that is ${post.status.toLowerCase()} can no longer be refined.`);
  }

  const brief = briefFromPost(action.tone ? { ...post, tone: action.tone } : post);
  const current: GeneratedContent = {
    headline: post.headline,
    caption: post.caption,
    hashtags: post.hashtags,
    cta: post.cta ?? "",
    imagePrompt: post.imagePrompt ?? "",
    timingRationale: "",
  };

  const provider = getProvider();
  const result = await provider.generate({
    task: action.action,
    system: COPYWRITER_SYSTEM,
    prompt: buildRefinePrompt(action.action, brief, current, action.instruction || undefined),
    jsonSchema: GENERATED_CONTENT_JSON_SCHEMA,
    parse: parseGeneratedContent,
    context: { brief, current, variant: post.version, instruction: action.instruction || undefined },
    maxTokens: 2048,
  });

  const contentUpdate = toPostContentUpdate(result.data);
  const version = post.version + 1;
  const wasApproved = APPROVAL_INVALIDATING_STATES.includes(post.status);

  await prisma.$transaction(async (tx) => {
    if (wasApproved) {
      await tx.schedule.updateMany({
        where: { postId, status: { in: [ScheduleStatus.PENDING, ScheduleStatus.QUEUED] } },
        data: { status: ScheduleStatus.CANCELLED, cancelledAt: new Date() },
      });
    }
    await tx.post.update({
      where: { id: postId },
      data: {
        ...contentUpdate,
        version,
        tone: action.tone ?? post.tone,
        aiProvider: result.provider,
        aiModel: result.model,
        generatedMs: result.latencyMs,
        ...(wasApproved ? { status: PostStatus.DRAFT } : {}),
      },
    });
    await tx.postRevision.create({
      data: {
        postId,
        version,
        source: REFINE_SOURCE[action.action],
        changeSummary: action.instruction ? `${REFINE_LABEL[action.action]}: ${action.instruction}` : REFINE_LABEL[action.action],
        authorId: userId,
        ...contentUpdate,
        snapshot: result.data as unknown as Prisma.InputJsonValue,
      },
    });
  });

  // Keep the score honest after the rewrite.
  const refreshed = await prisma.post.findUniqueOrThrow({ where: { id: postId } });
  const outcome = validateContent(briefFromPost(refreshed), result.data);
  await prisma.post.update({
    where: { id: postId },
    data: {
      qualityScore: outcome.structuralScore,
      qualityReport: {
        score: outcome.structuralScore,
        verdict: outcome.hardViolations.length ? "fail" : outcome.structuralScore >= 60 ? "pass" : "revise",
        checks: outcome.checks,
        strengths: [],
        risks: outcome.hardViolations,
        suggestions: [],
        hardViolations: outcome.hardViolations,
        scoredBy: `${result.provider}:${result.model}`,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  await logActivity({
    userId,
    postId,
    type: ActivityType.POST_REGENERATED,
    message: `${REFINE_LABEL[action.action]} (v${version}, ${result.latencyMs}ms).`,
  });

  return getPost(postId, userId);
}

export async function duplicatePost(postId: string, userId: string) {
  const post = await getPost(postId, userId);

  const copy = await prisma.post.create({
    data: {
      userId,
      topic: post.topic,
      product: post.product,
      audience: post.audience,
      contentType: post.contentType,
      tone: post.tone,
      length: post.length,
      language: post.language,
      keywords: post.keywords,
      ctaRequest: post.ctaRequest,
      notes: post.notes,
      platform: post.platform,
      socialAccountId: post.socialAccountId,
      headline: post.headline,
      caption: post.caption,
      hashtags: post.hashtags,
      cta: post.cta,
      imagePrompt: post.imagePrompt,
      status: PostStatus.DRAFT,
      version: 1,
      qualityScore: post.qualityScore,
      qualityReport: (post.qualityReport ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      aiProvider: post.aiProvider,
      aiModel: post.aiModel,
    },
  });

  await prisma.postRevision.create({
    data: {
      postId: copy.id,
      version: 1,
      source: RevisionSource.HUMAN_EDIT,
      changeSummary: `Duplicated from ${post.id}.`,
      authorId: userId,
      headline: copy.headline,
      caption: copy.caption,
      hashtags: copy.hashtags,
      cta: copy.cta,
      imagePrompt: copy.imagePrompt,
    },
  });

  await logActivity({
    userId,
    postId: copy.id,
    type: ActivityType.POST_DUPLICATED,
    message: "Duplicated as a fresh draft. It needs its own approval.",
  });

  return copy;
}

export async function deletePost(postId: string, userId: string) {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw notFound("Post not found.");
  if (post.userId !== userId) throw forbidden("You do not own this post.");
  if (post.status === PostStatus.PUBLISHING) {
    throw invalidState("This post is mid-publish and cannot be deleted.");
  }

  await prisma.post.delete({ where: { id: postId } });
  await logActivity({
    userId,
    type: ActivityType.POST_DELETED,
    message: `Deleted "${post.topic}".`,
  });
  return { ok: true };
}

export { Platform, PostStatus };

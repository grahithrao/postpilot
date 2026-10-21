import { interrupt } from "@langchain/langgraph";
import { ActivityType, type ApprovalDecision, PostStatus, RevisionSource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { platformSpec } from "@/lib/constants/platforms";
import { getProvider } from "@/lib/ai";
import {
  GENERATED_CONTENT_JSON_SCHEMA,
  QUALITY_JUDGEMENT_JSON_SCHEMA,
  parseGeneratedContent,
  parseQualityJudgement,
} from "@/lib/ai/schemas";
import { COPYWRITER_SYSTEM, REVIEWER_SYSTEM, buildGenerationPrompt, buildQualityPrompt } from "@/lib/ai/prompts";
import { MIN_PUBLISHABLE_SCORE, validateContent } from "@/lib/ai/validators";
import type { GeneratedContent, QualityReport } from "@/lib/ai/types";
import { sanitizeHashtags, sanitizeKeywords, sanitizeSingleLine, sanitizeText } from "@/lib/security/sanitize";
import { logActivity } from "@/lib/services/activity";
import { applyApprovalDecision } from "@/lib/services/approvals";
import { schedulePost } from "@/lib/services/scheduling";
import { executeScheduledPublish } from "@/lib/services/publishing";
import { createDraftPost, persistGeneratedContent, persistQualityReport } from "./persistence";
import type { AgentStateType, AgentStateUpdate, HumanDecision } from "./state";

/** Content is regenerated at most this many times before a human is asked anyway. */
const MAX_QUALITY_RETRIES = 2;

const now = () => new Date().toISOString();

/**
 * The resume payload a human sends back into the paused graph.
 * It is the only way `approved` can ever become true.
 */
export interface ApprovalResumePayload {
  decision: ApprovalDecision;
  reviewerId: string;
  feedback?: string;
  /** Optional: approve and schedule in a single action. */
  scheduledFor?: string;
  socialAccountId?: string | null;
  timezone?: string;
  /** Approve and publish straight away (still only after this human decision). */
  publishNow?: boolean;
}

// ---------------------------------------------------------------------------
// 1. Parse the request
// ---------------------------------------------------------------------------

export async function parseRequest(state: AgentStateType): Promise<AgentStateUpdate> {
  const brief = {
    ...state.brief,
    topic: sanitizeSingleLine(state.brief.topic, 300),
    product: state.brief.product ? sanitizeSingleLine(state.brief.product, 200) : null,
    audience: state.brief.audience ? sanitizeSingleLine(state.brief.audience, 200) : null,
    ctaRequest: state.brief.ctaRequest ? sanitizeSingleLine(state.brief.ctaRequest, 200) : null,
    notes: state.brief.notes ? sanitizeText(state.brief.notes, 1000) : null,
    keywords: sanitizeKeywords(state.brief.keywords),
    hashtags: sanitizeHashtags(state.brief.hashtags),
  };

  const postId = state.postId ?? (await createDraftPost({ ...state, brief }));

  return {
    brief,
    postId,
    nodeHistory: ["parse_request"],
    updatedAt: now(),
  };
}

// ---------------------------------------------------------------------------
// 2. Generate content
// ---------------------------------------------------------------------------

export async function generateContent(state: AgentStateType): Promise<AgentStateUpdate> {
  const provider = getProvider();
  const isRetry = state.retryCount > 0;

  try {
    const result = await provider.generate({
      task: isRetry ? "regenerate" : "generate",
      system: COPYWRITER_SYSTEM,
      prompt: buildGenerationPrompt(state.brief),
      jsonSchema: GENERATED_CONTENT_JSON_SCHEMA,
      parse: parseGeneratedContent,
      context: { brief: state.brief, variant: state.retryCount },
      maxTokens: 2048,
    });

    const content = result.data;
    const version = await persistGeneratedContent({
      postId: state.postId!,
      userId: state.userId,
      content,
      source: isRetry ? RevisionSource.AI_REGENERATED : RevisionSource.AI_GENERATED,
      changeSummary: isRetry
        ? `Regenerated after the quality gate flagged the previous draft (attempt ${state.retryCount + 1}).`
        : "Initial draft from the content brief.",
      provider: result.provider,
      model: result.model,
      latencyMs: result.latencyMs,
    });

    await logActivity({
      userId: state.userId,
      postId: state.postId,
      type: ActivityType.POST_GENERATED,
      message: `${result.provider === "mock" ? "Demo model" : result.model} generated v${version} in ${result.latencyMs}ms.`,
      metadata: { provider: result.provider, model: result.model, latencyMs: result.latencyMs },
    });

    return {
      content,
      revisions: [{ version, source: isRetry ? "AI_REGENERATED" : "AI_GENERATED", content, at: now() }],
      nodeHistory: ["generate_content"],
      updatedAt: now(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Content generation failed.";
    if (state.postId) {
      await prisma.post.update({ where: { id: state.postId }, data: { failureReason: message } }).catch(() => {});
    }
    throw new AppError("PROVIDER_ERROR", `The AI provider could not generate content: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// 3. Validate content (deterministic)
// ---------------------------------------------------------------------------

export async function validateContentNode(state: AgentStateType): Promise<AgentStateUpdate> {
  const outcome = validateContent(state.brief, state.content!);
  const errors = outcome.hardViolations.map((message) => ({
    node: "validate_content" as const,
    message,
    at: now(),
    retryable: true,
  }));

  return {
    ...(errors.length ? { errors } : {}),
    nodeHistory: ["validate_content"],
    updatedAt: now(),
  };
}

export function routeAfterValidation(state: AgentStateType): "generate_content" | "optimize_for_platform" {
  const outcome = validateContent(state.brief, state.content!);
  const shouldRetry = outcome.hardViolations.length > 0 && state.retryCount < MAX_QUALITY_RETRIES;
  return shouldRetry ? "generate_content" : "optimize_for_platform";
}

// ---------------------------------------------------------------------------
// 4. Platform optimisation (deterministic)
// ---------------------------------------------------------------------------

/** The next occurrence of one of the platform's best-performing hours. */
function nextGoodSlot(platform: AgentStateType["brief"]["platform"]): Date {
  const spec = platformSpec(platform);
  const candidate = new Date();
  candidate.setSeconds(0, 0);
  candidate.setMinutes(0);

  for (let dayOffset = 0; dayOffset < 8; dayOffset++) {
    for (const hour of spec.bestHours) {
      const slot = new Date(candidate);
      slot.setDate(candidate.getDate() + dayOffset);
      slot.setHours(hour, 0, 0, 0);
      const isWeekend = slot.getDay() === 0 || slot.getDay() === 6;
      // B2B platforms do not get weekend slots.
      if ((platform === "LINKEDIN" || platform === "X") && isWeekend) continue;
      if (slot.getTime() > Date.now() + 30 * 60_000) return slot;
    }
  }
  return new Date(Date.now() + 24 * 3600_000);
}

export async function optimizeForPlatform(state: AgentStateType): Promise<AgentStateUpdate> {
  const spec = platformSpec(state.brief.platform);
  const original = state.content!;
  let caption = original.caption;
  let hashtags = [...original.hashtags];
  const notes: string[] = [];

  // Hashtag budget
  if (hashtags.length > spec.hashtagLimit) {
    hashtags = hashtags.slice(0, spec.hashtagLimit);
    notes.push(`Trimmed hashtags to the ${spec.name} maximum of ${spec.hashtagLimit}.`);
  }

  // Instagram: captions cannot carry clickable links.
  if (!spec.supportsLinkInCaption && /https?:\/\//i.test(caption)) {
    caption = caption.replace(/https?:\/\/\S+/gi, "the link in our bio").replace(/\s{2,}/g, " ");
    notes.push("Replaced inline URLs with a link-in-bio reference, which Instagram requires.");
  }

  // X: single block, and the whole thing has to fit in 280 characters.
  if (state.brief.platform === "X") {
    caption = caption.replace(/\n{2,}/g, " ").replace(/\s{2,}/g, " ").trim();
    const tagLength = hashtags.reduce((n, t) => n + t.length + 2, 0);
    if (caption.length + tagLength > spec.captionLimit) {
      const budget = spec.captionLimit - tagLength - 1;
      const cut = caption.slice(0, Math.max(40, budget));
      const lastStop = cut.lastIndexOf(". ");
      caption = (lastStop > budget * 0.5 ? cut.slice(0, lastStop + 1) : cut).trim();
      notes.push(`Compressed the post to fit the ${spec.captionLimit}-character X limit.`);
    }
  }

  // LinkedIn: keep the hook above the "see more" fold.
  if (state.brief.platform === "LINKEDIN") {
    const [first, ...rest] = caption.split("\n");
    if (first && first.length > 200) {
      const breakAt = first.slice(0, 200).lastIndexOf(". ");
      if (breakAt > 60) {
        caption = [first.slice(0, breakAt + 1), first.slice(breakAt + 2), ...rest].join("\n\n").trim();
        notes.push("Split the opening line so the hook survives the LinkedIn fold.");
      }
    }
  }

  const suggestedTime = nextGoodSlot(state.brief.platform);
  const changed = caption !== original.caption || hashtags.length !== original.hashtags.length;
  const content: GeneratedContent = { ...original, caption, hashtags };

  if (changed && state.postId) {
    await persistGeneratedContent({
      postId: state.postId,
      userId: state.userId,
      content,
      source: RevisionSource.AI_IMPROVED,
      changeSummary: notes.join(" "),
      provider: "postpilot",
      model: "platform-optimizer",
      latencyMs: 0,
      suggestedTime,
    });
  } else if (state.postId) {
    await prisma.post.update({ where: { id: state.postId }, data: { suggestedTime } });
  }

  return {
    content,
    suggestedTime: suggestedTime.toISOString(),
    nodeHistory: ["optimize_for_platform"],
    updatedAt: now(),
  };
}

// ---------------------------------------------------------------------------
// 5. Quality gate (deterministic rules + model judgement)
// ---------------------------------------------------------------------------

export async function qualityCheck(state: AgentStateType): Promise<AgentStateUpdate> {
  const content = state.content!;
  const structural = validateContent(state.brief, content);
  const provider = getProvider();

  let judgement;
  try {
    const result = await provider.generate({
      task: "quality_check",
      system: REVIEWER_SYSTEM,
      prompt: buildQualityPrompt(state.brief, content),
      jsonSchema: QUALITY_JUDGEMENT_JSON_SCHEMA,
      parse: parseQualityJudgement,
      context: { brief: state.brief, current: content },
      maxTokens: 1024,
    });
    judgement = result.data;
  } catch {
    // A reviewer outage must not strand the draft: fall back to the
    // deterministic score alone and say so in the report.
    judgement = {
      clarity: structural.structuralScore,
      relevance: structural.structuralScore,
      engagement: structural.structuralScore,
      brandSafety: structural.structuralScore,
      strengths: [],
      risks: ["The AI reviewer was unavailable; only the deterministic checks ran."],
      suggestions: ["Re-run the quality check once the AI provider is reachable."],
    };
  }

  const subjective = (judgement.clarity + judgement.relevance + judgement.engagement + judgement.brandSafety) / 4;
  // Deterministic rules carry the heavier weight, and a hard violation caps the
  // score so a persuasive draft can never score its way past a platform limit.
  const blended = structural.structuralScore * 0.55 + subjective * 0.45;
  const score = structural.hardViolations.length ? Math.min(59, Math.round(blended)) : Math.round(blended);

  const report: QualityReport = {
    score,
    verdict: structural.hardViolations.length ? "fail" : score >= MIN_PUBLISHABLE_SCORE ? "pass" : "revise",
    checks: structural.checks,
    strengths: judgement.strengths,
    risks: judgement.risks,
    suggestions: judgement.suggestions,
    hardViolations: structural.hardViolations,
    scoredBy: `${provider.name}:${provider.model}`,
  };

  if (state.postId) await persistQualityReport(state.postId, report);

  const willRetry = report.verdict !== "pass" && state.retryCount < MAX_QUALITY_RETRIES;

  return {
    qualityReport: report,
    ...(willRetry ? { retryCount: 1 } : {}),
    nodeHistory: ["quality_check"],
    updatedAt: now(),
  };
}

export function routeAfterQuality(state: AgentStateType): "generate_content" | "human_approval" {
  const report = state.qualityReport;
  if (!report) return "human_approval";
  const needsRework = report.verdict !== "pass";
  return needsRework && state.retryCount <= MAX_QUALITY_RETRIES ? "generate_content" : "human_approval";
}

// ---------------------------------------------------------------------------
// 6. Human approval — the interrupt
// ---------------------------------------------------------------------------

/**
 * The workflow stops here, indefinitely, until a person acts.
 *
 * `interrupt()` throws a GraphInterrupt that LangGraph catches after
 * checkpointing the state to Postgres. Nothing downstream of this node — the
 * scheduler and the publisher — can run until the graph is resumed with a real
 * human decision, and only this node may set `approved`.
 *
 * Note the ordering: `interrupt()` is the first statement, because LangGraph
 * re-executes a node from the top when it resumes. Anything above it would run
 * twice.
 */
export async function humanApproval(state: AgentStateType): Promise<AgentStateUpdate> {
  const payload = interrupt<Record<string, unknown>, ApprovalResumePayload>({
    type: "approval_required",
    postId: state.postId,
    platform: state.brief.platform,
    qualityScore: state.qualityReport?.score ?? null,
    message: "Human approval is required before this post can be scheduled or published.",
  });

  // Delegated to the approval service so the graph and the REST endpoint share
  // one implementation of the rule.
  const { status } = await applyApprovalDecision({
    postId: state.postId!,
    reviewerId: payload.reviewerId,
    decision: payload.decision,
    feedback: payload.feedback,
  });

  const decision: HumanDecision = {
    decision: payload.decision,
    reviewerId: payload.reviewerId,
    feedback: payload.feedback,
    at: now(),
  };

  return {
    approval: decision,
    approved: status === PostStatus.APPROVED,
    scheduledFor: payload.scheduledFor ?? null,
    publishNow: Boolean(payload.publishNow),
    nodeHistory: ["human_approval"],
    updatedAt: now(),
  };
}

export function routeAfterApproval(state: AgentStateType): "schedule" | "__end__" {
  return state.approved ? "schedule" : "__end__";
}

// ---------------------------------------------------------------------------
// 7. Scheduling
// ---------------------------------------------------------------------------

export async function scheduleNode(state: AgentStateType): Promise<AgentStateUpdate> {
  // Defence in depth: this can only be reached via `routeAfterApproval`, but a
  // future edge added by mistake must not be able to schedule unapproved work.
  if (!state.approved) {
    return {
      errors: [
        { node: "schedule", message: "Refused to schedule content that has no human approval.", at: now(), retryable: false },
      ],
      nodeHistory: ["schedule"],
      updatedAt: now(),
    };
  }

  if (!state.scheduledFor) {
    return {
      nodeHistory: ["schedule"],
      updatedAt: now(),
    };
  }

  try {
    const schedule = await schedulePost({
      postId: state.postId!,
      userId: state.userId,
      scheduledFor: new Date(state.scheduledFor),
      timezone: "UTC",
    });
    return {
      scheduleId: schedule.id,
      scheduledFor: schedule.scheduledFor.toISOString(),
      nodeHistory: ["schedule"],
      updatedAt: now(),
    };
  } catch (error) {
    return {
      errors: [
        {
          node: "schedule",
          message: error instanceof Error ? error.message : "Scheduling failed.",
          at: now(),
          retryable: false,
        },
      ],
      nodeHistory: ["schedule"],
      updatedAt: now(),
    };
  }
}

/**
 * Publish inside the graph only when the reviewer explicitly asked to publish
 * now, or the requested slot is already due. Anything scheduled for later is
 * handed to the background scheduler, which runs the identical publishing
 * service — so a post is never published earlier than the reviewer asked.
 */
export function routeAfterSchedule(state: AgentStateType): "publish" | "__end__" {
  if (!state.approved || !state.scheduleId || !state.scheduledFor) return "__end__";
  const due = new Date(state.scheduledFor).getTime() <= Date.now() + 5_000;
  return due || state.publishNow ? "publish" : "__end__";
}

// ---------------------------------------------------------------------------
// 8. Publish
// ---------------------------------------------------------------------------

export async function publishNode(state: AgentStateType): Promise<AgentStateUpdate> {
  if (!state.approved || !state.scheduleId) {
    return {
      publishResult: {
        status: "BLOCKED",
        message: "Publishing blocked: human approval is required.",
        at: now(),
      },
      nodeHistory: ["publish"],
      updatedAt: now(),
    };
  }

  const outcome = await executeScheduledPublish(state.scheduleId);

  return {
    publishResult: {
      status: outcome.status === "PUBLISHED" ? "PUBLISHED" : outcome.status === "BLOCKED" ? "BLOCKED" : "FAILED",
      externalId: outcome.externalId,
      externalUrl: outcome.externalUrl,
      message: outcome.message,
      at: now(),
    },
    ...(outcome.status === "FAILED" || outcome.status === "BLOCKED"
      ? { errors: [{ node: "publish" as const, message: outcome.message, at: now(), retryable: outcome.status === "FAILED" }] }
      : {}),
    nodeHistory: ["publish"],
    updatedAt: now(),
  };
}

// ---------------------------------------------------------------------------
// 9. Verify the result
// ---------------------------------------------------------------------------

export async function verifyResult(state: AgentStateType): Promise<AgentStateUpdate> {
  const post = await prisma.post.findUnique({
    where: { id: state.postId! },
    select: { status: true, externalId: true, publishedUrl: true, publishedAt: true, failureReason: true },
  });

  const verified = post?.status === PostStatus.PUBLISHED && Boolean(post.externalId);

  return {
    publishResult: {
      status: verified ? "PUBLISHED" : state.publishResult?.status ?? "FAILED",
      externalId: post?.externalId ?? undefined,
      externalUrl: post?.publishedUrl ?? undefined,
      message: verified
        ? `Verified live at ${post?.publishedUrl ?? "the platform"}.`
        : (post?.failureReason ?? state.publishResult?.message ?? "Publication could not be verified."),
      at: now(),
    },
    nodeHistory: ["verify_result"],
    updatedAt: now(),
  };
}

export { MAX_QUALITY_RETRIES };

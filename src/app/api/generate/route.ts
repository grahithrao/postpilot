import { AppError } from "@/lib/errors";
import { fail, ok, readJson, withUser } from "@/lib/api/handler";
import { rateLimit } from "@/lib/security/rate-limit";
import { generationBriefSchema } from "@/lib/validation/schemas";
import { startContentRun } from "@/lib/agent/runner";
import { publicRuntimeFlags } from "@/lib/env";
import type { ContentBrief } from "@/lib/ai/types";

/**
 * Runs the LangGraph content agent.
 *
 * The response describes a *paused* workflow: the agent has generated,
 * validated, optimised and scored the draft, and is now blocked at the human
 * approval interrupt. Nothing is scheduled or published by this endpoint.
 */
export const POST = withUser(async (user, request) => {
  try {
    // Generation can cost real money once a provider key is configured.
    const limit = rateLimit(`generate:${user.id}`, 20, 60_000);
    if (!limit.ok) {
      throw new AppError(
        "RATE_LIMITED",
        `Too many generations. Try again in ${Math.ceil(limit.retryAfterMs / 1000)}s.`,
      );
    }

    const parsed = generationBriefSchema.parse(await readJson(request));

    const brief: ContentBrief = {
      topic: parsed.topic,
      product: parsed.product || null,
      audience: parsed.audience || null,
      platform: parsed.platform,
      contentType: parsed.contentType,
      tone: parsed.tone,
      length: parsed.length,
      language: parsed.language,
      ctaRequest: parsed.ctaRequest || null,
      keywords: parsed.keywords,
      hashtags: parsed.hashtags,
      notes: parsed.notes || null,
    };

    const summary = await startContentRun({ userId: user.id, brief });

    return ok({
      ...summary,
      runtime: publicRuntimeFlags(),
      /** Explicit for the client: the agent stopped and is waiting for a person. */
      awaitingHumanApproval: summary.status === "awaiting_approval",
    });
  } catch (error) {
    return fail(error);
  }
});

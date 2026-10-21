import { platformSpec } from "@/lib/constants/platforms";
import type {
  ContentBrief,
  GeneratedContent,
  LLMProvider,
  LLMResult,
  QualityJudgement,
  StructuredRequest,
} from "@/lib/ai/types";
import { validateContent } from "@/lib/ai/validators";
import { composeContent, transformContent } from "./copy-engine";

/**
 * Context the agent attaches to a request so the mock provider can produce a
 * realistic answer. Real providers ignore it and use the rendered prompt.
 */
export interface MockContext {
  brief: ContentBrief;
  current?: GeneratedContent;
  variant?: number;
  instruction?: string;
}

function isMockContext(v: unknown): v is MockContext {
  return typeof v === "object" && v !== null && "brief" in v;
}

/** A small, believable delay so loading states are exercised in demos. */
const LATENCY_MS = { min: 320, max: 900 };

function synthesiseJudgement(ctx: MockContext, content: GeneratedContent): QualityJudgement {
  const { brief } = ctx;
  const spec = platformSpec(brief.platform);
  const { checks, hardViolations } = validateContent(brief, content);
  const caption = content.caption;

  const [lo, hi] = spec.idealCaptionRange;
  const lengthFit = caption.length < lo * 0.6 ? 0.6 : caption.length > hi ? 0.75 : 1;
  const paragraphs = caption.split(/\n{2,}/).filter(Boolean).length;
  const hookLength = caption.split(/[.!?\n]/)[0]?.length ?? 0;

  const clarity = Math.round(
    Math.min(100, 62 + lengthFit * 18 + (paragraphs > 1 ? 8 : 0) + (hookLength < 110 ? 10 : 0)),
  );
  const keywordHits = brief.keywords.filter((k) => caption.toLowerCase().includes(k.toLowerCase())).length;
  const keywordRatio = brief.keywords.length ? keywordHits / brief.keywords.length : 1;
  const relevance = Math.round(
    Math.min(100, 60 + keywordRatio * 22 + (brief.audience && caption.length > 80 ? 9 : 4) + (content.headline ? 5 : 3)),
  );
  const tagFit =
    content.hashtags.length >= spec.idealHashtagRange[0] && content.hashtags.length <= spec.idealHashtagRange[1];
  const engagement = Math.round(
    Math.min(
      100,
      58 + (content.cta ? 14 : 0) + (tagFit ? 10 : 2) + (/[?]/.test(caption) ? 8 : 0) + (paragraphs > 2 ? 6 : 2),
    ),
  );
  const warnCount = checks.filter((c) => c.status === "warn").length;
  const brandSafety = Math.round(Math.max(35, 98 - hardViolations.length * 30 - warnCount * 5));

  const strengths: string[] = [];
  if (content.cta) strengths.push("Ends on a specific call to action rather than trailing off.");
  if (tagFit) strengths.push(`Hashtag count sits in the ${spec.name} sweet spot.`);
  if (hookLength < 110) strengths.push("Opening line is short enough to survive the feed truncation.");
  if (keywordRatio === 1 && brief.keywords.length) strengths.push("Every requested keyword appears naturally.");

  const risks: string[] = [];
  for (const c of checks) if (c.status !== "pass") risks.push(c.detail);

  const suggestions: string[] = [];
  if (!content.cta) suggestions.push("Add one explicit next step for the reader.");
  if (!tagFit) {
    suggestions.push(
      `Adjust to ${spec.idealHashtagRange[0]}-${spec.idealHashtagRange[1]} hashtags for ${spec.name}.`,
    );
  }
  if (caption.length < lo * 0.6) suggestions.push("Add one concrete example or number to give the post substance.");
  if (paragraphs === 1 && brief.platform !== "X") suggestions.push("Break the copy into shorter paragraphs.");
  if (!suggestions.length) suggestions.push("Consider testing a second hook variant against this one.");

  return {
    clarity,
    relevance,
    engagement,
    brandSafety,
    strengths: strengths.slice(0, 3),
    risks: risks.slice(0, 3),
    suggestions: suggestions.slice(0, 3),
  };
}

/**
 * The DEMO MODE model. Implements exactly the same interface as the real
 * providers so nothing upstream — the LangGraph agent included — knows or cares
 * which one is in use.
 */
export class MockProvider implements LLMProvider {
  readonly name = "mock" as const;
  readonly model = "postpilot-mock-1";
  readonly isMock = true;

  async generate<T>(request: StructuredRequest<T>): Promise<LLMResult<T>> {
    const started = Date.now();
    const jitter = LATENCY_MS.min + Math.random() * (LATENCY_MS.max - LATENCY_MS.min);
    await new Promise((r) => setTimeout(r, jitter));

    if (!isMockContext(request.context)) {
      throw new Error(
        `Mock provider requires typed context for task "${request.task}". This is a programming error, not a configuration one.`,
      );
    }
    const ctx = request.context;

    let payload: unknown;
    switch (request.task) {
      case "generate":
        payload = composeContent(ctx.brief, { variant: ctx.variant, instruction: ctx.instruction });
        break;
      case "regenerate":
        payload = composeContent(ctx.brief, {
          variant: (ctx.variant ?? 0) + 1 + Math.floor(Math.random() * 5),
          instruction: ctx.instruction,
        });
        break;
      case "improve":
      case "shorten":
      case "expand":
      case "rewrite":
      case "tone":
        payload = transformContent(
          ctx.brief,
          ctx.current ?? composeContent(ctx.brief, { variant: ctx.variant }),
          request.task,
          { variant: ctx.variant, instruction: ctx.instruction },
        );
        break;
      case "quality_check":
        payload = synthesiseJudgement(
          ctx,
          ctx.current ?? composeContent(ctx.brief, { variant: ctx.variant }),
        );
        break;
      default: {
        const exhaustive: never = request.task;
        throw new Error(`Unhandled mock task: ${String(exhaustive)}`);
      }
    }

    return {
      data: request.parse(payload),
      provider: this.name,
      model: this.model,
      latencyMs: Date.now() - started,
    };
  }
}

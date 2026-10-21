import type { ContentLength, ContentType, Platform, Tone } from "@prisma/client";

/** Every distinct thing we ask a model to do. */
export type AiTask =
  | "generate"
  | "improve"
  | "shorten"
  | "expand"
  | "rewrite"
  | "tone"
  | "regenerate"
  | "quality_check";

export interface ContentBrief {
  topic: string;
  product?: string | null;
  audience?: string | null;
  platform: Platform;
  contentType: ContentType;
  tone: Tone;
  length: ContentLength;
  language: string;
  ctaRequest?: string | null;
  keywords: string[];
  hashtags: string[];
  notes?: string | null;
}

/** The content payload every generation task returns. */
export interface GeneratedContent {
  headline: string | null;
  caption: string;
  hashtags: string[];
  cta: string;
  imagePrompt: string;
  /** Why the agent picked the suggested posting slot. */
  timingRationale: string;
}

export type QualityCheckStatus = "pass" | "warn" | "fail";

export interface QualityCheck {
  id: string;
  label: string;
  status: QualityCheckStatus;
  detail: string;
}

export interface QualityReport {
  /** 0-100. Below `MIN_PUBLISHABLE_SCORE` the agent flags the draft for rework. */
  score: number;
  verdict: "pass" | "revise" | "fail";
  checks: QualityCheck[];
  strengths: string[];
  risks: string[];
  suggestions: string[];
  /** Deterministic rule violations that a model cannot talk its way out of. */
  hardViolations: string[];
  scoredBy: string;
}

/** What the model returns for the subjective half of the quality gate. */
export interface QualityJudgement {
  clarity: number;
  relevance: number;
  engagement: number;
  brandSafety: number;
  strengths: string[];
  risks: string[];
  suggestions: string[];
}

export interface LLMUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface LLMResult<T> {
  data: T;
  provider: string;
  model: string;
  latencyMs: number;
  usage?: LLMUsage;
}

export interface StructuredRequest<T> {
  task: AiTask;
  system: string;
  prompt: string;
  /** JSON Schema handed to the provider's structured-output mode. */
  jsonSchema: Record<string, unknown>;
  /** Parses/validates whatever the provider returns. Throws on mismatch. */
  parse: (raw: unknown) => T;
  /** Typed context the mock provider uses to synthesise a realistic answer. */
  context?: unknown;
  maxTokens?: number;
}

export interface LLMProvider {
  readonly name: "mock" | "anthropic" | "openai";
  readonly model: string;
  /** True when responses are synthesised locally rather than by a real model. */
  readonly isMock: boolean;
  generate<T>(request: StructuredRequest<T>): Promise<LLMResult<T>>;
}

export class ProviderError extends Error {
  readonly provider: string;
  readonly retryable: boolean;
  constructor(provider: string, message: string, retryable = false) {
    super(message);
    this.name = "ProviderError";
    this.provider = provider;
    this.retryable = retryable;
  }
}

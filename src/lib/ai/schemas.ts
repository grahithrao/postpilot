import { z } from "zod";
import type { GeneratedContent, QualityJudgement } from "./types";

/**
 * Zod is the source of truth for what a model must return; the JSON Schema
 * beside it is what we hand to the provider's structured-output mode. Keeping
 * both here means a drift between them is a one-file fix.
 */
export const generatedContentSchema = z.object({
  headline: z.string().max(300).nullable().optional().default(null),
  caption: z.string().min(1).max(8000),
  hashtags: z.array(z.string().max(60)).max(30).default([]),
  cta: z.string().max(300).default(""),
  imagePrompt: z.string().max(2000).default(""),
  timingRationale: z.string().max(500).default(""),
});

export const GENERATED_CONTENT_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    headline: {
      type: ["string", "null"],
      description: "Short headline. Null for platforms that have no headline slot.",
    },
    caption: { type: "string", description: "The post body, ready to publish." },
    hashtags: {
      type: "array",
      items: { type: "string" },
      description: "Hashtags without the leading # character.",
    },
    cta: { type: "string", description: "A single, specific call to action." },
    imagePrompt: {
      type: "string",
      description: "A prompt an image model could use to create the accompanying visual.",
    },
    timingRationale: {
      type: "string",
      description: "One sentence on why the suggested posting time suits this audience.",
    },
  },
  required: ["headline", "caption", "hashtags", "cta", "imagePrompt", "timingRationale"],
  additionalProperties: false,
};

export const qualityJudgementSchema = z.object({
  clarity: z.number().min(0).max(100),
  relevance: z.number().min(0).max(100),
  engagement: z.number().min(0).max(100),
  brandSafety: z.number().min(0).max(100),
  strengths: z.array(z.string().max(240)).max(6).default([]),
  risks: z.array(z.string().max(240)).max(6).default([]),
  suggestions: z.array(z.string().max(240)).max(6).default([]),
});

export const QUALITY_JUDGEMENT_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    clarity: { type: "number", description: "0-100: is the message immediately understandable?" },
    relevance: { type: "number", description: "0-100: does it serve the brief and the audience?" },
    engagement: { type: "number", description: "0-100: will the target audience react to it?" },
    brandSafety: { type: "number", description: "0-100: free of claims, risks and off-brand phrasing?" },
    strengths: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
    suggestions: { type: "array", items: { type: "string" } },
  },
  required: ["clarity", "relevance", "engagement", "brandSafety", "strengths", "risks", "suggestions"],
  additionalProperties: false,
};

export function parseGeneratedContent(raw: unknown): GeneratedContent {
  const parsed = generatedContentSchema.parse(raw);
  return {
    headline: parsed.headline ?? null,
    caption: parsed.caption,
    hashtags: parsed.hashtags,
    cta: parsed.cta,
    imagePrompt: parsed.imagePrompt,
    timingRationale: parsed.timingRationale,
  };
}

export function parseQualityJudgement(raw: unknown): QualityJudgement {
  return qualityJudgementSchema.parse(raw);
}

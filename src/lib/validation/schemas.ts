import { z } from "zod";
import {
  ApprovalDecision,
  AutomationFrequency,
  ContentLength,
  ContentType,
  Platform,
  PostStatus,
  Tone,
} from "@prisma/client";

export const platformEnum = z.nativeEnum(Platform);
export const contentTypeEnum = z.nativeEnum(ContentType);
export const toneEnum = z.nativeEnum(Tone);
export const lengthEnum = z.nativeEnum(ContentLength);
export const postStatusEnum = z.nativeEnum(PostStatus);
export const frequencyEnum = z.nativeEnum(AutomationFrequency);

const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max);

/** The brief a human fills in on /create. */
export const generationBriefSchema = z.object({
  topic: trimmed(3, 300),
  product: trimmed(0, 200).optional().or(z.literal("")),
  audience: trimmed(0, 200).optional().or(z.literal("")),
  platform: platformEnum,
  contentType: contentTypeEnum.default(ContentType.SOCIAL_POST),
  tone: toneEnum.default(Tone.PROFESSIONAL),
  length: lengthEnum.default(ContentLength.MEDIUM),
  language: trimmed(2, 40).default("English"),
  ctaRequest: trimmed(0, 200).optional().or(z.literal("")),
  keywords: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  hashtags: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  notes: trimmed(0, 1000).optional().or(z.literal("")),
  socialAccountId: z.string().cuid().optional().nullable(),
});
export type GenerationBrief = z.infer<typeof generationBriefSchema>;

/** Post-generation refinements the user can apply from the editor. */
export const refineActionSchema = z.object({
  action: z.enum(["improve", "shorten", "expand", "rewrite", "tone", "regenerate"]),
  tone: toneEnum.optional(),
  instruction: trimmed(0, 500).optional().or(z.literal("")),
});
export type RefineAction = z.infer<typeof refineActionSchema>;

export const postContentSchema = z.object({
  headline: z.string().trim().max(300).optional().nullable(),
  caption: trimmed(1, 8000),
  hashtags: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  cta: z.string().trim().max(300).optional().nullable(),
  imagePrompt: z.string().trim().max(2000).optional().nullable(),
});
export type PostContentInput = z.infer<typeof postContentSchema>;

export const createPostSchema = generationBriefSchema.extend({
  caption: z.string().trim().min(1).max(8000),
  headline: z.string().trim().max(300).optional().nullable(),
  cta: z.string().trim().max(300).optional().nullable(),
  imagePrompt: z.string().trim().max(2000).optional().nullable(),
  status: z.enum([PostStatus.DRAFT, PostStatus.PENDING_APPROVAL]).default(PostStatus.DRAFT),
});

export const updatePostSchema = postContentSchema.partial().extend({
  topic: trimmed(3, 300).optional(),
  audience: z.string().trim().max(200).optional().nullable(),
  product: z.string().trim().max(200).optional().nullable(),
  tone: toneEnum.optional(),
  contentType: contentTypeEnum.optional(),
  socialAccountId: z.string().cuid().optional().nullable(),
  changeSummary: z.string().trim().max(300).optional(),
});

export const approvalSchema = z.object({
  decision: z.nativeEnum(ApprovalDecision),
  feedback: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const scheduleSchema = z
  .object({
    scheduledFor: z.coerce.date(),
    socialAccountId: z.string().cuid().optional().nullable(),
    timezone: z.string().trim().max(64).default("UTC"),
  })
  .refine((v) => v.scheduledFor.getTime() > Date.now() - 60_000, {
    message: "Scheduled time must be in the future.",
    path: ["scheduledFor"],
  })
  .refine((v) => v.scheduledFor.getTime() < Date.now() + 365 * 24 * 3600_000, {
    message: "Scheduled time must be within the next 12 months.",
    path: ["scheduledFor"],
  });

export const automationSchema = z.object({
  name: trimmed(2, 120),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  frequency: frequencyEnum,
  dayOfWeek: z.coerce.number().int().min(0).max(6).default(1),
  dayOfMonth: z.coerce.number().int().min(1).max(28).default(1),
  hour: z.coerce.number().int().min(0).max(23).default(9),
  minute: z.coerce.number().int().min(0).max(59).default(0),
  timezone: z.string().trim().max(64).default("UTC"),
  platform: platformEnum,
  socialAccountId: z.string().cuid().optional().nullable(),
  topic: trimmed(3, 300),
  audience: z.string().trim().max(200).optional().or(z.literal("")),
  tone: toneEnum.default(Tone.PROFESSIONAL),
  contentType: contentTypeEnum.default(ContentType.SOCIAL_POST),
  keywords: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  enabled: z.boolean().default(true),
});

export const contentQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.union([postStatusEnum, z.literal("ALL")]).optional(),
  platform: z.union([platformEnum, z.literal("ALL")]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  sort: z.enum(["newest", "oldest", "quality", "scheduled"]).default("newest"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(12),
});
export type ContentQuery = z.infer<typeof contentQuerySchema>;

export const connectAccountSchema = z.object({
  platform: platformEnum,
  handle: z.string().trim().min(1).max(80).optional(),
  displayName: z.string().trim().min(1).max(120).optional(),
});

export const registerSchema = z.object({
  name: trimmed(2, 80),
  email: z.string().trim().email().max(200),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export const settingsSchema = z.object({
  name: trimmed(2, 80).optional(),
  timezone: z.string().trim().max(64).optional(),
});

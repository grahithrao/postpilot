/**
 * Centralised, validated access to server-side configuration.
 *
 * Nothing in this file may be imported from a Client Component — every value
 * here is server-only. The single exception is `publicRuntimeFlags()`, which is
 * explicitly whitelisted and passed down through server components as props.
 */
import { z } from "zod";

const boolish = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? fallback : v.toLowerCase() === "true" || v === "1"));

const numeric = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => {
      const n = v === undefined || v === "" ? NaN : Number(v);
      return Number.isFinite(n) ? n : fallback;
    });

const serverSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 characters"),
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "ENCRYPTION_KEY must be 64 hex characters (32 bytes)"),

  AI_PROVIDER: z.enum(["mock", "anthropic", "openai"]).optional().default("mock"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().optional().default("claude-opus-5"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().optional().default("gpt-4o-mini"),
  OPENAI_BASE_URL: z.string().optional().default("https://api.openai.com/v1"),

  DEMO_MODE: boolish(true),
  DEMO_PUBLISH_FAILURE_RATE: numeric(0.08),

  CRON_SECRET: z.string().optional().default("dev-cron-secret"),
  ENABLE_IN_PROCESS_SCHEDULER: boolish(true),
  SCHEDULER_INTERVAL_MS: numeric(20_000),

  OAUTH_REDIRECT_BASE_URL: z.string().optional().default("http://localhost:3000"),

  LINKEDIN_CLIENT_ID: z.string().optional(),
  LINKEDIN_CLIENT_SECRET: z.string().optional(),
  X_CLIENT_ID: z.string().optional(),
  X_CLIENT_SECRET: z.string().optional(),
  FACEBOOK_CLIENT_ID: z.string().optional(),
  FACEBOOK_CLIENT_SECRET: z.string().optional(),
  INSTAGRAM_CLIENT_ID: z.string().optional(),
  INSTAGRAM_CLIENT_SECRET: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(
      `Invalid environment configuration:\n${issues}\n\nCopy .env.example to .env and fill in the required values.`,
    );
  }
  cached = parsed.data;
  return cached;
}

/**
 * Which AI provider will actually be used. Falls back to the deterministic mock
 * model whenever the configured provider has no credentials, so the app is never
 * broken by a missing key — it just runs in demo mode.
 */
export function resolvedAiProvider(): "mock" | "anthropic" | "openai" {
  const e = env();
  if (e.AI_PROVIDER === "anthropic" && e.ANTHROPIC_API_KEY) return "anthropic";
  if (e.AI_PROVIDER === "openai" && e.OPENAI_API_KEY) return "openai";
  return "mock";
}

/** True when publishing is simulated rather than sent to a real platform API. */
export function isDemoMode(): boolean {
  return env().DEMO_MODE;
}

/**
 * Probability that a simulated publish fails, read fresh from the environment
 * rather than the cached config so it can be turned up at runtime to exercise
 * the retry and failure paths (the end-to-end flow test does exactly that).
 */
export function demoPublishFailureRate(): number {
  const raw = Number(process.env.DEMO_PUBLISH_FAILURE_RATE);
  return Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : env().DEMO_PUBLISH_FAILURE_RATE;
}

/** Serialisable, non-secret flags safe to hand to Client Components. */
export function publicRuntimeFlags() {
  const provider = resolvedAiProvider();
  return {
    demoMode: isDemoMode(),
    aiProvider: provider,
    aiModel:
      provider === "anthropic"
        ? env().ANTHROPIC_MODEL
        : provider === "openai"
          ? env().OPENAI_MODEL
          : "postpilot-mock-1",
    usingMockAi: provider === "mock",
  } as const;
}

export type RuntimeFlags = ReturnType<typeof publicRuntimeFlags>;

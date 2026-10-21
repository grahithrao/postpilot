import { env, resolvedAiProvider } from "@/lib/env";
import { AnthropicProvider } from "./anthropic-provider";
import { MockProvider } from "./mock";
import { OpenAICompatibleProvider } from "./openai-provider";
import type { LLMProvider } from "./types";

let cached: LLMProvider | null = null;

/**
 * Resolves the active LLM provider.
 *
 * Falls back to the deterministic mock whenever the configured provider has no
 * credentials, which is what lets the whole product run in DEMO MODE. API keys
 * are read here and nowhere else, and never cross the server boundary.
 */
export function getProvider(): LLMProvider {
  if (cached) return cached;
  const e = env();
  switch (resolvedAiProvider()) {
    case "anthropic":
      cached = new AnthropicProvider(e.ANTHROPIC_API_KEY!, e.ANTHROPIC_MODEL);
      break;
    case "openai":
      cached = new OpenAICompatibleProvider(e.OPENAI_API_KEY!, e.OPENAI_MODEL, e.OPENAI_BASE_URL);
      break;
    default:
      cached = new MockProvider();
  }
  return cached;
}

/** Test seam — lets the flow test swap in a failing provider. */
export function __setProviderForTesting(provider: LLMProvider | null) {
  cached = provider;
}

export * from "./types";
export { MockProvider } from "./mock";
export type { MockContext } from "./mock";

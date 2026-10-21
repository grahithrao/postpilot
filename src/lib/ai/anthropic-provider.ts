import Anthropic from "@anthropic-ai/sdk";
import { ProviderError, type LLMProvider, type LLMResult, type StructuredRequest } from "./types";

/**
 * Anthropic Messages API provider.
 *
 * Uses structured outputs (`output_config.format`) so the model returns JSON
 * matching the schema the caller supplied, then re-validates that JSON with the
 * caller's own parser before it is trusted.
 */
export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic" as const;
  readonly isMock = false;
  readonly model: string;
  private readonly client: Anthropic;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000 });
    this.model = model;
  }

  async generate<T>(request: StructuredRequest<T>): Promise<LLMResult<T>> {
    const started = Date.now();
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: request.maxTokens ?? 4096,
        system: request.system,
        messages: [{ role: "user", content: request.prompt }],
        output_config: {
          effort: "medium",
          format: { type: "json_schema", schema: request.jsonSchema },
        },
      });

      if (response.stop_reason === "refusal") {
        throw new ProviderError(
          this.name,
          `The model declined this request (${response.stop_details?.category ?? "unspecified"}). Rework the brief and try again.`,
        );
      }

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");

      if (!text.trim()) {
        throw new ProviderError(this.name, "The model returned an empty response.", true);
      }

      return {
        data: request.parse(safeJsonParse(text, this.name)),
        provider: this.name,
        model: this.model,
        latencyMs: Date.now() - started,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    } catch (error) {
      throw normaliseAnthropicError(error, this.name);
    }
  }
}

function safeJsonParse(text: string, provider: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Structured outputs should make this unreachable; salvage a JSON object if
    // the model wrapped it in prose anyway.
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        /* fall through */
      }
    }
    throw new ProviderError(provider, "The model did not return valid JSON.", true);
  }
}

function normaliseAnthropicError(error: unknown, provider: string): ProviderError {
  if (error instanceof ProviderError) return error;
  if (error instanceof Anthropic.AuthenticationError) {
    return new ProviderError(provider, "Anthropic rejected the API key. Check ANTHROPIC_API_KEY.");
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new ProviderError(provider, "Anthropic rate limit reached. Try again shortly.", true);
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new ProviderError(provider, `Anthropic rejected the request: ${error.message}`);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new ProviderError(provider, "Could not reach the Anthropic API.", true);
  }
  if (error instanceof Anthropic.APIError) {
    return new ProviderError(provider, `Anthropic API error ${error.status}: ${error.message}`, error.status >= 500);
  }
  return new ProviderError(provider, error instanceof Error ? error.message : "Unknown provider error", true);
}

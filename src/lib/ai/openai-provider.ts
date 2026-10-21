import { ProviderError, type LLMProvider, type LLMResult, type StructuredRequest } from "./types";

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

/**
 * OpenAI-compatible provider (works with OpenAI, Azure-style gateways, Groq,
 * Together, Ollama, and anything else exposing /chat/completions).
 *
 * Deliberately written against the wire protocol rather than a vendor SDK so a
 * single class covers every OpenAI-shaped endpoint via OPENAI_BASE_URL.
 */
export class OpenAICompatibleProvider implements LLMProvider {
  readonly name = "openai" as const;
  readonly isMock = false;
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, model: string, baseUrl: string) {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async generate<T>(request: StructuredRequest<T>): Promise<LLMResult<T>> {
    const started = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: request.maxTokens ?? 4096,
          temperature: request.task === "quality_check" ? 0.2 : 0.8,
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.prompt },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: `postpilot_${request.task}`,
              strict: true,
              schema: request.jsonSchema,
            },
          },
        }),
      });

      const body = (await response.json().catch(() => ({}))) as ChatCompletionResponse;

      if (!response.ok) {
        const message = body.error?.message ?? `HTTP ${response.status}`;
        if (response.status === 401) throw new ProviderError(this.name, "The API key was rejected. Check OPENAI_API_KEY.");
        if (response.status === 429) throw new ProviderError(this.name, "Rate limited by the provider.", true);
        throw new ProviderError(this.name, `Provider error: ${message}`, response.status >= 500);
      }

      const content = body.choices?.[0]?.message?.content;
      if (!content) throw new ProviderError(this.name, "The model returned an empty response.", true);

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new ProviderError(this.name, "The model did not return valid JSON.", true);
      }

      return {
        data: request.parse(parsed),
        provider: this.name,
        model: this.model,
        latencyMs: Date.now() - started,
        usage: {
          inputTokens: body.usage?.prompt_tokens,
          outputTokens: body.usage?.completion_tokens,
        },
      };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new ProviderError(this.name, "The provider timed out after 120s.", true);
      }
      throw new ProviderError(this.name, error instanceof Error ? error.message : "Unknown provider error", true);
    } finally {
      clearTimeout(timeout);
    }
  }
}

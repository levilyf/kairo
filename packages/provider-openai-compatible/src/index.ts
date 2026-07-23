import type {
  Provider,
  ProviderCapabilities,
  ProviderRequest,
  ProviderResponse,
  ProviderStreamEvent,
} from "@kairo/core";
import { assertProvider } from "@kairo/core";
import {
  OpenAICompatibleProtocol,
  createOpenAICompatibleClient,
  type OpenAIChatCompletionsClient,
} from "@kairo/protocol-openai";

export interface OpenAICompatibleProviderConfig {
  readonly apiKey?: string;
  readonly baseURL?: string;
  readonly baseUrl?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly defaults?: Readonly<Record<string, unknown>>;
  readonly defaultRequestOptions?: Readonly<Record<string, unknown>>;
  readonly defaultModel?: string;
  readonly name?: string;
  readonly description?: string;
  readonly client?: OpenAIChatCompletionsClient;
}

export interface OpenAICompatibleProviderFactoryInput {
  readonly id: string;
  readonly protocol: string;
  readonly config: Readonly<Record<string, unknown>>;
}

export class OpenAICompatibleProvider implements Provider {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly capabilities: ProviderCapabilities;

  private readonly protocol: OpenAICompatibleProtocol;

  constructor(id: string, config: OpenAICompatibleProviderConfig = {}) {
    const name = normalizeOptionalString(config.name) ?? id;
    const description =
      normalizeOptionalString(config.description) ??
      "OpenAI-compatible Chat Completions provider";
    const defaultModel = normalizeOptionalString(config.defaultModel);
    const defaults = normalizeRecord(config.defaultRequestOptions) ?? normalizeRecord(config.defaults);
    const capabilities: ProviderCapabilities = Object.freeze({
      streaming: true,
      tools: true,
      modalities: Object.freeze(["text", "image"] as const),
    });

    this.protocol = new OpenAICompatibleProtocol({
      id,
      name,
      description,
      capabilities,
      client:
        config.client ??
        createOpenAICompatibleClient({
          apiKey: normalizeOptionalString(config.apiKey) ?? "kairo",
          ...(
            normalizeOptionalString(config.baseURL) ??
            normalizeOptionalString(config.baseUrl)
              ? { baseURL: normalizeOptionalString(config.baseURL) ?? normalizeOptionalString(config.baseUrl)! }
              : {}
          ),
          ...(config.headers !== undefined ? { defaultHeaders: config.headers } : {}),
        }),
      ...(defaultModel !== undefined ? { defaultModel } : {}),
      ...(defaults !== undefined ? { defaultRequestOptions: defaults } : {}),
    });

    this.id = this.protocol.id;
    this.name = this.protocol.name;
    if (this.protocol.description !== undefined) {
      this.description = this.protocol.description;
    }
    this.capabilities = this.protocol.capabilities;

    assertProvider(this);
  }

  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    return this.protocol.complete(request);
  }

  stream(request: ProviderRequest): AsyncIterable<ProviderStreamEvent> {
    return this.protocol.stream!(request);
  }
}

export function createOpenAICompatibleProvider(
  input: OpenAICompatibleProviderFactoryInput,
): OpenAICompatibleProvider {
  return new OpenAICompatibleProvider(
    input.id,
    input.config as OpenAICompatibleProviderConfig,
  );
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeRecord(
  value: unknown,
): Readonly<Record<string, unknown>> | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Readonly<Record<string, unknown>>;
}

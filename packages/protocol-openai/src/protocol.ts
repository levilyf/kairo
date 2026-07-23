/**
 * Reusable OpenAI-compatible protocol logic.
 */

import type {
  Provider,
  ProviderCapabilities,
  ProviderRequest,
  ProviderResponse,
  ProviderStreamEvent,
} from "@kairo/core";
import { assertProvider } from "@kairo/core";
import OpenAI from "openai";
import {
  errorOptions,
  ProtocolOpenAIError,
  ProtocolOpenAIErrorCode,
} from "./errors.js";
import { mapProviderRequestToOpenAI } from "./mapping/request.js";
import { mapOpenAIResponseToProvider } from "./mapping/response.js";
import { OpenAIStreamMapper } from "./mapping/stream.js";

/** Minimal Chat Completions surface used by the protocol (testable). */
export interface OpenAIChatCompletionsClient {
  chat: {
    completions: {
      /**
       * Non-stream calls resolve to a completion object.
       * Stream calls resolve to an AsyncIterable of chunks (OpenAI SDK shape).
       */
      create(
        body: Record<string, unknown>,
        options?: { signal?: AbortSignal },
      ): Promise<unknown>;
    };
  };
}

export interface OpenAICompatibleProtocolOptions {
  /** Provider identity */
  readonly id: string;
  readonly name: string;
  readonly description?: string;

  /** Statically defined capabilities */
  readonly capabilities: ProviderCapabilities;

  /** Configured client (OpenAI SDK or compatible mock) */
  readonly client: OpenAIChatCompletionsClient;

  /** Protocol defaults */
  readonly defaultModel?: string;
  readonly defaultRequestOptions?: Readonly<Record<string, unknown>>;
}

/**
 * Reusable implementation of the Core Provider contract for any
 * OpenAI-compatible API.
 */
export class OpenAICompatibleProtocol implements Provider {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly capabilities: ProviderCapabilities;

  /**
   * Present only when `capabilities.streaming` is true.
   * Assigned as an own-property so `assertProvider` sees it iff streaming.
   */
  readonly stream?: (
    request: ProviderRequest,
  ) => AsyncIterable<ProviderStreamEvent>;

  private readonly client: OpenAIChatCompletionsClient;
  private readonly defaultModel?: string;
  private readonly defaultRequestOptions?: Readonly<Record<string, unknown>>;

  constructor(options: OpenAICompatibleProtocolOptions) {
    this.id = options.id;
    this.name = options.name;
    if (options.description !== undefined) {
      this.description = options.description;
    }
    this.capabilities = options.capabilities;
    this.client = options.client;
    if (options.defaultModel !== undefined) {
      this.defaultModel = options.defaultModel;
    }
    if (options.defaultRequestOptions !== undefined) {
      this.defaultRequestOptions = options.defaultRequestOptions;
    }

    // Conditionally expose stream() only when streaming capability is declared
    if (this.capabilities.streaming === true) {
      this.stream = this.streamImpl.bind(this);
    }

    // Optional early validation; the wrapper should also do this, but safe here too
    assertProvider(this);
  }

  /**
   * Perform a non-streaming Chat Completions call and map to ProviderResponse.
   */
  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    this.assertNotCancelled(request.signal, request.model);

    const body = this.buildBody(request, false);

    let raw: unknown;
    try {
      raw = await this.client.chat.completions.create(
        body,
        request.signal !== undefined ? { signal: request.signal } : undefined,
      );
    } catch (error) {
      throw this.mapSdkError(error, request);
    }

    this.assertNotCancelled(request.signal, request.model);

    try {
      return mapOpenAIResponseToProvider(raw, {
        providerId: this.id,
        ...(typeof body.model === "string"
          ? { model: body.model }
          : { model: request.model }),
      });
    } catch (error) {
      if (error instanceof ProtocolOpenAIError) {
        throw error;
      }
      throw new ProtocolOpenAIError(
        errorOptions({
          code: ProtocolOpenAIErrorCode.MAPPING_FAILED,
          message:
            error instanceof Error
              ? error.message
              : "Failed to map OpenAI response",
          providerId: this.id,
          model: request.model,
          cause: error,
        }),
      );
    }
  }

  /**
   * Internal stream implementation. Bound and assigned to `this.stream`
   * only when `capabilities.streaming` is true.
   */
  private async *streamImpl(
    request: ProviderRequest,
  ): AsyncIterable<ProviderStreamEvent> {
    this.assertNotCancelled(request.signal, request.model);

    const body = this.buildBody(request, true);
    const mapOptions = {
      providerId: this.id,
      ...(typeof body.model === "string"
        ? { model: body.model }
        : { model: request.model }),
    };
    const mapper = new OpenAIStreamMapper(mapOptions);

    let raw: unknown;
    try {
      raw = await this.client.chat.completions.create(
        body,
        request.signal !== undefined ? { signal: request.signal } : undefined,
      );
    } catch (error) {
      throw this.mapSdkError(error, request);
    }

    this.assertNotCancelled(request.signal, request.model);

    try {
      for await (const chunk of asAsyncIterable(raw, this.id, request.model)) {
        this.assertNotCancelled(request.signal, request.model);
        for (const event of mapper.push(chunk)) {
          yield event;
        }
      }
      this.assertNotCancelled(request.signal, request.model);
      for (const event of mapper.end()) {
        yield event;
      }
    } catch (error) {
      if (error instanceof ProtocolOpenAIError) {
        throw error;
      }
      if (isAbortError(error) || request.signal?.aborted) {
        throw this.mapSdkError(error, request);
      }
      throw new ProtocolOpenAIError(
        errorOptions({
          code: ProtocolOpenAIErrorCode.MAPPING_FAILED,
          message:
            error instanceof Error
              ? error.message
              : "Failed to map OpenAI stream",
          providerId: this.id,
          model: request.model,
          cause: error,
        }),
      );
    }
  }

  private buildBody(
    request: ProviderRequest,
    stream: boolean,
  ): Record<string, unknown> {
    return mapProviderRequestToOpenAI(request, {
      providerId: this.id,
      stream,
      ...(this.defaultRequestOptions !== undefined
        ? { defaultRequestOptions: this.defaultRequestOptions }
        : {}),
      ...(this.defaultModel !== undefined
        ? { defaultModel: this.defaultModel }
        : {}),
    });
  }

  private mapSdkError(
    error: unknown,
    request: ProviderRequest,
  ): ProtocolOpenAIError {
    if (error instanceof ProtocolOpenAIError) {
      return error;
    }

    if (isAbortError(error) || request.signal?.aborted) {
      return new ProtocolOpenAIError(
        errorOptions({
          code: ProtocolOpenAIErrorCode.CANCELLED,
          message: "OpenAI request cancelled",
          providerId: this.id,
          model: request.model,
          cause: error,
          details: { reason: request.signal?.reason },
        }),
      );
    }

    const status = extractStatus(error);
    const message =
      error instanceof Error ? error.message : "OpenAI request failed";

    if (status === 401 || status === 403) {
      return new ProtocolOpenAIError(
        errorOptions({
          code: ProtocolOpenAIErrorCode.AUTHENTICATION,
          message,
          status,
          providerId: this.id,
          model: request.model,
          cause: error,
        }),
      );
    }

    if (status === 429) {
      return new ProtocolOpenAIError(
        errorOptions({
          code: ProtocolOpenAIErrorCode.RATE_LIMITED,
          message,
          status,
          providerId: this.id,
          model: request.model,
          cause: error,
        }),
      );
    }

    return new ProtocolOpenAIError(
      errorOptions({
        code: ProtocolOpenAIErrorCode.API_ERROR,
        message,
        status,
        providerId: this.id,
        model: request.model,
        cause: error,
      }),
    );
  }

  private assertNotCancelled(
    signal: AbortSignal | undefined,
    model: string | undefined,
  ): void {
    if (signal?.aborted) {
      throw new ProtocolOpenAIError(
        errorOptions({
          code: ProtocolOpenAIErrorCode.CANCELLED,
          message: "OpenAI request cancelled",
          providerId: this.id,
          model,
          details: { reason: signal.reason },
        }),
      );
    }
  }
}

/**
 * Reusable client construction for OpenAI-compatible endpoints.
 */
export interface CreateOpenAIClientOptions {
  readonly apiKey?: string;
  readonly baseURL?: string;
  readonly organization?: string;
  readonly project?: string;
  readonly defaultHeaders?: Readonly<Record<string, string>>;
}

export function createOpenAICompatibleClient(
  options: CreateOpenAIClientOptions,
): OpenAIChatCompletionsClient {
  const clientOptions: ConstructorParameters<typeof OpenAI>[0] = {};

  if (options.apiKey !== undefined) {
    clientOptions.apiKey = options.apiKey;
  }
  if (options.baseURL !== undefined) {
    clientOptions.baseURL = options.baseURL;
  }
  if (options.organization !== undefined) {
    clientOptions.organization = options.organization;
  }
  if (options.project !== undefined) {
    clientOptions.project = options.project;
  }
  if (options.defaultHeaders !== undefined) {
    clientOptions.defaultHeaders = { ...options.defaultHeaders };
  }

  // The SDK might still throw if apiKey is missing and process.env has none.
  return new OpenAI(clientOptions) as unknown as OpenAIChatCompletionsClient;
}

function isAbortError(error: unknown): boolean {
  if (error === null || typeof error !== "object") {
    return false;
  }
  const name = (error as { name?: unknown }).name;
  if (name === "AbortError" || name === "APIUserAbortError") {
    return true;
  }
  const code = (error as { code?: unknown }).code;
  return code === "ABORT_ERR" || code === "CANCELLED";
}

function asAsyncIterable(
  value: unknown,
  providerId: string,
  model: string | undefined,
): AsyncIterable<unknown> {
  if (value !== null && typeof value === "object") {
    const iterator = (value as AsyncIterable<unknown>)[
      Symbol.asyncIterator
    ];
    if (typeof iterator === "function") {
      return value as AsyncIterable<unknown>;
    }
  }
  throw new ProtocolOpenAIError(
    errorOptions({
      code: ProtocolOpenAIErrorCode.UNEXPECTED_RESPONSE,
      message:
        "OpenAI stream response is not an AsyncIterable (expected stream: true result)",
      providerId,
      model,
    }),
  );
}

function extractStatus(error: unknown): number | undefined {
  if (error === null || typeof error !== "object") {
    return undefined;
  }
  const status = (error as { status?: unknown }).status;
  if (typeof status === "number") {
    return status;
  }
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  if (typeof statusCode === "number") {
    return statusCode;
  }
  return undefined;
}

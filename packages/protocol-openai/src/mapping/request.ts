/**
 * Map Core ProviderRequest → OpenAI Chat Completions body.
 *
 * Hides every OpenAI-specific detail behind this boundary.
 * Core never sees vendor field names.
 */

import type {
  ProviderContentPart,
  ProviderMessage,
  ProviderRequest,
  ProviderToolDefinition,
} from "@kairo/core";
import {
  errorOptions,
  ProtocolOpenAIError,
  ProtocolOpenAIErrorCode,
} from "../errors.js";

export interface MapRequestOptions {
  readonly providerId?: string;
  /** Merged under request.options (request wins). */
  readonly defaultRequestOptions?: Readonly<Record<string, unknown>>;
  /**
   * Fallback model when request.model is empty (should not happen via Gateway).
   */
  readonly defaultModel?: string;
  /**
   * When true, body.stream is true (Provider.stream path).
   * When false/omitted, body.stream is false (Provider.complete path).
   * Opaque request.options.stream is always stripped and ignored.
   */
  readonly stream?: boolean;
}

/**
 * OpenAI Chat Completions request body (JSON-serializable subset).
 * Typed loosely so we do not couple to a specific SDK version's request type.
 */
export type OpenAIChatCompletionBody = Record<string, unknown>;

/**
 * Translate a provider-neutral request into a Chat Completions body.
 */
export function mapProviderRequestToOpenAI(
  request: ProviderRequest,
  options: MapRequestOptions = {},
): OpenAIChatCompletionBody {
  if (request === null || typeof request !== "object") {
    throw new ProtocolOpenAIError(
      errorOptions({
        code: ProtocolOpenAIErrorCode.INVALID_REQUEST,
        message: "ProviderRequest is required",
        field: "request",
        providerId: options.providerId,
      }),
    );
  }

  const model =
    normalizeNonEmpty(request.model) ??
    normalizeNonEmpty(options.defaultModel);

  if (model === undefined) {
    throw new ProtocolOpenAIError(
      errorOptions({
        code: ProtocolOpenAIErrorCode.INVALID_REQUEST,
        message: "model must be a non-empty string",
        field: "model",
        providerId: options.providerId,
      }),
    );
  }

  if (!Array.isArray(request.input)) {
    throw new ProtocolOpenAIError(
      errorOptions({
        code: ProtocolOpenAIErrorCode.INVALID_REQUEST,
        message: "input must be an array of messages",
        field: "input",
        providerId: options.providerId,
        model,
      }),
    );
  }

  const messages = request.input.map((message, index) =>
    mapMessage(message, index, options.providerId, model),
  );

  const defaults = options.defaultRequestOptions ?? {};
  const requestOptions = request.options ?? {};
  const mergedOptions = { ...defaults, ...requestOptions };

  // Reserved keys that Core owns; never take from opaque options.
  const {
    model: _ignoredModel,
    messages: _ignoredMessages,
    tools: _ignoredTools,
    stream: _ignoredStream,
    signal: _ignoredSignal,
    ...safeOptions
  } = mergedOptions as Record<string, unknown>;

  const body: OpenAIChatCompletionBody = {
    model,
    messages,
    ...safeOptions,
  };

  // Core owns stream: complete() forces false; stream() forces true.
  body.stream = options.stream === true;

  if (request.tools !== undefined && request.tools.length > 0) {
    body.tools = request.tools.map((tool) => mapTool(tool));
  }

  return body;
}

function mapMessage(
  message: ProviderMessage,
  index: number,
  providerId: string | undefined,
  model: string,
): Record<string, unknown> {
  if (message === null || typeof message !== "object") {
    throw new ProtocolOpenAIError(
      errorOptions({
        code: ProtocolOpenAIErrorCode.MAPPING_FAILED,
        message: `input[${index}] must be a message object`,
        field: `input[${index}]`,
        providerId,
        model,
      }),
    );
  }

  const role = typeof message.role === "string" ? message.role : "user";
  const content = Array.isArray(message.content) ? message.content : [];

  if (role === "tool") {
    return mapToolRoleMessage(content, index, providerId, model);
  }

  if (role === "assistant") {
    return mapAssistantMessage(content, index, providerId, model);
  }

  return {
    role,
    content: mapContentParts(content, role, index, providerId, model),
  };
}

function mapAssistantMessage(
  content: readonly ProviderContentPart[],
  index: number,
  providerId: string | undefined,
  model: string,
): Record<string, unknown> {
  const textParts: unknown[] = [];
  const toolCalls: Record<string, unknown>[] = [];

  for (const part of content) {
    if (part.type === "tool_call") {
      toolCalls.push({
        id: part.id,
        type: "function",
        function: {
          name: part.name,
          arguments: serializeToolArguments(part.arguments),
        },
      });
      continue;
    }
    if (part.type === "text") {
      textParts.push(part.text);
      continue;
    }
    textParts.push(mapSingleContentPart(part, "assistant", index, providerId, model));
  }

  const message: Record<string, unknown> = {
    role: "assistant",
  };

  if (toolCalls.length > 0) {
    message.tool_calls = toolCalls;
  }

  if (textParts.length === 0) {
    message.content = toolCalls.length > 0 ? null : "";
  } else if (textParts.every((p) => typeof p === "string")) {
    message.content = (textParts as string[]).join("");
  } else {
    message.content = textParts.map((p) =>
      typeof p === "string" ? { type: "text", text: p } : p,
    );
  }

  return message;
}

function mapToolRoleMessage(
  content: readonly ProviderContentPart[],
  index: number,
  providerId: string | undefined,
  model: string,
): Record<string, unknown> {
  const toolResult = content.find((p) => p.type === "tool_result");
  if (toolResult && toolResult.type === "tool_result") {
    return {
      role: "tool",
      tool_call_id: toolResult.id,
      content: serializeToolResult(toolResult.result),
      ...(toolResult.name !== undefined ? { name: toolResult.name } : {}),
    };
  }

  const text = content
    .filter((p) => p.type === "text")
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("");

  throw new ProtocolOpenAIError(
    errorOptions({
      code: ProtocolOpenAIErrorCode.MAPPING_FAILED,
      message: `input[${index}] tool role requires a tool_result content part (got text length ${text.length})`,
      field: `input[${index}]`,
      providerId,
      model,
    }),
  );
}

function mapContentParts(
  content: readonly ProviderContentPart[],
  role: string,
  index: number,
  providerId: string | undefined,
  model: string,
): string | unknown[] {
  if (content.length === 0) {
    return "";
  }

  if (content.every((p) => p.type === "text")) {
    return content.map((p) => (p.type === "text" ? p.text : "")).join("");
  }

  return content.map((part) =>
    mapSingleContentPart(part, role, index, providerId, model),
  );
}

function mapSingleContentPart(
  part: ProviderContentPart,
  role: string,
  index: number,
  providerId: string | undefined,
  model: string,
): Record<string, unknown> {
  if (part.type === "text") {
    return { type: "text", text: part.text };
  }

  if (part.type === "image") {
    if (typeof part.uri === "string" && part.uri.length > 0) {
      return {
        type: "image_url",
        image_url: { url: part.uri },
      };
    }
    if (typeof part.data === "string" && part.data.length > 0) {
      const mime = part.mimeType ?? "image/png";
      const url = part.data.startsWith("data:")
        ? part.data
        : `data:${mime};base64,${part.data}`;
      return {
        type: "image_url",
        image_url: { url },
      };
    }
    throw new ProtocolOpenAIError(
      errorOptions({
        code: ProtocolOpenAIErrorCode.MAPPING_FAILED,
        message: `input[${index}] image part requires uri or data`,
        field: `input[${index}].content`,
        providerId,
        model,
        details: { role },
      }),
    );
  }

  if (part.type === "tool_call") {
    throw new ProtocolOpenAIError(
      errorOptions({
        code: ProtocolOpenAIErrorCode.MAPPING_FAILED,
        message: `input[${index}] tool_call content is only valid on assistant messages`,
        field: `input[${index}].content`,
        providerId,
        model,
        details: { role },
      }),
    );
  }

  if (part.type === "tool_result") {
    throw new ProtocolOpenAIError(
      errorOptions({
        code: ProtocolOpenAIErrorCode.MAPPING_FAILED,
        message: `input[${index}] tool_result content is only valid on tool messages`,
        field: `input[${index}].content`,
        providerId,
        model,
        details: { role },
      }),
    );
  }

  return {
    type: "text",
    text: safeJson(part.value),
  };
}

function mapTool(tool: ProviderToolDefinition): Record<string, unknown> {
  const parameters =
    tool.parameters !== undefined
      ? tool.parameters
      : { type: "object", properties: {} };

  return {
    type: "function",
    function: {
      name: tool.name,
      ...(tool.description !== undefined
        ? { description: tool.description }
        : {}),
      parameters,
    },
  };
}

function serializeToolArguments(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return safeJson(value ?? {});
}

function serializeToolResult(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return safeJson(value ?? null);
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function normalizeNonEmpty(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

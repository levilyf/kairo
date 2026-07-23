/**
 * Map OpenAI Chat Completions response → Core ProviderResponse.
 */

import type {
  ProviderContentPart,
  ProviderResponse,
  ProviderStopReason,
} from "@kairo/core";
import {
  errorOptions,
  ProtocolOpenAIError,
  ProtocolOpenAIErrorCode,
} from "../errors.js";

export interface MapResponseOptions {
  readonly providerId?: string;
  readonly model?: string;
}

/**
 * Translate an OpenAI chat.completions response into a provider-neutral response.
 */
export function mapOpenAIResponseToProvider(
  raw: unknown,
  options: MapResponseOptions = {},
): ProviderResponse {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ProtocolOpenAIError(
      errorOptions({
        code: ProtocolOpenAIErrorCode.UNEXPECTED_RESPONSE,
        message: "OpenAI response must be an object",
        providerId: options.providerId,
        model: options.model,
      }),
    );
  }

  const response = raw as Record<string, unknown>;
  const id =
    typeof response.id === "string" && response.id.trim().length > 0
      ? response.id
      : `openai-${Date.now()}`;

  const choices = Array.isArray(response.choices) ? response.choices : [];
  const first = choices[0];

  if (first === null || typeof first !== "object") {
    throw new ProtocolOpenAIError(
      errorOptions({
        code: ProtocolOpenAIErrorCode.UNEXPECTED_RESPONSE,
        message: "OpenAI response is missing choices[0]",
        providerId: options.providerId,
        model: options.model,
        details: { id },
      }),
    );
  }

  const choice = first as Record<string, unknown>;
  const message =
    choice.message !== null &&
    typeof choice.message === "object" &&
    !Array.isArray(choice.message)
      ? (choice.message as Record<string, unknown>)
      : {};

  const output = mapMessageToOutput(message, options);
  const stopReason = mapStopReason(
    typeof choice.finish_reason === "string" ? choice.finish_reason : undefined,
    output,
  );

  const model =
    typeof response.model === "string" ? response.model : options.model;

  const usage =
    response.usage !== null &&
    typeof response.usage === "object" &&
    !Array.isArray(response.usage)
      ? Object.freeze({ ...(response.usage as Record<string, unknown>) })
      : undefined;

  const metadata: Record<string, unknown> = {
    vendor: "openai",
    ...(typeof choice.finish_reason === "string"
      ? { finish_reason: choice.finish_reason }
      : {}),
    ...(typeof response.system_fingerprint === "string"
      ? { system_fingerprint: response.system_fingerprint }
      : {}),
  };

  return {
    id,
    output: Object.freeze([...output]),
    stopReason,
    ...(model !== undefined ? { model } : {}),
    ...(usage !== undefined ? { usage } : {}),
    metadata: Object.freeze(metadata),
  };
}

function mapMessageToOutput(
  message: Record<string, unknown>,
  options: MapResponseOptions,
): ProviderContentPart[] {
  const parts: ProviderContentPart[] = [];

  const content = message.content;
  if (typeof content === "string" && content.length > 0) {
    parts.push({ type: "text", text: content });
  } else if (Array.isArray(content)) {
    for (const item of content) {
      const mapped = mapContentItem(item, options);
      if (mapped !== undefined) {
        parts.push(mapped);
      }
    }
  }

  const toolCalls = message.tool_calls;
  if (Array.isArray(toolCalls)) {
    for (const call of toolCalls) {
      parts.push(mapToolCall(call, options));
    }
  }

  if (
    (!Array.isArray(toolCalls) || toolCalls.length === 0) &&
    message.function_call !== null &&
    typeof message.function_call === "object"
  ) {
    parts.push(
      mapLegacyFunctionCall(message.function_call as Record<string, unknown>),
    );
  }

  return parts;
}

function mapContentItem(
  item: unknown,
  _options: MapResponseOptions,
): ProviderContentPart | undefined {
  if (item === null || typeof item !== "object") {
    return undefined;
  }
  const part = item as Record<string, unknown>;
  const type = typeof part.type === "string" ? part.type : undefined;

  if (type === "text" || typeof part.text === "string") {
    return {
      type: "text",
      text: typeof part.text === "string" ? part.text : "",
    };
  }

  if (type === "image_url") {
    const imageUrl =
      part.image_url !== null && typeof part.image_url === "object"
        ? (part.image_url as Record<string, unknown>)
        : {};
    const url = typeof imageUrl.url === "string" ? imageUrl.url : undefined;
    if (url === undefined) {
      return undefined;
    }
    if (url.startsWith("data:")) {
      const match = /^data:([^;]+);base64,(.+)$/.exec(url);
      if (match) {
        const mimeType = match[1];
        const data = match[2];
        return {
          type: "image",
          ...(mimeType !== undefined ? { mimeType } : {}),
          ...(data !== undefined ? { data } : {}),
        };
      }
    }
    return { type: "image", uri: url };
  }

  return {
    type: "data",
    value: part,
  };
}

function mapToolCall(
  call: unknown,
  options: MapResponseOptions,
): ProviderContentPart {
  if (call === null || typeof call !== "object") {
    throw new ProtocolOpenAIError(
      errorOptions({
        code: ProtocolOpenAIErrorCode.UNEXPECTED_RESPONSE,
        message: "tool_call entry must be an object",
        providerId: options.providerId,
        model: options.model,
      }),
    );
  }

  const entry = call as Record<string, unknown>;
  const id =
    typeof entry.id === "string" && entry.id.trim().length > 0
      ? entry.id
      : "unknown";

  const fn =
    entry.function !== null &&
    typeof entry.function === "object" &&
    !Array.isArray(entry.function)
      ? (entry.function as Record<string, unknown>)
      : {};

  const name =
    typeof fn.name === "string" && fn.name.trim().length > 0
      ? fn.name
      : "unknown";

  const argsRaw = fn.arguments;
  let args: unknown = argsRaw;
  if (typeof argsRaw === "string") {
    try {
      args = JSON.parse(argsRaw) as unknown;
    } catch {
      args = argsRaw;
    }
  }

  return {
    type: "tool_call",
    id,
    name,
    arguments: args ?? {},
  };
}

function mapLegacyFunctionCall(
  fn: Record<string, unknown>,
): ProviderContentPart {
  const name =
    typeof fn.name === "string" && fn.name.trim().length > 0
      ? fn.name
      : "unknown";
  const argsRaw = fn.arguments;
  let args: unknown = argsRaw;
  if (typeof argsRaw === "string") {
    try {
      args = JSON.parse(argsRaw) as unknown;
    } catch {
      args = argsRaw;
    }
  }
  return {
    type: "tool_call",
    id: `function_call:${name}`,
    name,
    arguments: args ?? {},
  };
}

function mapStopReason(
  finishReason: string | undefined,
  output: readonly ProviderContentPart[],
): ProviderStopReason {
  if (finishReason === "stop") {
    return "end";
  }
  if (finishReason === "tool_calls" || finishReason === "function_call") {
    return "tool_calls";
  }
  if (finishReason === "length") {
    return "length";
  }
  if (finishReason === "content_filter") {
    return "error";
  }
  if (finishReason === "cancelled") {
    return "cancelled";
  }
  if (output.some((p) => p.type === "tool_call")) {
    return "tool_calls";
  }
  if (finishReason !== undefined && finishReason.length > 0) {
    return finishReason;
  }
  return "end";
}

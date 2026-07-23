/**
 * ProviderRequestTranslator — Context → ProviderRequest.
 *
 * Provider-neutral mapping only. No vendor formats (OpenAI/Anthropic/etc).
 * Gateway owns this translation; builders/assembler remain unaware of requests.
 */

import type { Context } from "../context/context.js";
import type {
  ProviderContentPart,
  ProviderMessage,
  ProviderRequest,
  ProviderToolDefinition,
} from "../contracts/provider.js";
import {
  ProviderGatewayError,
  ProviderGatewayErrorCode,
} from "./errors.js";

export interface TranslateOptions {
  readonly model: string;
  readonly options?: Readonly<Record<string, unknown>>;
  readonly signal?: AbortSignal;
}

/**
 * Translate an assembled Context into a provider-neutral ProviderRequest.
 */
export function translateContextToProviderRequest(
  context: Context,
  options: TranslateOptions,
): ProviderRequest {
  if (typeof options.model !== "string" || options.model.trim().length === 0) {
    throw new ProviderGatewayError({
      code: ProviderGatewayErrorCode.INVALID_INVOCATION,
      message: "model must be a non-empty string",
      field: "model",
      sessionId: context.sessionId,
      turnId: context.turnId,
      runtimeId: context.runtimeId,
    });
  }

  try {
    const input: ProviderMessage[] = [];

    if (context.instructions.length > 0) {
      input.push({
        role: "system",
        content: context.instructions.map(
          (text): ProviderContentPart => ({ type: "text", text }),
        ),
      });
    }

    for (const message of context.messages) {
      input.push({
        role: message.role,
        content: message.content.map((part) => mapContentPart(part)),
      });
    }

    const tools = mapTools(context.toolDefinitions);

    const request: ProviderRequest = {
      model: options.model,
      input: Object.freeze([...input]),
      ...(tools !== undefined ? { tools } : {}),
      ...(options.options !== undefined
        ? { options: Object.freeze({ ...options.options }) }
        : {}),
      ...(options.signal !== undefined ? { signal: options.signal } : {}),
    };

    return request;
  } catch (error) {
    if (error instanceof ProviderGatewayError) {
      throw error;
    }
    throw new ProviderGatewayError({
      code: ProviderGatewayErrorCode.TRANSLATION_FAILED,
      message:
        error instanceof Error
          ? error.message
          : "Failed to translate Context to ProviderRequest",
      sessionId: context.sessionId,
      turnId: context.turnId,
      runtimeId: context.runtimeId,
      cause: error,
    });
  }
}

function mapContentPart(
  part: Readonly<Record<string, unknown>>,
): ProviderContentPart {
  const type = typeof part.type === "string" ? part.type : "data";

  if (type === "text") {
    return {
      type: "text",
      text: typeof part.text === "string" ? part.text : String(part.text ?? ""),
    };
  }

  if (type === "image") {
    return {
      type: "image",
      ...(typeof part.mimeType === "string" ? { mimeType: part.mimeType } : {}),
      ...(typeof part.data === "string" ? { data: part.data } : {}),
      ...(typeof part.uri === "string" ? { uri: part.uri } : {}),
    };
  }

  if (type === "tool_call") {
    return {
      type: "tool_call",
      id: typeof part.id === "string" ? part.id : "unknown",
      name: typeof part.name === "string" ? part.name : "unknown",
      arguments: part.arguments,
    };
  }

  if (type === "tool_result") {
    return {
      type: "tool_result",
      id: typeof part.id === "string" ? part.id : "unknown",
      ...(typeof part.name === "string" ? { name: part.name } : {}),
      result: part.result,
    };
  }

  return {
    type: "data",
    ...(typeof part.mimeType === "string" ? { mimeType: part.mimeType } : {}),
    value: "value" in part ? part.value : part,
  };
}

function mapTools(
  tools: Context["toolDefinitions"],
): readonly ProviderToolDefinition[] | undefined {
  if (tools.length === 0) {
    return undefined;
  }

  return Object.freeze(
    tools.map((tool, index) => {
      const name =
        typeof tool.name === "string" && tool.name.trim().length > 0
          ? tool.name
          : typeof tool.id === "string" && tool.id.trim().length > 0
            ? tool.id
            : `tool-${index}`;
      const id =
        typeof tool.id === "string" && tool.id.trim().length > 0
          ? tool.id
          : name;

      const mapped: ProviderToolDefinition = {
        id,
        name,
        ...(typeof tool.description === "string"
          ? { description: tool.description }
          : {}),
        ...("parameters" in tool ? { parameters: tool.parameters } : {}),
      };
      return mapped;
    }),
  );
}

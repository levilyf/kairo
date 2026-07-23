import { vi } from "vitest";
import type { OpenAIChatCompletionsClient } from "../src/protocol.js";
import type { ProviderRequest } from "@kairo/core";

export function makeMockClient(
  createImpl?: (
    body: Record<string, unknown>,
    options?: { signal?: AbortSignal },
  ) => Promise<unknown>,
): {
  client: OpenAIChatCompletionsClient;
  create: ReturnType<typeof vi.fn>;
} {
  const create =
    createImpl !== undefined
      ? vi.fn(createImpl)
      : vi.fn(async () => makeTextCompletion("hello"));

  const client: OpenAIChatCompletionsClient = {
    chat: {
      completions: {
        create: create as OpenAIChatCompletionsClient["chat"]["completions"]["create"],
      },
    },
  };

  return { client, create };
}

/** AsyncIterable of OpenAI-style chat.completion.chunk objects. */
export async function* makeChunkStream(
  chunks: readonly Record<string, unknown>[],
): AsyncIterable<Record<string, unknown>> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

export function makeTextChunk(
  content: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "chatcmpl-stream",
    object: "chat.completion.chunk",
    model: "gpt-4o-mini",
    choices: [
      {
        index: 0,
        delta: { content },
        finish_reason: null,
      },
    ],
    ...overrides,
  };
}

export function makeFinishChunk(
  finishReason: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "chatcmpl-stream",
    object: "chat.completion.chunk",
    model: "gpt-4o-mini",
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: finishReason,
      },
    ],
    ...overrides,
  };
}

export function makeTextCompletion(
  text: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "chatcmpl-test",
    object: "chat.completion",
    model: "gpt-4o-mini",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: text,
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    },
    ...overrides,
  };
}

export function makeToolCallCompletion(
  calls: Array<{ id: string; name: string; arguments: string }>,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "chatcmpl-tools",
    object: "chat.completion",
    model: "gpt-4o-mini",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: null,
          tool_calls: calls.map((c) => ({
            id: c.id,
            type: "function",
            function: {
              name: c.name,
              arguments: c.arguments,
            },
          })),
        },
        finish_reason: "tool_calls",
      },
    ],
    usage: {
      prompt_tokens: 20,
      completion_tokens: 8,
      total_tokens: 28,
    },
    ...overrides,
  };
}

export function baseRequest(
  overrides: Partial<ProviderRequest> = {},
): ProviderRequest {
  return {
    model: "gpt-4o-mini",
    input: [
      {
        role: "user",
        content: [{ type: "text", text: "hi" }],
      },
    ],
    ...overrides,
  };
}

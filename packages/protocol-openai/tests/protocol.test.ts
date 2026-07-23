import { describe, expect, it, vi } from "vitest";
import { assertProvider } from "@kairo/core";
import {
  ProtocolOpenAIError,
  ProtocolOpenAIErrorCode,
} from "../src/errors.js";
import { OpenAICompatibleProtocol } from "../src/protocol.js";
import {
  baseRequest,
  makeChunkStream,
  makeFinishChunk,
  makeMockClient,
  makeTextChunk,
  makeTextCompletion,
  makeToolCallCompletion,
} from "./helpers.js";

function createProtocol(client = makeMockClient().client, options: any = {}) {
  return new OpenAICompatibleProtocol({
    id: "test",
    name: "Test",
    capabilities: { streaming: false, tools: true, modalities: ["text"] },
    client,
    ...options,
  });
}

function createStreamingProtocol(
  client = makeMockClient().client,
  options: any = {},
) {
  return new OpenAICompatibleProtocol({
    id: "test",
    name: "Test",
    capabilities: { streaming: true, tools: true, modalities: ["text"] },
    client,
    ...options,
  });
}

async function collect<
  T,
>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) {
    items.push(item);
  }
  return items;
}

describe("OpenAICompatibleProtocol", () => {
  it("constructs a valid Core Provider", () => {
    const provider = createProtocol();

    expect(() => assertProvider(provider)).not.toThrow();
    expect(provider.id).toBe("test");
    expect(provider.name).toBe("Test");
    expect(provider.capabilities.streaming).toBe(false);
  });

  it("passes request parameters to Chat Completions body", async () => {
    const { client, create } = makeMockClient();
    const provider = createProtocol(client, {
      defaultRequestOptions: { temperature: 0.5 },
    });

    const request = baseRequest({
      model: "gpt-test",
      options: { top_p: 0.9 },
    });

    await provider.complete(request);

    expect(create).toHaveBeenCalledTimes(1);
    const body = create.mock.calls[0]![0] as Record<string, unknown>;
    expect(body.model).toBe("gpt-test");
    expect(body.temperature).toBe(0.5); // from default
    expect(body.top_p).toBe(0.9); // from request
    expect(body.stream).toBe(false);
  });

  it("handles empty model via defaultModel", async () => {
    const { client, create } = makeMockClient();
    const provider = createProtocol(client, {
      defaultModel: "gpt-fallback",
    });

    const request = baseRequest({ model: "" });
    await provider.complete(request);

    const body = create.mock.calls[0]![0] as Record<string, unknown>;
    expect(body.model).toBe("gpt-fallback");
  });

  it("maps OpenAI Chat Completions text response to ProviderResponse", async () => {
    const { client } = makeMockClient(async () =>
      makeTextCompletion("hello world"),
    );
    const provider = createProtocol(client);

    const response = await provider.complete(baseRequest());

    expect(response.id).toBe("chatcmpl-test");
    expect(response.model).toBe("gpt-4o-mini");
    expect(response.stopReason).toBe("end");
    expect(response.output).toEqual([{ type: "text", text: "hello world" }]);
    expect(response.usage).toEqual({
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    });
    expect(response.metadata).toMatchObject({
      vendor: "openai",
      finish_reason: "stop",
    });
  });

  it("maps OpenAI Chat Completions tool calls to ProviderResponse", async () => {
    const { client } = makeMockClient(async () =>
      makeToolCallCompletion([
        { id: "call_1", name: "get_weather", arguments: '{"location":"NYC"}' },
      ]),
    );
    const provider = createProtocol(client);

    const response = await provider.complete(baseRequest());

    expect(response.stopReason).toBe("tool_calls");
    expect(response.output).toEqual([
      {
        type: "tool_call",
        id: "call_1",
        name: "get_weather",
        arguments: { location: "NYC" },
      },
    ]);
  });

  it("aborts when signal is aborted before fetch", async () => {
    const { client, create } = makeMockClient();
    const provider = createProtocol(client);

    const controller = new AbortController();
    controller.abort(new Error("pre-aborted"));

    const request = baseRequest({ signal: controller.signal });

    try {
      await provider.complete(request);
      expect.unreachable("should throw");
    } catch (error) {
      expect(create).not.toHaveBeenCalled();
      expect(error).toBeInstanceOf(ProtocolOpenAIError);
      expect((error as ProtocolOpenAIError).code).toBe(
        ProtocolOpenAIErrorCode.CANCELLED,
      );
      expect((error as ProtocolOpenAIError).details?.reason).toEqual(
        new Error("pre-aborted"),
      );
    }
  });

  it("aborts when SDK throws AbortError", async () => {
    const { client } = makeMockClient(async () => {
      const err = new Error("AbortError");
      err.name = "AbortError";
      throw err;
    });
    const provider = createProtocol(client);

    try {
      await provider.complete(baseRequest());
      expect.unreachable("should throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ProtocolOpenAIError);
      expect((error as ProtocolOpenAIError).code).toBe(
        ProtocolOpenAIErrorCode.CANCELLED,
      );
    }
  });

  it("maps 401 SDK error to AUTHENTICATION", async () => {
    const { client } = makeMockClient(async () => {
      const err = new Error("Invalid token");
      (err as any).status = 401;
      throw err;
    });
    const provider = createProtocol(client);

    try {
      await provider.complete(baseRequest());
      expect.unreachable("should throw");
    } catch (error) {
      expect((error as ProtocolOpenAIError).code).toBe(
        ProtocolOpenAIErrorCode.AUTHENTICATION,
      );
      expect((error as ProtocolOpenAIError).status).toBe(401);
    }
  });

  it("maps 429 SDK error to RATE_LIMITED", async () => {
    const { client } = makeMockClient(async () => {
      const err = new Error("Too many requests");
      (err as any).status = 429;
      throw err;
    });
    const provider = createProtocol(client);

    try {
      await provider.complete(baseRequest());
      expect.unreachable("should throw");
    } catch (error) {
      expect((error as ProtocolOpenAIError).code).toBe(
        ProtocolOpenAIErrorCode.RATE_LIMITED,
      );
      expect((error as ProtocolOpenAIError).status).toBe(429);
    }
  });

  it("maps malformed SDK responses to UNEXPECTED_RESPONSE", async () => {
    const { client } = makeMockClient(async () => ({ junk: true }));
    const provider = createProtocol(client);

    try {
      await provider.complete(baseRequest());
      expect.unreachable("should throw");
    } catch (error) {
      expect((error as ProtocolOpenAIError).code).toBe(
        ProtocolOpenAIErrorCode.UNEXPECTED_RESPONSE,
      );
    }
  });

  describe("stream()", () => {
    it("constructs a valid streaming Core Provider", () => {
      const provider = createStreamingProtocol();
      expect(() => assertProvider(provider)).not.toThrow();
      expect(provider.capabilities.streaming).toBe(true);
      expect(typeof provider.stream).toBe("function");
    });

    it("sets stream:true on the Chat Completions body", async () => {
      const { client, create } = makeMockClient(async () =>
        makeChunkStream([
          makeTextChunk("hi"),
          makeFinishChunk("stop"),
        ]),
      );
      const provider = createStreamingProtocol(client);
      await collect(provider.stream(baseRequest()));

      const body = create.mock.calls[0]![0] as Record<string, unknown>;
      expect(body.stream).toBe(true);
    });

    it("maps text chunks to ordered Core stream events", async () => {
      const { client } = makeMockClient(async () =>
        makeChunkStream([
          makeTextChunk("hello"),
          makeTextChunk(" world"),
          makeFinishChunk("stop", {
            usage: {
              prompt_tokens: 1,
              completion_tokens: 2,
              total_tokens: 3,
            },
          }),
        ]),
      );
      const provider = createStreamingProtocol(client);
      const events = await collect(provider.stream(baseRequest()));

      expect(events.map((e) => e.type)).toEqual([
        "message_start",
        "text_delta",
        "text_delta",
        "usage",
        "message_end",
      ]);
      expect(events[1]).toEqual({ type: "text_delta", text: "hello" });
      expect(events[2]).toEqual({ type: "text_delta", text: " world" });

      const end = events[events.length - 1]!;
      expect(end.type).toBe("message_end");
      if (end.type === "message_end") {
        expect(end.response.output).toEqual([
          { type: "text", text: "hello world" },
        ]);
        expect(end.response.stopReason).toBe("end");
        expect(end.response.model).toBe("gpt-4o-mini");
      }
    });

    it("maps streamed tool_call deltas into final tool_call output", async () => {
      const { client } = makeMockClient(async () =>
        makeChunkStream([
          {
            id: "chatcmpl-tools",
            object: "chat.completion.chunk",
            model: "gpt-4o-mini",
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: "call_1",
                      type: "function",
                      function: { name: "search", arguments: "" },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          },
          {
            id: "chatcmpl-tools",
            object: "chat.completion.chunk",
            model: "gpt-4o-mini",
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      function: { arguments: '{"q":"pi"}' },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          },
          makeFinishChunk("tool_calls"),
        ]),
      );
      const provider = createStreamingProtocol(client);
      const events = await collect(provider.stream(baseRequest()));
      const end = events[events.length - 1]!;
      expect(end.type).toBe("message_end");
      if (end.type === "message_end") {
        expect(end.response.stopReason).toBe("tool_calls");
        expect(end.response.output).toEqual([
          {
            type: "tool_call",
            id: "call_1",
            name: "search",
            arguments: { q: "pi" },
          },
        ]);
      }
    });

    it("does not expose stream() when capabilities.streaming is false", () => {
      const provider = createProtocol();
      expect(provider.capabilities.streaming).toBe(false);
      expect(provider.stream).toBeUndefined();
    });

    it("maps abort during stream to CANCELLED", async () => {
      const controller = new AbortController();
      const { client } = makeMockClient(async (_body, options) => {
        controller.abort("stop");
        if (options?.signal?.aborted) {
          const err = new Error("aborted");
          (err as { name?: string }).name = "AbortError";
          throw err;
        }
        return makeChunkStream([makeTextChunk("x")]);
      });
      const provider = createStreamingProtocol(client);

      await expect(
        collect(
          provider.stream(
            baseRequest({ signal: controller.signal }),
          ),
        ),
      ).rejects.toMatchObject({
        code: ProtocolOpenAIErrorCode.CANCELLED,
      });
    });

    it("rejects non-iterable stream responses", async () => {
      const { client } = makeMockClient(async () => ({ not: "a stream" }));
      const provider = createStreamingProtocol(client);
      await expect(collect(provider.stream(baseRequest()))).rejects.toMatchObject({
        code: ProtocolOpenAIErrorCode.UNEXPECTED_RESPONSE,
      });
    });

    it("keeps complete() non-streaming even when capability is true", async () => {
      const { client, create } = makeMockClient(async () =>
        makeTextCompletion("ok"),
      );
      const provider = createStreamingProtocol(client);
      await provider.complete(baseRequest());
      const body = create.mock.calls[0]![0] as Record<string, unknown>;
      expect(body.stream).toBe(false);
    });
  });
});

import { describe, expect, it } from "vitest";
import { mapOpenAIResponseToProvider } from "../src/mapping/response.js";
import {
  ProtocolOpenAIError,
  ProtocolOpenAIErrorCode,
} from "../src/errors.js";
import { makeTextCompletion, makeToolCallCompletion } from "./helpers.js";

describe("mapOpenAIResponseToProvider", () => {
  it("maps a text completion", () => {
    const response = mapOpenAIResponseToProvider(makeTextCompletion("hello world"));

    expect(response.id).toBe("chatcmpl-test");
    expect(response.model).toBe("gpt-4o-mini");
    expect(response.stopReason).toBe("end");
    expect(response.output).toEqual([{ type: "text", text: "hello world" }]);
    expect(response.usage).toEqual({
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    });
    expect(response.metadata?.vendor).toBe("openai");
    expect(response.metadata?.finish_reason).toBe("stop");
  });

  it("maps tool_calls", () => {
    const response = mapOpenAIResponseToProvider(
      makeToolCallCompletion([
        {
          id: "call_abc",
          name: "get_weather",
          arguments: '{"city":"Paris"}',
        },
      ]),
    );

    expect(response.stopReason).toBe("tool_calls");
    expect(response.output).toEqual([
      {
        type: "tool_call",
        id: "call_abc",
        name: "get_weather",
        arguments: { city: "Paris" },
      },
    ]);
  });

  it("keeps non-JSON tool arguments as strings", () => {
    const response = mapOpenAIResponseToProvider(
      makeToolCallCompletion([
        {
          id: "call_1",
          name: "raw",
          arguments: "not-json",
        },
      ]),
    );

    expect(response.output[0]).toMatchObject({
      type: "tool_call",
      arguments: "not-json",
    });
  });

  it("maps length finish_reason", () => {
    const response = mapOpenAIResponseToProvider(
      makeTextCompletion("partial", {
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "partial" },
            finish_reason: "length",
          },
        ],
      }),
    );
    expect(response.stopReason).toBe("length");
  });

  it("maps content_filter to error stopReason", () => {
    const response = mapOpenAIResponseToProvider(
      makeTextCompletion("", {
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "" },
            finish_reason: "content_filter",
          },
        ],
      }),
    );
    expect(response.stopReason).toBe("error");
  });

  it("maps multimodal content arrays", () => {
    const response = mapOpenAIResponseToProvider({
      id: "chatcmpl-mm",
      model: "gpt-4o",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: [
              { type: "text", text: "see" },
              {
                type: "image_url",
                image_url: { url: "https://example.com/x.png" },
              },
            ],
          },
          finish_reason: "stop",
        },
      ],
    });

    expect(response.output).toEqual([
      { type: "text", text: "see" },
      { type: "image", uri: "https://example.com/x.png" },
    ]);
  });

  it("maps legacy function_call", () => {
    const response = mapOpenAIResponseToProvider({
      id: "chatcmpl-legacy",
      model: "gpt-3.5-turbo",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: null,
            function_call: {
              name: "lookup",
              arguments: '{"q":"x"}',
            },
          },
          finish_reason: "function_call",
        },
      ],
    });

    expect(response.stopReason).toBe("tool_calls");
    expect(response.output).toEqual([
      {
        type: "tool_call",
        id: "function_call:lookup",
        name: "lookup",
        arguments: { q: "x" },
      },
    ]);
  });

  it("fails closed on missing choices", () => {
    expect(() =>
      mapOpenAIResponseToProvider({ id: "x", choices: [] }),
    ).toThrow(ProtocolOpenAIError);

    try {
      mapOpenAIResponseToProvider(null);
    } catch (error) {
      expect((error as ProtocolOpenAIError).code).toBe(
        ProtocolOpenAIErrorCode.UNEXPECTED_RESPONSE,
      );
    }
  });

  it("infers tool_calls stopReason when finish_reason missing", () => {
    const response = mapOpenAIResponseToProvider({
      id: "chatcmpl-infer",
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "c1",
                type: "function",
                function: { name: "t", arguments: "{}" },
              },
            ],
          },
        },
      ],
    });
    expect(response.stopReason).toBe("tool_calls");
  });
});

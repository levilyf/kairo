import { describe, expect, it } from "vitest";
import type { ProviderRequest } from "@kairo/core";
import { mapProviderRequestToOpenAI } from "../src/mapping/request.js";
import {
  ProtocolOpenAIError,
  ProtocolOpenAIErrorCode,
} from "../src/errors.js";

describe("mapProviderRequestToOpenAI", () => {
  it("maps a simple user text message", () => {
    const body = mapProviderRequestToOpenAI({
      model: "gpt-4o-mini",
      input: [
        {
          role: "user",
          content: [{ type: "text", text: "hello" }],
        },
      ],
    });

    expect(body.model).toBe("gpt-4o-mini");
    expect(body.stream).toBe(false);
    expect(body.messages).toEqual([
      { role: "user", content: "hello" },
    ]);
  });

  it("maps system + multi-turn text", () => {
    const body = mapProviderRequestToOpenAI({
      model: "gpt-4o",
      input: [
        {
          role: "system",
          content: [{ type: "text", text: "You are helpful." }],
        },
        {
          role: "user",
          content: [{ type: "text", text: "Hi" }],
        },
        {
          role: "assistant",
          content: [{ type: "text", text: "Hello!" }],
        },
      ],
    });

    expect(body.messages).toEqual([
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello!" },
    ]);
  });

  it("maps image parts to image_url", () => {
    const body = mapProviderRequestToOpenAI({
      model: "gpt-4o",
      input: [
        {
          role: "user",
          content: [
            { type: "text", text: "describe" },
            { type: "image", uri: "https://example.com/a.png" },
            {
              type: "image",
              mimeType: "image/jpeg",
              data: "abc123",
            },
          ],
        },
      ],
    });

    expect(body.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "describe" },
          {
            type: "image_url",
            image_url: { url: "https://example.com/a.png" },
          },
          {
            type: "image_url",
            image_url: { url: "data:image/jpeg;base64,abc123" },
          },
        ],
      },
    ]);
  });

  it("maps tool definitions", () => {
    const body = mapProviderRequestToOpenAI({
      model: "gpt-4o-mini",
      input: [{ role: "user", content: [{ type: "text", text: "x" }] }],
      tools: [
        {
          id: "weather",
          name: "get_weather",
          description: "Get weather",
          parameters: {
            type: "object",
            properties: { city: { type: "string" } },
            required: ["city"],
          },
        },
      ],
    });

    expect(body.tools).toEqual([
      {
        type: "function",
        function: {
          name: "get_weather",
          description: "Get weather",
          parameters: {
            type: "object",
            properties: { city: { type: "string" } },
            required: ["city"],
          },
        },
      },
    ]);
  });

  it("maps assistant tool_call messages", () => {
    const body = mapProviderRequestToOpenAI({
      model: "gpt-4o-mini",
      input: [
        {
          role: "assistant",
          content: [
            {
              type: "tool_call",
              id: "call_1",
              name: "get_weather",
              arguments: { city: "Paris" },
            },
          ],
        },
      ],
    });

    expect(body.messages).toEqual([
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: {
              name: "get_weather",
              arguments: JSON.stringify({ city: "Paris" }),
            },
          },
        ],
      },
    ]);
  });

  it("maps tool role tool_result messages", () => {
    const body = mapProviderRequestToOpenAI({
      model: "gpt-4o-mini",
      input: [
        {
          role: "tool",
          content: [
            {
              type: "tool_result",
              id: "call_1",
              name: "get_weather",
              result: { ok: true, data: { temp: 20 } },
            },
          ],
        },
      ],
    });

    expect(body.messages).toEqual([
      {
        role: "tool",
        tool_call_id: "call_1",
        name: "get_weather",
        content: JSON.stringify({ ok: true, data: { temp: 20 } }),
      },
    ]);
  });

  it("merges defaultRequestOptions under request.options", () => {
    const body = mapProviderRequestToOpenAI(
      {
        model: "gpt-4o-mini",
        input: [{ role: "user", content: [{ type: "text", text: "x" }] }],
        options: { temperature: 0.9, max_tokens: 50 },
      },
      {
        defaultRequestOptions: {
          temperature: 0.1,
          top_p: 0.5,
        },
      },
    );

    expect(body.temperature).toBe(0.9);
    expect(body.top_p).toBe(0.5);
    expect(body.max_tokens).toBe(50);
  });

  it("ignores reserved keys in opaque options", () => {
    const body = mapProviderRequestToOpenAI({
      model: "real-model",
      input: [{ role: "user", content: [{ type: "text", text: "x" }] }],
      options: {
        model: "hijack",
        messages: [],
        tools: [],
        stream: true,
        temperature: 0,
      },
    });

    expect(body.model).toBe("real-model");
    expect(body.stream).toBe(false);
    expect(body.temperature).toBe(0);
    expect(Array.isArray(body.messages)).toBe(true);
  });

  it("uses defaultModel when request.model is empty", () => {
    const body = mapProviderRequestToOpenAI(
      {
        model: "  ",
        input: [{ role: "user", content: [{ type: "text", text: "x" }] }],
      } as ProviderRequest,
      { defaultModel: "fallback-model" },
    );
    expect(body.model).toBe("fallback-model");
  });

  it("fails closed without a model", () => {
    expect(() =>
      mapProviderRequestToOpenAI({
        model: "",
        input: [],
      }),
    ).toThrow(ProtocolOpenAIError);

    try {
      mapProviderRequestToOpenAI({ model: "", input: [] });
    } catch (error) {
      expect((error as ProtocolOpenAIError).code).toBe(
        ProtocolOpenAIErrorCode.INVALID_REQUEST,
      );
    }
  });

  it("rejects tool_call on non-assistant roles", () => {
    expect(() =>
      mapProviderRequestToOpenAI({
        model: "gpt-4o-mini",
        input: [
          {
            role: "user",
            content: [
              {
                type: "tool_call",
                id: "c1",
                name: "x",
                arguments: {},
              },
            ],
          },
        ],
      }),
    ).toThrow(ProtocolOpenAIError);
  });

  it("rejects tool messages without tool_result parts", () => {
    expect(() =>
      mapProviderRequestToOpenAI({
        model: "gpt-4o-mini",
        input: [
          {
            role: "tool",
            content: [{ type: "text", text: "result" }],
          },
        ],
      }),
    ).toThrow(ProtocolOpenAIError);
  });
});

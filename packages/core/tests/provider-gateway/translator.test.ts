import { describe, expect, it } from "vitest";
import {
  createContext,
  translateContextToProviderRequest,
} from "../../src/index.js";

describe("ProviderRequestTranslator", () => {
  it("maps instructions to a leading system message and appends context messages", () => {
    const context = createContext({
      turnId: "t1",
      sessionId: "s1",
      runtimeId: "r1",
      instructions: ["rule-a", "rule-b"],
      messages: [
        { role: "user", content: [{ type: "text", text: "hi" }] },
        { role: "assistant", content: [{ type: "text", text: "yo" }] },
      ],
      toolDefinitions: [
        {
          id: "search",
          name: "search",
          description: "find things",
          parameters: { type: "object" },
        },
        {
          name: "nameless-id",
        },
      ],
      state: "assembled",
    });

    const request = translateContextToProviderRequest(context, {
      model: "demo",
    });

    expect(request.model).toBe("demo");
    expect(request.input).toEqual([
      {
        role: "system",
        content: [
          { type: "text", text: "rule-a" },
          { type: "text", text: "rule-b" },
        ],
      },
      { role: "user", content: [{ type: "text", text: "hi" }] },
      { role: "assistant", content: [{ type: "text", text: "yo" }] },
    ]);
    expect(request.tools).toEqual([
      {
        id: "search",
        name: "search",
        description: "find things",
        parameters: { type: "object" },
      },
      {
        id: "nameless-id",
        name: "nameless-id",
      },
    ]);
  });

  it("omits system message when there are no instructions", () => {
    const context = createContext({
      turnId: "t1",
      sessionId: "s1",
      runtimeId: "r1",
      messages: [{ role: "user", content: [{ type: "text", text: "only" }] }],
      state: "assembled",
    });

    const request = translateContextToProviderRequest(context, {
      model: "m",
    });

    expect(request.input).toHaveLength(1);
    expect(request.input[0]?.role).toBe("user");
    expect(request.tools).toBeUndefined();
  });

  it("forwards options and signal without inventing vendor fields", () => {
    const context = createContext({
      turnId: "t1",
      sessionId: "s1",
      runtimeId: "r1",
      state: "assembled",
    });
    const signal = new AbortController().signal;

    const request = translateContextToProviderRequest(context, {
      model: "m",
      options: { temperature: 0.2 },
      signal,
    });

    expect(request.options).toEqual({ temperature: 0.2 });
    expect(request.signal).toBe(signal);
    expect("openai" in request).toBe(false);
    expect("anthropic" in request).toBe(false);
  });
});

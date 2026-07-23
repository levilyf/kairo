import { describe, expect, it } from "vitest";
import {
  Context,
  ContextError,
  ContextErrorCode,
  createContext,
  type ContextMessage,
} from "../../src/index.js";

describe("Context", () => {
  it("creates an immutable context with identity, metadata, timestamps, and empty placeholders", () => {
    const context = createContext({
      id: "ctx-1",
      turnId: "turn-1",
      sessionId: "session-1",
      runtimeId: "runtime-1",
      metadata: { purpose: "test" },
    });

    expect(context).toBeInstanceOf(Context);
    expect(context.id).toBe("ctx-1");
    expect(context.turnId).toBe("turn-1");
    expect(context.sessionId).toBe("session-1");
    expect(context.runtimeId).toBe("runtime-1");
    expect(context.state).toBe("created");
    expect(context.metadata.id).toBe("ctx-1");
    expect(context.metadata.turnId).toBe("turn-1");
    expect(context.metadata.sessionId).toBe("session-1");
    expect(context.metadata.runtimeId).toBe("runtime-1");
    expect(context.metadata.data).toEqual({ purpose: "test" });
    expect(context.metadata.createdAt).toBeGreaterThan(0);
    expect(context.instructions).toEqual([]);
    expect(context.messages).toEqual([]);
    expect(context.toolDefinitions).toEqual([]);
    expect(context.attachments).toEqual([]);
    expect(context.variables).toEqual({});
  });

  it("accepts placeholder collections without assembling or translating them", () => {
    const messages: ContextMessage[] = [
      {
        role: "user",
        content: [{ type: "text", text: "hello" }],
      },
    ];
    const context = createContext({
      turnId: "turn-1",
      sessionId: "session-1",
      runtimeId: "runtime-1",
      instructions: ["be careful"],
      messages,
      toolDefinitions: [{ name: "search" }],
      attachments: [{ id: "file-1" }],
      variables: { locale: "en" },
    });

    expect(context.instructions).toEqual(["be careful"]);
    expect(context.messages).toEqual(messages);
    expect(context.toolDefinitions).toEqual([{ name: "search" }]);
    expect(context.attachments).toEqual([{ id: "file-1" }]);
    expect(context.variables).toEqual({ locale: "en" });
  });

  it("freezes the context object and all nested collections", () => {
    const context = createContext({
      turnId: "turn-1",
      sessionId: "session-1",
      runtimeId: "runtime-1",
      instructions: ["a"],
      messages: [{ role: "user", content: [{ type: "text", text: "x" }] }],
      toolDefinitions: [{ name: "t" }],
      attachments: [{ id: "a" }],
      variables: { k: 1 },
      metadata: { m: true },
    });

    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.metadata)).toBe(true);
    expect(Object.isFrozen(context.metadata.data)).toBe(true);
    expect(Object.isFrozen(context.instructions)).toBe(true);
    expect(Object.isFrozen(context.messages)).toBe(true);
    expect(Object.isFrozen(context.messages[0])).toBe(true);
    expect(Object.isFrozen(context.messages[0]!.content)).toBe(true);
    expect(Object.isFrozen(context.toolDefinitions)).toBe(true);
    expect(Object.isFrozen(context.attachments)).toBe(true);
    expect(Object.isFrozen(context.variables)).toBe(true);
  });

  it("generates a context id when omitted", () => {
    const a = createContext({
      turnId: "turn-1",
      sessionId: "session-1",
      runtimeId: "runtime-1",
    });
    const b = createContext({
      turnId: "turn-1",
      sessionId: "session-1",
      runtimeId: "runtime-1",
    });

    expect(a.id.length).toBeGreaterThan(0);
    expect(b.id.length).toBeGreaterThan(0);
    expect(a.id).not.toBe(b.id);
  });

  it("rejects empty explicit context id", () => {
    expect(() =>
      createContext({
        id: "",
        turnId: "turn-1",
        sessionId: "session-1",
        runtimeId: "runtime-1",
      }),
    ).toThrow(ContextError);
    try {
      createContext({
        id: "   ",
        turnId: "turn-1",
        sessionId: "session-1",
        runtimeId: "runtime-1",
      });
      expect.unreachable("expected throw");
    } catch (error) {
      expect(error).toMatchObject({ code: ContextErrorCode.INVALID_CONTEXT });
    }
  });

  it("rejects missing ownership identifiers", () => {
    expect(() =>
      createContext({
        turnId: "",
        sessionId: "session-1",
        runtimeId: "runtime-1",
      }),
    ).toThrow(ContextError);

    try {
      createContext({
        turnId: "",
        sessionId: "session-1",
        runtimeId: "runtime-1",
      });
      expect.unreachable("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ContextError);
      expect(error).toMatchObject({
        code: ContextErrorCode.INVALID_CONTEXT,
        field: "turnId",
      });
    }
  });

  it("creates independent context instances", () => {
    const a = createContext({
      id: "a",
      turnId: "t1",
      sessionId: "s1",
      runtimeId: "r1",
      variables: { x: 1 },
    });
    const b = createContext({
      id: "b",
      turnId: "t2",
      sessionId: "s1",
      runtimeId: "r1",
      variables: { x: 2 },
    });

    expect(a).not.toBe(b);
    expect(a.variables).toEqual({ x: 1 });
    expect(b.variables).toEqual({ x: 2 });
  });
});

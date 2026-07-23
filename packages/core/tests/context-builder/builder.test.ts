import { describe, expect, it } from "vitest";
import {
  assertContextBuilder,
  ContextBuilderError,
  ContextBuilderErrorCode,
  type ContextBuilder,
  type ContextBuilderContext,
  type ContextBuilderResult,
} from "../../src/index.js";

function makeBuilder(
  id: string,
  overrides: Partial<ContextBuilder> = {},
): ContextBuilder {
  return {
    id,
    name: overrides.name ?? id,
    description: overrides.description ?? `builder ${id}`,
    build:
      overrides.build ??
      (async () => ({
        fragments: [{ instructions: [`from ${id}`] }],
      })),
    ...overrides,
  };
}

describe("ContextBuilder contract", () => {
  it("accepts a valid builder", () => {
    const builder = makeBuilder("core/system");
    expect(() => assertContextBuilder(builder)).not.toThrow();
  });

  it("rejects builders missing identity or build()", () => {
    expect(() => assertContextBuilder({})).toThrow(ContextBuilderError);
    expect(() =>
      assertContextBuilder({ id: "x", name: "x" }),
    ).toThrow(ContextBuilderError);
    expect(() =>
      assertContextBuilder({ id: "", name: "x", build: async () => ({ fragments: [] }) }),
    ).toThrow(ContextBuilderError);

    try {
      assertContextBuilder({ id: "x", name: "x" });
    } catch (error) {
      expect(error).toMatchObject({
        code: ContextBuilderErrorCode.INVALID_BUILDER,
      });
    }
  });

  it("build returns provider-neutral fragments without mutating context", async () => {
    const builder = makeBuilder("core/messages", {
      build: async (ctx: ContextBuilderContext): Promise<ContextBuilderResult> => ({
        fragments: [
          {
            messages: [
              {
                role: "user",
                content: [{ type: "text", text: `turn=${ctx.turnId}` }],
              },
            ],
            variables: { source: "messages" },
          },
        ],
      }),
    });

    const input: ContextBuilderContext = {
      turnId: "turn-1",
      sessionId: "session-1",
      runtimeId: "runtime-1",
      metadata: { request: "hello" },
    };

    const result = await builder.build(input);

    expect(result.fragments).toHaveLength(1);
    expect(result.fragments[0]!.messages?.[0]!.content[0]).toEqual({
      type: "text",
      text: "turn=turn-1",
    });
    expect(result.fragments[0]!.variables).toEqual({ source: "messages" });
    // Input remains unchanged (builders must not mutate execution state).
    expect(input).toEqual({
      turnId: "turn-1",
      sessionId: "session-1",
      runtimeId: "runtime-1",
      metadata: { request: "hello" },
    });
  });

  it("does not require provider-specific fields on the contract", () => {
    const builder = makeBuilder("core/neutral");
    expect("model" in builder).toBe(false);
    expect("provider" in builder).toBe(false);
    expect("openai" in builder).toBe(false);
  });
});

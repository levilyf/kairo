import { describe, expect, it } from "vitest";
import {
  ContextBuilderError,
  ContextBuilderErrorCode,
  ContextBuilderRegistry,
  type ContextBuilder,
} from "../../src/index.js";

function makeBuilder(
  id: string,
  overrides: Partial<ContextBuilder> = {},
): ContextBuilder {
  return {
    id,
    name: overrides.name ?? id,
    build:
      overrides.build ??
      (async () => ({ fragments: [{ instructions: [id] }] })),
    ...overrides,
  };
}

describe("ContextBuilderRegistry", () => {
  it("registers builders and retrieves them by id", () => {
    const registry = new ContextBuilderRegistry();
    const builder = makeBuilder("core/system");
    registry.register(builder);

    expect(registry.size).toBe(1);
    expect(registry.has("core/system")).toBe(true);
    expect(registry.get("core/system")).toBe(builder);
  });

  it("rejects duplicate builder ids", () => {
    const registry = new ContextBuilderRegistry();
    registry.register(makeBuilder("dup"));

    expect(() => registry.register(makeBuilder("dup"))).toThrow(
      ContextBuilderError,
    );
    try {
      registry.register(makeBuilder("dup"));
    } catch (error) {
      expect((error as ContextBuilderError).code).toBe(
        ContextBuilderErrorCode.DUPLICATE_BUILDER,
      );
    }
  });

  it("rejects invalid builders on register", () => {
    const registry = new ContextBuilderRegistry();
    expect(() =>
      registry.register({ id: "", name: "x", build: async () => ({ fragments: [] }) }),
    ).toThrow(ContextBuilderError);
  });

  it("unregisters builders", () => {
    const registry = new ContextBuilderRegistry();
    registry.register(makeBuilder("a"));
    expect(registry.unregister("a")).toBe(true);
    expect(registry.has("a")).toBe(false);
    expect(registry.unregister("a")).toBe(false);
  });

  it("lists builders in deterministic priority then registration order", () => {
    const registry = new ContextBuilderRegistry();
    registry.register(makeBuilder("late-high", { priority: 200 }));
    registry.register(makeBuilder("early-default")); // default 100
    registry.register(makeBuilder("mid-default")); // same priority, later registration
    registry.register(makeBuilder("first", { priority: 10 }));

    expect(registry.list().map((b) => b.id)).toEqual([
      "first",
      "early-default",
      "mid-default",
      "late-high",
    ]);
  });

  it("resolve returns the ordered pipeline for the future assembler", () => {
    const registry = new ContextBuilderRegistry();
    registry.register(makeBuilder("b", { priority: 50 }));
    registry.register(makeBuilder("a", { priority: 10 }));
    registry.register(makeBuilder("c", { priority: 50 }));

    const ordered = registry.resolve();
    expect(ordered.map((b) => b.id)).toEqual(["a", "b", "c"]);
  });

  it("supports discovery via list and get", () => {
    const registry = new ContextBuilderRegistry();
    registry.register(makeBuilder("core/tools", { description: "tools" }));
    registry.register(makeBuilder("core/memory", { priority: 20 }));

    expect(registry.list()).toHaveLength(2);
    expect(registry.get("core/memory")?.priority).toBe(20);
    expect(registry.get("missing")).toBeUndefined();
  });

  it("clear removes all builders", () => {
    const registry = new ContextBuilderRegistry();
    registry.register(makeBuilder("a"));
    registry.register(makeBuilder("b"));
    registry.clear();
    expect(registry.size).toBe(0);
    expect(registry.list()).toEqual([]);
  });

  it("close rejects further registration", () => {
    const registry = new ContextBuilderRegistry();
    registry.close();
    expect(registry.closed).toBe(true);
    expect(() => registry.register(makeBuilder("late"))).toThrow(
      ContextBuilderError,
    );
    try {
      registry.register(makeBuilder("late"));
    } catch (error) {
      expect((error as ContextBuilderError).code).toBe(
        ContextBuilderErrorCode.REGISTRY_CLOSED,
      );
    }
  });

  it("executes registered builders independently", async () => {
    const registry = new ContextBuilderRegistry();
    registry.register(
      makeBuilder("one", {
        priority: 1,
        build: async () => ({ fragments: [{ instructions: ["one"] }] }),
      }),
    );
    registry.register(
      makeBuilder("two", {
        priority: 2,
        build: async () => ({
          fragments: [{ messages: [{ role: "user", content: [{ type: "text", text: "two" }] }] }],
        }),
      }),
    );

    const results = [];
    for (const builder of registry.resolve()) {
      results.push(
        await builder.build({
          turnId: "t1",
          sessionId: "s1",
          runtimeId: "r1",
        }),
      );
    }

    expect(results[0]!.fragments[0]!.instructions).toEqual(["one"]);
    expect(results[1]!.fragments[0]!.messages?.[0]!.content[0]).toEqual({
      type: "text",
      text: "two",
    });
  });
});

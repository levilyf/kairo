import { describe, expect, it } from "vitest";
import {
  Context,
  ContextAssembler,
  ContextAssemblerError,
  ContextAssemblerErrorCode,
  ContextBuilderRegistry,
  type ContextBuilder,
  type ContextBuilderContext,
  type ContextBuilderResult,
} from "../../src/index.js";

function builder(
  id: string,
  result: ContextBuilderResult | (() => ContextBuilderResult | Promise<ContextBuilderResult>),
  priority?: number,
): ContextBuilder {
  return {
    id,
    name: id,
    ...(priority !== undefined ? { priority } : {}),
    build: async () =>
      typeof result === "function" ? await result() : result,
  };
}

function baseInput(overrides: Partial<ContextBuilderContext> = {}): ContextBuilderContext {
  return {
    turnId: "turn-1",
    sessionId: "session-1",
    runtimeId: "runtime-1",
    metadata: { request: "hello" },
    ...overrides,
  };
}

describe("ContextAssembler", () => {
  it("assembles an empty immutable Context when no builders are registered", async () => {
    const registry = new ContextBuilderRegistry();
    const assembler = new ContextAssembler({ registry });

    const result = await assembler.assemble(baseInput());

    expect(result.context).toBeInstanceOf(Context);
    expect(result.context.state).toBe("assembled");
    expect(result.context.turnId).toBe("turn-1");
    expect(result.context.sessionId).toBe("session-1");
    expect(result.context.runtimeId).toBe("runtime-1");
    expect(result.context.instructions).toEqual([]);
    expect(result.context.messages).toEqual([]);
    expect(result.context.toolDefinitions).toEqual([]);
    expect(result.context.attachments).toEqual([]);
    expect(result.context.variables).toEqual({});
    expect(Object.isFrozen(result.context)).toBe(true);
    expect(result.builders).toEqual([]);
    expect(result.fragments).toEqual([]);
  });

  it("runs builders in registry resolve order", async () => {
    const registry = new ContextBuilderRegistry();
    const order: string[] = [];
    registry.register(
      builder(
        "late",
        () => {
          order.push("late");
          return { fragments: [{ instructions: ["late"] }] };
        },
        200,
      ),
    );
    registry.register(
      builder(
        "early",
        () => {
          order.push("early");
          return { fragments: [{ instructions: ["early"] }] };
        },
        10,
      ),
    );
    registry.register(
      builder("mid", () => {
        order.push("mid");
        return { fragments: [{ instructions: ["mid"] }] };
      }),
    );

    const assembler = new ContextAssembler({ registry });
    const result = await assembler.assemble(baseInput());

    expect(order).toEqual(["early", "mid", "late"]);
    expect(result.builders.map((b) => b.id)).toEqual(["early", "mid", "late"]);
    expect(result.context.instructions).toEqual(["early", "mid", "late"]);
  });

  it("appends collection fragments in builder order", async () => {
    const registry = new ContextBuilderRegistry();
    registry.register(
      builder("a", {
        fragments: [
          {
            instructions: ["sys-a"],
            messages: [{ role: "user", content: [{ type: "text", text: "a" }] }],
            toolDefinitions: [{ name: "tool-a" }],
            attachments: [{ id: "att-a" }],
          },
        ],
      }, 1),
    );
    registry.register(
      builder("b", {
        fragments: [
          {
            instructions: ["sys-b"],
            messages: [{ role: "assistant", content: [{ type: "text", text: "b" }] }],
            toolDefinitions: [{ name: "tool-b" }],
            attachments: [{ id: "att-b" }],
          },
        ],
      }, 2),
    );

    const assembler = new ContextAssembler({ registry });
    const result = await assembler.assemble(baseInput());

    expect(result.context.instructions).toEqual(["sys-a", "sys-b"]);
    expect(result.context.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(result.context.toolDefinitions.map((t) => t.name)).toEqual([
      "tool-a",
      "tool-b",
    ]);
    expect(result.context.attachments.map((a) => a.id)).toEqual([
      "att-a",
      "att-b",
    ]);
  });

  it("merges variables with last-write-wins for duplicate keys", async () => {
    const registry = new ContextBuilderRegistry();
    registry.register(
      builder(
        "first",
        {
          fragments: [{ variables: { a: 1, b: 1, keep: "first" } }],
        },
        1,
      ),
    );
    registry.register(
      builder(
        "second",
        {
          fragments: [{ variables: { a: 2, c: 3 } }],
        },
        2,
      ),
    );

    const assembler = new ContextAssembler({ registry });
    const result = await assembler.assemble(baseInput());

    expect(result.context.variables).toEqual({
      a: 2,
      b: 1,
      keep: "first",
      c: 3,
    });
  });

  it("merges metadata with last-write-wins for duplicate keys", async () => {
    const registry = new ContextBuilderRegistry();
    registry.register(
      builder(
        "first",
        {
          fragments: [{ metadata: { source: "first", keep: true } }],
        },
        1,
      ),
    );
    registry.register(
      builder(
        "second",
        {
          fragments: [{ metadata: { source: "second", extra: 1 } }],
        },
        2,
      ),
    );

    const assembler = new ContextAssembler({ registry });
    const result = await assembler.assemble(baseInput());

    expect(result.context.metadata.data).toEqual({
      request: "hello",
      source: "second",
      keep: true,
      extra: 1,
    });
  });

  it("merges multiple fragments from a single builder in declaration order", async () => {
    const registry = new ContextBuilderRegistry();
    registry.register(
      builder("multi", {
        fragments: [
          { instructions: ["one"], variables: { n: 1 } },
          { instructions: ["two"], variables: { n: 2 } },
        ],
      }),
    );

    const assembler = new ContextAssembler({ registry });
    const result = await assembler.assemble(baseInput());

    expect(result.context.instructions).toEqual(["one", "two"]);
    expect(result.context.variables).toEqual({ n: 2 });
    expect(result.fragments).toHaveLength(2);
  });

  it("does not mutate builder fragment inputs", async () => {
    const registry = new ContextBuilderRegistry();
    const instructions = ["keep"];
    const variables = { k: 1 };
    const fragment = { instructions, variables };
    registry.register(builder("x", { fragments: [fragment] }));

    const assembler = new ContextAssembler({ registry });
    await assembler.assemble(baseInput());

    expect(instructions).toEqual(["keep"]);
    expect(variables).toEqual({ k: 1 });
    expect(fragment.instructions).toBe(instructions);
  });

  it("fails closed when a builder throws", async () => {
    const registry = new ContextBuilderRegistry();
    registry.register(
      builder("ok", { fragments: [{ instructions: ["ok"] }] }, 1),
    );
    registry.register({
      id: "boom",
      name: "boom",
      priority: 2,
      build: async () => {
        throw new Error("builder exploded");
      },
    });

    const assembler = new ContextAssembler({ registry });
    await expect(assembler.assemble(baseInput())).rejects.toBeInstanceOf(
      ContextAssemblerError,
    );
    try {
      await assembler.assemble(baseInput());
    } catch (error) {
      expect(error).toMatchObject({
        code: ContextAssemblerErrorCode.BUILDER_FAILED,
        builderId: "boom",
      });
    }
  });

  it("fails closed when a builder returns an invalid result", async () => {
    const registry = new ContextBuilderRegistry();
    registry.register({
      id: "bad",
      name: "bad",
      build: async () => ({ fragments: null }) as unknown as ContextBuilderResult,
    });

    const assembler = new ContextAssembler({ registry });
    await expect(assembler.assemble(baseInput())).rejects.toMatchObject({
      code: ContextAssemblerErrorCode.INVALID_FRAGMENT,
      builderId: "bad",
    });
  });

  it("produces deterministic output for the same registry and input", async () => {
    const registry = new ContextBuilderRegistry();
    registry.register(
      builder("b", { fragments: [{ instructions: ["b"], variables: { x: 1 } }] }, 20),
    );
    registry.register(
      builder("a", { fragments: [{ instructions: ["a"], variables: { x: 0, y: 2 } }] }, 10),
    );

    const assembler = new ContextAssembler({ registry });
    const first = await assembler.assemble(baseInput());
    const second = await assembler.assemble(baseInput());

    expect(first.context.instructions).toEqual(second.context.instructions);
    expect(first.context.variables).toEqual(second.context.variables);
    expect(first.context.metadata.data).toEqual(second.context.metadata.data);
    expect(first.builders.map((b) => b.id)).toEqual(
      second.builders.map((b) => b.id),
    );
  });

  it("accepts an explicit builder list override via options", async () => {
    const registry = new ContextBuilderRegistry();
    registry.register(
      builder("registry-only", {
        fragments: [{ instructions: ["from-registry"] }],
      }),
    );
    const override = builder("override", {
      fragments: [{ instructions: ["from-override"] }],
    });

    const assembler = new ContextAssembler({ registry });
    const result = await assembler.assemble(baseInput(), {
      builders: [override],
    });

    expect(result.context.instructions).toEqual(["from-override"]);
    expect(result.builders.map((b) => b.id)).toEqual(["override"]);
  });

  it("seeds variables and metadata from assembly options before builders", async () => {
    const registry = new ContextBuilderRegistry();
    registry.register(
      builder("later", {
        fragments: [{ variables: { a: 2 }, metadata: { m: "later" } }],
      }),
    );

    const assembler = new ContextAssembler({ registry });
    const result = await assembler.assemble(baseInput(), {
      variables: { a: 1, seed: true },
      metadata: { m: "seed", keep: 1 },
    });

    expect(result.context.variables).toEqual({ a: 2, seed: true });
    expect(result.context.metadata.data).toEqual({
      request: "hello",
      m: "later",
      keep: 1,
    });
  });

  it("remains provider-neutral and does not invent vendor fields", async () => {
    const registry = new ContextBuilderRegistry();
    registry.register(
      builder("neutral", {
        fragments: [
          {
            messages: [
              { role: "user", content: [{ type: "text", text: "hi" }] },
            ],
          },
        ],
      }),
    );

    const assembler = new ContextAssembler({ registry });
    const result = await assembler.assemble(baseInput());
    const context = result.context as Context & Record<string, unknown>;

    expect("model" in context).toBe(false);
    expect("provider" in context).toBe(false);
    expect("openai" in context).toBe(false);
    expect("anthropic" in context).toBe(false);
  });
});

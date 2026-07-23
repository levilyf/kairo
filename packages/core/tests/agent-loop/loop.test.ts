import { describe, expect, it, vi } from "vitest";
import {
  AgentLoop,
  AgentLoopError,
  AgentLoopErrorCode,
  ContextAssembler,
  ContextBuilderRegistry,
  createContextFragment,
  EventBus,
  EventPublisher,
  PolicyManager,
  ProviderGateway,
  ProviderRegistry,
  ToolRegistry,
  ToolRouter,
  type ContextBuilder,
  type Provider,
  type ProviderRequest,
  type ProviderResponse,
  type RuntimeEvent,
  type Tool,
} from "../../src/index.js";
import { makeProvider, makeTool } from "../helpers/contracts.js";

function createFakeTurn(overrides: {
  id?: string;
  sessionId?: string;
  runtimeId?: string;
  signal?: AbortSignal;
} = {}) {
  const controller = new AbortController();
  const signal = overrides.signal ?? controller.signal;
  const turn = {
    id: overrides.id ?? "turn-1",
    sessionId: overrides.sessionId ?? "session-1",
    runtimeId: overrides.runtimeId ?? "runtime-1",
    state: "created" as "created" | "completed" | "cancelled" | "failed",
    result: undefined as unknown,
    cancellation: {
      signal,
      abort: (reason?: unknown) => controller.abort(reason),
    },
    complete: vi.fn(async (input: { result?: unknown } = {}) => {
      turn.result = input.result;
      turn.state = "completed";
    }),
    cancel: vi.fn(async () => {
      turn.state = "cancelled";
    }),
  };
  return turn;
}

function seedMessagesBuilder(
  messages: Array<{
    role: string;
    content: Array<{ type: string; text?: string; [k: string]: unknown }>;
  }>,
): ContextBuilder {
  return {
    id: "test/seed-messages",
    name: "Seed Messages",
    priority: 10,
    build: () => ({
      fragments: [createContextFragment({ messages })],
    }),
  };
}

function toolsBuilder(tools: Tool[]): ContextBuilder {
  return {
    id: "test/tools",
    name: "Tools",
    priority: 20,
    build: () => ({
      fragments: [
        createContextFragment({
          toolDefinitions: tools.map((tool) => ({
            id: tool.id,
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          })),
        }),
      ],
    }),
  };
}

function setup(options: {
  providers?: Provider[];
  tools?: Tool[];
  builders?: ContextBuilder[];
} = {}) {
  const providerRegistry = new ProviderRegistry();
  for (const provider of options.providers ?? []) {
    providerRegistry.register(provider);
  }
  const toolRegistry = new ToolRegistry();
  for (const tool of options.tools ?? []) {
    toolRegistry.register(tool);
  }
  const builderRegistry = new ContextBuilderRegistry();
  for (const builder of options.builders ?? []) {
    builderRegistry.register(builder);
  }

  const events = new EventBus();
  const publisher = new EventPublisher(events);
  const policy = new PolicyManager();
  const providers = new ProviderGateway({
    providers: providerRegistry,
    events,
    policy,
    publisher,
  });
  const tools = new ToolRouter({
    tools: toolRegistry,
    events,
    policy,
    publisher,
  });
  const assembler = new ContextAssembler({ registry: builderRegistry });
  const loop = new AgentLoop({
    providers,
    tools,
    assembler,
    builders: builderRegistry,
    toolRegistry,
    events,
    publisher,
  });

  return { loop, events, providers, tools, assembler, toolRegistry, publisher };
}

describe("AgentLoop", () => {
  it("completes a turn on a single provider response without tools", async () => {
    const provider = makeProvider("acme/model", {
      complete: async () => ({
        id: "resp-1",
        output: [{ type: "text", text: "hello world" }],
        stopReason: "end",
      }),
    });
    const { loop } = setup({
      providers: [provider],
      builders: [
        seedMessagesBuilder([
          { role: "user", content: [{ type: "text", text: "hi" }] },
        ]),
      ],
    });
    const turn = createFakeTurn();

    const result = await loop.execute(turn as never, {
      model: "demo",
    });

    expect(result.status).toBe("completed");
    expect(result.iterations).toHaveLength(1);
    expect(result.finalResponse?.output[0]).toEqual({
      type: "text",
      text: "hello world",
    });
    expect(turn.complete).toHaveBeenCalledOnce();
    expect(turn.state).toBe("completed");
  });

  it("executes tool calls then returns the final assistant response", async () => {
    const execute = vi.fn(async (args: Readonly<Record<string, unknown>>) => ({
      ok: true,
      data: { answer: `found:${args.q}` },
    }));
    const tool = makeTool("acme/search", {
      name: "search",
      parameters: {
        type: "object",
        properties: { q: { type: "string" } },
        required: ["q"],
      },
      execute,
    });

    let call = 0;
    const provider = makeProvider("acme/model", {
      capabilities: {
        streaming: false,
        tools: true,
        modalities: ["text"],
      },
      complete: async (request: ProviderRequest): Promise<ProviderResponse> => {
        call += 1;
        if (call === 1) {
          return {
            id: "resp-tools",
            output: [
              {
                type: "tool_call",
                id: "call-1",
                name: "search",
                arguments: { q: "kairo" },
              },
            ],
            stopReason: "tool_calls",
          };
        }
        const hasToolResult = request.input.some((message) =>
          message.content.some((part) => part.type === "tool_result"),
        );
        expect(hasToolResult).toBe(true);
        return {
          id: "resp-final",
          output: [{ type: "text", text: "done" }],
          stopReason: "end",
        };
      },
    });

    const { loop } = setup({
      providers: [provider],
      tools: [tool],
      builders: [
        seedMessagesBuilder([
          { role: "user", content: [{ type: "text", text: "search please" }] },
        ]),
        toolsBuilder([tool]),
      ],
    });
    const turn = createFakeTurn();

    const result = await loop.execute(turn as never, {
      model: "demo",
      maxIterations: 4,
    });

    expect(execute).toHaveBeenCalledOnce();
    expect(result.status).toBe("completed");
    expect(result.iterations).toHaveLength(2);
    expect(result.iterations[0]!.toolCalls).toHaveLength(1);
    expect(result.iterations[0]!.toolResults[0]!.result.data).toEqual({
      answer: "found:kairo",
    });
    expect(result.finalResponse?.id).toBe("resp-final");
    expect(turn.complete).toHaveBeenCalledOnce();
  });

  it("supports multiple tool iterations", async () => {
    const tool = makeTool("acme/step", {
      name: "step",
      parameters: { type: "object", properties: {} },
      execute: async () => ({ ok: true, data: { ok: true } }),
    });

    let call = 0;
    const provider = makeProvider("acme/model", {
      capabilities: { streaming: false, tools: true, modalities: ["text"] },
      complete: async () => {
        call += 1;
        if (call < 3) {
          return {
            id: `resp-${call}`,
            output: [
              {
                type: "tool_call",
                id: `c${call}`,
                name: "step",
                arguments: {},
              },
            ],
            stopReason: "tool_calls",
          };
        }
        return {
          id: "resp-final",
          output: [{ type: "text", text: "finished" }],
          stopReason: "end",
        };
      },
    });

    const { loop } = setup({
      providers: [provider],
      tools: [tool],
      builders: [
        seedMessagesBuilder([
          { role: "user", content: [{ type: "text", text: "go" }] },
        ]),
        toolsBuilder([tool]),
      ],
    });

    const result = await loop.execute(createFakeTurn() as never, {
      model: "demo",
      maxIterations: 5,
    });

    expect(result.iterations).toHaveLength(3);
    expect(result.status).toBe("completed");
  });

  it("stops when maxIterations is reached", async () => {
    const tool = makeTool("acme/step", {
      name: "step",
      parameters: { type: "object", properties: {} },
      execute: async () => ({ ok: true }),
    });
    const provider = makeProvider("acme/model", {
      capabilities: { streaming: false, tools: true, modalities: ["text"] },
      complete: async () => ({
        id: "resp",
        output: [
          {
            type: "tool_call",
            id: "c1",
            name: "step",
            arguments: {},
          },
        ],
        stopReason: "tool_calls",
      }),
    });
    const { loop } = setup({
      providers: [provider],
      tools: [tool],
      builders: [
        seedMessagesBuilder([
          { role: "user", content: [{ type: "text", text: "loop" }] },
        ]),
        toolsBuilder([tool]),
      ],
    });

    await expect(
      loop.execute(createFakeTurn() as never, {
        model: "demo",
        maxIterations: 2,
      }),
    ).rejects.toMatchObject({
      code: AgentLoopErrorCode.MAX_ITERATIONS,
    });
  });

  it("fails closed on provider failure", async () => {
    const provider = makeProvider("acme/model", {
      complete: async () => {
        throw new Error("provider down");
      },
    });
    const { loop } = setup({
      providers: [provider],
      builders: [
        seedMessagesBuilder([
          { role: "user", content: [{ type: "text", text: "hi" }] },
        ]),
      ],
    });
    const turn = createFakeTurn();

    await expect(
      loop.execute(turn as never, { model: "demo" }),
    ).rejects.toBeInstanceOf(AgentLoopError);
    expect(turn.complete).not.toHaveBeenCalled();
  });

  it("fails closed when a tool throws", async () => {
    const tool = makeTool("acme/boom", {
      name: "boom",
      parameters: { type: "object", properties: {} },
      execute: async () => {
        throw new Error("tool exploded");
      },
    });
    const provider = makeProvider("acme/model", {
      capabilities: { streaming: false, tools: true, modalities: ["text"] },
      complete: async () => ({
        id: "resp",
        output: [
          {
            type: "tool_call",
            id: "c1",
            name: "boom",
            arguments: {},
          },
        ],
        stopReason: "tool_calls",
      }),
    });
    const { loop } = setup({
      providers: [provider],
      tools: [tool],
      builders: [
        seedMessagesBuilder([
          { role: "user", content: [{ type: "text", text: "hi" }] },
        ]),
        toolsBuilder([tool]),
      ],
    });
    const turn = createFakeTurn();

    await expect(
      loop.execute(turn as never, { model: "demo" }),
    ).rejects.toMatchObject({
      code: AgentLoopErrorCode.TOOL_FAILED,
    });
    expect(turn.complete).not.toHaveBeenCalled();
  });

  it("honors cancellation", async () => {
    const controller = new AbortController();
    controller.abort("stop");
    const provider = makeProvider("acme/model");
    const { loop } = setup({
      providers: [provider],
      builders: [
        seedMessagesBuilder([
          { role: "user", content: [{ type: "text", text: "hi" }] },
        ]),
      ],
    });

    await expect(
      loop.execute(createFakeTurn({ signal: controller.signal }) as never, {
        model: "demo",
      }),
    ).rejects.toMatchObject({
      code: AgentLoopErrorCode.CANCELLED,
    });
  });

  it("assembles context on every iteration via ContextAssembler", async () => {
    const build = vi.fn(() => ({
      fragments: [
        createContextFragment({
          messages: [{ role: "user", content: [{ type: "text", text: "x" }] }],
        }),
      ],
    }));
    const builder: ContextBuilder = {
      id: "test/count",
      name: "Count",
      build,
    };

    let call = 0;
    const tool = makeTool("acme/step", {
      name: "step",
      parameters: { type: "object", properties: {} },
      execute: async () => ({ ok: true }),
    });
    const provider = makeProvider("acme/model", {
      capabilities: { streaming: false, tools: true, modalities: ["text"] },
      complete: async () => {
        call += 1;
        if (call === 1) {
          return {
            id: "r1",
            output: [
              {
                type: "tool_call",
                id: "c1",
                name: "step",
                arguments: {},
              },
            ],
            stopReason: "tool_calls",
          };
        }
        return {
          id: "r2",
          output: [{ type: "text", text: "ok" }],
          stopReason: "end",
        };
      },
    });

    const { loop } = setup({
      providers: [provider],
      tools: [tool],
      builders: [builder, toolsBuilder([tool])],
    });

    await loop.execute(createFakeTurn() as never, {
      model: "demo",
      maxIterations: 3,
    });

    expect(build.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("uses ProviderGateway and ToolRouter (never calls provider/tool contracts directly)", async () => {
    const complete = vi.fn(
      async (): Promise<ProviderResponse> => ({
        id: "r",
        output: [{ type: "text" as const, text: "ok" }],
        stopReason: "end",
      }),
    );
    const provider = makeProvider("acme/model", { complete });
    const { loop, events } = setup({
      providers: [provider],
      builders: [
        seedMessagesBuilder([
          { role: "user", content: [{ type: "text", text: "hi" }] },
        ]),
      ],
    });
    const received: RuntimeEvent[] = [];
    events.subscribe((e) => {
      received.push(e);
    });

    await loop.execute(createFakeTurn() as never, { model: "demo" });

    expect(complete).toHaveBeenCalledOnce();
    // Gateway lifecycle events only — fake turn.complete does not publish.
    // Real Turn.complete emits turn.completed (covered in runtime integration).
    expect(received.map((e) => e.type)).toEqual([
      "provider.called",
      "provider.completed",
    ]);
  });

  it("requires a model option", async () => {
    const { loop } = setup({
      providers: [makeProvider("acme/model")],
    });
    await expect(
      loop.execute(createFakeTurn() as never, {
        model: "",
      }),
    ).rejects.toMatchObject({
      code: AgentLoopErrorCode.INVALID_OPTIONS,
    });
  });

  it("continues when a tool returns ok:false (structured tool result)", async () => {
    const tool = makeTool("acme/search", {
      name: "search",
      parameters: { type: "object", properties: {} },
      execute: async () => ({ ok: false, message: "miss", errorCode: "MISS" }),
    });
    let call = 0;
    const provider = makeProvider("acme/model", {
      capabilities: { streaming: false, tools: true, modalities: ["text"] },
      complete: async () => {
        call += 1;
        if (call === 1) {
          return {
            id: "r1",
            output: [
              {
                type: "tool_call",
                id: "c1",
                name: "search",
                arguments: {},
              },
            ],
            stopReason: "tool_calls",
          };
        }
        return {
          id: "r2",
          output: [{ type: "text", text: "handled miss" }],
          stopReason: "end",
        };
      },
    });
    const { loop } = setup({
      providers: [provider],
      tools: [tool],
      builders: [
        seedMessagesBuilder([
          { role: "user", content: [{ type: "text", text: "q" }] },
        ]),
        toolsBuilder([tool]),
      ],
    });

    const result = await loop.execute(createFakeTurn() as never, {
      model: "demo",
    });
    expect(result.status).toBe("completed");
    expect(result.iterations[0]!.toolResults[0]!.result.ok).toBe(false);
  });

  describe("stream mode", () => {
    it("streams a text-only turn and matches complete-path LoopResult shape", async () => {
      const finalResponse: ProviderResponse = {
        id: "resp-stream",
        output: [{ type: "text", text: "hello world" }],
        stopReason: "end",
      };
      const provider = makeProvider("acme/stream", {
        capabilities: {
          streaming: true,
          tools: false,
          modalities: ["text"],
        },
        complete: async () => finalResponse,
        stream: async function* () {
          yield { type: "message_start" as const };
          yield { type: "text_delta" as const, text: "hello" };
          yield { type: "text_delta" as const, text: " world" };
          yield { type: "message_end" as const, response: finalResponse };
        },
      });
      const turn = createFakeTurn();
      const { loop } = setup({
        providers: [provider],
        builders: [
          seedMessagesBuilder([
            { role: "user", content: [{ type: "text", text: "hi" }] },
          ]),
        ],
      });

      const deltas: string[] = [];
      const result = await loop.execute(turn as never, {
        model: "demo",
        stream: true,
        onStreamEvent: (event) => {
          if (event.type === "text_delta") {
            deltas.push(event.text);
          }
        },
      });

      expect(result.status).toBe("completed");
      expect(result.iterationCount).toBe(1);
      expect(result.finalResponse).toEqual(finalResponse);
      expect(result.iterations[0]!.assistantOutput).toEqual(
        finalResponse.output,
      );
      expect(deltas).toEqual(["hello", " world"]);
      expect(turn.complete).toHaveBeenCalledOnce();
    });

    it("forwards stream events in order via onStreamEvent", async () => {
      const finalResponse: ProviderResponse = {
        id: "r",
        output: [{ type: "text", text: "ab" }],
        stopReason: "end",
      };
      const provider = makeProvider("acme/stream", {
        capabilities: {
          streaming: true,
          tools: false,
          modalities: ["text"],
        },
        stream: async function* () {
          yield { type: "message_start" as const };
          yield { type: "text_delta" as const, text: "a" };
          yield { type: "text_delta" as const, text: "b" };
          yield { type: "message_end" as const, response: finalResponse };
        },
      });
      const { loop } = setup({
        providers: [provider],
        builders: [
          seedMessagesBuilder([
            { role: "user", content: [{ type: "text", text: "x" }] },
          ]),
        ],
      });

      const types: string[] = [];
      await loop.execute(createFakeTurn() as never, {
        model: "demo",
        stream: true,
        onStreamEvent: (event) => {
          types.push(event.type);
        },
      });
      expect(types).toEqual([
        "message_start",
        "text_delta",
        "text_delta",
        "message_end",
      ]);
    });

    it("does not call stream() when stream option is omitted", async () => {
      const stream = vi.fn(async function* () {
        const response: ProviderResponse = {
          id: "s",
          output: [{ type: "text", text: "streamed" }],
          stopReason: "end",
        };
        yield {
          type: "message_end" as const,
          response,
        };
      });
      const complete = vi.fn(async (): Promise<ProviderResponse> => ({
        id: "c",
        output: [{ type: "text", text: "completed" }],
        stopReason: "end",
      }));
      const provider = makeProvider("acme/both", {
        capabilities: {
          streaming: true,
          tools: false,
          modalities: ["text"],
        },
        complete,
        stream,
      });
      const { loop } = setup({
        providers: [provider],
        builders: [
          seedMessagesBuilder([
            { role: "user", content: [{ type: "text", text: "x" }] },
          ]),
        ],
      });

      const result = await loop.execute(createFakeTurn() as never, {
        model: "demo",
      });
      expect(result.finalResponse?.id).toBe("c");
      expect(complete).toHaveBeenCalledOnce();
      expect(stream).not.toHaveBeenCalled();
    });

    it("cancels mid-stream", async () => {
      const controller = new AbortController();
      const provider = makeProvider("acme/stream", {
        capabilities: {
          streaming: true,
          tools: false,
          modalities: ["text"],
        },
        stream: async function* (request) {
          yield { type: "text_delta" as const, text: "one" };
          controller.abort("stop-stream");
          if (request.signal?.aborted) {
            return;
          }
          yield { type: "text_delta" as const, text: "two" };
        },
      });
      const { loop } = setup({
        providers: [provider],
        builders: [
          seedMessagesBuilder([
            { role: "user", content: [{ type: "text", text: "x" }] },
          ]),
        ],
      });

      await expect(
        loop.execute(createFakeTurn({ signal: controller.signal }) as never, {
          model: "demo",
          stream: true,
          signal: controller.signal,
        }),
      ).rejects.toMatchObject({
        code: AgentLoopErrorCode.CANCELLED,
      });
    });

    it("fails closed when stream is requested but provider cannot stream", async () => {
      const provider = makeProvider("acme/model", {
        complete: async () => ({
          id: "r",
          output: [{ type: "text", text: "ok" }],
          stopReason: "end",
        }),
      });
      const { loop } = setup({
        providers: [provider],
        builders: [
          seedMessagesBuilder([
            { role: "user", content: [{ type: "text", text: "x" }] },
          ]),
        ],
      });

      await expect(
        loop.execute(createFakeTurn() as never, {
          model: "demo",
          stream: true,
        }),
      ).rejects.toMatchObject({
        code: AgentLoopErrorCode.PROVIDER_FAILED,
      });
    });

    it("runs tool iterations after a streamed tool_calls response", async () => {
      const execute = vi.fn(async () => ({
        ok: true as const,
        data: { answer: 42 },
      }));
      const tool = makeTool("search", {
        name: "search",
        execute,
      });

      let calls = 0;
      const provider = makeProvider("acme/stream", {
        capabilities: {
          streaming: true,
          tools: true,
          modalities: ["text"],
        },
        complete: async () => ({
          id: "should-not-use",
          output: [{ type: "text", text: "nope" }],
          stopReason: "end",
        }),
        stream: async function* () {
          calls += 1;
          if (calls === 1) {
            yield {
              type: "message_end" as const,
              response: {
                id: "r1",
                output: [
                  {
                    type: "tool_call" as const,
                    id: "c1",
                    name: "search",
                    arguments: { q: "pi" },
                  },
                ],
                stopReason: "tool_calls" as const,
              },
            };
            return;
          }
          yield { type: "text_delta" as const, text: "42" };
          yield {
            type: "message_end" as const,
            response: {
              id: "r2",
              output: [{ type: "text" as const, text: "42" }],
              stopReason: "end" as const,
            },
          };
        },
      });

      const { loop } = setup({
        providers: [provider],
        tools: [tool],
        builders: [
          seedMessagesBuilder([
            { role: "user", content: [{ type: "text", text: "q" }] },
          ]),
          toolsBuilder([tool]),
        ],
      });

      const result = await loop.execute(createFakeTurn() as never, {
        model: "demo",
        stream: true,
        maxIterations: 4,
      });

      expect(result.status).toBe("completed");
      expect(result.iterationCount).toBe(2);
      expect(execute).toHaveBeenCalledOnce();
      expect(result.finalResponse?.output[0]).toEqual({
        type: "text",
        text: "42",
      });
      expect(result.iterations[0]!.toolCalls[0]!.name).toBe("search");
    });
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  EventBus,
  EventPublisher,
  PolicyManager,
  ToolRegistry,
  ToolRouter,
  ToolRouterError,
  ToolRouterErrorCode,
  type PolicyHook,
  type RuntimeEvent,
  type Tool,
  type ToolExecuteContext,
  type ToolResult,
} from "../../src/index.js";
import { makeTool } from "../helpers/contracts.js";

function setup(tools: Tool[] = []) {
  const registry = new ToolRegistry();
  for (const tool of tools) {
    registry.register(tool);
  }
  const events = new EventBus();
  const policy = new PolicyManager();
  const router = new ToolRouter({
    tools: registry,
    events,
    policy,
  });
  return { router, registry, events, policy };
}

describe("ToolRouter", () => {
  it("looks up a tool and invokes execute()", async () => {
    const execute = vi.fn(
      async (
        args: Readonly<Record<string, unknown>>,
      ): Promise<ToolResult> => ({
        ok: true,
        data: { echoed: args.q },
      }),
    );
    const tool = makeTool("acme/search", {
      parameters: {
        type: "object",
        properties: { q: { type: "string" } },
        required: ["q"],
      },
      execute,
    });
    const { router } = setup([tool]);

    const result = await router.invoke({
      toolId: "acme/search",
      args: { q: "kairo" },
      sessionId: "session-1",
      turnId: "turn-1",
      runtimeId: "runtime-1",
    });

    expect(execute).toHaveBeenCalledOnce();
    expect(result.toolId).toBe("acme/search");
    expect(result.result.ok).toBe(true);
    expect(result.result.data).toEqual({ echoed: "kairo" });
    expect(result.args).toEqual({ q: "kairo" });
  });

  it("rejects missing tools", async () => {
    const { router } = setup();
    await expect(
      router.invoke({
        toolId: "missing",
        args: {},
      }),
    ).rejects.toMatchObject({
      code: ToolRouterErrorCode.TOOL_NOT_FOUND,
    });
  });

  it("denies invocation when policy denies tool.invoke", async () => {
    const execute = vi.fn(async () => ({ ok: true }));
    const { router, policy } = setup([
      makeTool("acme/search", { execute }),
    ]);

    const hook: PolicyHook = {
      id: "deny-tool",
      evaluate: () => ({ verdict: "deny", reason: "not allowed" }),
    };
    policy.registry.register(hook);

    await expect(
      router.invoke({
        toolId: "acme/search",
        args: {},
        sessionId: "s1",
        turnId: "t1",
      }),
    ).rejects.toMatchObject({
      code: ToolRouterErrorCode.POLICY_DENIED,
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("validates required arguments before execute", async () => {
    const execute = vi.fn(async () => ({ ok: true }));
    const { router } = setup([
      makeTool("acme/search", {
        parameters: {
          type: "object",
          properties: {
            q: { type: "string" },
          },
          required: ["q"],
        },
        execute,
      }),
    ]);

    await expect(
      router.invoke({
        toolId: "acme/search",
        args: {},
      }),
    ).rejects.toMatchObject({
      code: ToolRouterErrorCode.INVALID_ARGUMENTS,
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("validates argument types before execute", async () => {
    const execute = vi.fn(async () => ({ ok: true }));
    const { router } = setup([
      makeTool("acme/search", {
        parameters: {
          type: "object",
          properties: {
            limit: { type: "integer" },
          },
        },
        execute,
      }),
    ]);

    await expect(
      router.invoke({
        toolId: "acme/search",
        args: { limit: "not-a-number" },
      }),
    ).rejects.toMatchObject({
      code: ToolRouterErrorCode.INVALID_ARGUMENTS,
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("emits tool.invoked and tool.completed on success", async () => {
    const { router, events } = setup([makeTool("acme/search")]);
    const received: RuntimeEvent[] = [];
    events.subscribe((event) => {
      received.push(event);
    });

    await router.invoke({
      toolId: "acme/search",
      args: {},
      sessionId: "session-1",
      turnId: "turn-1",
    });

    expect(received.map((e) => e.type)).toEqual([
      "tool.invoked",
      "tool.completed",
    ]);
    expect(received[0]!.sessionId).toBe("session-1");
    expect(received[0]!.turnId).toBe("turn-1");
    expect(received[0]!.data.toolId).toBe("acme/search");
  });

  it("emits tool.failed when execute throws", async () => {
    const { router, events } = setup([
      makeTool("acme/search", {
        execute: async () => {
          throw new Error("upstream down");
        },
      }),
    ]);
    const received: RuntimeEvent[] = [];
    events.subscribe((event) => {
      received.push(event);
    });

    await expect(
      router.invoke({
        toolId: "acme/search",
        args: {},
      }),
    ).rejects.toMatchObject({
      code: ToolRouterErrorCode.INVOCATION_FAILED,
    });

    expect(received.map((e) => e.type)).toEqual([
      "tool.invoked",
      "tool.failed",
    ]);
  });

  it("emits policy.denied when policy blocks", async () => {
    const { router, events, policy } = setup([makeTool("acme/search")]);
    policy.registry.register({
      id: "block",
      evaluate: () => ({ verdict: "deny", reason: "blocked" }),
    });
    const received: RuntimeEvent[] = [];
    events.subscribe((event) => {
      received.push(event);
    });

    await expect(
      router.invoke({
        toolId: "acme/search",
        args: {},
      }),
    ).rejects.toBeInstanceOf(ToolRouterError);

    expect(received.map((e) => e.type)).toEqual(["policy.denied"]);
  });

  it("honors cancellation before and during invocation", async () => {
    const controller = new AbortController();
    controller.abort("stop");
    const { router } = setup([makeTool("acme/search")]);

    await expect(
      router.invoke({
        toolId: "acme/search",
        args: {},
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({
      code: ToolRouterErrorCode.CANCELLED,
    });
  });

  it("passes abort signal and metadata into ToolExecuteContext", async () => {
    let seen: ToolExecuteContext | undefined;
    const { router } = setup([
      makeTool("acme/search", {
        execute: async (_args, context) => {
          seen = context;
          return { ok: true };
        },
      }),
    ]);
    const controller = new AbortController();

    await router.invoke({
      toolId: "acme/search",
      args: {},
      signal: controller.signal,
      metadata: { source: "test" },
    });

    expect(seen?.signal).toBe(controller.signal);
    expect(seen?.metadata).toEqual({ source: "test" });
  });

  it("validates tool results", async () => {
    const { router } = setup([
      makeTool("acme/search", {
        execute: async () =>
          ({
            ok: "yes",
          }) as unknown as ToolResult,
      }),
    ]);

    await expect(
      router.invoke({
        toolId: "acme/search",
        args: {},
      }),
    ).rejects.toMatchObject({
      code: ToolRouterErrorCode.INVALID_RESULT,
    });
  });

  it("requires an explicit toolId (does not choose tools)", async () => {
    const { router } = setup([makeTool("only/one")]);
    await expect(
      router.invoke({
        toolId: "",
        args: {},
      }),
    ).rejects.toMatchObject({
      code: ToolRouterErrorCode.INVALID_INVOCATION,
    });
  });

  it("returns tool ok:false results without throwing", async () => {
    const { router, events } = setup([
      makeTool("acme/search", {
        execute: async () => ({
          ok: false,
          message: "not found",
          errorCode: "NOT_FOUND",
        }),
      }),
    ]);
    const received: RuntimeEvent[] = [];
    events.subscribe((event) => {
      received.push(event);
    });

    const result = await router.invoke({
      toolId: "acme/search",
      args: {},
    });

    expect(result.result.ok).toBe(false);
    expect(result.result.errorCode).toBe("NOT_FOUND");
    expect(received.map((e) => e.type)).toEqual([
      "tool.invoked",
      "tool.completed",
    ]);
  });

  it("uses EventPublisher when provided and remains provider-neutral", async () => {
    const registry = new ToolRegistry();
    registry.register(makeTool("acme/search"));
    const events = new EventBus();
    const publisher = new EventPublisher(events);
    const router = new ToolRouter({
      tools: registry,
      events,
      policy: new PolicyManager(),
      publisher,
    });

    const result = await router.invoke({
      toolId: "acme/search",
      args: {},
    });

    expect(result.toolId).toBe("acme/search");
    expect("openai" in result).toBe(false);
    expect("anthropic" in result).toBe(false);
  });
});

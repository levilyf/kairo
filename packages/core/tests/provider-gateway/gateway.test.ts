import { describe, expect, it, vi } from "vitest";
import {
  Context,
  createContext,
  EventBus,
  EventPublisher,
  PolicyManager,
  ProviderGateway,
  ProviderGatewayError,
  ProviderGatewayErrorCode,
  ProviderRegistry,
  type PolicyHook,
  type Provider,
  type ProviderRequest,
  type ProviderResponse,
  type RuntimeEvent,
} from "../../src/index.js";
import { makeProvider } from "../helpers/contracts.js";

function context(overrides: Partial<{
  instructions: string[];
  messages: Context["messages"];
  toolDefinitions: Context["toolDefinitions"];
  variables: Record<string, unknown>;
}> = {}): Context {
  return createContext({
    turnId: "turn-1",
    sessionId: "session-1",
    runtimeId: "runtime-1",
    instructions: overrides.instructions ?? ["be careful"],
    messages: overrides.messages ?? [
      { role: "user", content: [{ type: "text", text: "hello" }] },
    ],
    toolDefinitions: overrides.toolDefinitions ?? [{ name: "search", id: "search" }],
    variables: overrides.variables ?? {},
    state: "assembled",
  });
}

function setup(providers: Provider[] = []) {
  const registry = new ProviderRegistry();
  for (const provider of providers) {
    registry.register(provider);
  }
  const events = new EventBus();
  const policy = new PolicyManager();
  const gateway = new ProviderGateway({
    providers: registry,
    events,
    policy,
  });
  return { gateway, registry, events, policy };
}

describe("ProviderGateway", () => {
  it("looks up a provider and invokes complete()", async () => {
    const complete = vi.fn(async (request: ProviderRequest): Promise<ProviderResponse> => ({
      id: "resp-1",
      output: [{ type: "text", text: `echo:${request.input.length}` }],
      stopReason: "end",
      model: request.model,
    }));
    const provider = makeProvider("acme/model", { complete });
    const { gateway } = setup([provider]);

    const result = await gateway.invoke({
      providerId: "acme/model",
      model: "demo-1",
      context: context(),
    });

    expect(complete).toHaveBeenCalledOnce();
    expect(result.providerId).toBe("acme/model");
    expect(result.response.id).toBe("resp-1");
    expect(result.response.output[0]).toEqual({
      type: "text",
      text: "echo:2",
    });
    expect(result.request.model).toBe("demo-1");
  });

  it("rejects missing providers", async () => {
    const { gateway } = setup();
    await expect(
      gateway.invoke({
        providerId: "missing",
        model: "x",
        context: context(),
      }),
    ).rejects.toMatchObject({
      code: ProviderGatewayErrorCode.PROVIDER_NOT_FOUND,
    });
  });

  it("denies invocation when policy denies provider.call", async () => {
    const complete = vi.fn(async () => ({
      id: "resp",
      output: [{ type: "text" as const, text: "nope" }],
      stopReason: "end" as const,
    }));
    const { gateway, policy } = setup([
      makeProvider("acme/model", { complete }),
    ]);

    const hook: PolicyHook = {
      id: "deny-provider",
      evaluate: () => ({ verdict: "deny", reason: "not allowed" }),
    };
    policy.registry.register(hook);

    await expect(
      gateway.invoke({
        providerId: "acme/model",
        model: "x",
        context: context(),
      }),
    ).rejects.toMatchObject({
      code: ProviderGatewayErrorCode.POLICY_DENIED,
    });
    expect(complete).not.toHaveBeenCalled();
  });

  it("emits provider.called and provider.completed on success", async () => {
    const { gateway, events } = setup([makeProvider("acme/model")]);
    const received: RuntimeEvent[] = [];
    events.subscribe((event) => {
      received.push(event);
    });

    await gateway.invoke({
      providerId: "acme/model",
      model: "m",
      context: context(),
    });

    expect(received.map((e) => e.type)).toEqual([
      "provider.called",
      "provider.completed",
    ]);
    expect(received[0]!.sessionId).toBe("session-1");
    expect(received[0]!.turnId).toBe("turn-1");
    expect(received[0]!.data.providerId).toBe("acme/model");
  });

  it("emits provider.failed when complete throws", async () => {
    const { gateway, events } = setup([
      makeProvider("acme/model", {
        complete: async () => {
          throw new Error("upstream down");
        },
      }),
    ]);
    const received: RuntimeEvent[] = [];
    events.subscribe((event) => {
      received.push(event);
    });

    await expect(
      gateway.invoke({
        providerId: "acme/model",
        model: "m",
        context: context(),
      }),
    ).rejects.toMatchObject({
      code: ProviderGatewayErrorCode.INVOCATION_FAILED,
    });

    expect(received.map((e) => e.type)).toEqual([
      "provider.called",
      "provider.failed",
    ]);
  });

  it("emits policy.denied when policy blocks", async () => {
    const { gateway, events, policy } = setup([makeProvider("acme/model")]);
    policy.registry.register({
      id: "block",
      evaluate: () => ({ verdict: "deny", reason: "blocked" }),
    });
    const received: RuntimeEvent[] = [];
    events.subscribe((event) => {
      received.push(event);
    });

    await expect(
      gateway.invoke({
        providerId: "acme/model",
        model: "m",
        context: context(),
      }),
    ).rejects.toBeInstanceOf(ProviderGatewayError);

    expect(received.map((e) => e.type)).toEqual(["policy.denied"]);
  });

  it("honors cancellation before and during invocation", async () => {
    const controller = new AbortController();
    controller.abort("stop");
    const { gateway } = setup([makeProvider("acme/model")]);

    await expect(
      gateway.invoke({
        providerId: "acme/model",
        model: "m",
        context: context(),
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({
      code: ProviderGatewayErrorCode.CANCELLED,
    });
  });

  it("passes abort signal into ProviderRequest", async () => {
    let seen: AbortSignal | undefined;
    const { gateway } = setup([
      makeProvider("acme/model", {
        complete: async (request) => {
          seen = request.signal;
          return {
            id: "r",
            output: [{ type: "text", text: "ok" }],
            stopReason: "end",
          };
        },
      }),
    ]);
    const controller = new AbortController();

    await gateway.invoke({
      providerId: "acme/model",
      model: "m",
      context: context(),
      signal: controller.signal,
    });

    expect(seen).toBe(controller.signal);
  });

  it("validates provider responses", async () => {
    const { gateway } = setup([
      makeProvider("acme/model", {
        complete: async () =>
          ({
            id: "",
            output: "bad",
            stopReason: "end",
          }) as unknown as ProviderResponse,
      }),
    ]);

    await expect(
      gateway.invoke({
        providerId: "acme/model",
        model: "m",
        context: context(),
      }),
    ).rejects.toMatchObject({
      code: ProviderGatewayErrorCode.INVALID_RESPONSE,
    });
  });

  it("selects the only registered provider when providerId is omitted", async () => {
    const { gateway } = setup([makeProvider("only/one")]);
    const result = await gateway.invoke({
      model: "m",
      context: context(),
    });
    expect(result.providerId).toBe("only/one");
  });

  it("rejects ambiguous selection when multiple providers and no providerId", async () => {
    const { gateway } = setup([
      makeProvider("a"),
      makeProvider("b"),
    ]);
    await expect(
      gateway.invoke({
        model: "m",
        context: context(),
      }),
    ).rejects.toMatchObject({
      code: ProviderGatewayErrorCode.AMBIGUOUS_PROVIDER,
    });
  });

  it("does not allow registry duplicates (registry enforces uniqueness)", () => {
    const registry = new ProviderRegistry();
    registry.register(makeProvider("dup"));
    expect(() => registry.register(makeProvider("dup"))).toThrow();
  });

  it("uses EventPublisher when provided and remains provider-neutral", async () => {
    const registry = new ProviderRegistry();
    registry.register(makeProvider("acme/model"));
    const events = new EventBus();
    const publisher = new EventPublisher(events);
    const gateway = new ProviderGateway({
      providers: registry,
      events,
      policy: new PolicyManager(),
      publisher,
    });

    const result = await gateway.invoke({
      providerId: "acme/model",
      model: "m",
      context: context(),
    });

    expect(result.request.input[0]?.role).toBe("system");
    expect("openai" in result).toBe(false);
    expect("anthropic" in result).toBe(false);
  });

  describe("stream()", () => {
    function makeStreamingProvider(
      id: string,
      streamImpl?: Provider["stream"],
    ): Provider {
      const finalResponse: ProviderResponse = {
        id: "resp-stream",
        output: [{ type: "text", text: "hello world" }],
        stopReason: "end",
        model: "m",
      };
      return makeProvider(id, {
        capabilities: {
          streaming: true,
          tools: false,
          modalities: ["text"],
        },
        stream:
          streamImpl ??
          (async function* () {
            yield { type: "message_start" as const };
            yield { type: "text_delta" as const, text: "hello" };
            yield { type: "text_delta" as const, text: " world" };
            yield { type: "message_end" as const, response: finalResponse };
          }),
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

    it("yields ordered stream events with attribution", async () => {
      const { gateway } = setup([makeStreamingProvider("acme/stream")]);
      const events = await collect(
        gateway.stream({
          providerId: "acme/stream",
          model: "m",
          context: context(),
        }),
      );

      expect(events.map((e) => e.event.type)).toEqual([
        "message_start",
        "text_delta",
        "text_delta",
        "message_end",
      ]);
      expect(events[1]?.event).toEqual({ type: "text_delta", text: "hello" });
      expect(events[0]?.providerId).toBe("acme/stream");
      expect(events[0]?.model).toBe("m");
      expect(events[0]?.sessionId).toBe("session-1");
      expect(events[0]?.turnId).toBe("turn-1");
      expect(events[0]?.runtimeId).toBe("runtime-1");
      expect(events[0]?.contextId).toBeDefined();

      const end = events[events.length - 1]!;
      expect(end.event.type).toBe("message_end");
      if (end.event.type === "message_end") {
        expect(end.event.response.id).toBe("resp-stream");
        expect(end.event.response.output[0]).toEqual({
          type: "text",
          text: "hello world",
        });
      }
    });

    it("emits provider.called and provider.completed for a successful stream", async () => {
      const { gateway, events } = setup([makeStreamingProvider("acme/stream")]);
      const received: RuntimeEvent[] = [];
      events.subscribe((event) => {
        received.push(event);
      });

      await collect(
        gateway.stream({
          providerId: "acme/stream",
          model: "m",
          context: context(),
        }),
      );

      expect(received.map((e) => e.type)).toEqual([
        "provider.called",
        "provider.completed",
      ]);
      expect(received[1]!.data.responseId).toBe("resp-stream");
    });

    it("fails closed when provider lacks streaming capability", async () => {
      const { gateway } = setup([makeProvider("acme/model")]);
      await expect(
        collect(
          gateway.stream({
            providerId: "acme/model",
            model: "m",
            context: context(),
          }),
        ),
      ).rejects.toMatchObject({
        code: ProviderGatewayErrorCode.STREAMING_UNSUPPORTED,
      });
    });

    it("fails closed when streaming is true but stream() is missing", async () => {
      // Registry asserts the contract on register. Mutate after registration to
      // exercise the gateway's defensive STREAMING_UNSUPPORTED path.
      const broken = makeProvider("acme/broken");
      const { gateway } = setup([broken]);
      (broken.capabilities as { streaming: boolean }).streaming = true;
      delete (broken as { stream?: unknown }).stream;

      await expect(
        collect(
          gateway.stream({
            providerId: "acme/broken",
            model: "m",
            context: context(),
          }),
        ),
      ).rejects.toMatchObject({
        code: ProviderGatewayErrorCode.STREAMING_UNSUPPORTED,
      });
    });

    it("denies stream when policy denies provider.call", async () => {
      const stream = vi.fn(async function* () {
        yield { type: "text_delta" as const, text: "nope" };
      });
      const { gateway, policy } = setup([
        makeStreamingProvider("acme/stream", stream),
      ]);
      policy.registry.register({
        id: "deny-stream",
        evaluate: () => ({ verdict: "deny", reason: "not allowed" }),
      });

      await expect(
        collect(
          gateway.stream({
            providerId: "acme/stream",
            model: "m",
            context: context(),
          }),
        ),
      ).rejects.toMatchObject({
        code: ProviderGatewayErrorCode.POLICY_DENIED,
      });
      expect(stream).not.toHaveBeenCalled();
    });

    it("honors cancellation before stream starts", async () => {
      const controller = new AbortController();
      controller.abort("stop");
      const { gateway } = setup([makeStreamingProvider("acme/stream")]);

      await expect(
        collect(
          gateway.stream({
            providerId: "acme/stream",
            model: "m",
            context: context(),
            signal: controller.signal,
          }),
        ),
      ).rejects.toMatchObject({
        code: ProviderGatewayErrorCode.CANCELLED,
      });
    });

    it("cancels mid-stream when signal aborts", async () => {
      const controller = new AbortController();
      const provider = makeStreamingProvider("acme/stream", async function* (request) {
        yield { type: "text_delta" as const, text: "one" };
        controller.abort("mid");
        // Provider may check signal; gateway also checks between events.
        if (request.signal?.aborted) {
          return;
        }
        yield { type: "text_delta" as const, text: "two" };
      });
      const { gateway } = setup([provider]);

      await expect(
        collect(
          gateway.stream({
            providerId: "acme/stream",
            model: "m",
            context: context(),
            signal: controller.signal,
          }),
        ),
      ).rejects.toMatchObject({
        code: ProviderGatewayErrorCode.CANCELLED,
      });
    });

    it("emits provider.failed when stream throws", async () => {
      const { gateway, events } = setup([
        makeStreamingProvider("acme/stream", async function* () {
          yield { type: "text_delta" as const, text: "partial" };
          throw new Error("upstream stream down");
        }),
      ]);
      const received: RuntimeEvent[] = [];
      events.subscribe((event) => {
        received.push(event);
      });

      await expect(
        collect(
          gateway.stream({
            providerId: "acme/stream",
            model: "m",
            context: context(),
          }),
        ),
      ).rejects.toMatchObject({
        code: ProviderGatewayErrorCode.INVOCATION_FAILED,
      });

      expect(received.map((e) => e.type)).toEqual([
        "provider.called",
        "provider.failed",
      ]);
    });

    it("rejects invalid message_end response", async () => {
      const { gateway } = setup([
        makeStreamingProvider("acme/stream", async function* () {
          yield {
            type: "message_end" as const,
            response: {
              id: "",
              output: [],
              stopReason: "end",
            },
          };
        }),
      ]);

      await expect(
        collect(
          gateway.stream({
            providerId: "acme/stream",
            model: "m",
            context: context(),
          }),
        ),
      ).rejects.toMatchObject({
        code: ProviderGatewayErrorCode.INVALID_RESPONSE,
      });
    });

    it("passes abort signal into ProviderRequest for stream", async () => {
      let seen: AbortSignal | undefined;
      const { gateway } = setup([
        makeStreamingProvider("acme/stream", async function* (request) {
          seen = request.signal;
          yield {
            type: "message_end" as const,
            response: {
              id: "r",
              output: [{ type: "text", text: "ok" }],
              stopReason: "end",
            },
          };
        }),
      ]);
      const controller = new AbortController();

      await collect(
        gateway.stream({
          providerId: "acme/stream",
          model: "m",
          context: context(),
          signal: controller.signal,
        }),
      );

      expect(seen).toBe(controller.signal);
    });
  });
});

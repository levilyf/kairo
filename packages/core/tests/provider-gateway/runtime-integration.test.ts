import { describe, expect, it } from "vitest";
import {
  createContext,
  createHarness,
  createRuntime,
  defineHarness,
  ProviderGateway,
  type RuntimeEvent,
} from "../../src/index.js";
import { makeProvider } from "../helpers/contracts.js";
import {
  createManifest,
  createModule,
  createSource,
} from "../helpers/fixtures.js";

async function readyRuntime() {
  const provider = makeProvider("acme/demo", {
    complete: async (request) => ({
      id: "runtime-resp",
      output: [{ type: "text", text: `model=${request.model}` }],
      stopReason: "end",
      model: request.model,
    }),
  });

  const manifest = createManifest({
    id: "acme/provider-mod",
    capabilities: ["provider"],
  });

  const harness = await createHarness(
    defineHarness({
      name: "ProviderGatewayRT",
      modules: [
        createSource(
          manifest,
          createModule(manifest, {
            initialize(context) {
              context.registerContribution({
                id: "acme/demo",
                capability: "provider",
                value: provider,
              });
            },
          }),
        ),
      ],
    }),
  );

  return createRuntime(harness);
}

describe("Runtime + ProviderGateway integration", () => {
  it("exposes ProviderGateway via runtime.providers", async () => {
    const runtime = await readyRuntime();
    expect(runtime.providers).toBeInstanceOf(ProviderGateway);
  });

  it("invokes providers through runtime.providers using harness registry", async () => {
    const runtime = await readyRuntime();
    const context = createContext({
      turnId: "t1",
      sessionId: "s1",
      runtimeId: runtime.metadata.id,
      messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      state: "assembled",
    });

    const result = await runtime.providers.invoke({
      providerId: "acme/demo",
      model: "demo-model",
      context,
    });

    expect(result.response.id).toBe("runtime-resp");
    expect(result.response.output[0]).toEqual({
      type: "text",
      text: "model=demo-model",
    });
  });

  it("emits provider lifecycle events on the runtime event bus", async () => {
    const runtime = await readyRuntime();
    const received: RuntimeEvent[] = [];
    runtime.events.subscribe((event) => {
      received.push(event);
    });

    await runtime.providers.invoke({
      providerId: "acme/demo",
      model: "m",
      context: createContext({
        turnId: "t1",
        sessionId: "s1",
        runtimeId: runtime.metadata.id,
        state: "assembled",
      }),
    });

    expect(received.map((e) => e.type)).toEqual([
      "provider.called",
      "provider.completed",
    ]);
  });

  it("uses runtime cancellation when no signal is provided", async () => {
    const runtime = await readyRuntime();
    runtime.cancellation.abort("shutdown");

    await expect(
      runtime.providers.invoke({
        providerId: "acme/demo",
        model: "m",
        context: createContext({
          turnId: "t1",
          sessionId: "s1",
          runtimeId: runtime.metadata.id,
          state: "assembled",
        }),
      }),
    ).rejects.toMatchObject({
      code: "CANCELLED",
    });
  });
});

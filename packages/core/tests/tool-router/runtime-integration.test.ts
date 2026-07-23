import { describe, expect, it } from "vitest";
import {
  createHarness,
  createRuntime,
  defineHarness,
  ToolRouter,
  type RuntimeEvent,
} from "../../src/index.js";
import { makeTool } from "../helpers/contracts.js";
import {
  createManifest,
  createModule,
  createSource,
} from "../helpers/fixtures.js";

async function readyRuntime() {
  const tool = makeTool("acme/echo", {
    parameters: {
      type: "object",
      properties: {
        text: { type: "string" },
      },
      required: ["text"],
    },
    execute: async (args) => ({
      ok: true,
      data: { text: String(args.text ?? "") },
    }),
  });

  const manifest = createManifest({
    id: "acme/tool-mod",
    capabilities: ["tool"],
  });

  const harness = await createHarness(
    defineHarness({
      name: "ToolRouterRT",
      modules: [
        createSource(
          manifest,
          createModule(manifest, {
            initialize(context) {
              context.registerContribution({
                id: "acme/echo",
                capability: "tool",
                value: tool,
              });
            },
          }),
        ),
      ],
    }),
  );

  return createRuntime(harness);
}

describe("Runtime + ToolRouter integration", () => {
  it("exposes ToolRouter via runtime.tools", async () => {
    const runtime = await readyRuntime();
    expect(runtime.tools).toBeInstanceOf(ToolRouter);
  });

  it("invokes tools through runtime.tools using harness registry", async () => {
    const runtime = await readyRuntime();

    const result = await runtime.tools.invoke({
      toolId: "acme/echo",
      args: { text: "hello" },
      sessionId: "s1",
      turnId: "t1",
      runtimeId: runtime.metadata.id,
    });

    expect(result.result.ok).toBe(true);
    expect(result.result.data).toEqual({ text: "hello" });
    expect(result.toolId).toBe("acme/echo");
  });

  it("emits tool lifecycle events on the runtime event bus", async () => {
    const runtime = await readyRuntime();
    const received: RuntimeEvent[] = [];
    runtime.events.subscribe((event) => {
      received.push(event);
    });

    await runtime.tools.invoke({
      toolId: "acme/echo",
      args: { text: "hi" },
      sessionId: "s1",
      turnId: "t1",
    });

    expect(received.map((e) => e.type)).toEqual([
      "tool.invoked",
      "tool.completed",
    ]);
  });

  it("uses runtime cancellation when no signal is provided", async () => {
    const runtime = await readyRuntime();
    runtime.cancellation.abort("shutdown");

    await expect(
      runtime.tools.invoke({
        toolId: "acme/echo",
        args: { text: "hi" },
      }),
    ).rejects.toMatchObject({
      code: "CANCELLED",
    });
  });
});

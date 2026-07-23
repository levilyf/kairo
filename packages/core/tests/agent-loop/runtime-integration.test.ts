import { describe, expect, it } from "vitest";
import {
  AgentLoop,
  createHarness,
  createRuntime,
  defineHarness,
  type RuntimeEvent,
} from "../../src/index.js";
import { makeProvider, makeTool } from "../helpers/contracts.js";
import {
  createManifest,
  createModule,
  createSource,
} from "../helpers/fixtures.js";

async function readyRuntime() {
  const provider = makeProvider("acme/demo", {
    capabilities: { streaming: false, tools: true, modalities: ["text"] },
    complete: async (request) => {
      const hasToolResult = request.input.some((message) =>
        message.content.some((part) => part.type === "tool_result"),
      );
      if (!hasToolResult) {
        return {
          id: "resp-tools",
          output: [
            {
              type: "tool_call",
              id: "call-1",
              name: "echo",
              arguments: { text: "hi" },
            },
          ],
          stopReason: "tool_calls",
        };
      }
      return {
        id: "resp-final",
        output: [{ type: "text", text: "all done" }],
        stopReason: "end",
      };
    },
  });

  const tool = makeTool("acme/echo", {
    name: "echo",
    parameters: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
    },
    execute: async (args) => ({
      ok: true,
      data: { text: String(args.text ?? "") },
    }),
  });

  const manifest = createManifest({
    id: "acme/loop-mod",
    capabilities: ["provider", "tool"],
  });

  const harness = await createHarness(
    defineHarness({
      name: "AgentLoopRT",
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

describe("Runtime + AgentLoop integration", () => {
  it("exposes AgentLoop via runtime.agentLoop", async () => {
    const runtime = await readyRuntime();
    expect(runtime.agentLoop).toBeInstanceOf(AgentLoop);
  });

  it("executes a turn end-to-end through runtime services", async () => {
    const runtime = await readyRuntime();
    const session = await runtime.sessions.create();
    const turn = await session.turns.create();

    const received: RuntimeEvent[] = [];
    runtime.events.subscribe((event) => {
      received.push(event);
    });

    const result = await runtime.agentLoop.execute(turn, {
      model: "demo",
      messages: [{ role: "user", content: [{ type: "text", text: "run" }] }],
      maxIterations: 3,
    });

    expect(result.status).toBe("completed");
    expect(result.iterations).toHaveLength(2);
    expect(result.finalResponse?.output[0]).toEqual({
      type: "text",
      text: "all done",
    });
    expect(turn.state).toBe("completed");
    expect(received.map((e) => e.type)).toEqual(
      expect.arrayContaining([
        "provider.called",
        "provider.completed",
        "tool.invoked",
        "tool.completed",
        "turn.completed",
      ]),
    );
  });

  it("uses runtime cancellation when turn is cancelled", async () => {
    const runtime = await readyRuntime();
    const session = await runtime.sessions.create();
    const turn = await session.turns.create();
    turn.cancellation.abort("stop");

    await expect(
      runtime.agentLoop.execute(turn, {
        model: "demo",
        messages: [{ role: "user", content: [{ type: "text", text: "x" }] }],
      }),
    ).rejects.toMatchObject({
      code: "CANCELLED",
    });
  });
});

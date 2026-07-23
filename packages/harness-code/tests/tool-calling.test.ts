import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { OpenAIChatCompletionsClient } from "@kairo/protocol-openai";
import type { KairoConfig } from "@kairo/config";
import { READ_FILE_TOOL_ID } from "@kairo/module-workspace-tools";

import { createKairoCodeApplication } from "../src/index.js";

/**
 * PR4 — end-to-end tool call through the real runtime.
 *
 * A scripted mock OpenAI-compatible client:
 *   call 1 → returns a tool_call for read_file("README.md")
 *   call 2 → returns a final answer, after the tool result is fed back
 *
 * The mock records every request body it received so the test can assert
 * that tool definitions reached the provider and that the README content
 * reached the second model call. Only the network boundary is faked; the
 * genuine Core runtime (context assembler, provider gateway, agent loop,
 * tool router) and the real @kairo/protocol-openai mapper are exercised.
 */
interface ScriptedClient {
  client: OpenAIChatCompletionsClient;
  bodies: () => Array<Record<string, unknown>>;
  callCount: () => number;
}

function makeScriptedClient(finalAnswer: string): ScriptedClient {
  const bodies: Array<Record<string, unknown>> = [];
  const client: OpenAIChatCompletionsClient = {
    chat: {
      completions: {
        async create(body: Record<string, unknown>) {
          bodies.push(body);
          const model = body["model"] ?? "echo-1";
          if (bodies.length === 1) {
            // First turn: ask to read README.md via a tool call.
            return {
              id: "chatcmpl-tool",
              object: "chat.completion",
              model,
              choices: [
                {
                  index: 0,
                  message: {
                    role: "assistant",
                    content: null,
                    tool_calls: [
                      {
                        id: "call_1",
                        type: "function",
                        function: {
                          name: "read_file",
                          arguments: JSON.stringify({ path: "README.md" }),
                        },
                      },
                    ],
                  },
                  finish_reason: "tool_calls",
                },
              ],
            };
          }
          // Second turn: produce the final answer.
          return {
            id: "chatcmpl-final",
            object: "chat.completion",
            model,
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: finalAnswer },
                finish_reason: "stop",
              },
            ],
          };
        },
      },
    },
  };
  return {
    client,
    bodies: () => bodies,
    callCount: () => bodies.length,
  };
}

function makeConfig(client: unknown): KairoConfig {
  return Object.freeze({
    version: 1,
    providers: {
      echo: {
        protocol: "openai-compatible",
        defaultModel: "echo-1",
        models: ["echo-1"],
        client,
      },
    },
    model: "echo-1",
  }) as unknown as KairoConfig;
}

let root: string;
const README_CONTENTS = "# Demo Project\n\nThis README was read by the tool.\n";

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "kairo-code-tool-"));
  writeFileSync(join(root, "README.md"), README_CONTENTS, "utf8");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("Kairo Code — one complete tool call through the runtime", () => {
  it("advertises tool definitions, executes read_file, and returns a final answer", async () => {
    const scripted = makeScriptedClient("The README describes a demo project.");
    const app = await createKairoCodeApplication({
      config: makeConfig(scripted.client),
      workspaceRoot: root,
    });

    const result = await app.run({ prompt: "What does the README say?" });

    // 1. The loop ran exactly two provider iterations (tool call → final).
    expect(scripted.callCount()).toBe(2);
    expect(result.iterationCount).toBe(2);

    // 2. Tool definitions reached the provider on the FIRST call.
    const firstBody = scripted.bodies()[0]!;
    const tools = firstBody["tools"] as
      | Array<{ type: string; function: { name: string } }>
      | undefined;
    expect(Array.isArray(tools)).toBe(true);
    const names = (tools ?? []).map((t) => t.function?.name);
    expect(names).toContain("read_file");

    // 3. The README content reached the SECOND model call as a tool result.
    const secondBody = scripted.bodies()[1]!;
    const serialized = JSON.stringify(secondBody);
    expect(serialized).toContain("This README was read by the tool.");

    // 4. The final assistant answer is returned to the caller.
    expect(result.text).toBe("The README describes a demo project.");

    await app.stop();
  });

  it("routes the read_file call through the ToolRouter (tool.completed event fires)", async () => {
    const scripted = makeScriptedClient("done");
    const app = await createKairoCodeApplication({
      config: makeConfig(scripted.client),
      workspaceRoot: root,
    });

    const toolEvents: Array<{ toolId?: unknown; ok?: unknown }> = [];
    app.app.runtime.events.subscribe((event) => {
      if (event.type === "tool.completed") {
        toolEvents.push(event.data as { toolId?: unknown; ok?: unknown });
      }
    });

    const result = await app.run({ prompt: "read the readme" });

    expect(toolEvents.length).toBe(1);
    expect(toolEvents[0]?.toolId).toBe(READ_FILE_TOOL_ID);
    expect(toolEvents[0]?.ok).toBe(true);
    expect(result.text).toBe("done");

    await app.stop();
  });

  it("surfaces the tool result inside the loop iteration record", async () => {
    const scripted = makeScriptedClient("ok");
    const app = await createKairoCodeApplication({
      config: makeConfig(scripted.client),
      workspaceRoot: root,
    });

    const result = await app.run({ prompt: "read it" });

    const firstIteration = result.loopResult.iterations[0]!;
    expect(firstIteration.toolCalls.length).toBe(1);
    expect(firstIteration.toolCalls[0]?.toolId).toBe(READ_FILE_TOOL_ID);
    const toolResult = firstIteration.toolResults[0]!;
    expect(toolResult.result.ok).toBe(true);
    const data = toolResult.result.data as { content: string; path: string };
    expect(data.path).toBe("README.md");
    expect(data.content).toBe(README_CONTENTS);

    await app.stop();
  });
});

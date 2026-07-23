import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { OpenAIChatCompletionsClient } from "@kairo/protocol-openai";
import type { KairoConfig } from "@kairo/config";
import {
  createKairoCodeApplication,
  type CreateKairoCodeApplicationOptions,
} from "@kairo/harness-code";

import { runWith, type RunCommandDeps } from "../src/commands/run.js";
import { CLIError, CLIErrorCode } from "../src/errors.js";
import { makeContext } from "./helpers.js";

/**
 * Scripted mock OpenAI-compatible client.
 *
 * mode "answer"       → single final answer, no tool call.
 * mode "tool"         → first call requests read_file, second returns answer.
 * mode "provider-err" → throws (simulated provider failure).
 * mode "tool-args"    → requests read_file with a MISSING path arg, forcing
 *                       a tool-layer failure (invalid arguments).
 */
type Mode = "answer" | "tool" | "provider-err" | "tool-args";

function makeClient(mode: Mode, finalAnswer: string): {
  client: OpenAIChatCompletionsClient;
  calls: () => number;
} {
  let count = 0;
  const client: OpenAIChatCompletionsClient = {
    chat: {
      completions: {
        async create(body: Record<string, unknown>) {
          count += 1;
          const model = body["model"] ?? "echo-1";
          if (mode === "provider-err") {
            throw new Error("upstream provider exploded");
          }
          if ((mode === "tool" || mode === "tool-args") && count === 1) {
            const argumentsJson =
              mode === "tool"
                ? JSON.stringify({ path: "README.md" })
                : JSON.stringify({});
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
                        function: { name: "read_file", arguments: argumentsJson },
                      },
                    ],
                  },
                  finish_reason: "tool_calls",
                },
              ],
            };
          }
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
  return { client, calls: () => count };
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

/** Build injectable deps: mock-client config + the REAL harness factory. */
function makeDeps(
  root: string,
  client: unknown,
  configOverride?: KairoConfig,
): { deps: RunCommandDeps; created: () => number } {
  let created = 0;
  const deps: RunCommandDeps = {
    loadConfig: async () => ({
      config: configOverride ?? makeConfig(client),
      root,
    }),
    createApplication: (options: CreateKairoCodeApplicationOptions) => {
      created += 1;
      return createKairoCodeApplication(options);
    },
  };
  return { deps, created: () => created };
}

let root: string;
const README = "# Title\n\nThe answer is 42.\n";

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "kairo-run-"));
  writeFileSync(join(root, "README.md"), README, "utf8");
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("kairo run — one-shot execution", () => {
  it("runs a prompt and prints the final answer (exit 0)", async () => {
    const { client } = makeClient("answer", "Hello from Kairo.");
    const { deps, created } = makeDeps(root, client);
    const { ctx, out } = makeContext({
      cwd: root,
      args: ["What is up?"],
    });

    const code = await runWith(ctx, deps);

    expect(code).toBe(0);
    expect(created()).toBe(1);
    expect(out.stdoutText).toContain("Hello from Kairo.");
  });

  it("forwards the parsed prompt to the harness (joined positional words)", async () => {
    const { client } = makeClient("answer", "ok");
    // Capture the prompt the harness receives by wrapping app.run.
    let seenPrompt: string | undefined;
    const deps: RunCommandDeps = {
      loadConfig: async () => ({ config: makeConfig(client), root }),
      createApplication: async (options) => {
        const app = await createKairoCodeApplication(options);
        const originalRun = app.run.bind(app);
        return Object.assign(app, {
          run: (o: Parameters<typeof app.run>[0]) => {
            seenPrompt = o.prompt;
            return originalRun(o);
          },
        });
      },
    };
    const { ctx } = makeContext({ cwd: root, args: ["summarize", "the", "readme"] });

    const code = await runWith(ctx, deps);
    expect(code).toBe(0);
    expect(seenPrompt).toBe("summarize the readme");
  });

  it("executes a real tool call and prints the tool-informed answer", async () => {
    const { client, calls } = makeClient("tool", "The README says 42.");
    const { deps } = makeDeps(root, client);
    const { ctx, out } = makeContext({ cwd: root, args: ["read", "the", "readme"] });

    const code = await runWith(ctx, deps);

    expect(code).toBe(0);
    expect(calls()).toBe(2); // tool call round-trip
    expect(out.stdoutText).toContain("The README says 42.");
  });

  it("returns MISSING_PROMPT (exit 2) when no prompt is supplied", async () => {
    const { client } = makeClient("answer", "unused");
    const { deps, created } = makeDeps(root, client);
    const { ctx } = makeContext({ cwd: root, args: [] });

    await expect(runWith(ctx, deps)).rejects.toMatchObject({
      code: CLIErrorCode.MISSING_PROMPT,
      exitCode: 2,
    });
    // App is never created when the prompt is missing.
    expect(created()).toBe(0);
  });

  it("prints help and exits 0 for --help without booting", async () => {
    const { client } = makeClient("answer", "unused");
    const { deps, created } = makeDeps(root, client);
    const { ctx, out } = makeContext({ cwd: root, args: ["--help"] });

    const code = await runWith(ctx, deps);
    expect(code).toBe(0);
    expect(created()).toBe(0);
    expect(out.stdoutText).toContain("Usage: kairo run");
  });

  it("maps a provider failure to RUN_FAILED (exit 8)", async () => {
    const { client } = makeClient("provider-err", "unused");
    const { deps } = makeDeps(root, client);
    const { ctx } = makeContext({ cwd: root, args: ["do", "it"] });

    await expect(runWith(ctx, deps)).rejects.toMatchObject({
      code: CLIErrorCode.RUN_FAILED,
      exitCode: 8,
    });
  });

  it("maps a tool failure (invalid arguments) to RUN_FAILED (exit 8)", async () => {
    const { client } = makeClient("tool-args", "unused");
    const { deps } = makeDeps(root, client);
    const { ctx } = makeContext({ cwd: root, args: ["read"] });

    await expect(runWith(ctx, deps)).rejects.toMatchObject({
      code: CLIErrorCode.RUN_FAILED,
      exitCode: 8,
    });
  });

  it("maps a missing model to CONFIG_LOAD_FAILED (exit 4)", async () => {
    const { client } = makeClient("answer", "unused");
    // Config with a provider but no top-level model, and no --model flag.
    const noModelConfig = Object.freeze({
      version: 1,
      providers: {
        echo: {
          protocol: "openai-compatible",
          models: ["echo-1"],
          client,
        },
      },
    }) as unknown as KairoConfig;
    const { deps } = makeDeps(root, client, noModelConfig);
    const { ctx } = makeContext({ cwd: root, args: ["hello"] });

    await expect(runWith(ctx, deps)).rejects.toMatchObject({
      code: CLIErrorCode.CONFIG_LOAD_FAILED,
      exitCode: 4,
    });
  });

  it("propagates a PROJECT_NOT_FOUND config error (exit 3)", async () => {
    const deps: RunCommandDeps = {
      loadConfig: async () => {
        throw new (await import("@kairo/config")).ConfigError({
          code: (await import("@kairo/config")).ConfigErrorCode.PROJECT_NOT_FOUND,
          message: "no .kairo project found",
        });
      },
      createApplication: () => {
        throw new Error("should not be called");
      },
    };
    const { ctx } = makeContext({ cwd: root, args: ["hello"] });

    await expect(runWith(ctx, deps)).rejects.toMatchObject({
      code: CLIErrorCode.PROJECT_NOT_FOUND,
      exitCode: 3,
    });
  });

  it("always stops the application on success", async () => {
    const { client } = makeClient("answer", "bye");
    let stopped = 0;
    const deps: RunCommandDeps = {
      loadConfig: async () => ({ config: makeConfig(client), root }),
      createApplication: async (options) => {
        const app = await createKairoCodeApplication(options);
        const originalStop = app.stop.bind(app);
        return Object.assign(app, {
          stop: () => {
            stopped += 1;
            return originalStop();
          },
        });
      },
    };
    const { ctx } = makeContext({ cwd: root, args: ["hi"] });

    const code = await runWith(ctx, deps);
    expect(code).toBe(0);
    expect(stopped).toBe(1);
  });

  it("always stops the application on failure", async () => {
    const { client } = makeClient("provider-err", "unused");
    let stopped = 0;
    const deps: RunCommandDeps = {
      loadConfig: async () => ({ config: makeConfig(client), root }),
      createApplication: async (options) => {
        const app = await createKairoCodeApplication(options);
        const originalStop = app.stop.bind(app);
        return Object.assign(app, {
          stop: () => {
            stopped += 1;
            return originalStop();
          },
        });
      },
    };
    const { ctx } = makeContext({ cwd: root, args: ["boom"] });

    await expect(runWith(ctx, deps)).rejects.toBeInstanceOf(CLIError);
    expect(stopped).toBe(1);
  });
});

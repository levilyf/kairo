import { describe, expect, it, afterEach } from "vitest";

import type { OpenAIChatCompletionsClient } from "@kairo/protocol-openai";
import type { LoopResult } from "@kairo/core";
import type { KairoConfig } from "@kairo/config";
import {
  createKairoCodeApplication,
  KAIRO_CODE_SYSTEM_PROMPT,
  KAIRO_CODE_DEFAULT_MAX_ITERATIONS,
  type KairoCodeApplication,
  type KairoCodeRunOptions,
  type KairoCodeRunResult,
} from "../src/index.js";

/**
 * Mock OpenAI-compatible client. Returns a single non-streaming Chat
 * Completions response whose assistant text optionally encodes whether
 * the assembled context carried a system prompt.
 *
 * This exercises the genuine Core runtime (sessions, turns, agent loop,
 * context assembler, provider gateway, the real @kairo/protocol-openai
 * response mapper) — only the network boundary is faked.
 */
function makeMockClient(opts: { text?: string; encodePrompt?: boolean } = {}): {
  client: OpenAIChatCompletionsClient;
  lastBody: () => Record<string, unknown>;
} {
  const text = opts.text ?? "pong";
  const encodePrompt = opts.encodePrompt ?? false;
  let last: Record<string, unknown> = {};
  const client: OpenAIChatCompletionsClient = {
    chat: {
      completions: {
        async create(body: Record<string, unknown>) {
          last = body as Record<string, unknown>;
          const messages = Array.isArray(body["messages"])
            ? (body["messages"] as Array<Record<string, unknown>>)
            : [];
          const systemMessages = messages.filter((m) => m["role"] === "system");
          const assistantText = encodePrompt
            ? `${text}|${systemMessages.length > 0 ? "has-prompt" : "no-prompt"}`
            : text;
          return {
            id: "chatcmpl-mock",
            object: "chat.completion",
            model: body["model"] ?? "echo-1",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: assistantText },
                finish_reason: "stop",
              },
            ],
          };
        },
      },
    },
  };
  return { client, lastBody: () => last };
}

function makeConfig(client: unknown, overrides: Record<string, unknown> = {}): KairoConfig {
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
    ...overrides,
  }) as unknown as KairoConfig;
}

const roots: string[] = [];
afterEach(() => {
  roots.length = 0;
});

describe("createKairoCodeApplication — harness identity + composition", () => {
  it("exports a stable Code system prompt constant", () => {
    expect(typeof KAIRO_CODE_SYSTEM_PROMPT).toBe("string");
    expect(KAIRO_CODE_SYSTEM_PROMPT.length).toBeGreaterThan(0);
    // Identity-bearing, not a generic placeholder.
    expect(KAIRO_CODE_SYSTEM_PROMPT.toLowerCase()).toContain("kairo");
  });

  it("exports the Code default max-iterations constant", () => {
    expect(KAIRO_CODE_DEFAULT_MAX_ITERATIONS).toBe(8);
  });

  it("creates a KairoCodeApplication from a config + workspace root", async () => {
    const { client } = makeMockClient();
    const app = await createKairoCodeApplication({
      config: makeConfig(client),
      workspaceRoot: "/tmp/repo",
    });
    roots.push("/tmp/repo");
    expect(app).toBeDefined();
    expect(app.workspaceRoot).toBe("/tmp/repo");
    expect(app.status).toBe("ready");
    // Composes a real @kairo/app Application.
    expect(app.app).toBeDefined();
    expect(app.app.runtime).toBeDefined();
    expect(app.systemPrompt).toBe(KAIRO_CODE_SYSTEM_PROMPT);
    await app.stop();
  });

  it("accepts an overridden system prompt", async () => {
    const { client } = makeMockClient();
    const app = await createKairoCodeApplication({
      config: makeConfig(client),
      workspaceRoot: "/tmp/repo",
      systemPrompt: "You are a custom Code agent.",
    });
    roots.push("/tmp/repo");
    expect(app.systemPrompt).toBe("You are a custom Code agent.");
    await app.stop();
  });

  it("defaults workspaceRoot to process.cwd() when omitted", async () => {
    const { client } = makeMockClient();
    const app = await createKairoCodeApplication({
      config: makeConfig(client),
    });
    expect(app.workspaceRoot).toBe(process.cwd());
    await app.stop();
  });
});

describe("createKairoCodeApplication — run (no-tool turn)", () => {
  it("runs a single no-tool turn and returns the assistant text", async () => {
    const { client } = makeMockClient({ text: "pong", encodePrompt: true });
    const app = await createKairoCodeApplication({
      config: makeConfig(client),
      workspaceRoot: "/tmp/repo",
    });
    roots.push("/tmp/repo");
    await app.start();

    const result = await app.run({ prompt: "ping" });
    expect(result.text).toBe("pong|has-prompt");
    expect(result.iterationCount).toBe(1);
    expect(result.loopResult.status).toBe("completed");
    await app.stop();
  });

  it("the Code system prompt reaches the provider", async () => {
    const { client, lastBody } = makeMockClient({ encodePrompt: true });
    const app = await createKairoCodeApplication({
      config: makeConfig(client),
      workspaceRoot: "/tmp/repo",
    });
    roots.push("/tmp/repo");
    await app.start();
    await app.run({ prompt: "ping" });
    const messages = (lastBody()["messages"] as Array<Record<string, unknown>>);
    const system = messages.filter((m) => m["role"] === "system");
    expect(system.length).toBe(1);
    expect(system[0]!["content"]).toBe(KAIRO_CODE_SYSTEM_PROMPT);
    await app.stop();
  });

  it("a custom system prompt reaches the provider instead", async () => {
    const { client, lastBody } = makeMockClient({ encodePrompt: true });
    const app = await createKairoCodeApplication({
      config: makeConfig(client),
      workspaceRoot: "/tmp/repo",
      systemPrompt: "You are a custom Code agent.",
    });
    roots.push("/tmp/repo");
    await app.start();
    const result = await app.run({ prompt: "ping" });
    expect(result.text).toBe("pong|has-prompt");
    const messages = (lastBody()["messages"] as Array<Record<string, unknown>>);
    const system = messages.filter((m) => m["role"] === "system");
    expect(system[0]!["content"]).toBe("You are a custom Code agent.");
    await app.stop();
  });

  it("run forwards an explicit model + providerId to the loop", async () => {
    const { client, lastBody } = makeMockClient({ text: "ok" });
    const app = await createKairoCodeApplication({
      config: makeConfig(client),
      workspaceRoot: "/tmp/repo",
    });
    roots.push("/tmp/repo");
    await app.start();
    await app.run({ prompt: "hi", model: "echo-1" });
    expect(lastBody()["model"]).toBe("echo-1");
    await app.stop();
  });

  it("supports cancellation via an AbortSignal", async () => {
    const { client } = makeMockClient({ text: "never" });
    const app = await createKairoCodeApplication({
      config: makeConfig(client),
      workspaceRoot: "/tmp/repo",
    });
    roots.push("/tmp/repo");
    await app.start();
    const ac = new AbortController();
    ac.abort("user-cancel");
    await expect(app.run({ prompt: "hi", signal: ac.signal })).rejects.toThrow();
    await app.stop();
  });
});

describe("createKairoCodeApplication — lifecycle", () => {
  it("start() is idempotent and moves status to 'started'", async () => {
    const { client } = makeMockClient();
    const app = await createKairoCodeApplication({
      config: makeConfig(client),
      workspaceRoot: "/tmp/repo",
    });
    roots.push("/tmp/repo");
    await app.start();
    expect(app.status).toBe("started");
    await app.start(); // idempotent
    expect(app.status).toBe("started");
    await app.stop();
  });

  it("stop() moves status to 'stopped' and is idempotent", async () => {
    const { client } = makeMockClient();
    const app = await createKairoCodeApplication({
      config: makeConfig(client),
      workspaceRoot: "/tmp/repo",
    });
    roots.push("/tmp/repo");
    await app.start();
    await app.stop();
    expect(app.status).toBe("stopped");
    await app.stop(); // idempotent
    expect(app.status).toBe("stopped");
  });

  it("run() before start() auto-starts the application", async () => {
    const { client } = makeMockClient({ text: "pong" });
    const app = await createKairoCodeApplication({
      config: makeConfig(client),
      workspaceRoot: "/tmp/repo",
    });
    roots.push("/tmp/repo");
    // No explicit start().
    const result = await app.run({ prompt: "ping" });
    expect(result.text).toBe("pong");
    expect(app.status).toBe("started");
    await app.stop();
  });

  it("run() after stop() rejects", async () => {
    const { client } = makeMockClient();
    const app = await createKairoCodeApplication({
      config: makeConfig(client),
      workspaceRoot: "/tmp/repo",
    });
    roots.push("/tmp/repo");
    await app.start();
    await app.stop();
    await expect(app.run({ prompt: "ping" })).rejects.toThrow();
  });
});

describe("createKairoCodeApplication — Core contracts remain unchanged", () => {
  it("reuses Core's DEFAULT_MAX_ITERATIONS without mutating it", async () => {
    const core = await import("@kairo/core");
    expect(KAIRO_CODE_DEFAULT_MAX_ITERATIONS).toBe(core.DEFAULT_MAX_ITERATIONS);
    // Composing a harness must not mutate the shared constant.
    const { client } = makeMockClient();
    const app = await createKairoCodeApplication({
      config: makeConfig(client),
      workspaceRoot: "/tmp/repo",
    });
    roots.push("/tmp/repo");
    await app.stop();
    expect(core.DEFAULT_MAX_ITERATIONS).toBe(8);
  });

  it("composes only via public Core primitives (runtime.sessions / turns / agentLoop)", async () => {
    const { client } = makeMockClient({ text: "pong" });
    const app = await createKairoCodeApplication({
      config: makeConfig(client),
      workspaceRoot: "/tmp/repo",
    });
    roots.push("/tmp/repo");
    await app.start();
    // The composed Application exposes the untouched Core runtime surface.
    expect(typeof app.app.runtime.sessions.create).toBe("function");
    expect(typeof app.app.runtime.agentLoop.execute).toBe("function");
    await app.stop();
  });
});

describe("createKairoCodeApplication — types are exported", () => {
  it("exposes KairoCodeApplication/RunOptions/RunResult types", () => {
    // Compile-time only: ensure the exported types exist and are usable.
    const app: KairoCodeApplication = {} as unknown as KairoCodeApplication;
    const opts: KairoCodeRunOptions = { prompt: "x" };
    const result: KairoCodeRunResult = {} as unknown as KairoCodeRunResult;
    expect(typeof app).toBe("object");
    expect(opts.prompt).toBe("x");
    expect(typeof result).toBe("object");
  });
});

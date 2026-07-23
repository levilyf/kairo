/**
 * End-to-end production path test.
 *
 * Exercises the complete `kairo run` execution path with NO dependency
 * injection — real config loading, real bootstrap, real harness, real
 * runtime, real Agent Loop, real ToolRouter, real provider. The only
 * mocked boundary is HTTP: a local `node:http` server on 127.0.0.1
 * with an ephemeral port returns scripted OpenAI Chat Completions
 * responses.
 *
 * Flow verified:
 *   program.run(ctx)
 *   → argument parsing ("run", "Summarize README.md")
 *   → real loadConfig (reads .kairo/config.json from temp workspace)
 *   → real loadKairoCodeApplication (real bootstrap, real harness)
 *   → real runtime → real Agent Loop → real ToolRouter → real provider
 *   → HTTP request 1 → tool_call: read_file("README.md")
 *   → tool execution (real read_file reads real file from workspace)
 *   → HTTP request 2 (carries tool_result with README content)
 *   → final assistant response → stdout → exit 0
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import { run } from "../src/program.js";
import { makeContext } from "./helpers.js";

// ─── Scripted HTTP mock server ──────────────────────────────────────────

interface RequestLog {
  readonly method: string;
  readonly url: string;
  readonly body: Record<string, unknown>;
}

const README_CONTENT = "# My Project\n\nThis project does exactly one thing.\n";
const FINAL_ANSWER = "The README describes a project that does exactly one thing.";

/**
 * Start a local HTTP server that mimics an OpenAI Chat Completions
 * endpoint. It returns a tool_call on the first request and a final
 * text response on the second.
 *
 * Returns the assigned port + a handle to get the request log + stop.
 */
function startMockServer(): Promise<{
  port: number;
  requests: () => readonly RequestLog[];
  isListening: () => boolean;
  close: () => Promise<void>;
}> {
  const requests: RequestLog[] = [];

  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk: Buffer) => {
      raw += chunk.toString();
    });
    req.on("end", () => {
      const body = JSON.parse(raw) as Record<string, unknown>;
      requests.push({
        method: req.method ?? "POST",
        url: req.url ?? "/",
        body,
      });

      const model =
        typeof body["model"] === "string" ? body["model"] : "test-model";

      let responseBody: Record<string, unknown>;

      if (requests.length === 1) {
        // First request: return a tool_call for read_file("README.md").
        responseBody = {
          id: "chatcmpl-e2e-1",
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
                    id: "call_e2e_1",
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
      } else {
        // Second request: return the final answer.
        responseBody = {
          id: "chatcmpl-e2e-2",
          object: "chat.completion",
          model,
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: FINAL_ANSWER,
              },
              finish_reason: "stop",
            },
          ],
        };
      }

      const payload = JSON.stringify(responseBody);
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Length": String(Buffer.byteLength(payload)),
      });
      res.end(payload);
    });
  });

  return new Promise<{
    port: number;
    requests: () => readonly RequestLog[];
    isListening: () => boolean;
    close: () => Promise<void>;
  }>((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr === null || typeof addr === "string") {
        reject(new Error("unexpected server address"));
        return;
      }
      resolve({
        port: addr.port,
        requests: () => requests,
        isListening: () => server.listening,
        close: () =>
          new Promise<void>((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
  });
}

// ─── Workspace scaffolding ──────────────────────────────────────────────

let workspaceRoot: string;
let mockServer: Awaited<ReturnType<typeof startMockServer>>;

beforeEach(async () => {
  // Create a temporary workspace with README.md and .kairo/config.json.
  workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kairo-e2e-"));
  fs.writeFileSync(path.join(workspaceRoot, "README.md"), README_CONTENT, "utf8");

  // Start the mock server to get an ephemeral port.
  mockServer = await startMockServer();

  // Write a real .kairo/config.json pointing at the mock server.
  const kairoDir = path.join(workspaceRoot, ".kairo");
  fs.mkdirSync(kairoDir, { recursive: true });
  const config = {
    version: 1,
    model: "test-model",
    providers: {
      "test-provider": {
        protocol: "openai-compatible",
        apiKey: "test-key",
        baseURL: `http://127.0.0.1:${mockServer.port}/v1`,
        models: ["test-model"],
      },
    },
  };
  fs.writeFileSync(
    path.join(kairoDir, "config.json"),
    JSON.stringify(config, null, 2) + "\n",
    "utf8",
  );
});

afterEach(async () => {
  // Shut down the mock server and assert the listening socket is gone.
  await mockServer.close();
  expect(mockServer.isListening()).toBe(false);
  // Clean up the temp workspace.
  fs.rmSync(workspaceRoot, { recursive: true, force: true });
});

// ─── The test ───────────────────────────────────────────────────────────

describe("E2E: kairo run — production path with local HTTP server", () => {
  it("executes a complete tool-calling flow through the real production path", async () => {
    // Build a CLIContext with cwd pointing at the temp workspace.
    // The "run" command word is included because program.run dispatches
    // by the first arg.
    const { ctx, out } = makeContext({
      cwd: workspaceRoot,
      args: ["run", "Summarize README.md"],
      env: {
        // Suppress OpenAI SDK's OPENAI_API_KEY env-var check.
        OPENAI_API_KEY: "test-key",
      },
    });

    // Execute the REAL program.run — no DI, no mocks except HTTP.
    const exitCode = await run(ctx);

    // ── 1. Exit code ──────────────────────────────────────────────────
    expect(exitCode).toBe(0);

    // ── 2. Final answer in stdout ─────────────────────────────────────
    expect(out.stdoutText).toContain(FINAL_ANSWER);

    // ── 3. Exactly two HTTP requests ──────────────────────────────────
    const reqs = mockServer.requests();
    expect(reqs).toHaveLength(2);

    // Both should be POST /v1/chat/completions.
    expect(reqs[0]!.method).toBe("POST");
    expect(reqs[0]!.url).toBe("/v1/chat/completions");
    expect(reqs[1]!.method).toBe("POST");
    expect(reqs[1]!.url).toBe("/v1/chat/completions");

    // ── 4. README content reached the second request ──────────────────
    // The second request's messages array must contain a tool-role
    // message whose content includes the README text. The runtime
    // serializes the tool result as a string (or JSON-stringified object).
    const messages2 = reqs[1]!.body["messages"] as Array<Record<string, unknown>>;
    const toolMessage = messages2.find((m) => m["role"] === "tool");
    expect(toolMessage).toBeDefined();
    const toolContent = String(toolMessage!["content"]);
    expect(toolContent).toContain("My Project");
    expect(toolContent).toContain("does exactly one thing");

    // ── 5. First request carries tool definitions ─────────────────────
    const tools1 = reqs[0]!.body["tools"] as Array<Record<string, unknown>> | undefined;
    expect(tools1).toBeDefined();
    expect(tools1!.length).toBeGreaterThanOrEqual(1);
    const readFileTool = tools1!.find(
      (t) => (t["function"] as Record<string, unknown>)?.["name"] === "read_file",
    );
    expect(readFileTool).toBeDefined();
  });
});

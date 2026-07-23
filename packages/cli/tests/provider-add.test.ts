import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as p from "node:path";

import { run } from "../src/program.js";
import { makeContext, makeTempProject, writeJsonFile, readJson } from "./helpers.js";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("kairo provider add", () => {
  it("refuses to add unknown provider id", async () => {
    const cwd = await makeTempProject("add-unknown");
    try {
      await writeJsonFile(cwd, ".kairo/config.json", { version: 1, providers: {} });
      const { ctx } = makeContext({ cwd, args: ["provider", "add", "nope"] });
      const code = await run(ctx);
      expect(code).toBe(7); // PROVIDER_NOT_FOUND
    } finally {
      await fs.promises.rm(cwd, { recursive: true, force: true });
    }
  });

  it("refuses when provider id is missing", async () => {
    const cwd = await makeTempProject("add-missing-id");
    try {
      await writeJsonFile(cwd, ".kairo/config.json", { version: 1, providers: {} });
      const { ctx } = makeContext({ cwd, args: ["provider", "add"] });
      const code = await run(ctx);
      expect(code).toBe(2); // UNKNOWN_COMMAND
    } finally {
      await fs.promises.rm(cwd, { recursive: true, force: true });
    }
  });

  it("refuses if provider already configured", async () => {
    const cwd = await makeTempProject("add-dup");
    try {
      await writeJsonFile(cwd, ".kairo/config.json", {
        version: 1,
        providers: { nvidia: { apiKey: "x", models: ["m"], defaultModel: "m" } },
      });
      const { ctx } = makeContext({ cwd, args: ["provider", "add", "nvidia"] });
      const code = await run(ctx);
      expect(code).toBe(6); // PROVIDER_ALREADY_EXISTS
    } finally {
      await fs.promises.rm(cwd, { recursive: true, force: true });
    }
  });

  it("writes the nvidia block (api key + models + default) into config.json directly", async () => {
    const cwd = await makeTempProject("add-nvidia-config");
    try {
      await writeJsonFile(cwd, ".kairo/config.json", { version: 1, providers: {} });
      // Sequence: API Key, Models, Default model, storage (.env/config/Skip) → 2 = config.json
      const { ctx, out } = makeContext({
        cwd,
        args: ["provider", "add", "nvidia"],
        stdinQueue: [
          "sk-test-123",
          "moonshotai/kimi-k2-instruct",
          "moonshotai/kimi-k2-instruct",
          "2", // config.json
        ],
      });
      const code = await run(ctx);
      expect(code).toBe(0);
      expect(out.stdoutText).toContain("NVIDIA configured");
      const config = (await readJson(cwd, ".kairo/config.json")) as {
        providers: Record<string, Record<string, unknown>>;
        model?: string;
      };
      expect(config.providers.nvidia).toBeDefined();
      expect(config.providers.nvidia?.apiKey).toBe("sk-test-123");
      expect(config.providers.nvidia?.models).toEqual([
        "moonshotai/kimi-k2-instruct",
      ]);
      expect(config.providers.nvidia?.defaultModel).toBe(
        "moonshotai/kimi-k2-instruct",
      );
      expect(config.model).toBe("moonshotai/kimi-k2-instruct");
    } finally {
      await fs.promises.rm(cwd, { recursive: true, force: true });
    }
  });

  it("discovers provider models automatically and only asks for the default model", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ id: "z-ai/glm-5.2" }, { id: "moonshotai/kimi-k2-instruct" }],
        }),
      })),
    );
    const cwd = await makeTempProject("add-discovery");
    try {
      await writeJsonFile(cwd, ".kairo/config.json", { version: 1, providers: {} });
      const { ctx, out } = makeContext({
        cwd,
        args: ["provider", "add", "nvidia"],
        stdinQueue: [
          "sk-live-ish",
          "z-ai/glm-5.2", // searchable/exact selector input
          "", // storage defaults to .env
        ],
      });
      const code = await run(ctx);
      expect(code).toBe(0);
      expect(out.stdoutText).toContain("API key validated");
      expect(out.stdoutText).toContain("Retrieved 2 models");
      const config = (await readJson(cwd, ".kairo/config.json")) as {
        providers: { nvidia: { apiKey: string; models: string[]; defaultModel: string } };
      };
      expect(config.providers.nvidia.apiKey).toBe("${NVIDIA_API_KEY}");
      expect(config.providers.nvidia.models).toEqual([
        "moonshotai/kimi-k2-instruct",
        "z-ai/glm-5.2",
      ]);
      expect(config.providers.nvidia.defaultModel).toBe("z-ai/glm-5.2");
    } finally {
      await fs.promises.rm(cwd, { recursive: true, force: true });
    }
  });

  it("writes ollama block without an api key and supports a custom base URL", async () => {
    const cwd = await makeTempProject("add-ollama");
    try {
      await writeJsonFile(cwd, ".kairo/config.json", { version: 1, providers: {} });
      // Sequence: Base URL (use default), Models, Default model (use first)
      const { ctx, out } = makeContext({
        cwd,
        args: ["provider", "add", "ollama"],
        stdinQueue: ["", "qwen3-coder:30b", ""],
      });
      const code = await run(ctx);
      expect(code).toBe(0);
      expect(out.stdoutText).toContain("Ollama configured");
      const config = (await readJson(cwd, ".kairo/config.json")) as {
        providers: { ollama: Record<string, unknown> };
        model?: string;
      };
      expect(config.providers.ollama.baseURL).toBe("http://localhost:11434/v1");
      expect(config.providers.ollama.models).toEqual(["qwen3-coder:30b"]);
      expect(config.providers.ollama.defaultModel).toBe("qwen3-coder:30b");
      expect(config.model).toBe("qwen3-coder:30b");
    } finally {
      await fs.promises.rm(cwd, { recursive: true, force: true });
    }
  });

  it("writes .env and substitutes ${ENV_VAR} when user picks .env", async () => {
    const cwd = await makeTempProject("add-env");
    try {
      await writeJsonFile(cwd, ".kairo/config.json", { version: 1, providers: {} });
      const { ctx } = makeContext({
        cwd,
        args: ["provider", "add", "nvidia"],
        stdinQueue: ["sk-test-env", "m1", "m1", "1"], // .env
      });
      const code = await run(ctx);
      expect(code).toBe(0);
      const config = (await readJson(cwd, ".kairo/config.json")) as {
        providers: { nvidia: { apiKey: string } };
      };
      expect(config.providers.nvidia.apiKey).toBe("${NVIDIA_API_KEY}");
      const envText = await fs.promises.readFile(
        p.join(cwd, ".env"),
        "utf8",
      );
      expect(envText).toContain("NVIDIA_API_KEY=sk-test-env");
    } finally {
      await fs.promises.rm(cwd, { recursive: true, force: true });
    }
  });
});

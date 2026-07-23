import { describe, expect, it } from "vitest";
import * as fs from "node:fs";

import { run } from "../src/program.js";
import { makeContext, makeTempProject, writeJsonFile } from "./helpers.js";

describe("kairo models", () => {
  it("lists every model declared across providers", async () => {
    const cwd = await makeTempProject("models-mix");
    try {
      await writeJsonFile(cwd, ".kairo/config.json", {
        version: 1,
        providers: {
          ollama: {
            models: ["qwen3-coder:30b", "llama3:8b"],
            defaultModel: "qwen3-coder:30b",
          },
          lmstudio: {
            models: ["qwen3-coder:30b"],
            defaultModel: "qwen3-coder:30b",
          },
        },
        model: "qwen3-coder:30b",
      });
      const { ctx, out } = makeContext({ cwd, args: ["models"] });
      const code = await run(ctx);
      expect(code).toBe(0);
      expect(out.stdoutText).toContain("qwen3-coder:30b");
      expect(out.stdoutText).toContain("llama3:8b");
      // Both providers own qwen3-coder:30b
      expect(out.stdoutText).toContain("ollama, lmstudio");
    } finally {
      await fs.promises.rm(cwd, { recursive: true, force: true });
    }
  });

  it("shows empty-state when no providers are configured", async () => {
    const cwd = await makeTempProject("models-empty");
    try {
      await writeJsonFile(cwd, ".kairo/config.json", { version: 1, providers: {} });
      const { ctx, out } = makeContext({ cwd, args: ["models"] });
      const code = await run(ctx);
      expect(code).toBe(0);
      expect(out.stdoutText).toContain("No models have been configured.");
      expect(out.stdoutText).toContain("kairo provider add");
    } finally {
      await fs.promises.rm(cwd, { recursive: true, force: true });
    }
  });
});

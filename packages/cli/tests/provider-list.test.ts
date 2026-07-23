import { describe, expect, it } from "vitest";
import * as fs from "node:fs";

import { run } from "../src/program.js";
import { makeContext, makeTempProject, writeJsonFile } from "./helpers.js";

describe("kairo provider list", () => {
  it("renders the borderless provider table", async () => {
    const cwd = await makeTempProject("plist");
    try {
      await writeJsonFile(cwd, ".kairo/config.json", {
        version: 1,
        providers: {
          nvidia: {
            apiKey: "k",
            models: ["moonshotai/kimi-k2-instruct"],
            defaultModel: "moonshotai/kimi-k2-instruct",
          },
          ollama: {
            models: ["qwen3-coder:30b"],
            defaultModel: "qwen3-coder:30b",
          },
        },
        model: "moonshotai/kimi-k2-instruct",
      });
      const { ctx, out } = makeContext({ cwd, args: ["provider", "list"] });
      const code = await run(ctx);
      expect(code).toBe(0);
      expect(out.stdoutText).toContain("Provider");
      expect(out.stdoutText).toContain("Models");
      expect(out.stdoutText).toContain("Default");
      expect(out.stdoutText).toContain("NVIDIA");
      expect(out.stdoutText).toContain("Ollama");
      expect(out.stdoutText).toContain("1");
      expect(out.stdoutText).toContain("moonshotai/kimi-k2-instruct");
    } finally {
      await fs.promises.rm(cwd, { recursive: true, force: true });
    }
  });

  it("shows empty-state when no providers configured", async () => {
    const cwd = await makeTempProject("plist-empty");
    try {
      await writeJsonFile(cwd, ".kairo/config.json", { version: 1, providers: {} });
      const { ctx, out } = makeContext({ cwd, args: ["provider", "list"] });
      const code = await run(ctx);
      expect(code).toBe(0);
      expect(out.stdoutText).toContain("No providers have been configured.");
      expect(out.stdoutText).toContain("kairo provider add");
    } finally {
      await fs.promises.rm(cwd, { recursive: true, force: true });
    }
  });
});

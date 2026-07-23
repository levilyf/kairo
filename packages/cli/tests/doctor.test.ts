import { describe, expect, it } from "vitest";
import * as fs from "node:fs";

import { run } from "../src/program.js";
import { makeContext, makeTempProject, writeJsonFile } from "./helpers.js";

describe("kairo doctor", () => {
  it("fails when no project root is detected", async () => {
    const cwd = await makeTempProject("doc-none");
    try {
      const { ctx, out } = makeContext({ cwd, args: ["doctor"] });
      const code = await run(ctx);
      expect(code).toBe(3);
      expect(out.stdoutText).toContain("Project root discoverable");
      expect(out.stdoutText).toContain(".kairo/");
    } finally {
      await fs.promises.rm(cwd, { recursive: true, force: true });
    }
  });

  it("passes all local-only checks against a valid local config", async () => {
    const cwd = await makeTempProject("doc-ok");
    try {
      await writeJsonFile(cwd, ".kairo/config.json", {
        version: 1,
        providers: {
          ollama: {
            models: ["qwen3-coder:30b"],
            defaultModel: "qwen3-coder:30b",
          },
        },
        model: "qwen3-coder:30b",
      });
      const { ctx, out } = makeContext({ cwd, args: ["doctor"] });
      const code = await run(ctx);
      expect(code).toBe(0);
      expect(out.stdoutText).toContain("Project root discoverable");
      expect(out.stdoutText).toContain("Config file readable");
      expect(out.stdoutText).toContain("Config schema valid");
      expect(out.stdoutText).toContain("Provider blocks valid");
      expect(out.stdoutText).toContain("Default model exists");
      expect(out.stdoutText).toContain("Registry boots successfully");
      expect(out.stdoutText).toContain("All checks passed");
    } finally {
      await fs.promises.rm(cwd, { recursive: true, force: true });
    }
  });

  it("warns about an unresolved default model", async () => {
    const cwd = await makeTempProject("doc-default");
    try {
      await writeJsonFile(cwd, ".kairo/config.json", {
        version: 1,
        providers: {
          ollama: { models: ["qwen3-coder:30b"], defaultModel: "qwen3-coder:30b" },
        },
        model: "does-not-exist",
      });
      const { ctx, out } = makeContext({ cwd, args: ["doctor"] });
      const code = await run(ctx);
      expect(code).toBe(1);
      expect(out.stdoutText).toContain(
        "Default model declared but not served by any provider",
      );
    } finally {
      await fs.promises.rm(cwd, { recursive: true, force: true });
    }
  });

  it("warns when there are zero providers configured", async () => {
    const cwd = await makeTempProject("doc-empty");
    try {
      await writeJsonFile(cwd, ".kairo/config.json", { version: 1, providers: {} });
      const { ctx, out } = makeContext({ cwd, args: ["doctor"] });
      const code = await run(ctx);
      expect(code).toBe(0);
      expect(out.stdoutText).toContain("Default model not configured");
      expect(out.stdoutText).toContain("No providers have been configured");
    } finally {
      await fs.promises.rm(cwd, { recursive: true, force: true });
    }
  });

  it("fails APPLICATION_BOOT_FAILED when a built-in factory rejects a block", async () => {
    const cwd = await makeTempProject("doc-bad-block");
    try {
      // An unknown protocol causes the registry to refuse construction
      // at doctor's bootstrap step; config still validates as opaque
      // at @kairo/config, but @kairo/app's factory lookup fails.
      await writeJsonFile(cwd, ".kairo/config.json", {
        version: 1,
        providers: {
          nvidia: { protocol: "totally-fake", apiKey: "k" },
        },
      });
      const { ctx, out } = makeContext({ cwd, args: ["doctor"] });
      const code = await run(ctx);
      expect(code).toBe(1);
      expect(out.stdoutText).toContain("Application bootstrap failed");
    } finally {
      await fs.promises.rm(cwd, { recursive: true, force: true });
    }
  });
});

import { describe, expect, it } from "vitest";
import * as fs from "node:fs";

import { run } from "../src/program.js";
import { makeContext, makeTempProject, writeJsonFile, readJson } from "./helpers.js";

describe("kairo provider remove", () => {
  it("removes the provider block and clears a now-orphaned default when skipped", async () => {
    const cwd = await makeTempProject("rm-skip");
    try {
      await writeJsonFile(cwd, ".kairo/config.json", {
        version: 1,
        providers: {
          ollama: { models: ["m1", "m2"], defaultModel: "m1" },
        },
        model: "m1",
      });
      const { ctx, out } = makeContext({
        cwd,
        args: ["provider", "remove", "ollama"],
        stdinQueue: [""], // skip default replacement
      });
      const code = await run(ctx);
      expect(code).toBe(0);
      expect(out.stdoutText).toContain("Removed provider: ollama");
      const config = (await readJson(cwd, ".kairo/config.json")) as {
        providers?: Record<string, unknown>;
        model?: string;
      };
      expect(config.providers).toBeUndefined();
      expect(config.model).toBeUndefined();
    } finally {
      await fs.promises.rm(cwd, { recursive: true, force: true });
    }
  });

  it("removes a single provider without touching an unrelated default", async () => {
    const cwd = await makeTempProject("rm-keep");
    try {
      await writeJsonFile(cwd, ".kairo/config.json", {
        version: 1,
        providers: {
          ollama: { models: ["m1"], defaultModel: "m1" },
          lmstudio: { models: ["m2"], defaultModel: "m2" },
        },
        model: "m2",
      });
      const { ctx } = makeContext({
        cwd,
        args: ["provider", "remove", "ollama"],
        stdinQueue: [],
      });
      const code = await run(ctx);
      expect(code).toBe(0);
      const config = (await readJson(cwd, ".kairo/config.json")) as {
        providers: Record<string, unknown>;
        model?: string;
      };
      expect(config.providers["ollama"]).toBeUndefined();
      expect(config.providers["lmstudio"]).toBeDefined();
      expect(config.model).toBe("m2");
    } finally {
      await fs.promises.rm(cwd, { recursive: true, force: true });
    }
  });

  it("refuses if provider is not configured", async () => {
    const cwd = await makeTempProject("rm-nop");
    try {
      await writeJsonFile(cwd, ".kairo/config.json", { version: 1, providers: {} });
      const { ctx } = makeContext({ cwd, args: ["provider", "remove", "nvidia"] });
      const code = await run(ctx);
      expect(code).toBe(7);
    } finally {
      await fs.promises.rm(cwd, { recursive: true, force: true });
    }
  });

  it("on a non-unknown provider id refuses", async () => {
    const cwd = await makeTempProject("rm-unk");
    try {
      await writeJsonFile(cwd, ".kairo/config.json", { version: 1, providers: {} });
      const { ctx } = makeContext({ cwd, args: ["provider", "remove", "zzz"] });
      const code = await run(ctx);
      expect(code).toBe(7);
    } finally {
      await fs.promises.rm(cwd, { recursive: true, force: true });
    }
  });

  it("when removing the default-owner provider, prompts and accepts a valid replacement from remaining providers", async () => {
    const cwd = await makeTempProject("rm-replace");
    try {
      await writeJsonFile(cwd, ".kairo/config.json", {
        version: 1,
        providers: {
          ollama: { models: ["m1"], defaultModel: "m1" },
          lmstudio: { models: ["m2"], defaultModel: "m2" },
        },
        model: "m1",
      });
      const { ctx, out } = makeContext({
        cwd,
        args: ["provider", "remove", "ollama"],
        stdinQueue: ["m2"], // pick lmstudio's defaultModel as new project default
      });
      const code = await run(ctx);
      expect(code).toBe(0);
      expect(out.stdoutText).toContain("Default model removed");
      const config = (await readJson(cwd, ".kairo/config.json")) as {
        providers: Record<string, unknown>;
        model?: string;
      };
      expect(config.providers.ollama).toBeUndefined();
      expect(config.model).toBe("m2");
    } finally {
      await fs.promises.rm(cwd, { recursive: true, force: true });
    }
  });
});

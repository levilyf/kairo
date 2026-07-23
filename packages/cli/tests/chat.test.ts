import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

import { run } from "../src/program.js";
import {
  makeContext,
  makeTempProject,
  writeJsonFile,
} from "./helpers.js";

const localConfig = {
  version: 1,
  providers: {
    ollama: {
      models: ["qwen3-coder:30b"],
      defaultModel: "qwen3-coder:30b",
    },
  },
  model: "qwen3-coder:30b",
};

describe("kairo chat", () => {
  it("shows help for chat --help", async () => {
    const cwd = await makeTempProject("chat-help");
    try {
      const { ctx, out } = makeContext({
        cwd,
        args: ["chat", "--help"],
      });
      const code = await run(ctx);
      expect(code).toBe(0);
      expect(out.stdoutText).toContain("--model");
      expect(out.stdoutText).toContain("--resume");
      expect(out.stdoutText).toContain("Ctrl+C");
    } finally {
      await fs.promises.rm(cwd, { recursive: true, force: true });
    }
  });

  it("boots, prints banner with default model, exits 0 on EOF", async () => {
    const cwd = await makeTempProject("chat-eof");
    try {
      await writeJsonFile(cwd, ".kairo/config.json", localConfig);
      // No stdin queue → EOF immediately (no provider network call).
      const { ctx, out } = makeContext({ cwd, args: ["chat"] });
      const code = await run(ctx);
      expect(code).toBe(0);
      expect(out.stdoutText).toContain("Kairo chat");
      expect(out.stdoutText).toContain("qwen3-coder:30b");
      expect(out.stdoutText).toContain("Ctrl+D");
      expect(out.stdoutText).not.toContain("placeholder");
      // session JSONL created under project root
      const sessionsDir = path.join(cwd, ".kairo", "sessions");
      const files = await fs.promises.readdir(sessionsDir);
      expect(files.some((f) => f.endsWith(".jsonl"))).toBe(true);
    } finally {
      await fs.promises.rm(cwd, { recursive: true, force: true });
    }
  });

  it("accepts --model and --provider flags", async () => {
    const cwd = await makeTempProject("chat-flags");
    try {
      await writeJsonFile(cwd, ".kairo/config.json", localConfig);
      const { ctx, out } = makeContext({
        cwd,
        args: ["chat", "--model", "qwen3-coder:30b", "--provider", "ollama"],
      });
      const code = await run(ctx);
      expect(code).toBe(0);
      expect(out.stdoutText).toContain("qwen3-coder:30b");
      expect(out.stdoutText).toContain("ollama");
    } finally {
      await fs.promises.rm(cwd, { recursive: true, force: true });
    }
  });

  it("fails when --provider is not configured", async () => {
    const cwd = await makeTempProject("chat-bad-provider");
    try {
      await writeJsonFile(cwd, ".kairo/config.json", localConfig);
      const { ctx, out } = makeContext({
        cwd,
        args: ["chat", "--provider", "totally-missing"],
      });
      const code = await run(ctx);
      expect(code).toBe(7);
      expect(out.stdoutText.toLowerCase()).toMatch(/provider|not configured|unknown/);
    } finally {
      await fs.promises.rm(cwd, { recursive: true, force: true });
    }
  });

  it("rejects unknown flags", async () => {
    const cwd = await makeTempProject("chat-bad-flag");
    try {
      await writeJsonFile(cwd, ".kairo/config.json", localConfig);
      const { ctx, out } = makeContext({
        cwd,
        args: ["chat", "--wat"],
      });
      const code = await run(ctx);
      expect(code).toBe(2);
      expect(out.stdoutText).toContain("Unknown flag");
    } finally {
      await fs.promises.rm(cwd, { recursive: true, force: true });
    }
  });

  it("resumes last session with --resume", async () => {
    const cwd = await makeTempProject("chat-resume");
    try {
      await writeJsonFile(cwd, ".kairo/config.json", localConfig);
      // First session (EOF immediately) creates JSONL.
      {
        const { ctx } = makeContext({ cwd, args: ["chat"] });
        expect(await run(ctx)).toBe(0);
      }
      // Resume last without sending turns.
      const { ctx, out } = makeContext({
        cwd,
        args: ["chat", "--resume"],
      });
      const code = await run(ctx);
      expect(code).toBe(0);
      expect(out.stdoutText).toContain("Kairo chat");
    } finally {
      await fs.promises.rm(cwd, { recursive: true, force: true });
    }
  });

  it("fails without a default model when none configured", async () => {
    const cwd = await makeTempProject("chat-no-model");
    try {
      await writeJsonFile(cwd, ".kairo/config.json", {
        version: 1,
        providers: {
          ollama: {},
        },
      });
      const { ctx, out } = makeContext({ cwd, args: ["chat"] });
      const code = await run(ctx);
      expect(code).not.toBe(0);
      expect(out.stdoutText.toLowerCase()).toMatch(/model|default/);
    } finally {
      await fs.promises.rm(cwd, { recursive: true, force: true });
    }
  });

  it("fails closed on --resume of missing session", async () => {
    const cwd = await makeTempProject("chat-resume-missing");
    try {
      await writeJsonFile(cwd, ".kairo/config.json", localConfig);
      const { ctx, out } = makeContext({
        cwd,
        args: ["chat", "--resume", "does-not-exist"],
      });
      const code = await run(ctx);
      expect(code).not.toBe(0);
      expect(out.stdoutText.toLowerCase()).toMatch(/session|not found|missing/);
    } finally {
      await fs.promises.rm(cwd, { recursive: true, force: true });
    }
  });
});

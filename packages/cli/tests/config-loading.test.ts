import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

import { run } from "../src/program.js";
import { makeContext, makeTempProject, writeJsonFile, readJson } from "./helpers.js";

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

describe("bootstrap without a project", () => {
  it("fails PROJECT_NOT_FOUND when no .kairo/ exists", async () => {
    const cwd = await makeTempProject("none");
    try {
      const { ctx, out } = makeContext({ cwd, args: ["models"] });
      const code = await run(ctx);
      expect(code).toBe(3);
      expect(out.stdoutText).toContain("kairo init");
    } finally {
      await fs.promises.rm(cwd, { recursive: true, force: true });
    }
  });
});

describe("bootstrap with a malformed config", () => {
  it("fails CONFIG_LOAD_FAILED on broken JSON", async () => {
    const cwd = await makeTempProject("broken");
    try {
      await fs.promises.mkdir(path.join(cwd, ".kairo"), { recursive: true });
      await fs.promises.writeFile(
        path.join(cwd, ".kairo", "config.json"),
        "{ this is not valid json",
      );
      const { ctx, out } = makeContext({ cwd, args: ["models"] });
      const code = await run(ctx);
      expect(code).toBe(4);
      expect(out.stdoutText.toLowerCase()).toContain("json");
    } finally {
      await fs.promises.rm(cwd, { recursive: true, force: true });
    }
  });

  it("fails CONFIG_LOAD_FAILED on wrong version", async () => {
    const cwd = await makeTempProject("bad-version");
    try {
      await writeJsonFile(cwd, ".kairo/config.json", { version: 999, providers: {} });
      const { ctx } = makeContext({ cwd, args: ["models"] });
      const code = await run(ctx);
      expect(code).toBe(4);
    } finally {
      await fs.promises.rm(cwd, { recursive: true, force: true });
    }
  });
});

describe("bootstrap from a valid local config", () => {
  it("loads ollama locally and lists the model", async () => {
    const cwd = await makeTempProject("ok");
    try {
      await writeJsonFile(cwd, ".kairo/config.json", localConfig);
      const { ctx, out } = makeContext({ cwd, args: ["models"] });
      const code = await run(ctx);
      expect(code).toBe(0);
      expect(out.stdoutText).toContain("qwen3-coder:30b");
    } finally {
      await fs.promises.rm(cwd, { recursive: true, force: true });
    }
  });
});

describe("kairo chat bootstrap", () => {
  it("boots streaming chat and exits 0 on EOF", async () => {
    const cwd = await makeTempProject("chat");
    try {
      await writeJsonFile(cwd, ".kairo/config.json", localConfig);
      const { ctx, out } = makeContext({ cwd, args: ["chat"] });
      const code = await run(ctx);
      expect(code).toBe(0);
      expect(out.stdoutText).toContain("Kairo chat");
      expect(out.stdoutText).toContain("qwen3-coder:30b");
    } finally {
      await fs.promises.rm(cwd, { recursive: true, force: true });
    }
  });
});

describe("kairo run without a prompt", () => {
  it("exits 2 (MISSING_PROMPT) and shows usage", async () => {
    const cwd = await makeTempProject("run");
    try {
      await writeJsonFile(cwd, ".kairo/config.json", localConfig);
      const { ctx, out } = makeContext({ cwd, args: ["run"] });
      const code = await run(ctx);
      expect(code).toBe(2);
      expect(out.stdoutText).toContain("kairo run");
    } finally {
      await fs.promises.rm(cwd, { recursive: true, force: true });
    }
  });
});

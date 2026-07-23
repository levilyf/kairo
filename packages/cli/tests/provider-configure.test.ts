import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";

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

describe("kairo provider configure", () => {
  it("refuses if the provider is not configured yet", async () => {
    const cwd = await makeTempProject("cf-not");
    try {
      await writeJsonFile(cwd, ".kairo/config.json", { version: 1, providers: {} });
      const { ctx } = makeContext({ cwd, args: ["provider", "configure", "nvidia"] });
      const code = await run(ctx);
      expect(code).toBe(7);
    } finally {
      await fs.promises.rm(cwd, { recursive: true, force: true });
    }
  });

  it("re-runs setup and overwrites the configured block", async () => {
    const cwd = await makeTempProject("cf-re");
    try {
      await writeJsonFile(cwd, ".kairo/config.json", {
        version: 1,
        providers: { nvidia: { apiKey: "old", models: ["m1"], defaultModel: "m1" } },
      });
      const { ctx, out } = makeContext({
        cwd,
        args: ["provider", "configure", "nvidia"],
        stdinQueue: ["new-key", "m2", "m2", "2"], // config.json
      });
      const code = await run(ctx);
      expect(code).toBe(0);
      expect(out.stdoutText).toContain("NVIDIA configured");
      const config = (await readJson(cwd, ".kairo/config.json")) as {
        providers: { nvidia: { apiKey: string; models: string[]; defaultModel: string } };
      };
      expect(config.providers.nvidia.apiKey).toBe("new-key");
      expect(config.providers.nvidia.models).toEqual(["m2"]);
      expect(config.providers.nvidia.defaultModel).toBe("m2");
    } finally {
      await fs.promises.rm(cwd, { recursive: true, force: true });
    }
  });
});

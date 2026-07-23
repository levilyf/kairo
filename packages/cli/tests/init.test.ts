import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

import { run } from "../src/program.js";
import { makeContext, readJson, makeTempProject } from "./helpers.js";

describe("kairo init", () => {
  it("creates .kairo/config.json in an empty project", async () => {
    const cwd = await makeTempProject("init-new");
    try {
      const { ctx, out } = makeContext({ cwd, args: ["init"] });
      const code = await run(ctx);
      expect(code).toBe(0);
      const config = await readJson(cwd, path.join(".kairo", "config.json"));
      expect(config).toEqual({ version: 1, providers: {} });
      expect(out.stdoutText).toContain("Initialized Kairo project");
    } finally {
      await fs.promises.rm(cwd, { recursive: true, force: true });
    }
  });

  it("re-running init in an existing project exits non-zero and does not overwrite", async () => {
    const cwd = await makeTempProject("init-dup");
    try {
      // First create the skeleton
      await fs.promises.mkdir(path.join(cwd, ".kairo"), { recursive: true });
      const marker = { version: 1, providers: { openai: { apiKey: "x" } } };
      await fs.promises.writeFile(
        path.join(cwd, ".kairo", "config.json"),
        JSON.stringify(marker, null, 2),
      );
      const { ctx, out } = makeContext({ cwd, args: ["init"] });
      const code = await run(ctx);
      expect(code).not.toBe(0);
      // Existing config untouched
      const config = (await readJson(cwd, ".kairo/config.json")) as {
        providers: { openai: { apiKey: string } };
      };
      expect(config.providers.openai.apiKey).toBe("x");
      expect(out.stdoutText).toContain("already exists");
    } finally {
      await fs.promises.rm(cwd, { recursive: true, force: true });
    }
  });
});

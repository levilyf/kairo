import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as p from "node:path";

import { run } from "../src/program.js";
import { makeContext, makeTempProject, writeJsonFile, readJson } from "./helpers.js";
import { CLIError, CLIErrorCode } from "../src/index.js";

async function runWithCancel(
  cwd: string,
  args: readonly string[],
  cancelLabel: string,
): Promise<number> {
  const { ctx } = makeContext({
    cwd,
    args,
    stdin: async (label: string) => {
      if (label === cancelLabel) {
        throw new CLIError({
          code: CLIErrorCode.USER_CANCELLED,
          message: "Cancelled",
        });
      }
      return "";
    },
  });
  return run(ctx);
}

describe("user cancellation", () => {
  it("during provider-add setup → exit 130, no config written", async () => {
    const cwd = await makeTempProject("add-cancel");
    try {
      await writeJsonFile(cwd, ".kairo/config.json", { version: 1, providers: {} });
      const code = await runWithCancel(
        cwd,
        ["provider", "add", "nvidia"],
        "API Key",
      );
      expect(code).toBe(130);
      const config = (await readJson(cwd, ".kairo/config.json")) as {
        providers: Record<string, unknown>;
      };
      expect(config.providers.nvidia).toBeUndefined();
      void p;
    } finally {
      await fs.promises.rm(cwd, { recursive: true, force: true });
    }
  });
});

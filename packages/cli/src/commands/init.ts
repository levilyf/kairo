/**
 * `kairo init` — create `.kairo/config.json` skeleton.
 *
 * Behavior:
 *   - If `.kairo/config.json` already exists: friendly error, exit non-zero.
 *   - Otherwise creates `.kairo/` directory + a minimal default config.
 *
 * The default config is intentionally bare (no providers) — the user
 * builds it up via `kairo provider add`. We never overwrite an
 * existing file, even an empty one.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";

import type { CLIContext } from "../context.js";
import { CLIError, CLIErrorCode } from "../errors.js";
import { heading, success, text, muted } from "../ui/index.js";
import type { Command, CommandMetadata } from "./types.js";
import { resolveProjectRoot } from "../config-file.js";

export const initMetadata: CommandMetadata = {
  name: "init",
  summary: "Create a new Kairo project (writes .kairo/config.json)",
  usage: "kairo init",
  description:
    "Creates the .kairo/ directory and an empty config.json. Does not overwrite an existing project; run kairo provider add to populate it.",
};

const DEFAULT_CONFIG = {
  version: 1,
  providers: {},
};

export const initCommand: Command = {
  metadata: initMetadata,
  async run(ctx: CLIContext): Promise<number> {
    // Detect an existing project anywhere from cwd upward.
    const root = await resolveProjectRoot(ctx);
    if (root !== null) {
      const configPath = path.join(root, ".kairo", "config.json");
      let exists = false;
      try {
        const stat = await fs.stat(configPath);
        exists = stat.isFile();
      } catch {
        exists = false;
      }
      if (exists) {
        throw new CLIError({
          code: CLIErrorCode.PROVIDER_ALREADY_EXISTS,
          message: "A Kairo project already exists here.",
          hint: "Run: kairo provider add",
        });
      }
    }
    // Write a fresh config in cwd.
    const dir = path.resolve(ctx.cwd, ".kairo");
    await fs.mkdir(dir, { recursive: true });
    const configPath = path.join(dir, "config.json");
    await fs.writeFile(
      configPath,
      JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n",
      "utf8",
    );
    heading(ctx, "Initialized Kairo project");
    text(ctx, configPath, { indent: 0 });
    ctx.stdout("");
    success(ctx, "Project ready");
    ctx.stdout("");
    muted(ctx, "Run: kairo provider add <provider>");
    muted(ctx, "Run: kairo doctor");
    return 0;
  },
};

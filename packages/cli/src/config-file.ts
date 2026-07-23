/**
 * Config-file reading/writing helpers for the CLI.
 *
 * Why not use @kairo/config? @kairo/config's loadConfig() returns a
 * deeply frozen, validated KairoConfig — perfect for bootstrap but
 * unsuited for incremental editing (we'd lose the rest of the object
 * graph + force re-validation on a half-finished file).
 *
 * For provider mutations (`provider add/configure/remove`), we instead
 * read the raw JSON file ourselves, patch the one block we care about,
 * validate the result via @kairo/config's `validateConfig` before
 * writing (so we never write a broken config), and re-emit it with a
 * stable 2-space indent.
 *
 * This keeps `provider add/configure/remove` self-contained and
 * always-validating without round-tripping through createApplication()
 * until the user explicitly runs a bootstrap command.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";

import { validateConfig, ConfigError, ConfigErrorCode } from "@kairo/config";

import { CLIError, CLIErrorCode } from "./errors.js";
import type { CLIContext } from "./context.js";

/** A shallow, mutable view of the config file structure we edit. */
export interface MutableKairoConfig {
  version: number;
  providers?: Record<string, Record<string, unknown>>;
  model?: string | null;
  agent?: Record<string, unknown>;
  permissions?: Record<string, unknown>;
  workspace?: Record<string, unknown>;
  [key: string]: unknown;
}

/** The relative config path inside the project. */
export const CONFIG_RELATIVE_PATH = path.join(".kairo", "config.json");

export async function resolveProjectRoot(
  ctx: CLIContext,
): Promise<string | null> {
  let current = path.resolve(ctx.cwd);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const candidate = path.join(current, ".kairo");
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) return current;
    } catch {
      // not present, keep walking
    }
    const parent = path.dirname(current);
    if (parent === current) return null; // hit fs root
    current = parent;
  }
}

/** Reads the config as a mutable, *unvalidated* shape. */
export async function readMutableConfig(
  ctx: CLIContext,
): Promise<{ root: string; absPath: string; config: MutableKairoConfig } | null> {
  const root = await resolveProjectRoot(ctx);
  if (root === null) return null;
  const absPath = path.join(root, CONFIG_RELATIVE_PATH);
  let exists = false;
  try {
    const stat = await fs.stat(absPath);
    exists = stat.isFile();
  } catch {
    exists = false;
  }
  if (!exists) return null;
  let content: string;
  try {
    content = await fs.readFile(absPath, "utf8");
  } catch (cause) {
    throw new CLIError({
      code: CLIErrorCode.CONFIG_LOAD_FAILED,
      message: `Cannot read "${absPath}"`,
      ...(cause instanceof Error ? { cause } : {}),
    });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (cause) {
    throw new CLIError({
      code: CLIErrorCode.CONFIG_LOAD_FAILED,
      message: `"${absPath}" is not valid JSON`,
      ...(cause instanceof Error ? { cause } : {}),
    });
  }
  const config = parsed as MutableKairoConfig;
  if (
    config === null ||
    typeof config !== "object" ||
    typeof config.version !== "number"
  ) {
    throw new CLIError({
      code: CLIErrorCode.CONFIG_LOAD_FAILED,
      message: `"${absPath}" is missing required "version" field`,
    });
  }
  return { root, absPath, config };
}

/**
 * Validates the supplied mutable config via @kairo/config and, if it
 * passes, writes it back to disk with 2-space indentation. Throws
 * CLIError(CONFIG_LOAD_FAILED) if validation fails.
 *
 * Mutations to `config` made by the caller are *also* validated —
 * this is the gate that prevents `provider add` from writing a broken
 * config file to disk.
 */
export async function writeMutableConfig(
  ctx: CLIContext,
  absPath: string,
  config: MutableKairoConfig,
): Promise<void> {
  try {
    validateConfig(config);
  } catch (cause) {
    throw new CLIError({
      code: CLIErrorCode.CONFIG_LOAD_FAILED,
      message:
        cause instanceof ConfigError
          ? cause.message
          : "updated config would be invalid",
      ...(cause instanceof Error ? { cause } : {}),
    });
  }
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, JSON.stringify(config, null, 2) + "\n", "utf8");
}

/** Bumps a non-error to a typed `PROJECT_NOT_FOUND` if no project root exists. */
export function assertProjectRoot(
  root: string | null,
  ctx: CLIContext,
): asserts root {
  if (root === null) {
    throw new CLIError({
      code: CLIErrorCode.PROJECT_NOT_FOUND,
      message: `No ".kairo/" directory found from "${ctx.cwd}".`,
      hint: "Run: kairo init",
    });
  }
}

/** Bumps a missing config file to a typed CLIError. */
export function assertConfigPresent(
  data: { root: string; absPath: string; config: MutableKairoConfig } | null,
  ctx: CLIContext,
): asserts data is { root: string; absPath: string; config: MutableKairoConfig } {
  if (data === null) {
    throw new CLIError({
      code: CLIErrorCode.CONFIG_LOAD_FAILED,
      message: `".kairo/config.json" not found in the current project.`,
      hint: "Run: kairo init",
    });
  }
}

/** Re-export the code reader for callers who need to distinguish errors. */
export { ConfigErrorCode };

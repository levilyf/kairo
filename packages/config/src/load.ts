/**
 * Kairo config loader.
 *
 * Combines project-root discovery + file reading + JSON parsing +
 * validation. Returns a resolved project + immutable config.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";

import {
  ConfigError,
  ConfigErrorCode,
} from "./errors.js";
import type { KairoConfig } from "./schema.js";
import { validateConfig } from "./validate.js";
import { findProjectRoot } from "./discover.js";

export interface LoadConfigOptions {
  /** Starting directory for project-root discovery. Defaults to cwd. */
  readonly cwd?: string;
}

export interface LoadedConfig {
  /** Absolute project root containing the `.kairo/` directory. */
  readonly root: string;
  /** Absolute path to the loaded `.kairo/config.json`. */
  readonly path: string;
  /** Validated, immutable Kairo config. */
  readonly config: KairoConfig;
}

/**
 * Discover the Kairo project root, read `.kairo/config.json`, parse it,
 * and validate it. Returns an immutable config alongside the resolved
 * filesystem paths.
 *
 * This function does NOT substitute environment placeholders — call
 * {@link resolveConfigEnvironment} for that.
 */
export async function loadConfig(
  options?: LoadConfigOptions,
): Promise<LoadedConfig> {
  const root = await findProjectRoot(options?.cwd);
  const configPath = path.join(root, ".kairo", "config.json");

  let exists = false;
  try {
    const stat = await fs.stat(configPath);
    exists = stat.isFile();
  } catch {
    exists = false;
  }
  if (!exists) {
    throw new ConfigError({
      code: ConfigErrorCode.CONFIG_NOT_FOUND,
      message: `Kairo config not found at "${configPath}"`,
      path: configPath,
    });
  }

  let content: string;
  try {
    content = await fs.readFile(configPath, "utf8");
  } catch (error) {
    throw new ConfigError({
      code: ConfigErrorCode.INVALID_CONFIG,
      message: `Failed to read Kairo config at "${configPath}"`,
      path: configPath,
      cause: error,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new ConfigError({
      code: ConfigErrorCode.CONFIG_PARSE_FAILED,
      message: `Kairo config at "${configPath}" is not valid JSON`,
      path: configPath,
      cause: error,
    });
  }

  const config = validateConfig(parsed);
  return Object.freeze({
    root,
    path: configPath,
    config,
  });
}

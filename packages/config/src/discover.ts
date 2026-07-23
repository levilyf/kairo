/**
 * Project root discovery.
 *
 * Walks upward from a starting directory looking for a `.kairo/`
 * marker directory. The first directory that contains `.kairo/` is
 * returned as the project root. If the filesystem root is reached
 * without finding a marker, PROJECT_NOT_FOUND is thrown.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";

import {
  ConfigError,
  ConfigErrorCode,
} from "./errors.js";

const MARKER_DIR = ".kairo";

/**
 * Find the project root by walking upward from `start` (default
 * `process.cwd()`) and returning the first directory that contains a
 * `.kairo/` directory.
 *
 * Throws ConfigError with code PROJECT_NOT_FOUND when no marker is
 * present between `start` and the filesystem root, or when `start`
 * itself does not resolve to an accessible directory.
 */
export async function findProjectRoot(start?: string): Promise<string> {
  const from = start ?? process.cwd();
  return walkUpForRoot(from);
}

async function walkUpForRoot(from: string): Promise<string> {
  // Resolve to an absolute path; throws if cwd is missing — surface as PROJECT_NOT_FOUND.
  let current: string;
  try {
    current = path.resolve(from);
  } catch {
    throw new ConfigError({
      code: ConfigErrorCode.PROJECT_NOT_FOUND,
      message: `Could not resolve starting directory "${from}"`,
      path: from,
    });
  }

  // Verify start is a directory; otherwise surface as PROJECT_NOT_FOUND.
  try {
    const stat = await fs.stat(current);
    if (!stat.isDirectory()) {
      throw new ConfigError({
        code: ConfigErrorCode.PROJECT_NOT_FOUND,
        message: `Starting path is not a directory: "${current}"`,
        path: current,
      });
    }
  } catch (error) {
    if (error instanceof ConfigError) {
      throw error;
    }
    throw new ConfigError({
      code: ConfigErrorCode.PROJECT_NOT_FOUND,
      message: `Starting directory is not accessible: "${current}"`,
      path: current,
      cause: error,
    });
  }

  while (true) {
    const candidate = path.join(current, MARKER_DIR);
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) {
        return current;
      }
    } catch {
      // Not present; keep walking.
    }

    const parent = path.dirname(current);
    if (parent === current) {
      // Reached filesystem root without finding a marker.
      throw new ConfigError({
        code: ConfigErrorCode.PROJECT_NOT_FOUND,
        message:
          `Could not find a ".kairo/" directory starting from "${from}"`,
        path: from,
      });
    }
    current = parent;
  }
}

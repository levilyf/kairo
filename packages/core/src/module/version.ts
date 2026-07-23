/**
 * Minimal semver utilities for Core contract / module dependency ranges.
 *
 * Not a full semver implementation — only what the module host needs for
 * basic resolution (major.minor.patch, inclusive min/max ranges).
 */

import { ModuleError, ModuleErrorCode } from "./errors.js";

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

export interface VersionRange {
  /** Inclusive lower bound. */
  min: string;
  /** Inclusive upper bound, if any. */
  max?: string;
}

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

export function parseSemver(version: string): SemVer {
  const match = SEMVER_RE.exec(version);
  if (!match) {
    throw new ModuleError({
      code: ModuleErrorCode.INVALID_MANIFEST,
      message: `Invalid semantic version: "${version}" (expected major.minor.patch)`,
      phase: "resolution",
    });
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

export function compareSemver(a: string, b: string): number {
  const left = parseSemver(a);
  const right = parseSemver(b);
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  return left.patch - right.patch;
}

export function isVersionInRange(version: string, range: VersionRange): boolean {
  if (compareSemver(version, range.min) < 0) {
    return false;
  }
  if (range.max !== undefined && compareSemver(version, range.max) > 0) {
    return false;
  }
  return true;
}

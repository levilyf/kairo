/**
 * Environment placeholder resolution.
 *
 * Replaces `${VAR}` placeholders using a supplied environment map. The
 * supplied config is not mutated; the returned config is freshly
 * constructed and deeply frozen.
 *
 * Placeholder grammar (intentionally strict):
 *   - Only the form `${VARNAME}` is recognized.
 *   - `VARNAME` must match /^[A-Za-z_][A-Za-z0-9_]*$/.
 *   - Strings without placeholders are returned unchanged.
 *   - Non-string values are returned unchanged (numbers, booleans, null,
 *     arrays, objects).
 *
 * A string containing multiple placeholders, e.g.
 *   "Bearer ${TOKEN}, foo=${FOO}"
 * is supported; every placeholder must resolve or the call fails.
 *
 * A missing variable throws ENVIRONMENT_VARIABLE_MISSING with the
 * variable name attached as `error.variable`.
 */

import {
  ConfigError,
  ConfigErrorCode,
} from "./errors.js";
import type { KairoConfig } from "./schema.js";
import { deepFreeze } from "./freeze.js";

const PLACEHOLDER = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

export type EnvironmentMap = Readonly<Record<string, string | undefined>>;

/**
 * Resolve `${VAR}` placeholders in `config` using `env`. If `env` is
 * omitted, falls back to `process.env` when available; otherwise uses
 * an empty map.
 */
export function resolveConfigEnvironment(
  config: KairoConfig,
  env?: EnvironmentMap,
): KairoConfig {
  const map = env ?? processEnv();
  const resolved = resolveValue(config, map) as KairoConfig;
  return deepFreeze(resolved);
}

function resolveValue(value: unknown, env: EnvironmentMap): unknown {
  if (typeof value === "string") {
    if (!value.includes("${")) {
      return value;
    }
    return resolveString(value, env);
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveValue(item, env));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>)) {
      out[key] = resolveValue(
        (value as Record<string, unknown>)[key],
        env,
      );
    }
    return out;
  }
  return value;
}

function resolveString(value: string, env: EnvironmentMap): string {
  return value.replace(PLACEHOLDER, (match, name: string) => {
    const looked = env[name];
    if (looked === undefined || looked === "") {
      throw new ConfigError({
        code: ConfigErrorCode.ENVIRONMENT_VARIABLE_MISSING,
        message:
          `Environment variable "${name}" is required by config but was not found`,
        variable: name,
      });
    }
    return looked;
  });
}

function processEnv(): EnvironmentMap {
  if (typeof process !== "undefined" && process !== null) {
    const env = (process as { env?: Record<string, string | undefined> }).env;
    if (env !== undefined) {
      return env;
    }
  }
  return {};
}

/**
 * Pure configuration validation. Independent of the filesystem.
 */

import {
  ConfigError,
  ConfigErrorCode,
} from "./errors.js";
import {
  KNOWN_TOP_LEVEL_KEYS,
  type KairoConfig,
  CURRENT_CONFIG_VERSION,
} from "./schema.js";
import { deepFreeze } from "./freeze.js";

/**
 * Validate a raw parsed object against the Kairo config schema and
 * return a deeply-frozen immutable config. Throws ConfigError on any
 * validation failure.
 *
 * Does NOT touch the filesystem and does NOT substitute environment
 * placeholders.
 */
export function validateConfig(input: unknown): KairoConfig {
  if (!isPlainObject(input)) {
    throw new ConfigError({
      code: ConfigErrorCode.INVALID_SCHEMA,
      message:
        "Kairo config must be a JSON object at the top level",
      field: "",
    });
  }

  const obj = input as Record<string, unknown>;

  assertVersion(obj.version);
  assertUnknownKeys(obj);
  if (obj.providers !== undefined) {
    assertProviders(obj.providers);
  }
  if (obj.model !== undefined) {
    assertModel(obj.model);
  }
  if (obj.agent !== undefined) {
    assertPlainObjectSection(obj.agent, "agent");
  }
  if (obj.permissions !== undefined) {
    assertPlainObjectSection(obj.permissions, "permissions");
  }
  if (obj.workspace !== undefined) {
    assertPlainObjectSection(obj.workspace, "workspace");
  }

  return deepFreeze(obj) as unknown as KairoConfig;
}

function assertVersion(version: unknown): void {
  if (version === undefined) {
    throw new ConfigError({
      code: ConfigErrorCode.INVALID_SCHEMA,
      message: `Kairo config is missing required field "version"`,
      field: "version",
    });
  }
  if (typeof version !== "number" || !Number.isInteger(version)) {
    throw new ConfigError({
      code: ConfigErrorCode.INVALID_SCHEMA,
      message: `Kairo config "version" must be an integer (got ${typeof version})`,
      field: "version",
    });
  }
  if (version !== CURRENT_CONFIG_VERSION) {
    throw new ConfigError({
      code: ConfigErrorCode.INVALID_SCHEMA,
      message:
        `Kairo config "version" must be ${CURRENT_CONFIG_VERSION} (got ${version})`,
      field: "version",
    });
  }
}

function assertUnknownKeys(obj: Record<string, unknown>): void {
  const known = new Set<string>(KNOWN_TOP_LEVEL_KEYS);
  for (const key of Object.keys(obj)) {
    if (!known.has(key)) {
      throw new ConfigError({
        code: ConfigErrorCode.INVALID_SCHEMA,
        message: `Unknown top-level key "${key}" in Kairo config`,
        field: key,
      });
    }
  }
}

function assertProviders(providers: unknown): void {
  if (!isPlainObject(providers)) {
    throw new ConfigError({
      code: ConfigErrorCode.INVALID_SCHEMA,
      message: `"providers" must be an object mapping provider ids to provider configs`,
      field: "providers",
    });
  }
  const map = providers as Record<string, unknown>;
  for (const id of Object.keys(map)) {
    const entry = map[id];
    if (entry === null || entry === undefined) {
      throw new ConfigError({
        code: ConfigErrorCode.INVALID_SCHEMA,
        message: `Provider "${id}" must be an object`,
        field: `providers.${id}`,
      });
    }
    if (!isPlainObject(entry)) {
      throw new ConfigError({
        code: ConfigErrorCode.INVALID_SCHEMA,
        message: `Provider "${id}" must be an object (got ${typeof entry})`,
        field: `providers.${id}`,
      });
    }
  }
}

function assertModel(model: unknown): void {
  if (model !== null && typeof model !== "string") {
    throw new ConfigError({
      code: ConfigErrorCode.INVALID_SCHEMA,
      message: `"model" must be a string or null (got ${typeof model})`,
      field: "model",
    });
  }
}

function assertPlainObjectSection(value: unknown, field: string): void {
  if (!isPlainObject(value)) {
    throw new ConfigError({
      code: ConfigErrorCode.INVALID_SCHEMA,
      message: `"${field}" must be an object`,
      field,
    });
  }
}

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }
  // Reject arrays and class instances — only plain records pass.
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

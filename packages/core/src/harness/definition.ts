/**
 * Immutable HarnessDefinition.
 *
 * The intentional composition description: modules, config, permissions,
 * environment, metadata. Building a harness starts here.
 *
 * Source of truth: docs/HARNESS.md
 */

import type {
  ModuleHostEventListener,
  ModuleSource,
} from "../module/types.js";
import { createHarnessConfig, type HarnessConfig } from "./config.js";
import { HarnessError, HarnessErrorCode } from "./errors.js";
import {
  createHarnessMetadata,
  type HarnessMetadata,
} from "./metadata.js";

/** Default Core contract version this composition targets. */
export const DEFAULT_CORE_VERSION = "0.1.0";

/**
 * A module entry in a harness composition.
 * Either a bare ModuleSource or an explicit registration descriptor.
 */
export type HarnessModuleInput =
  | ModuleSource
  | {
      source: ModuleSource;
      optional?: boolean;
      config?: Record<string, unknown>;
    };

/**
 * Normalized, frozen module entry inside a HarnessDefinition.
 */
export interface HarnessModuleEntry {
  readonly source: ModuleSource;
  readonly optional: boolean;
  readonly config: Readonly<Record<string, unknown>>;
}

/**
 * Author-facing definition input for defineHarness / createHarness.
 */
export interface HarnessDefinitionInput {
  name: string;
  version?: string;
  description?: string;
  intent?: string;
  modules: readonly HarnessModuleInput[];
  /** Permissions granted by this harness composition. */
  permissions?: readonly string[];
  /** Harness-level config values. */
  config?: Record<string, unknown>;
  /** Environment bindings owned by the harness (opaque string map). */
  environment?: Record<string, string>;
  /**
   * Core contract version the host will report.
   * Defaults to the current Core contract version.
   */
  coreVersion?: string;
  /** Optional host diagnostic listener. */
  onModuleEvent?: ModuleHostEventListener;
}

/**
 * Immutable harness composition definition.
 */
export interface HarnessDefinition {
  readonly metadata: HarnessMetadata;
  readonly modules: readonly HarnessModuleEntry[];
  readonly permissions: ReadonlySet<string>;
  readonly config: HarnessConfig;
  readonly environment: Readonly<Record<string, string>>;
  readonly coreVersion: string;
  readonly onModuleEvent?: ModuleHostEventListener;
}

/**
 * Create a validated, frozen HarnessDefinition.
 *
 * Validation only — does not boot ModuleHost.
 */
export function defineHarness(input: HarnessDefinitionInput): HarnessDefinition {
  validateName(input.name);

  if (!Array.isArray(input.modules)) {
    throw new HarnessError({
      code: HarnessErrorCode.INVALID_DEFINITION,
      message: "Harness definition requires a modules array",
      harnessName: input.name,
      field: "modules",
    });
  }

  const permissions = normalizePermissions(input.name, input.permissions);
  const environment = normalizeEnvironment(input.name, input.environment);
  const modules = normalizeModules(input.name, input.modules);
  assertNoDuplicateModules(input.name, modules);

  if (input.config !== undefined && !isPlainObject(input.config)) {
    throw new HarnessError({
      code: HarnessErrorCode.INVALID_CONFIG,
      message: "Harness config must be a plain object",
      harnessName: input.name,
      field: "config",
    });
  }

  if (input.coreVersion !== undefined) {
    assertNonEmptyString(input.coreVersion, "coreVersion", input.name);
  }

  const definition: HarnessDefinition = {
    metadata: createHarnessMetadata({
      name: input.name.trim(),
      ...(input.version !== undefined ? { version: input.version } : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.intent !== undefined ? { intent: input.intent } : {}),
    }),
    modules: Object.freeze(modules),
    permissions,
    config: createHarnessConfig(
      input.config !== undefined ? { values: input.config } : {},
    ),
    environment: Object.freeze(environment),
    coreVersion: input.coreVersion ?? DEFAULT_CORE_VERSION,
    ...(input.onModuleEvent !== undefined
      ? { onModuleEvent: input.onModuleEvent }
      : {}),
  };

  return Object.freeze(definition);
}

function validateName(name: unknown): asserts name is string {
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new HarnessError({
      code: HarnessErrorCode.INVALID_DEFINITION,
      message: "Harness definition requires a non-empty name",
      field: "name",
      ...(typeof name === "string" ? { harnessName: name } : {}),
    });
  }
}

function normalizePermissions(
  harnessName: string,
  permissions: readonly string[] | undefined,
): ReadonlySet<string> {
  if (permissions === undefined) {
    return new Set();
  }
  if (!Array.isArray(permissions)) {
    throw new HarnessError({
      code: HarnessErrorCode.INVALID_PERMISSIONS,
      message: "permissions must be an array of strings",
      harnessName,
      field: "permissions",
    });
  }

  const set = new Set<string>();
  for (const permission of permissions) {
    if (typeof permission !== "string" || permission.trim().length === 0) {
      throw new HarnessError({
        code: HarnessErrorCode.INVALID_PERMISSIONS,
        message: "Each permission must be a non-empty string",
        harnessName,
        field: "permissions",
        details: { permission },
      });
    }
    set.add(permission);
  }
  return set;
}

function normalizeEnvironment(
  harnessName: string,
  environment: Record<string, string> | undefined,
): Record<string, string> {
  if (environment === undefined) {
    return {};
  }
  if (!isPlainObject(environment)) {
    throw new HarnessError({
      code: HarnessErrorCode.INVALID_ENVIRONMENT,
      message: "environment must be a plain object of string values",
      harnessName,
      field: "environment",
    });
  }

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(environment)) {
    if (typeof key !== "string" || key.length === 0) {
      throw new HarnessError({
        code: HarnessErrorCode.INVALID_ENVIRONMENT,
        message: "environment keys must be non-empty strings",
        harnessName,
        field: "environment",
      });
    }
    if (typeof value !== "string") {
      throw new HarnessError({
        code: HarnessErrorCode.INVALID_ENVIRONMENT,
        message: `environment.${key} must be a string`,
        harnessName,
        field: "environment",
        details: { key, value },
      });
    }
    result[key] = value;
  }
  return result;
}

function normalizeModules(
  harnessName: string,
  modules: readonly HarnessModuleInput[],
): HarnessModuleEntry[] {
  return modules.map((entry, index) => {
    if (isModuleSource(entry)) {
      return Object.freeze({
        source: entry,
        optional: false,
        config: Object.freeze({}),
      });
    }

    if (!isPlainObject(entry) || !isModuleSource(entry.source)) {
      throw new HarnessError({
        code: HarnessErrorCode.INVALID_MODULE_ENTRY,
        message: `modules[${index}] must be a ModuleSource or { source, optional?, config? }`,
        harnessName,
        field: "modules",
        details: { index },
      });
    }

    if (entry.config !== undefined && !isPlainObject(entry.config)) {
      throw new HarnessError({
        code: HarnessErrorCode.INVALID_CONFIG,
        message: `modules[${index}].config must be a plain object`,
        harnessName,
        field: "modules",
        moduleId: entry.source.manifest?.id,
        details: { index },
      });
    }

    if (
      entry.optional !== undefined &&
      typeof entry.optional !== "boolean"
    ) {
      throw new HarnessError({
        code: HarnessErrorCode.INVALID_MODULE_ENTRY,
        message: `modules[${index}].optional must be a boolean`,
        harnessName,
        field: "modules",
        moduleId: entry.source.manifest?.id,
        details: { index },
      });
    }

    return Object.freeze({
      source: entry.source,
      optional: entry.optional ?? false,
      config: Object.freeze({ ...(entry.config ?? {}) }),
    });
  });
}

function assertNoDuplicateModules(
  harnessName: string,
  modules: readonly HarnessModuleEntry[],
): void {
  const seen = new Set<string>();
  for (const entry of modules) {
    const id = entry.source.manifest.id;
    if (seen.has(id)) {
      throw new HarnessError({
        code: HarnessErrorCode.DUPLICATE_MODULE,
        message: `Duplicate module id in harness definition: "${id}"`,
        harnessName,
        moduleId: id,
        field: "modules",
      });
    }
    seen.add(id);
  }
}

function assertNonEmptyString(
  value: string,
  field: string,
  harnessName: string,
): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HarnessError({
      code: HarnessErrorCode.INVALID_DEFINITION,
      message: `${field} must be a non-empty string`,
      harnessName,
      field,
    });
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isModuleSource(value: unknown): value is ModuleSource {
  if (!isPlainObject(value)) return false;
  if (typeof value.load !== "function") return false;
  const manifest = value.manifest;
  if (!isPlainObject(manifest)) return false;
  return typeof manifest.id === "string" && manifest.id.length > 0;
}

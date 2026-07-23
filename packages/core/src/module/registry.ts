/**
 * Module registry — catalog of modules known to the host.
 *
 * Passive coordination: stores records, enforces unique ids, exposes
 * introspection. Does not execute domain logic.
 */

import { ModuleError, ModuleErrorCode } from "./errors.js";
import type {
  ModuleRecord,
  ModuleRegistrationOptions,
  ModuleSource,
  ModuleState,
} from "./types.js";

export class ModuleRegistry {
  private readonly modules = new Map<string, ModuleRecord>();

  register(
    source: ModuleSource,
    options: ModuleRegistrationOptions = {},
  ): ModuleRecord {
    const { manifest } = source;
    this.assertValidManifest(manifest);

    if (this.modules.has(manifest.id)) {
      throw new ModuleError({
        code: ModuleErrorCode.DUPLICATE_MODULE,
        message: `Module already registered: "${manifest.id}"`,
        phase: "registration",
        moduleId: manifest.id,
      });
    }

    const optional = options.optional ?? manifest.optional ?? false;
    const record: ModuleRecord = {
      manifest,
      state: "registered",
      optional,
      config: Object.freeze({ ...(options.config ?? {}) }),
      source,
    };

    this.modules.set(manifest.id, record);
    return record;
  }

  get(id: string): ModuleRecord | undefined {
    return this.modules.get(id);
  }

  has(id: string): boolean {
    return this.modules.has(id);
  }

  list(): ModuleRecord[] {
    return [...this.modules.values()];
  }

  setState(id: string, state: ModuleState, error?: Error): void {
    const record = this.require(id);
    record.state = state;
    if (error !== undefined) {
      record.lastError = error;
    }
  }

  setInstance(id: string, instance: ModuleRecord["instance"]): void {
    const record = this.require(id);
    if (instance === undefined) {
      delete record.instance;
    } else {
      record.instance = instance;
    }
  }

  require(id: string): ModuleRecord {
    const record = this.modules.get(id);
    if (!record) {
      throw new ModuleError({
        code: ModuleErrorCode.UNKNOWN_MODULE,
        message: `Unknown module: "${id}"`,
        phase: "runtime",
        moduleId: id,
      });
    }
    return record;
  }

  clear(): void {
    this.modules.clear();
  }

  private assertValidManifest(manifest: ModuleSource["manifest"]): void {
    if (!manifest.id || typeof manifest.id !== "string") {
      throw new ModuleError({
        code: ModuleErrorCode.INVALID_MANIFEST,
        message: "Module manifest requires a non-empty string id",
        phase: "registration",
      });
    }
    if (!manifest.version || typeof manifest.version !== "string") {
      throw new ModuleError({
        code: ModuleErrorCode.INVALID_MANIFEST,
        message: "Module manifest requires a version",
        phase: "registration",
        moduleId: manifest.id,
      });
    }
    if (!manifest.compatibility?.min) {
      throw new ModuleError({
        code: ModuleErrorCode.INVALID_MANIFEST,
        message: "Module manifest requires compatibility.min",
        phase: "registration",
        moduleId: manifest.id,
      });
    }
  }
}

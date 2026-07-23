/**
 * Module Host — kernel side of the module system.
 *
 * Responsibilities (docs/CORE.md, docs/MODULES.md):
 * - registration
 * - discovery coordination (via explicit sources; no magical scanning)
 * - dependency awareness
 * - lifecycle transitions
 * - isolation expectations (logical / lifecycle)
 * - failure reporting
 *
 * Does NOT implement runtime, agent loop, providers, tools, or UI.
 */

import { ContributionRegistry } from "./contributions.js";
import { ModuleError, ModuleErrorCode } from "./errors.js";
import { ModuleLoader } from "./loader.js";
import { ModuleRegistry } from "./registry.js";
import {
  DependencyResolver,
  type MissingOptionalDependency,
} from "./resolver.js";
import type {
  ModuleContext,
  ModuleHostEvent,
  ModuleHostEventListener,
  ModuleRecord,
  ModuleRegistrationOptions,
  ModuleSource,
  ModuleState,
} from "./types.js";

export interface ModuleHostOptions {
  /** Running Core contract version. */
  coreVersion: string;
  /** Permissions granted by the harness composition. */
  grantedPermissions?: Iterable<string>;
  /** Optional diagnostic listener (host-local; full event bus is later). */
  onEvent?: ModuleHostEventListener;
  /** Injectable loader (tests / alternate loading models). */
  loader?: ModuleLoader;
  /** Injectable contribution registry. */
  contributions?: ContributionRegistry;
}

export interface FailedOptionalModule {
  moduleId: string;
  error: ModuleError;
}

export type BootResult =
  | {
      ok: true;
      order: string[];
      failedOptional: FailedOptionalModule[];
      missingOptional: MissingOptionalDependency[];
    }
  | {
      ok: false;
      error: ModuleError;
      failedOptional: FailedOptionalModule[];
    };

type HostPhase = "open" | "booting" | "started" | "shutdown";

export class ModuleHost {
  readonly contributions: ContributionRegistry;

  private readonly coreVersion: string;
  private readonly grantedPermissions: ReadonlySet<string>;
  private readonly onEvent?: ModuleHostEventListener;
  private readonly loader: ModuleLoader;
  private readonly registry: ModuleRegistry;

  private phase: HostPhase = "open";
  private bootOrder: string[] = [];

  constructor(options: ModuleHostOptions) {
    this.coreVersion = options.coreVersion;
    this.grantedPermissions = new Set(options.grantedPermissions ?? []);
    if (options.onEvent) {
      this.onEvent = options.onEvent;
    }
    this.loader = options.loader ?? new ModuleLoader();
    this.contributions = options.contributions ?? new ContributionRegistry();
    this.registry = new ModuleRegistry();
  }

  /**
   * Register a module source with the host.
   * Registration is closed after boot starts (no hot reload in this milestone).
   */
  register(
    source: ModuleSource,
    options: ModuleRegistrationOptions = {},
  ): ModuleRecord {
    if (this.phase !== "open") {
      throw new ModuleError({
        code: ModuleErrorCode.REGISTRATION_CLOSED,
        message: "Cannot register modules after the host has started booting",
        phase: "registration",
        moduleId: source.manifest.id,
      });
    }

    const record = this.registry.register(source, options);
    this.emit("module.registered", record.manifest.id, record.state);
    return record;
  }

  get(id: string): ModuleRecord | undefined {
    return this.registry.get(id);
  }

  list(): ModuleRecord[] {
    // Prefer boot order when available for inspectability.
    if (this.bootOrder.length === 0) {
      return this.registry.list();
    }
    const ordered: ModuleRecord[] = [];
    for (const id of this.bootOrder) {
      const record = this.registry.get(id);
      if (record) ordered.push(record);
    }
    // Include any not in boot order (e.g. failed before order finalized)
    for (const record of this.registry.list()) {
      if (!this.bootOrder.includes(record.manifest.id)) {
        ordered.push(record);
      }
    }
    return ordered;
  }

  /**
   * Resolve, load, initialize, and start all registered modules.
   *
   * Required module failures fail the boot.
   * Optional module failures are contained when safe (docs/MODULES.md).
   */
  async boot(): Promise<BootResult> {
    if (this.phase !== "open") {
      return {
        ok: false,
        error: new ModuleError({
          code: ModuleErrorCode.INVALID_STATE,
          message: `Cannot boot host in phase "${this.phase}"`,
          phase: "start",
        }),
        failedOptional: [],
      };
    }

    this.phase = "booting";
    const failedOptional: FailedOptionalModule[] = [];

    const records = this.registry.list();
    const effectiveRequired = this.computeEffectivelyRequired(records);

    const resolver = new DependencyResolver({
      coreVersion: this.coreVersion,
      grantedPermissions: this.grantedPermissions,
    });

    const resolution = resolver.resolve(records.map((r) => r.manifest));
    if (!resolution.ok) {
      this.phase = "open";
      return { ok: false, error: resolution.error, failedOptional };
    }

    this.bootOrder = resolution.order.map((m) => m.id);
    for (const id of this.bootOrder) {
      this.registry.setState(id, "resolved");
      this.emit("module.resolved", id, "resolved");
    }

    // Load → Initialize → Start in dependency order.
    for (const phase of ["load", "initialize", "start"] as const) {
      for (const id of this.bootOrder) {
        const record = this.registry.require(id);
        // Skip modules already failed (optional failures earlier in boot)
        if (record.state === "failed") {
          continue;
        }

        try {
          if (phase === "load") {
            await this.loadOne(record);
          } else if (phase === "initialize") {
            await this.initializeOne(record);
          } else {
            await this.startOne(record);
          }
        } catch (error) {
          const moduleError = this.asModuleError(error, id, phase);
          const isOptional =
            record.optional && !effectiveRequired.has(record.manifest.id);

          this.registry.setState(id, "failed", moduleError);
          this.emit("module.failed", id, "failed", moduleError);

          if (isOptional) {
            failedOptional.push({ moduleId: id, error: moduleError });
            // Remove any partial contributions from a failed optional module
            this.contributions.removeByModule(id);
            continue;
          }

          this.phase = "open";
          return { ok: false, error: moduleError, failedOptional };
        }
      }
    }

    this.phase = "started";
    return {
      ok: true,
      order: [...this.bootOrder],
      failedOptional,
      missingOptional: resolution.missingOptional,
    };
  }

  /**
   * Stop and unload modules in reverse dependency order.
   * Cleanup is best-effort and idempotent; stop failures do not skip unload.
   */
  async shutdown(): Promise<void> {
    if (this.phase !== "started" && this.phase !== "booting") {
      // Allow shutdown from open (no-op) or after partial boot.
      if (this.phase === "shutdown") return;
    }

    this.phase = "shutdown";
    const order = [...this.bootOrder].reverse();

    for (const id of order) {
      const record = this.registry.get(id);
      if (!record) continue;
      if (record.state === "unloaded" || record.state === "registered") continue;
      if (record.state === "failed" && !record.instance) {
        // Never loaded successfully
        this.registry.setState(id, "unloaded");
        continue;
      }

      await this.stopOne(record);
      await this.unloadOne(record);
    }

    // Any remaining modules not in boot order
    for (const record of this.registry.list()) {
      if (record.state !== "unloaded") {
        await this.stopOne(record);
        await this.unloadOne(record);
      }
    }

    this.phase = "shutdown";
  }

  private async loadOne(record: ModuleRecord): Promise<void> {
    this.emit("module.loading", record.manifest.id, record.state);
    const instance = await this.loader.load(record.source);
    this.registry.setInstance(record.manifest.id, instance);

    const context = this.createContext(record);
    if (instance.load) {
      await instance.load(context);
    }

    this.registry.setState(record.manifest.id, "loaded");
    this.emit("module.loaded", record.manifest.id, "loaded");
  }

  private async initializeOne(record: ModuleRecord): Promise<void> {
    this.emit("module.initializing", record.manifest.id, record.state);
    const instance = record.instance;
    if (!instance) {
      throw new ModuleError({
        code: ModuleErrorCode.INVALID_STATE,
        message: "Cannot initialize module before load",
        phase: "initialization",
        moduleId: record.manifest.id,
      });
    }

    const context = this.createContext(record);
    try {
      if (instance.initialize) {
        await instance.initialize(context);
      }
    } catch (error) {
      throw this.asModuleError(error, record.manifest.id, "initialize");
    }

    this.registry.setState(record.manifest.id, "initialized");
    this.emit("module.initialized", record.manifest.id, "initialized");
  }

  private async startOne(record: ModuleRecord): Promise<void> {
    this.emit("module.starting", record.manifest.id, record.state);
    const instance = record.instance;
    if (!instance) {
      throw new ModuleError({
        code: ModuleErrorCode.INVALID_STATE,
        message: "Cannot start module before load",
        phase: "start",
        moduleId: record.manifest.id,
      });
    }

    const context = this.createContext(record);
    try {
      if (instance.start) {
        await instance.start(context);
      }
    } catch (error) {
      throw this.asModuleError(error, record.manifest.id, "start");
    }

    this.registry.setState(record.manifest.id, "started");
    this.emit("module.started", record.manifest.id, "started");
  }

  private async stopOne(record: ModuleRecord): Promise<void> {
    if (
      record.state === "stopped" ||
      record.state === "unloaded" ||
      record.state === "registered" ||
      record.state === "resolved"
    ) {
      return;
    }

    this.emit("module.stopping", record.manifest.id, record.state);
    const instance = record.instance;
    if (instance?.stop) {
      try {
        await instance.stop(this.createContext(record));
      } catch (error) {
        // Idempotent cleanup: report but continue to unload.
        const moduleError = this.asModuleError(error, record.manifest.id, "stop");
        record.lastError = moduleError;
        this.emit("module.failed", record.manifest.id, "failed", moduleError);
      }
    }
    this.registry.setState(record.manifest.id, "stopped");
    this.emit("module.stopped", record.manifest.id, "stopped");
  }

  private async unloadOne(record: ModuleRecord): Promise<void> {
    if (record.state === "unloaded") {
      return;
    }

    this.emit("module.unloading", record.manifest.id, record.state);
    const instance = record.instance;
    if (instance?.unload) {
      try {
        await instance.unload(this.createContext(record));
      } catch (error) {
        const moduleError = this.asModuleError(
          error,
          record.manifest.id,
          "unload",
        );
        record.lastError = moduleError;
        this.emit("module.failed", record.manifest.id, "failed", moduleError);
      }
    }

    this.contributions.removeByModule(record.manifest.id);
    this.registry.setState(record.manifest.id, "unloaded");
    this.emit("module.unloaded", record.manifest.id, "unloaded");
  }

  private createContext(record: ModuleRecord): ModuleContext {
    return {
      moduleId: record.manifest.id,
      config: record.config,
      grantedPermissions: this.grantedPermissions,
      registerContribution: (contribution) => {
        this.contributions.register(record.manifest.id, contribution);
      },
    };
  }

  /**
   * Optional is a composition property, not an excuse for broken dependencies.
   * If a required module hard-depends on an optional module, that chain is required.
   */
  private computeEffectivelyRequired(
    records: readonly ModuleRecord[],
  ): Set<string> {
    const byId = new Map(records.map((r) => [r.manifest.id, r]));
    const required = new Set<string>();

    for (const record of records) {
      if (!record.optional) {
        required.add(record.manifest.id);
      }
    }

    // Walk module dependencies: if A is required and depends on B, B is required.
    let changed = true;
    while (changed) {
      changed = false;
      for (const id of [...required]) {
        const record = byId.get(id);
        if (!record) continue;
        for (const dep of record.manifest.dependencies) {
          if (dep.type !== "module") continue;
          if (dep.optional) continue;
          if (!byId.has(dep.id)) continue;
          if (!required.has(dep.id)) {
            required.add(dep.id);
            changed = true;
          }
        }
        // Capability providers that satisfy a required capability dependency
        // become required if they are the only providers in the composition.
        for (const dep of record.manifest.dependencies) {
          if (dep.type !== "capability" || dep.optional) continue;
          const providers = records.filter((r) =>
            r.manifest.capabilities.includes(dep.id),
          );
          for (const provider of providers) {
            if (!required.has(provider.manifest.id)) {
              required.add(provider.manifest.id);
              changed = true;
            }
          }
        }
      }
    }

    return required;
  }

  private asModuleError(
    error: unknown,
    moduleId: string,
    phase: "load" | "initialize" | "start" | "stop" | "unload",
  ): ModuleError {
    if (error instanceof ModuleError) {
      return error;
    }

    const code =
      phase === "load"
        ? ModuleErrorCode.LOAD_FAILED
        : phase === "initialize"
          ? ModuleErrorCode.INITIALIZATION_FAILED
          : phase === "start"
            ? ModuleErrorCode.START_FAILED
            : phase === "stop"
              ? ModuleErrorCode.STOP_FAILED
              : ModuleErrorCode.UNLOAD_FAILED;

    const lifecyclePhase =
      phase === "initialize"
        ? "initialization"
        : phase === "load"
          ? "load"
          : phase;

    return new ModuleError({
      code,
      message: error instanceof Error ? error.message : String(error),
      phase: lifecyclePhase,
      moduleId,
      cause: error,
    });
  }

  private emit(
    type: ModuleHostEvent["type"],
    moduleId: string,
    state: ModuleState,
    error?: Error,
  ): void {
    if (!this.onEvent) return;
    const event: ModuleHostEvent = {
      type,
      moduleId,
      state,
      timestamp: Date.now(),
      ...(error !== undefined ? { error } : {}),
    };
    this.onEvent(event);
  }
}

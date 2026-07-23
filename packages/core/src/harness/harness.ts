/**
 * Harness — the composed product instance.
 *
 * Owns ModuleHost, configuration, metadata, permissions, environment,
 * contract registries, and the ContributionBinder that populated them.
 *
 * Does NOT own Runtime, Session, Turn, Context, AgentLoop, or AI execution.
 * The Runtime will consume registries from a ready Harness later.
 *
 * Source of truth: docs/HARNESS.md
 */

import type { ContributionBinder } from "../binding/binder.js";
import type { BoundContribution } from "../binding/contribution.js";
import type { ContextBuilderRegistry } from "../context-builder/registry.js";
import type {
  BootResult,
  FailedOptionalModule,
} from "../module/host.js";
import type { ModuleHost } from "../module/host.js";
import type { MissingOptionalDependency } from "../module/resolver.js";
import type { ContributionRegistry } from "../module/contributions.js";
import type { ModuleRecord } from "../module/types.js";
import type { PolicyRegistry } from "../policy/registry.js";
import type { CommandRegistry } from "../registries/command-registry.js";
import type { ProviderRegistry } from "../registries/provider-registry.js";
import type { ToolRegistry } from "../registries/tool-registry.js";
import type { UIRegistry } from "../registries/ui-registry.js";
import type { HarnessConfig } from "./config.js";
import type { HarnessDefinition } from "./definition.js";
import { HarnessError, HarnessErrorCode } from "./errors.js";
import type { HarnessMetadata } from "./metadata.js";

export type HarnessStatus = "ready" | "stopping" | "stopped";

export interface HarnessBootInfo {
  readonly order: readonly string[];
  readonly failedOptional: readonly FailedOptionalModule[];
  readonly missingOptional: readonly MissingOptionalDependency[];
}

export interface HarnessOptions {
  definition: HarnessDefinition;
  moduleHost: ModuleHost;
  bootResult: Extract<BootResult, { ok: true }>;
  registries: {
    providers: ProviderRegistry;
    tools: ToolRegistry;
    commands: CommandRegistry;
    uis: UIRegistry;
    contextBuilders: ContextBuilderRegistry;
    policyHooks: PolicyRegistry;
  };
  binder: ContributionBinder;
}

/**
 * A ready (or stopped) harness composition.
 *
 * Constructed only by HarnessBuilder after successful ModuleHost boot
 * and contribution binding.
 */
export class Harness {
  readonly definition: HarnessDefinition;
  readonly metadata: HarnessMetadata;
  readonly config: HarnessConfig;
  readonly environment: Readonly<Record<string, string>>;
  readonly permissions: ReadonlySet<string>;
  readonly moduleHost: ModuleHost;
  readonly bootInfo: HarnessBootInfo;

  /** Contract registries populated by ContributionBinder. */
  readonly providers: ProviderRegistry;
  readonly tools: ToolRegistry;
  readonly commands: CommandRegistry;
  readonly uis: UIRegistry;
  /** Context builders bound from modules (capability "context.builder"). */
  readonly contextBuilders: ContextBuilderRegistry;
  /** Policy hooks bound from modules (capability "policy.hook"). */
  readonly policyHooks: PolicyRegistry;

  private readonly binder: ContributionBinder;
  private _status: HarnessStatus = "ready";

  constructor(options: HarnessOptions) {
    this.definition = options.definition;
    this.metadata = options.definition.metadata;
    this.config = options.definition.config;
    this.environment = options.definition.environment;
    this.permissions = options.definition.permissions;
    this.moduleHost = options.moduleHost;
    this.bootInfo = Object.freeze({
      order: Object.freeze([...options.bootResult.order]),
      failedOptional: Object.freeze([...options.bootResult.failedOptional]),
      missingOptional: Object.freeze([...options.bootResult.missingOptional]),
    });
    this.providers = options.registries.providers;
    this.tools = options.registries.tools;
    this.commands = options.registries.commands;
    this.uis = options.registries.uis;
    this.contextBuilders = options.registries.contextBuilders;
    this.policyHooks = options.registries.policyHooks;
    this.binder = options.binder;
  }

  get status(): HarnessStatus {
    return this._status;
  }

  /** Modules known to the host, in boot order when available. */
  get modules(): readonly ModuleRecord[] {
    return this.moduleHost.list();
  }

  /** Generic contribution registry owned by ModuleHost. */
  get contributions(): ContributionRegistry {
    return this.moduleHost.contributions;
  }

  /**
   * Introspection over contributions bound into contract registries.
   * Runtime should consume registries; this exists for operators/tests.
   */
  get bindings(): {
    list(): BoundContribution[];
    get(id: string): BoundContribution | undefined;
  } {
    return {
      list: () => this.binder.list(),
      get: (id: string) => this.binder.get(id),
    };
  }

  getModule(id: string): ModuleRecord | undefined {
    return this.moduleHost.get(id);
  }

  /**
   * Stop the harness:
   *   ContributionBinder.unbind → ModuleHost.shutdown
   *
   * Idempotent rejection after stopped — call once.
   */
  async stop(): Promise<void> {
    if (this._status === "stopped") {
      throw new HarnessError({
        code: HarnessErrorCode.INVALID_STATE,
        message: "Harness is already stopped",
        harnessName: this.metadata.name,
      });
    }
    if (this._status === "stopping") {
      throw new HarnessError({
        code: HarnessErrorCode.INVALID_STATE,
        message: "Harness is already stopping",
        harnessName: this.metadata.name,
      });
    }

    this._status = "stopping";
    try {
      // Unbind registries before module teardown so Runtime consumers
      // cannot observe half-live contract registrations.
      this.binder.unbind();
      await this.moduleHost.shutdown();
    } finally {
      this._status = "stopped";
    }
  }
}

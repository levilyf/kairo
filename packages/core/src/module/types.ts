/**
 * Module system contracts.
 *
 * These types are the public surface for module authors and harness composers.
 * They intentionally know nothing about AI, providers, tools, or domains.
 *
 * Source of truth: docs/MODULES.md, docs/CONTRACTS.md, docs/CORE.md
 */

import type { VersionRange } from "./version.js";

/**
 * Lifecycle states for a module known to the host.
 *
 * Discovered is represented only before registration when a discovery source
 * yields metadata; once accepted by the host, the entry is "registered".
 */
export type ModuleState =
  | "registered"
  | "resolved"
  | "loaded"
  | "initialized"
  | "started"
  | "stopped"
  | "unloaded"
  | "failed";

/**
 * A dependency on either a concrete module id or an abstract capability.
 */
export type ModuleDependency =
  | {
      type: "module";
      id: string;
      versionRange?: VersionRange;
      optional?: boolean;
    }
  | {
      type: "capability";
      id: string;
      optional?: boolean;
    };

/**
 * Core contract compatibility declared by a module.
 */
export interface CoreCompatibility {
  min: string;
  max?: string;
}

/**
 * Declarative module metadata (manifest).
 *
 * A well-formed module definition checklist lives in docs/MODULES.md.
 */
export interface ModuleManifest {
  /** Stable unique identifier (namespaced). */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Module semantic version (major.minor.patch). */
  version: string;
  /** Short purpose statement. */
  description: string;
  /**
   * Capabilities this module contributes.
   * Used for capability-based dependency resolution.
   */
  capabilities: string[];
  /** Module and/or capability dependencies. */
  dependencies: ModuleDependency[];
  /** Sensitive powers this module requests. */
  permissions: string[];
  /** Core contract range this module targets. */
  compatibility: CoreCompatibility;
  /**
   * Optional intent declared by the module itself.
   * Harness composition may also mark a registration optional.
   */
  optional?: boolean;
}

/**
 * Context provided to module lifecycle hooks.
 *
 * Intentionally minimal for the Module Host milestone.
 * Future runtime services must be added deliberately as contracts.
 */
export interface ModuleContext {
  moduleId: string;
  /** Harness-provided configuration for this module. */
  config: Readonly<Record<string, unknown>>;
  /** Permissions granted by the harness to this process composition. */
  grantedPermissions: ReadonlySet<string>;
  /**
   * Register a generic contribution against a capability surface.
   *
   * This is not a tool/provider/command registry — those contracts arrive later.
   * It exists so initialization can apply registrations against extension points
   * without the host knowing domain semantics.
   */
  registerContribution(contribution: ContributionInput): void;
}

export interface ContributionInput {
  /** Capability / extension surface name. */
  capability: string;
  /** Stable contribution id (namespaced). */
  id: string;
  /** Opaque value owned by the contributing module. */
  value: unknown;
  /** Optional ordering hint (lower runs earlier when consumers sort). */
  order?: number;
}

export interface ContributionRecord extends ContributionInput {
  moduleId: string;
}

/**
 * Executable module contract.
 *
 * Lifecycle hooks are optional; missing hooks are no-ops.
 * Cleanup hooks must be idempotent and tolerate partial failure.
 */
export interface Module {
  readonly manifest: ModuleManifest;
  load?(context: ModuleContext): void | Promise<void>;
  initialize?(context: ModuleContext): void | Promise<void>;
  start?(context: ModuleContext): void | Promise<void>;
  stop?(context: ModuleContext): void | Promise<void>;
  unload?(context: ModuleContext): void | Promise<void>;
}

/**
 * A discovered/registered source of a module.
 *
 * Discovery yields metadata; loading yields the executable module.
 * The source keeps those steps separate so resolution can run before load.
 */
export interface ModuleSource {
  readonly manifest: ModuleManifest;
  load(): Module | Promise<Module>;
}

/**
 * Host-side record for a registered module.
 */
export interface ModuleRecord {
  readonly manifest: ModuleManifest;
  state: ModuleState;
  readonly optional: boolean;
  readonly config: Readonly<Record<string, unknown>>;
  readonly source: ModuleSource;
  instance?: Module;
  lastError?: Error;
}

/**
 * Options supplied when registering a module with the host.
 */
export interface ModuleRegistrationOptions {
  /** Harness marks this registration optional for boot degradation. */
  optional?: boolean;
  /** Harness-provided configuration values for this module. */
  config?: Record<string, unknown>;
}

/**
 * Diagnostic events emitted by the module host.
 *
 * Full runtime event bus is a later milestone; this is host-local observability.
 */
export type ModuleHostEventType =
  | "module.registered"
  | "module.resolved"
  | "module.loading"
  | "module.loaded"
  | "module.initializing"
  | "module.initialized"
  | "module.starting"
  | "module.started"
  | "module.stopping"
  | "module.stopped"
  | "module.unloading"
  | "module.unloaded"
  | "module.failed";

export interface ModuleHostEvent {
  type: ModuleHostEventType;
  moduleId: string;
  state: ModuleState;
  error?: Error;
  timestamp: number;
}

export type ModuleHostEventListener = (event: ModuleHostEvent) => void;

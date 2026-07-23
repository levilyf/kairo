/**
 * Runtime Event contract.
 *
 * Provider-neutral event model for observation and loose coordination.
 * No event bus implementation in this milestone — contract only.
 *
 * Source of truth: docs/CONTRACTS.md (Runtime Events)
 *
 * Events are not a substitute for policy hooks or tool return values.
 * Headless correctness must not depend on UI-only events.
 */

/** Core event kinds every harness can rely on. */
export const RUNTIME_EVENT_TYPES = [
  "module.registered",
  "module.resolved",
  "module.loaded",
  "module.initialized",
  "module.started",
  "module.stopped",
  "module.unloaded",
  "module.failed",
  "session.created",
  "session.resumed",
  "session.completed",
  "turn.started",
  "turn.completed",
  "provider.called",
  "provider.completed",
  "provider.failed",
  "tool.invoked",
  "tool.completed",
  "tool.failed",
  "command.invoked",
  "command.completed",
  "command.failed",
  "policy.denied",
  "cancelled",
  "error",
  "extension",
] as const;

export type RuntimeEventType = (typeof RUNTIME_EVENT_TYPES)[number];

export type CoreRuntimeEventType = Exclude<RuntimeEventType, "extension">;

/**
 * Shared attribution fields for runtime events.
 */
export interface RuntimeEventBase {
  /** Unique event id. */
  readonly id: string;
  /** Epoch milliseconds. */
  readonly timestamp: number;
  readonly sessionId?: string;
  readonly turnId?: string;
  readonly moduleId?: string;
  readonly data?: Readonly<Record<string, unknown>>;
}

/**
 * Core platform event.
 */
export interface CoreRuntimeEvent extends RuntimeEventBase {
  readonly type: CoreRuntimeEventType;
  readonly data: Readonly<Record<string, unknown>>;
}

/**
 * Namespaced extension event for module/domain channels.
 */
export interface ExtensionRuntimeEvent extends RuntimeEventBase {
  readonly type: "extension";
  /** Module/domain namespace (e.g. "acme.research"). */
  readonly namespace: string;
  /** Event name within the namespace. */
  readonly name: string;
  readonly data: Readonly<Record<string, unknown>>;
}

/**
 * Provider-neutral runtime event.
 */
export type RuntimeEvent = CoreRuntimeEvent | ExtensionRuntimeEvent;

/**
 * Future bus consumer signature (contract only; no bus here).
 */
export type RuntimeEventListener = (event: RuntimeEvent) => void | Promise<void>;

const RUNTIME_EVENT_TYPE_SET = new Set<string>(RUNTIME_EVENT_TYPES);

export function isRuntimeEventType(value: string): value is RuntimeEventType {
  return RUNTIME_EVENT_TYPE_SET.has(value);
}

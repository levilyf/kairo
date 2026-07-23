/**
 * Runtime lifecycle state.
 *
 * Intentionally minimal. Execution services attach later;
 * they must not invent private lifecycle models.
 */

export type RuntimeStatus =
  | "initializing"
  | "ready"
  | "shutting_down"
  | "stopped";

/**
 * Future service slots. Values remain undefined until those milestones land.
 * Runtime coordinates references; it does not implement the services.
 */
export interface RuntimeServices {
  /** Session Manager — not implemented in this milestone. */
  readonly sessions?: unknown;
  /** Runtime Event System wrapper/service — EventBus is exposed directly on Runtime. */
  readonly events?: unknown;
  /** Policy service wrapper — PolicyManager is exposed directly on Runtime. */
  readonly policy?: unknown;
  /** Provider Gateway is first-class on Runtime.providers. */
  readonly providers?: unknown;
  /** Tool Router is first-class on Runtime.tools. */
  readonly tools?: unknown;
  /** Context Assembler is first-class on Runtime.context. */
  readonly context?: unknown;
  /** Agent Loop is first-class on Runtime.agentLoop. */
  readonly agentLoop?: unknown;
}

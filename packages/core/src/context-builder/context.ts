/**
 * ContextBuilderContext — input to a Context Builder contribution.
 *
 * Provider-neutral execution attribution only. Builders must not mutate
 * this object or any existing Context. Assembler will call builders later.
 *
 * Source of truth: docs/CONTRACTS.md (Context Builder)
 */

export interface ContextBuilderContext {
  readonly turnId: string;
  readonly sessionId: string;
  readonly runtimeId: string;
  /** Optional opaque metadata from the turn/request. */
  readonly metadata?: Readonly<Record<string, unknown>>;
  /** Optional cancellation signal for long-running builders. */
  readonly signal?: AbortSignal;
  /** Optional permissions granted to the composition. */
  readonly grantedPermissions?: ReadonlySet<string>;
  /**
   * Optional additional data the assembler may pass later.
   * Domain-specific; builders decide what they care about.
   */
  readonly data?: Readonly<Record<string, unknown>>;
}

/**
 * Policy context — the input to a policy hook evaluation.
 *
 * Describes what is being attempted, by whom, and with what metadata.
 * Domain-neutral: no provider/tool/session specifics in Core.
 */

export interface PolicyContext {
  /** The action being attempted (e.g. "tool.invoke", "provider.call"). */
  readonly action: string;
  /** The subject/resource being acted upon (e.g. tool id, provider id). */
  readonly subject: string;
  /** Optional session attribution. */
  readonly sessionId?: string;
  /** Optional turn attribution. */
  readonly turnId?: string;
  /** Optional module attribution. */
  readonly moduleId?: string;
  /**
   * Arbitrary data the caller provides for hooks to inspect.
   * Domain-specific; hooks decide what they care about.
   */
  readonly data?: Readonly<Record<string, unknown>>;
}

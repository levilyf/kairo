/**
 * Policy decision — the structured result of evaluating policy hooks.
 *
 * Decisions are: allow, deny, or abstain.
 * Abstain means the hook has no opinion on this action.
 *
 * Source of truth: docs/CONTRACTS.md (Policy Hooks)
 */

/**
 * Possible policy verdicts.
 *
 * - allow: action is permitted
 * - deny: action is rejected
 * - abstain: hook has no opinion; defer to others
 */
export type PolicyVerdict = "allow" | "deny" | "abstain";

/**
 * A single hook's decision on a policy evaluation.
 */
export interface HookDecision {
  /** Which hook rendered this decision. */
  readonly hookId: string;
  /** The verdict. */
  readonly verdict: PolicyVerdict;
  /** Human-readable explanation of the decision. */
  readonly reason?: string;
  /** Arbitrary metadata from the hook. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * The aggregate result of evaluating all registered hooks for an action.
 */
export interface PolicyDecision {
  /** Final aggregate verdict. */
  readonly verdict: PolicyVerdict;
  /** True when at least one hook explicitly denied. */
  readonly denied: boolean;
  /** True when at least one hook explicitly allowed. */
  readonly allowed: boolean;
  /** Per-hook decisions in evaluation order. */
  readonly decisions: readonly HookDecision[];
  /** Denial reasons collected from hooks that denied. */
  readonly denyReasons: readonly string[];
  /** The action that was evaluated. */
  readonly action: string;
  /** The subject/resource that was evaluated. */
  readonly subject: string;
}

/**
 * Public result name for PolicyManager.evaluate().
 * Alias kept separate so future docs can distinguish manager result naming
 * without changing the decision structure.
 */
export type PolicyResult = PolicyDecision;

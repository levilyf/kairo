/**
 * Contribution binding types.
 *
 * Modules register opaque contributions on ModuleHost.
 * The binder classifies known capability names into contract registries.
 *
 * Source of truth: docs/MODULES.md (Registration), docs/CORE.md (Registries)
 */

/**
 * Contribution types this binder knows how to wire.
 *
 * Provider / Tool / Command / UI were the original bindable set.
 * ContextBuilder and PolicyHook complete Harness composition for Runtime.
 *
 * Capability strings are the ModuleHost contribution.capability values.
 */
export const BINDABLE_CONTRIBUTION_TYPES = [
  "provider",
  "tool",
  "command",
  "ui",
  "context.builder",
  "policy.hook",
] as const;

export type BindableContributionType =
  (typeof BINDABLE_CONTRIBUTION_TYPES)[number];

const BINDABLE_SET = new Set<string>(BINDABLE_CONTRIBUTION_TYPES);

export function isBindableContributionType(
  value: string,
): value is BindableContributionType {
  return BINDABLE_SET.has(value);
}

/**
 * Lifecycle of a contribution within the binder.
 *
 * discovered → validated → bound → unbound
 *                   ↘ failed
 */
export type BoundContributionState =
  | "discovered"
  | "validated"
  | "bound"
  | "unbound"
  | "failed";

/**
 * A contribution candidate or binding record with module attribution.
 */
export interface BoundContribution {
  /** Contribution id (same as registry id for bindable types). */
  readonly id: string;
  /** Classified contract type when bindable. */
  readonly type: BindableContributionType;
  /** Original capability string from the module contribution. */
  readonly capability: string;
  /** Module that registered the contribution. */
  readonly moduleId: string;
  /** Optional ordering hint from the contribution. */
  readonly order?: number;
  /** Opaque value (contract implementation when bound). */
  readonly value: unknown;
  readonly state: BoundContributionState;
}

/**
 * Non-bindable or skipped contribution (e.g. future/generic capabilities).
 */
export interface SkippedContribution {
  readonly id: string;
  readonly capability: string;
  readonly moduleId: string;
  readonly reason: "unbindable_capability";
}

export interface BindingResult {
  readonly bound: readonly BoundContribution[];
  readonly skipped: readonly SkippedContribution[];
}

export interface BindingIssue {
  readonly code: string;
  readonly message: string;
  readonly moduleId: string;
  readonly contributionId: string;
  readonly contributionType?: BindableContributionType | string;
  readonly capability: string;
  readonly cause?: unknown;
}

export interface BindingValidationReport {
  readonly ok: boolean;
  readonly candidates: readonly BoundContribution[];
  readonly skipped: readonly SkippedContribution[];
  readonly issues: readonly BindingIssue[];
}

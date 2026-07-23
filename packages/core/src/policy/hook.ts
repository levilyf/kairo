/**
 * PolicyHook — a replaceable policy implementation.
 *
 * Core owns the hook interface. Modules/harnesses own implementations.
 * Hooks evaluate a PolicyContext and return a verdict.
 *
 * Source of truth: docs/CONTRACTS.md (Policy Hooks), docs/CORE.md §11
 */

import type { PolicyContext } from "./context.js";
import type { PolicyVerdict } from "./decision.js";
import { PolicyError, PolicyErrorCode } from "./errors.js";

/**
 * Result returned by a single hook evaluation.
 */
export interface PolicyHookResult {
  readonly verdict: PolicyVerdict;
  readonly reason?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * A policy hook implementation.
 *
 * Hooks are registered by modules or harnesses.
 * Core provides gate locations; implementations provide logic.
 */
export interface PolicyHook {
  /** Unique hook identity. */
  readonly id: string;
  /** Human-readable description. */
  readonly description?: string;
  /**
   * Actions this hook applies to.
   * If undefined or empty, the hook applies to all actions.
   */
  readonly actions?: readonly string[];
  /**
   * Explicit ordering priority. Lower numbers run first.
   * Default is 100. Ties are broken by registration order.
   */
  readonly priority?: number;
  /** Optional module attribution. */
  readonly moduleId?: string;
  /**
   * Evaluate the hook for the given context.
   *
   * Must return a verdict. May be async.
   * Must not mutate Runtime internals.
   */
  evaluate(context: PolicyContext): PolicyHookResult | Promise<PolicyHookResult>;
}

/**
 * Validate a PolicyHook contract value.
 * Used by ContributionBinder before registration.
 */
export function assertPolicyHook(value: unknown): asserts value is PolicyHook {
  if (!isPlainObject(value)) {
    throw new PolicyError({
      code: PolicyErrorCode.INVALID_HOOK,
      message: "PolicyHook must be an object",
    });
  }

  if (typeof value.id !== "string" || value.id.trim().length === 0) {
    throw new PolicyError({
      code: PolicyErrorCode.INVALID_HOOK,
      message: "id must be a non-empty string",
      ...(typeof value.id === "string" ? { hookId: value.id } : {}),
    });
  }

  if (typeof value.evaluate !== "function") {
    throw new PolicyError({
      code: PolicyErrorCode.INVALID_HOOK,
      message: "evaluate must be a function",
      hookId: value.id,
    });
  }

  if (
    value.priority !== undefined &&
    (typeof value.priority !== "number" || !Number.isFinite(value.priority))
  ) {
    throw new PolicyError({
      code: PolicyErrorCode.INVALID_HOOK,
      message: "priority must be a finite number when provided",
      hookId: value.id,
    });
  }

  if (value.actions !== undefined) {
    if (!Array.isArray(value.actions)) {
      throw new PolicyError({
        code: PolicyErrorCode.INVALID_HOOK,
        message: "actions must be an array when provided",
        hookId: value.id,
      });
    }
    for (const action of value.actions) {
      if (typeof action !== "string") {
        throw new PolicyError({
          code: PolicyErrorCode.INVALID_HOOK,
          message: "actions entries must be strings",
          hookId: value.id,
        });
      }
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

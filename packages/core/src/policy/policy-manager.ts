/**
 * PolicyManager — coordinates policy hook evaluation.
 *
 * Core owns enforcement points. PolicyManager coordinates hooks only.
 * It does not implement policy logic.
 *
 * Evaluation strategy:
 * - Hooks are evaluated in priority order (ascending), then registration order.
 * - Any deny stops evaluation immediately (short-circuit).
 * - If all hooks allow or abstain with at least one allow, final verdict is allow.
 * - If all hooks abstain, final verdict is abstain (no opinion).
 * - Errors in hooks are isolated and attributed.
 *
 * "Must never fail open by default for dangerous actions when policy is
 * configured to enforce." — docs/CONTRACTS.md
 *
 * Source of truth: docs/CORE.md §11, docs/CONTRACTS.md (Policy Hooks)
 */

import type { PolicyContext } from "./context.js";
import type { HookDecision, PolicyResult } from "./decision.js";
import { PolicyError, PolicyErrorCode } from "./errors.js";
import type { PolicyHook } from "./hook.js";
import { PolicyRegistry } from "./registry.js";

export interface PolicyManagerOptions {
  /**
   * Error handler for hook evaluation failures.
   * When a hook throws, this is called. The hook's verdict becomes "deny"
   * (fail-closed) unless the handler returns a different decision.
   */
  readonly onHookError?: ((error: unknown, hook: PolicyHook, context: PolicyContext) => void) | undefined;
}

export class PolicyManager {
  readonly registry: PolicyRegistry;
  private readonly onHookError?: ((error: unknown, hook: PolicyHook, context: PolicyContext) => void) | undefined;
  private _closed = false;

  constructor(options: PolicyManagerOptions = {}) {
    this.registry = new PolicyRegistry();
    this.onHookError = options.onHookError;
  }

  get closed(): boolean {
    return this._closed;
  }

  /**
   * Evaluate all applicable hooks for the given context.
   *
   * Returns a structured PolicyDecision.
   *
   * Evaluation rules:
   * - Hooks run in priority order (ascending), then registration order.
   * - First deny short-circuits: no further hooks are evaluated.
   * - Hook errors are fail-closed (treated as deny).
   * - All abstain → verdict is abstain.
   * - At least one allow + no deny → verdict is allow.
   */
  async evaluate(context: PolicyContext): Promise<PolicyResult> {
    if (this._closed) {
      throw new PolicyError({
        code: PolicyErrorCode.MANAGER_CLOSED,
        message: "Cannot evaluate: policy manager is closed",
        action: context.action,
      });
    }

    const hooks = this.registry.resolve(context.action);
    const decisions: HookDecision[] = [];
    const denyReasons: string[] = [];
    let hasAllow = false;
    let hasDeny = false;

    for (const hook of hooks) {
      let decision: HookDecision;

      try {
        const result = await hook.evaluate(context);
        decision = {
          hookId: hook.id,
          verdict: result.verdict,
          ...(result.reason !== undefined ? { reason: result.reason } : {}),
          ...(result.metadata !== undefined
            ? { metadata: result.metadata }
            : {}),
        };
      } catch (error) {
        // Fail-closed: hook errors become deny.
        if (this.onHookError) {
          this.onHookError(error, hook, context);
        }

        const reason =
          error instanceof Error
            ? `Hook "${hook.id}" failed: ${error.message}`
            : `Hook "${hook.id}" failed`;

        decision = {
          hookId: hook.id,
          verdict: "deny",
          reason,
          metadata: { error: true },
        };
      }

      decisions.push(decision);

      if (decision.verdict === "allow") {
        hasAllow = true;
      } else if (decision.verdict === "deny") {
        hasDeny = true;
        if (decision.reason) {
          denyReasons.push(decision.reason);
        }
        // Short-circuit on first deny.
        break;
      }
      // abstain: continue
    }

    let verdict: "allow" | "deny" | "abstain";
    if (hasDeny) {
      verdict = "deny";
    } else if (hasAllow) {
      verdict = "allow";
    } else {
      verdict = "abstain";
    }

    return {
      verdict,
      denied: hasDeny,
      allowed: hasAllow,
      decisions,
      denyReasons,
      action: context.action,
      subject: context.subject,
    };
  }

  /**
   * Close the policy manager. Closes the registry and rejects future evaluations.
   * Idempotent.
   */
  close(): void {
    if (this._closed) return;
    this._closed = true;
    this.registry.close();
  }
}

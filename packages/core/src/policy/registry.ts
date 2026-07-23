/**
 * PolicyRegistry — catalog of registered policy hooks.
 *
 * Passive registry: accepts registrations, resolves hooks by action,
 * enforces uniqueness, supports removal. Does not evaluate.
 *
 * Ordering: hooks are sorted by priority (ascending), then registration order.
 */

import type { PolicyHook } from "./hook.js";
import { PolicyError, PolicyErrorCode } from "./errors.js";

const DEFAULT_PRIORITY = 100;

export class PolicyRegistry {
  private readonly hooks: PolicyHook[] = [];
  private readonly hookIds = new Set<string>();
  private _closed = false;

  get closed(): boolean {
    return this._closed;
  }

  get size(): number {
    return this.hooks.length;
  }

  /**
   * Register a policy hook.
   *
   * Throws on duplicate id or closed registry.
   */
  register(hook: PolicyHook): void {
    if (this._closed) {
      throw new PolicyError({
        code: PolicyErrorCode.MANAGER_CLOSED,
        message: "Cannot register hook: policy registry is closed",
        hookId: hook.id,
      });
    }

    if (!hook.id || typeof hook.id !== "string") {
      throw new PolicyError({
        code: PolicyErrorCode.INVALID_HOOK,
        message: "Policy hook must have a non-empty string id",
      });
    }

    if (typeof hook.evaluate !== "function") {
      throw new PolicyError({
        code: PolicyErrorCode.INVALID_HOOK,
        message: "Policy hook must have an evaluate function",
        hookId: hook.id,
      });
    }

    if (this.hookIds.has(hook.id)) {
      throw new PolicyError({
        code: PolicyErrorCode.DUPLICATE_HOOK,
        message: `Policy hook "${hook.id}" is already registered`,
        hookId: hook.id,
      });
    }

    this.hookIds.add(hook.id);
    this.hooks.push(hook);
  }

  /**
   * Remove a hook by id. Returns true if removed, false if not found.
   * Idempotent.
   */
  remove(hookId: string): boolean {
    const idx = this.hooks.findIndex((h) => h.id === hookId);
    if (idx === -1) return false;
    this.hooks.splice(idx, 1);
    this.hookIds.delete(hookId);
    return true;
  }

  /**
   * Get a hook by id, or undefined.
   */
  get(hookId: string): PolicyHook | undefined {
    return this.hooks.find((h) => h.id === hookId);
  }

  /**
   * Resolve hooks that apply to the given action, sorted by priority
   * (ascending), then by registration order for equal priorities.
   */
  resolve(action: string): readonly PolicyHook[] {
    const applicable = this.hooks.filter(
      (h) =>
        h.actions === undefined ||
        h.actions.length === 0 ||
        h.actions.includes(action),
    );

    return applicable.slice().sort((a, b) => {
      const pa = a.priority ?? DEFAULT_PRIORITY;
      const pb = b.priority ?? DEFAULT_PRIORITY;
      if (pa !== pb) return pa - pb;
      // Stable sort: registration order as tiebreak.
      return applicable.indexOf(a) - applicable.indexOf(b);
    });
  }

  /**
   * List all registered hooks.
   */
  list(): readonly PolicyHook[] {
    return [...this.hooks];
  }

  /**
   * Close the registry. No further registrations.
   * Idempotent.
   */
  close(): void {
    this._closed = true;
  }

  /**
   * Remove all hooks and reset state.
   */
  clear(): void {
    this.hooks.length = 0;
    this.hookIds.clear();
  }
}

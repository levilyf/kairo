/**
 * Cancellation root for a Runtime instance.
 *
 * Core owns cancellation / abort propagation expectations at the platform level
 * (docs/CONTRACTS.md, docs/CORE.md). This milestone provides only the root
 * AbortController scope. Session/turn-scoped children attach later.
 *
 * No AI execution, no provider/tool wiring.
 */

import { RuntimeError, RuntimeErrorCode } from "./errors.js";

export class CancellationRoot {
  private readonly controller = new AbortController();
  private _reason: unknown;

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  get aborted(): boolean {
    return this.controller.signal.aborted;
  }

  get reason(): unknown {
    return this._reason;
  }

  /**
   * Abort the root scope. Idempotent: subsequent calls are no-ops.
   */
  abort(reason?: unknown): void {
    if (this.controller.signal.aborted) {
      return;
    }
    this._reason = reason;
    this.controller.abort(reason);
  }

  /**
   * Create a child AbortSignal linked to this root.
   * Throws if the root is already aborted.
   */
  child(): { signal: AbortSignal; abort: (reason?: unknown) => void } {
    if (this.controller.signal.aborted) {
      throw new RuntimeError({
        code: RuntimeErrorCode.CANCELLED,
        message: "Cannot create cancellation child: runtime root is aborted",
        details: { reason: this._reason },
      });
    }

    const child = new AbortController();
    const onAbort = () => {
      if (!child.signal.aborted) {
        child.abort(this.controller.signal.reason ?? this._reason);
      }
    };

    if (this.controller.signal.aborted) {
      onAbort();
    } else {
      this.controller.signal.addEventListener("abort", onAbort, { once: true });
    }

    return {
      signal: child.signal,
      abort: (reason?: unknown) => {
        if (!child.signal.aborted) {
          child.abort(reason);
        }
      },
    };
  }
}

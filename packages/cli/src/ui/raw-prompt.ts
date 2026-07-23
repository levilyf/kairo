/**
 * Shared low-level prompt reader.
 *
 * Both the public `prompt()` helper and the connected-tree flow in
 * `flow.ts` end up asking the same question: read one line from
 * `ctx.stdin`, trim it, apply a default-or-required policy, and
 * re-ask on validation failures. Rather than duplicate that logic
 * inside the flow primitive, it lives here. `prompt()` continues
 * to render its own label/blank-line layout for non-flow callers
 * (and for the suite of existing prompt tests).
 *
 * The helper NEVER renders the question label or any layout — the
 * caller decides how to decorate the screen. The only outputs the
 * helper writes itself are the feedback lines (e.g. "Required" or
 * "Choose 1-N") on validation retries. This keeps the layout
 * responsibility with the caller, where it belongs.
 */

import type { CLIContext } from "../context.js";
import { CLIError, CLIErrorCode } from "../errors.js";

export interface RawPromptOptions {
  readonly default?: string;
  readonly required?: { readonly message: string };
}

/** Returns a function bound to `ctx` that reads one trimmed line. */
export function makeRawPromptReader(ctx: CLIContext): (label: string, opts?: RawPromptOptions) => Promise<string> {
  return async (label: string, opts: RawPromptOptions = {}): Promise<string> => {
    let value: string;
    try {
      const raw = await ctx.stdin(label);
      // EOF at a setup prompt is treated as cancel, not an empty answer.
      if (raw === null) {
        throw new CLIError({
          code: CLIErrorCode.USER_CANCELLED,
          message: "Prompt interrupted",
        });
      }
      value = raw;
    } catch (cause) {
      if (cause instanceof CLIError) throw cause;
      throw new CLIError({
        code: CLIErrorCode.USER_CANCELLED,
        message: "Prompt interrupted",
        ...(cause instanceof Error ? { cause } : {}),
      });
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      if (opts.required !== undefined) {
        ctx.stdout(opts.required.message);
        return makeRawPromptReader(ctx)(label, opts);
      }
      if (opts.default !== undefined) return opts.default;
      return "";
    }
    return trimmed;
  };
}

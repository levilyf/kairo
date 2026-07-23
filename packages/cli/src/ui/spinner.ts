/**
 * Spinner — the one place in the CLI that mutates the terminal in place.
 *
 * Used for short-lived async work (loading config, bootstrapping app).
 * Renders on stderr (so it does not pollute captured stdout), erases
 * itself on success or failure, and never animates in non-TTY mode
 * (where progress is instead shown as a static "Loading ..." line).
 *
 * Kept deliberately tiny: no animation frames, no nested frames. Just
 * a single `⠋ Loading` line that gets cleared and replaced by `✓ ...`
 * or `✕ ...` when complete.
 */

import type { CLIContext } from "../context.js";
import {
  success as renderSuccess,
  errorLine as renderError,
} from "./text.js";

export interface Spinner {
  /** Stops the spinner without printing success/error. */
  readonly stop: () => void;
  /** Stops the spinner and prints a success marker. */
  readonly succeed: (message: string) => void;
  /** Stops the spinner and prints an error marker. */
  readonly fail: (message: string) => void;
}

/**
 * Begins a spinner for `message`. The returned handle has `succeed` /
 * `fail` / `stop`. In non-TTY mode behaves as a no-op (no progress line
 * printed) so captured stdout/stderr stays clean for tests.
 */
export function startSpinner(ctx: CLIContext, message: string): Spinner {
  if (!ctx.isTTY) {
    return {
      stop() {},
      succeed(m) {
        renderSuccess(ctx, m);
      },
      fail(m) {
        renderError(ctx, m);
      },
    };
  }
  // TTY: write "⠋ <message>" then remember the line length so the
  // caller can clear it via succeed()/fail(). We use a `\r` carriage
  // return so the line is rewritten rather than scrolled.
  const eraseLine = "\r\x1b[K";
  ctx.stderr(`${eraseLine}⠋ ${message}`);
  let stopped = false;
  function stop() {
    if (stopped) return;
    stopped = true;
    ctx.stderr(eraseLine);
  }
  function succeed(m: string) {
    if (stopped) return;
    stop();
    renderSuccess(ctx, m);
  }
  function fail(m: string) {
    if (stopped) return;
    stop();
    renderError(ctx, m);
  }
  return { stop, succeed, fail };
}

/**
 * Convenience: wraps a Promise in a spinner lifecycle.
 *
 * In non-TTY mode prints the start + success/error lines statically
 * (no carriage returns), keeping captured output stable for tests.
 */
export async function withSpinner<T>(
  ctx: CLIContext,
  message: string,
  doneMessage: string,
  work: () => Promise<T>,
): Promise<T> {
  const spinner = startSpinner(ctx, message);
  try {
    const value = await work();
    spinner.succeed(doneMessage);
    return value;
  } catch (error) {
    spinner.fail(message);
    throw error;
  }
}

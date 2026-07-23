/**
 * Prompt component — minimal interactive line question.
 *
 * The Kairo design language for prompts: short label, blank line,
 * bare `>` cursor on the next line, no conversational filler, no
 * giant boxes. E.g.
 *
 *   API Key
 *
 *   >
 *
 * Prompts forward the prompt label to the supplied `stdin` reader
 * (the production reader renders the line itself; tests inject a
 * canned reader whose render is ignored).
 *
 * `cancel()` is thrown by the reader on Ctrl-C; commands bubble the
 * rejection up unchanged so the program-level error handler maps it to
 * CLIError(USER_CANCELLED).
 */

import type { CLIContext } from "../context.js";
import { CLIError, CLIErrorCode } from "../errors.js";
import { makeRawPromptReader } from "./raw-prompt.js";

export interface PromptOptions {
  /** When a submitted value is the empty string, fall back to this. */
  readonly default?: string;
  /**
   * When set, empty inputs are rejected with `message`. Use for
   * required fields (e.g. API keys for paid providers).
   */
  readonly required?: { readonly message: string };
}

/** Asks the user a single short question. Returns the trimmed answer. */
export async function prompt(
  ctx: CLIContext,
  label: string,
  options: PromptOptions = {},
): Promise<string> {
  ctx.stdout("");
  ctx.stdout(label);
  ctx.stdout("");
  return makeRawPromptReader(ctx)(label, options);
}

/**
 * Single-select prompt.
 *
 * Renders the question, then numbered options. Caller maps a
 * zero-based index to an action. Empty/whitespace input cancels via
 * CLIError(USER_CANCELLED).
 */
export async function select(
  ctx: CLIContext,
  question: string,
  options: readonly string[],
): Promise<number> {
  ctx.stdout("");
  ctx.stdout(question);
  ctx.stdout("");
  for (let i = 0; i < options.length; i += 1) {
    ctx.stdout(`  ${i + 1}  ${options[i]}`);
  }
  ctx.stdout("");
  const raw = await ctx.stdin(question);
  if (raw === null) {
    throw new CLIError({
      code: CLIErrorCode.USER_CANCELLED,
      message: "Cancelled",
    });
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new CLIError({
      code: CLIErrorCode.USER_CANCELLED,
      message: "Cancelled",
    });
  }
  const n = Number(trimmed);
  if (Number.isInteger(n) && n >= 1 && n <= options.length) {
    return n - 1;
  }
  ctx.stdout(`Choose 1-${options.length}.`);
  return select(ctx, question, options);
}

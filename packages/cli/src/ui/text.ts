/**
 * Layout & typography components.
 *
 * All prose output flows through these helpers so the whole CLI shares
 * one visual language: sectioned headings, indented body lines, and
 * status markers (✓ / • / ✕). The milestone brief is explicit about
 * avoiding decorated boxes (`====` banners) — we use blank-line spacing
 * and a single `Heading` accent treatment instead.
 *
 * Conventions used everywhere below:
 *   - Headings render in accent color, no underline, with one blank
 *     line both before and after.
 *   - Body lines render plain, indented two spaces when nested under a
 *     heading.
 *   - Status markers: success uses ✓, neutral uses •, error uses ✕.
 *   - All output is line-oriented; no screen-clearing, no full redraw,
 *     no flicker.
 */

import type { CLIContext } from "../context.js";
import { selectTheme } from "./color.js";

/** A short heading line. Renders with leading + trailing blank line. */
export function heading(ctx: CLIContext, text: string): void {
  const theme = selectTheme(ctx.isTTY);
  ctx.stdout("");
  ctx.stdout(theme.accentBold(text));
  ctx.stdout("");
}

/**
 * A body line. Indented two spaces by default; pass `indent: 0` for a
 * flush line.
 */
export function text(
  ctx: CLIContext,
  body: string,
  options: { readonly indent?: number } = {},
): void {
  const indent = options.indent ?? 2;
  ctx.stdout(`${" ".repeat(indent)}${body}`);
}

/** A muted secondary line. */
export function muted(ctx: CLIContext, body: string): void {
  const theme = selectTheme(ctx.isTTY);
  ctx.stdout(`  ${theme.muted(body)}`);
}

/** A single-line success marker. */
export function success(ctx: CLIContext, body: string): void {
  const theme = selectTheme(ctx.isTTY);
  ctx.stdout(`  ${theme.success("✓")} ${body}`);
}

/** A single-line warning marker. */
export function warning(ctx: CLIContext, body: string): void {
  const theme = selectTheme(ctx.isTTY);
  ctx.stdout(`  ${theme.warning("•")} ${body}`);
}

/** A single-line error marker. */
export function errorLine(ctx: CLIContext, body: string): void {
  const theme = selectTheme(ctx.isTTY);
  ctx.stdout(`  ${theme.error("✕")} ${body}`);
}

/** A subtle separator — a single muted line, not a decorative rule. */
export function separator(ctx: CLIContext): void {
  ctx.stdout("");
}

/**
 * A named key/value pair rendered as `key    value` aligned. Used for
 * summary panels (e.g. doctor).
 */
export function kv(ctx: CLIContext, key: string, value: string): void {
  const theme = selectTheme(ctx.isTTY);
  ctx.stdout(`  ${theme.muted(key.padEnd(14))} ${value}`);
}

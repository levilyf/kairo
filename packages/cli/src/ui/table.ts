/**
 * Aligned table component (no ASCII borders).
 *
 * The milestone brief is explicit: tables must be clean, aligned,
 * borderless. We render a header row + separator (two spaces) + body
 * rows, each cell padded so columns line up.
 *
 * Usage:
 *   table(ctx, {
 *     columns: ["Provider", "Models", "Default"],
 *     rows: [
 *       ["NVIDIA", "4", "kimi-k2"],
 *       ["OpenRouter", "8", "gpt-5"],
 *     ],
 *   });
 *
 * Renders indented two spaces so tables visually nest under their
 * section header.
 */

import type { CLIContext } from "../context.js";
import { selectTheme } from "./color.js";
import { heading, text, muted } from "./text.js";

export interface TableSpec {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

function computeWidths(spec: TableSpec): number[] {
  const widths = spec.columns.map((c) => c.length);
  for (const row of spec.rows) {
    for (let i = 0; i < row.length; i += 1) {
      const cell = row[i] ?? "";
      if (i < widths.length && cell.length > widths[i]!) {
        widths[i] = cell.length;
      }
    }
  }
  return widths;
}

function formatRow(cells: readonly string[], widths: readonly number[]): string {
  const parts: string[] = [];
  for (let i = 0; i < widths.length; i += 1) {
    const cell = cells[i] ?? "";
    parts.push(cell.padEnd(widths[i]!));
  }
  return parts.join("  ");
}

/** Renders an aligned, borderless table. */
export function table(ctx: CLIContext, spec: TableSpec): void {
  if (spec.columns.length === 0) return;
  const theme = selectTheme(ctx.isTTY);
  const widths = computeWidths(spec);

  // Header
  const header = formatRow(spec.columns, widths);
  ctx.stdout(`  ${theme.muted(header)}`);

  // Body
  for (const row of spec.rows) {
    ctx.stdout(`  ${formatRow(row, widths)}`);
  }
}

/** Renders the empty-state row: "No <noun> have been configured." */
export function emptyState(
  ctx: CLIContext,
  noun: string,
  hint?: string,
): void {
  muted(ctx, `No ${noun} have been configured.`);
  if (hint !== undefined && hint.length > 0) {
    ctx.stdout("");
    heading(ctx, "Run");
    text(ctx, hint);
  }
}

/**
 * Logo renderer — the one decorative element the Kairo CLI uses.
 *
 * The official Kairo blockmark. Shown only at high-value moments:
 * `--help`, `--version`, and interactive startup. Never before every
 * command, never as section decoration, never alongside a sub-command.
 *
 * The art is a fixed multiline string kept verbatim from the milestone
 * brief so any future re-rendering tweak stays here in one place.
 */

import type { CLIContext } from "../context.js";
import { selectTheme } from "./color.js";

/** The Kairo logo blockmark. */
export const LOGO_LINES: readonly string[] = Object.freeze([
  "▛▀▀▀▜  ██ ▄█▀  ▄▄▄  ▄▄ ▄▄▄▄   ▄▄▄",
  "▌ ▐    ████   ██▀██ ██ ██▄█▄ ██▀██",
  "▙▄▄▄▟  ██ ▀█▄ ██▀██ ██ ██ ██ ▀███▀",
]);

export const LOGO_TAGLINE = "Make your own AI harness";

/**
 * Renders the logo + tagline + version.
 *
 * Layout, in order:
 *   <blank>
 *   [logo block, accent color on supported terminals]
 *   <blank>
 *   <tagline>          — accent color (subtle)
 *   <version>          — muted
 *   <blank>
 *
 * The caller decides whether to follow with sections or other content.
 */
export function renderLogo(ctx: CLIContext, version: string): void {
  const theme = selectTheme(ctx.isTTY);
  ctx.stdout("");
  for (const line of LOGO_LINES) {
    ctx.stdout(theme.accent(line));
  }
  ctx.stdout("");
  ctx.stdout(theme.accent(LOGO_TAGLINE));
  ctx.stdout(theme.muted(version));
  ctx.stdout("");
}

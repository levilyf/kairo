/**
 * ANSI color helpers.
 *
 * A single source of truth for the Kairo CLI accent palette. Colors are
 * applied via thin helper functions that return plain strings without
 * escape codes when color is disabled, so the same formatting code path
 * works in a monochrome terminal and a golf-course TTY.
 *
 * Accent:  purple/indigo (bold + dim variants)
 * Success: green
 * Warning: yellow
 * Error:   red
 * Muted:   gray
 *
 * No other colors. No background fills. No decorated boxes.
 */

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

const PURPLE = "\x1b[38;5;141m"; // muted indigo/violet
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const GRAY = "\x1b[90m";

export interface ColorTheme {
  readonly accent: (text: string) => string;
  readonly accentBold: (text: string) => string;
  readonly success: (text: string) => string;
  readonly warning: (text: string) => string;
  readonly error: (text: string) => string;
  readonly muted: (text: string) => string;
}

function paint(code: string, text: string): string {
  return `${code}${text}${RESET}`;
}

/** Theme that emits ANSI escape codes. */
export const colorTheme: ColorTheme = {
  accent: (t) => paint(PURPLE, t),
  accentBold: (t) => paint(`${BOLD}${PURPLE}`, t),
  success: (t) => paint(GREEN, t),
  warning: (t) => paint(YELLOW, t),
  error: (t) => paint(RED, t),
  muted: (t) => paint(`${DIM}${GRAY}`, t),
};

/** Theme that strips all color (monochrome terminal / piped output). */
export const plainTheme: ColorTheme = {
  accent: (t) => t,
  accentBold: (t) => t,
  success: (t) => t,
  warning: (t) => t,
  error: (t) => t,
  muted: (t) => t,
};

/** Pick a theme based on whether color should be used. */
export function selectTheme(useColor: boolean): ColorTheme {
  return useColor ? colorTheme : plainTheme;
}

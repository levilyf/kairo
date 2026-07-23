/**
 * Per-command interface.
 *
 * Every command is an async function of (CLIContext) -> exitCode.
 * Commands set to 0 on success and throw CLIError with their preferred
 * exit code on failure. The program-level runner catches CLIError to
 * print + exit, and any other error to print a generic diagnostic.
 *
 * Each command also exports metadata (name, summary, usage) used by
 * the help command to render the command tree.
 */

import type { CLIContext } from "../context.js";

export interface CommandMetadata {
  readonly name: string;
  readonly summary: string;
  /** Full usage signature shown under --help for the specific command. */
  readonly usage?: string;
  /** Optional longer description for help output. */
  readonly description?: string;
}

export interface Command {
  readonly metadata: CommandMetadata;
  readonly run: (ctx: CLIContext) => Promise<number>;
}

export type CommandExit = 0 | 1;

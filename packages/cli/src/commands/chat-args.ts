/**
 * Argument parsing for `kairo chat`.
 *
 * Flags (all optional):
 *   --model <id>       model id (default: registry getDefault())
 *   --provider <id>    force provider selection
 *   --resume [id|last] resume a JSONL session (bare --resume ⇒ last)
 *
 * Fail closed on unknown flags / missing values.
 */

import { CLIError, CLIErrorCode } from "../errors.js";

export interface ChatCommandArgs {
  readonly model?: string;
  readonly providerId?: string;
  /** When set, resume that session id ("last" resolves in @kairo/chat). */
  readonly resume?: string;
}

/**
 * Parse chat command args (everything after `kairo chat`).
 */
export function parseChatArgs(args: readonly string[]): ChatCommandArgs {
  let model: string | undefined;
  let providerId: string | undefined;
  let resume: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const token = args[i]!;
    if (token === "--model" || token === "-m") {
      const value = args[++i];
      if (value === undefined || value.startsWith("-")) {
        throw new CLIError({
          code: CLIErrorCode.UNKNOWN_COMMAND,
          message: `${token} requires a model id`,
          hint: "Run: kairo chat --help",
        });
      }
      model = value;
      continue;
    }
    if (token === "--provider" || token === "-p") {
      const value = args[++i];
      if (value === undefined || value.startsWith("-")) {
        throw new CLIError({
          code: CLIErrorCode.UNKNOWN_COMMAND,
          message: `${token} requires a provider id`,
          hint: "Run: kairo chat --help",
        });
      }
      providerId = value;
      continue;
    }
    if (token === "--resume" || token === "-r") {
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        resume = next;
        i += 1;
      } else {
        resume = "last";
      }
      continue;
    }
    if (token === "--help" || token === "-h") {
      // Handled by caller if needed; treat as unknown for pure parse,
      // or allow through — chat command checks help before parse.
      throw new CLIError({
        code: CLIErrorCode.UNKNOWN_COMMAND,
        message: "Unexpected --help in parseChatArgs",
        hint: "Run: kairo chat --help",
      });
    }
    if (token.startsWith("-")) {
      throw new CLIError({
        code: CLIErrorCode.UNKNOWN_COMMAND,
        message: `Unknown flag: ${token}`,
        hint: "Run: kairo chat --help",
      });
    }
    throw new CLIError({
      code: CLIErrorCode.UNKNOWN_COMMAND,
      message: `Unexpected argument: ${token}`,
      hint: "Run: kairo chat --help",
    });
  }

  return {
    ...(model !== undefined ? { model } : {}),
    ...(providerId !== undefined ? { providerId } : {}),
    ...(resume !== undefined ? { resume } : {}),
  };
}

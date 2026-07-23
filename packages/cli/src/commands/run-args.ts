/**
 * Argument parsing for `kairo run`.
 *
 * Shape:
 *   kairo run <prompt...> [--model <id>] [--provider <id>]
 *
 * The prompt is positional. All non-flag tokens are joined with single
 * spaces so `kairo run summarize the readme` works without quoting, while
 * `kairo run "summarize the readme"` works too. Flags may appear before,
 * between, or after prompt words.
 *
 * Fail closed on unknown flags and missing flag values. A missing prompt
 * is NOT a parse error here — the command decides how to surface it
 * (MISSING_PROMPT) so `kairo run` with no args can print usage.
 */

import { CLIError, CLIErrorCode } from "../errors.js";

export interface RunCommandArgs {
  /** The joined positional prompt (may be empty when none supplied). */
  readonly prompt: string;
  /** Model id override (default: config/registry default). */
  readonly model?: string;
  /** Force provider selection. */
  readonly providerId?: string;
  /** True when `--help`/`-h` was requested. */
  readonly help: boolean;
}

/** Parse run command args (everything after `kairo run`). */
export function parseRunArgs(args: readonly string[]): RunCommandArgs {
  const promptWords: string[] = [];
  let model: string | undefined;
  let providerId: string | undefined;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const token = args[i]!;
    if (token === "--help" || token === "-h") {
      help = true;
      continue;
    }
    if (token === "--model" || token === "-m") {
      const value = args[++i];
      if (value === undefined || value.startsWith("-")) {
        throw new CLIError({
          code: CLIErrorCode.UNKNOWN_COMMAND,
          message: `${token} requires a model id`,
          hint: "Run: kairo run --help",
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
          hint: "Run: kairo run --help",
        });
      }
      providerId = value;
      continue;
    }
    if (token === "--") {
      // Everything after `--` is prompt text, verbatim.
      for (let j = i + 1; j < args.length; j++) {
        promptWords.push(args[j]!);
      }
      break;
    }
    if (token.startsWith("-") && token.length > 1) {
      throw new CLIError({
        code: CLIErrorCode.UNKNOWN_COMMAND,
        message: `Unknown flag: ${token}`,
        hint: "Run: kairo run --help",
      });
    }
    promptWords.push(token);
  }

  return {
    prompt: promptWords.join(" ").trim(),
    ...(model !== undefined ? { model } : {}),
    ...(providerId !== undefined ? { providerId } : {}),
    help,
  };
}

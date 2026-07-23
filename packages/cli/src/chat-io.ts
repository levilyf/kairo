/**
 * Bridge CLIContext IO → @kairo/chat ChatIO.
 *
 * - write / writeLine: progressive stream output (no full-screen TUI)
 * - readLine: wraps ctx.stdin; null = EOF (Ctrl+D); USER_CANCELLED = cancel
 *
 * Rendering stays out of business logic; this adapter only moves bytes.
 */

import {
  ChatError,
  ChatErrorCode,
  type ChatIO,
} from "@kairo/chat";
import type { CLIContext } from "./context.js";
import { CLIError, CLIErrorCode } from "./errors.js";

/**
 * Create a ChatIO bound to a CLIContext.
 *
 * Progressive token writes go to stdout without forced newlines.
 * Tests capture via a side buffer when `rawWrite` is provided; production
 * uses `process.stdout.write` when available, else falls back to line writes.
 */
export function createChatIO(
  ctx: CLIContext,
  options: {
    /** Optional raw writer (no newline). Defaults to process.stdout when TTY/production. */
    readonly rawWrite?: (text: string) => void;
  } = {},
): ChatIO {
  const rawWrite =
    options.rawWrite ??
    ((text: string) => {
      // Prefer process.stdout for progressive tokens; fall back to line-ish write.
      if (typeof process !== "undefined" && process.stdout?.write) {
        process.stdout.write(text);
        return;
      }
      ctx.stdout(text);
    });

  return {
    isTTY: ctx.isTTY,
    write(text: string) {
      rawWrite(text);
    },
    writeLine(line = "") {
      // Always go through ctx.stdout so tests capture complete lines.
      ctx.stdout(line);
    },
    async readLine(promptText: string): Promise<string | null> {
      // Show prompt without a forced newline after (cursor stays on same line when raw).
      if (promptText.length > 0) {
        rawWrite(promptText);
      }
      try {
        const value = await ctx.stdin(promptText);
        // null = EOF; empty string is a blank line (REPL skips it).
        if (value === null) {
          return null;
        }
        return value;
      } catch (cause) {
        if (
          cause instanceof CLIError &&
          cause.code === CLIErrorCode.USER_CANCELLED
        ) {
          throw new ChatError({
            code: ChatErrorCode.CANCELLED,
            message: cause.message,
            cause,
          });
        }
        if (
          cause instanceof Error &&
          (cause.message === "SIGINT" || cause.message === "Interrupted")
        ) {
          throw new ChatError({
            code: ChatErrorCode.CANCELLED,
            message: "Interrupted",
            cause,
          });
        }
        throw cause;
      }
    },
  };
}

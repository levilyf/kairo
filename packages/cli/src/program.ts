/**
 * Program runner — the heart of the CLI.
 *
 * Input: `CLIContext` (args + IO + cwd + env). Output: exit code.
 *
 * Parsing rules:
 *   - `--version` / `-V` (anywhere)          → version command
 *   - `--help`    / `-h` (anywhere)           → help overview
 *   - `help [<command>]`                      → help for that command
 *   - `<command> [<args...>]`                 → dispatch to command
 *   - empty args                              → help overview (exit 0)
 *   - unknown command                         → CLIError(UNKNOWN_COMMAND)
 *
 * Global flags:
 *   - `--no-color`  disables ANSI entirely for the run
 *
 * Errors: any CLIError thrown is rendered to stderr via the errorLine
 * component + hint, then the command's exitCode is returned. Any other
 * thrown value is wrapped in CLIError(UNKNOWN_COMMAND). The CLI never
 * prints a stack trace unless DEBUG=kairo is set in env.
 */
import type { CLIContext } from "./context.js";
import { CLIError, CLIErrorCode } from "./errors.js";
import { COMMANDS_BY_NAME } from "./commands/registry.js";
import { renderHelpOverview } from "./commands/help.js";
import { errorLine, muted, heading } from "./ui/index.js";
import { CLI_VERSION } from "./version.js";
import { createCLIContext } from "./context.js";
import * as readline from "node:readline";

/** Run the program; resolve to an exit code (never throws). */
export async function run(ctx: CLIContext): Promise<number> {
  const rawArgs = [...ctx.args];
  // Strip recognized global flags from the front of args before dispatch.
  // (--version / --help are handled specially below; --no-color adjusts ctx.)
  const colorlessIdx = rawArgs.indexOf("--no-color");
  let effectiveCtx = ctx;
  if (colorlessIdx >= 0) {
    rawArgs.splice(colorlessIdx, 1);
    effectiveCtx = { ...ctx, isTTY: false };
  }

  // Empty args → overview.
  if (rawArgs.length === 0) {
    renderHelpOverview(effectiveCtx);
    return 0;
  }

  // --version / -V anywhere at position 0.
  const first = rawArgs[0] ?? "";
  if (first === "--version" || first === "-V") {
    return COMMANDS_BY_NAME["version"]!.run(stripCommandWord(effectiveCtx, rawArgs));
  }
  if (first === "--help" || first === "-h") {
    renderHelpOverview(effectiveCtx);
    return 0;
  }

  // `help [<command>]` routes to the help command.
  if (first === "help") {
    return COMMANDS_BY_NAME["help"]!.run(
      withArgs(effectiveCtx, rawArgs.slice(1)),
    );
  }

  const cmd = COMMANDS_BY_NAME[first];
  if (cmd === undefined) {
    return renderCliError(effectiveCtx, new CLIError({
      code: CLIErrorCode.UNKNOWN_COMMAND,
      message: `Unknown command: ${first}`,
      hint: "Run: kairo --help",
    }));
  }

  try {
    return await cmd.run(withArgs(effectiveCtx, rawArgs.slice(1)));
  } catch (cause) {
    return renderErrorPropagate(effectiveCtx, cause);
  }
}

/** Renders a CLIError to stdout and returns its exit code (never throws). */
function renderErrorPropagate(ctx: CLIContext, cause: unknown): number {
  renderError(ctx, cause);
  return cause instanceof CLIError ? cause.exitCode : 1;
}

/** Alias used by the dispatch-unknown path above. */
function renderCliError(ctx: CLIContext, err: CLIError): number {
  renderError(ctx, err);
  return err.exitCode;
}

/** Convenience entry point: run with a real CLIContext. */
export async function main(argv: readonly string[]): Promise<number> {
  const ctx = createCLIContext(argv, {
    // Use readline for interactive prompts in production. Non-interactive
    // commands never touch stdin so this is a no-op for them.
    stdin: makeStdin(),
  });
  try {
    return await run(ctx);
  } catch (cause) {
    renderError(ctx, cause);
    return cause instanceof CLIError ? cause.exitCode : 1;
  }
}

function renderError(ctx: CLIContext, cause: unknown): void {
  if (cause instanceof CLIError) {
    heading(ctx, "Error");
    errorLine(ctx, cause.message);
    if (cause.hint !== undefined && cause.hint.length > 0) {
      ctx.stdout("");
      muted(ctx, "Run");
      muted(ctx, cause.hint);
    }
    if (ctx.env["DEBUG"] === "kairo" && cause.cause instanceof Error) {
      ctx.stdout("");
      muted(ctx, "Cause:");
      muted(ctx, cause.cause.stack ?? cause.cause.message);
    }
    return;
  }
  heading(ctx, "Error");
  errorLine(ctx, cause instanceof Error ? cause.message : String(cause));
  if (ctx.env["DEBUG"] === "kairo" && cause instanceof Error) {
    ctx.stdout("");
    muted(ctx, cause.stack ?? cause.message);
  }
}

function withArgs(ctx: CLIContext, args: readonly string[]): CLIContext {
  return { ...ctx, args: Object.freeze([...args]) };
}

function stripCommandWord(ctx: CLIContext, args: readonly string[]): CLIContext {
  // For --version / -V we want subsequent args (if any) to be passed; since
  // version takes no args, we drop the flag word only.
  const rest = args.filter((a) => a !== "--version" && a !== "-V");
  return withArgs(ctx, rest);
}

/**
 * Real stdin readline reader for interactive prompts. Closes the readline
 * interface after each prompt to avoid leaking file descriptors on
 * short-lived commands. Ctrl-C resolves to `Error('SIGINT')`, which the
 * prompt() wrapper converts to `CLIError(USER_CANCELLED)`.
 */
function makeStdin(): (label: string) => Promise<string | null> {
  return async (_label: string) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: undefined,
    });
    try {
      // Ctrl+C → USER_CANCELLED (chat maps to cancel / re-prompt).
      // Ctrl+D / EOF → null (chat REPL exits).
      return await new Promise<string | null>((resolve, reject) => {
        const onSigInt = (): void => {
          cleanup();
          reject(
            new CLIError({
              code: CLIErrorCode.USER_CANCELLED,
              message: "Interrupted",
            }),
          );
        };
        const onClose = (): void => {
          // EOF without an answer (Ctrl+D).
          cleanup();
          resolve(null);
        };
        const cleanup = (): void => {
          rl.off("SIGINT", onSigInt);
          rl.off("close", onClose);
          rl.close();
        };
        rl.on("SIGINT", onSigInt);
        rl.on("close", onClose);
        rl.question("", (answer) => {
          cleanup();
          resolve(answer);
        });
      });
    } catch (cause) {
      rl.close();
      throw cause;
    }
  };
}

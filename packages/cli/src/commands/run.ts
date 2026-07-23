/**
 * `kairo run` — real one-shot execution through @kairo/harness-code.
 *
 * The CLI is a thin entry point: it parses arguments, delegates config
 * loading + application creation to the single bootstrap bridge
 * (`loadKairoCodeApplication`), runs the prompt, prints the final
 * response, and always stops the application. No runtime logic lives
 * here — the harness owns sessions, turns, the agent loop, tool routing,
 * and provider calls. Config loading and ConfigError translation live in
 * `bootstrap.ts`; this command owns only *run*-failure classification.
 *
 * Flow:
 *   parse args → load (config + app) → run(prompt) → print → stop → exit
 *
 * Testability: the config loader and harness factory are injected via
 * {@link RunCommandDeps} (defaulting to the real implementations). Tests
 * supply a config carrying a mock OpenAI-compatible `client` so the
 * genuine harness/runtime/protocol path runs with no network.
 */

import {
  HarnessCodeError,
  HarnessCodeErrorCode,
} from "@kairo/harness-code";

import type { CLIContext } from "../context.js";
import { CLIError, CLIErrorCode } from "../errors.js";
import {
  loadKairoCodeApplication,
  defaultKairoCodeBridgeDeps,
  type KairoCodeBridgeDeps,
  type LoadedKairoCodeApplication,
} from "../bootstrap.js";
import { heading, muted, text, withSpinner } from "../ui/index.js";
import type { Command, CommandMetadata } from "./types.js";
import { parseRunArgs } from "./run-args.js";

export const runMetadata: CommandMetadata = {
  name: "run",
  summary: "Run a one-shot prompt through Kairo Code and print the answer",
  usage: "kairo run <prompt> [--model <id>] [--provider <id>]",
  description:
    "Loads the project config, boots the Kairo Code harness, runs a single prompt through the agent loop (with workspace tools available), prints the final assistant answer, and exits.",
};

/**
 * Injectable dependencies (the bootstrap bridge's DI seam). Production
 * uses the real config loader and harness factory; tests substitute a
 * config with a mock provider client.
 */
export type RunCommandDeps = KairoCodeBridgeDeps;

const defaultDeps: RunCommandDeps = defaultKairoCodeBridgeDeps;

export const runCommand: Command = {
  metadata: runMetadata,
  run: (ctx: CLIContext) => runWith(ctx, defaultDeps),
};

/** Core command body, parameterized over its dependencies. */
export async function runWith(
  ctx: CLIContext,
  deps: RunCommandDeps,
): Promise<number> {
  const args = parseRunArgs(ctx.args);

  if (args.help) {
    printHelp(ctx);
    return 0;
  }

  if (args.prompt.length === 0) {
    throw new CLIError({
      code: CLIErrorCode.MISSING_PROMPT,
      message: "A prompt is required.",
      hint: "Run: kairo run <prompt>",
    });
  }

  // 1-2. Load config + create the Kairo Code application via the bridge.
  const loaded: LoadedKairoCodeApplication = await loadKairoCodeApplication(
    ctx,
    {
      ...(args.model !== undefined ? { model: args.model } : {}),
      ...(args.providerId !== undefined ? { providerId: args.providerId } : {}),
    },
    deps,
  );
  const app = loaded.app;

  // 3. Run the prompt; 4. print; 5. always stop.
  try {
    const result = await withSpinner(
      ctx,
      "Thinking...",
      "Done",
      () =>
        app.run({
          prompt: args.prompt,
          ...(args.model !== undefined ? { model: args.model } : {}),
          ...(args.providerId !== undefined
            ? { providerId: args.providerId }
            : {}),
        }),
    );

    ctx.stdout("");
    ctx.stdout(result.text);
    return 0;
  } catch (cause) {
    throw wrapRunFailure(cause);
  } finally {
    await safeStop(app);
  }
}

function printHelp(ctx: CLIContext): void {
  heading(ctx, "run");
  text(ctx, runMetadata.description ?? runMetadata.summary);
  ctx.stdout("");
  muted(ctx, `Usage: ${runMetadata.usage}`);
  ctx.stdout("");
  muted(ctx, "Flags:");
  muted(ctx, "  --model, -m <id>     Model id (default: config default)");
  muted(ctx, "  --provider, -p <id>  Force provider id");
}

/**
 * Map a harness run failure to a CLIError with the right exit code.
 * Missing model / invalid options → CONFIG_LOAD_FAILED (user-fixable via
 * config); cancellation → USER_CANCELLED; everything else (provider
 * failure, tool failure, unexpected runtime error) → RUN_FAILED.
 */
function wrapRunFailure(cause: unknown): CLIError {
  if (cause instanceof CLIError) return cause;
  if (cause instanceof HarnessCodeError) {
    switch (cause.code) {
      case HarnessCodeErrorCode.INVALID_OPTIONS:
        return new CLIError({
          code: CLIErrorCode.CONFIG_LOAD_FAILED,
          message: cause.message,
          hint: "Pass --model <id> or set config.model",
          cause,
        });
      case HarnessCodeErrorCode.CANCELLED:
        return new CLIError({
          code: CLIErrorCode.USER_CANCELLED,
          message: cause.message,
          cause,
        });
      case HarnessCodeErrorCode.NOT_RUNNABLE:
      case HarnessCodeErrorCode.RUN_FAILED:
      default:
        return new CLIError({
          code: CLIErrorCode.RUN_FAILED,
          message: cause.message,
          hint: "Run: kairo doctor",
          cause,
        });
    }
  }
  return new CLIError({
    code: CLIErrorCode.RUN_FAILED,
    message: cause instanceof Error ? cause.message : "run failed",
    ...(cause instanceof Error ? { cause } : {}),
  });
}

async function safeStop(app: { stop(): Promise<void> }): Promise<void> {
  try {
    await app.stop();
  } catch {
    // best-effort shutdown; the run result or error is authoritative
  }
}

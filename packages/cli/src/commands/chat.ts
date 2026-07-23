/**
 * `kairo chat` — streaming interactive chat via @kairo/chat.
 *
 * Thin composition:
 *   loadApplication → resolve model/provider → runChatRepl → stop
 *
 * No ProviderRegistry/Runtime/Harness construction here.
 * No provider protocol logic. No full-screen TUI.
 *
 * Flags:
 *   --model / -m <id>
 *   --provider / -p <id>
 *   --resume / -r [id|last]
 */

import { ChatError, ChatErrorCode, runChatRepl } from "@kairo/chat";

import type { CLIContext } from "../context.js";
import { loadApplication } from "../bootstrap.js";
import { createChatIO } from "../chat-io.js";
import { CLIError, CLIErrorCode } from "../errors.js";
import {
  heading,
  muted,
  text,
  withSpinner,
} from "../ui/index.js";
import type { Command, CommandMetadata } from "./types.js";
import { parseChatArgs } from "./chat-args.js";

export const chatMetadata: CommandMetadata = {
  name: "chat",
  summary: "Start an interactive streaming chat session",
  usage:
    "kairo chat [--model <id>] [--provider <id>] [--resume [id|last]]",
  description:
    "Boots the application, resolves a model (flags or registry default), and runs a progressive streaming chat REPL. Ctrl+C cancels the in-flight stream; Ctrl+D or /exit ends the session. Sessions persist as JSONL under .kairo/sessions/.",
};

export const chatCommand: Command = {
  metadata: chatMetadata,
  async run(ctx: CLIContext): Promise<number> {
    // Subcommand help: `kairo chat --help`
    if (ctx.args.includes("--help") || ctx.args.includes("-h")) {
      heading(ctx, "chat");
      text(ctx, chatMetadata.description ?? chatMetadata.summary);
      ctx.stdout("");
      muted(ctx, `Usage: ${chatMetadata.usage}`);
      ctx.stdout("");
      muted(ctx, "Flags:");
      muted(ctx, "  --model, -m <id>        Model id (default: config/registry default)");
      muted(ctx, "  --provider, -p <id>     Force provider id");
      muted(ctx, "  --resume, -r [id|last]  Resume a prior session (default: last)");
      return 0;
    }

    const flags = parseChatArgs(ctx.args);

    const { app, root } = await withSpinner(
      ctx,
      "Loading configuration...",
      "Configuration loaded",
      () => loadApplication(ctx),
    );

    await withSpinner(
      ctx,
      "Bootstrapping application...",
      "Runtime ready",
      async () => {
        await app.start();
        return undefined;
      },
    );

    let exitCode = 0;
    try {
      const resolved = resolveModelAndProvider(app, flags);

      const banner = [
        `Kairo chat · ${resolved.model}${resolved.providerId !== undefined ? ` @ ${resolved.providerId}` : ""}`,
        "Ctrl+C cancel stream · Ctrl+D or /exit to quit",
        "",
      ];

      // Progressive tokens always go to process.stdout (TTY or pipe).
      // Line-oriented output still uses ctx.stdout so tests capture banners.
      const io = createChatIO(ctx);

      const result = await runChatRepl({
        app,
        io,
        rootDir: root,
        model: resolved.model,
        ...(resolved.providerId !== undefined
          ? { providerId: resolved.providerId }
          : {}),
        ...(flags.resume !== undefined ? { resume: flags.resume } : {}),
        banner,
        stream: true,
      });

      if (result.exitReason === "error") {
        exitCode = 1;
      }
    } catch (cause) {
      await safeStop(app);
      throw wrapChatFailure(cause);
    }

    await safeStop(app);
    return exitCode;
  },
};

interface ResolvedChatTarget {
  readonly model: string;
  readonly providerId?: string;
}

function resolveModelAndProvider(
  app: Awaited<ReturnType<typeof loadApplication>>["app"],
  flags: ReturnType<typeof parseChatArgs>,
): ResolvedChatTarget {
  const registry = app.registry;

  // Explicit provider check first (fail closed if not configured).
  if (flags.providerId !== undefined) {
    try {
      registry.get(flags.providerId);
    } catch (cause) {
      throw new CLIError({
        code: CLIErrorCode.PROVIDER_NOT_FOUND,
        message:
          cause instanceof Error
            ? cause.message
            : `provider "${flags.providerId}" is not configured`,
        hint: "Run: kairo provider list",
        cause,
      });
    }
  }

  if (flags.model !== undefined) {
    const model = flags.model.trim();
    if (model.length === 0) {
      throw new CLIError({
        code: CLIErrorCode.UNKNOWN_COMMAND,
        message: "model must be a non-empty string",
        hint: "Run: kairo chat --help",
      });
    }
    // When provider is forced, trust the pair; otherwise resolve ownership.
    if (flags.providerId === undefined) {
      try {
        const { provider } = registry.resolveModel(model);
        return { model, providerId: provider.id };
      } catch (cause) {
        // Model may not be in the index (e.g. free-form ollama tags).
        // Fall back to model-only and let Gateway select the sole provider.
        // Duck-type registry errors — CLI must not depend on provider-registry.
        if (isRegistryLookupError(cause)) {
          const providers = registry.listProviders();
          if (providers.length === 1) {
            return { model, providerId: providers[0]!.id };
          }
          throw new CLIError({
            code: CLIErrorCode.CONFIG_LOAD_FAILED,
            message:
              cause instanceof Error
                ? cause.message
                : `model "${model}" is not declared by any configured provider`,
            hint: "Run: kairo models",
            cause,
          });
        }
        throw cause;
      }
    }
    return { model, providerId: flags.providerId };
  }

  // No --model: registry default.
  try {
    const def = registry.getDefault();
    return {
      model: def.model,
      providerId: flags.providerId ?? def.provider.id,
    };
  } catch (cause) {
    throw new CLIError({
      code: CLIErrorCode.CONFIG_LOAD_FAILED,
      message:
        cause instanceof Error
          ? cause.message
          : "no default model is configured",
      hint: "Pass --model <id> or set config.model / provider defaultModel",
      cause,
    });
  }
}

async function safeStop(app: {
  stop(): Promise<void>;
}): Promise<void> {
  try {
    await app.stop();
  } catch {
    // best-effort shutdown
  }
}

function wrapChatFailure(cause: unknown): CLIError {
  if (cause instanceof CLIError) return cause;
  if (cause instanceof ChatError) {
    switch (cause.code) {
      case ChatErrorCode.CANCELLED:
        return new CLIError({
          code: CLIErrorCode.USER_CANCELLED,
          message: cause.message,
          cause,
        });
      case ChatErrorCode.MODEL_REQUIRED:
        return new CLIError({
          code: CLIErrorCode.CONFIG_LOAD_FAILED,
          message: cause.message,
          hint: "Pass --model <id> or set config.model",
          cause,
        });
      case ChatErrorCode.SESSION_NOT_FOUND:
      case ChatErrorCode.SESSION_CORRUPT:
      case ChatErrorCode.SESSION_IO:
        return new CLIError({
          code: CLIErrorCode.CONFIG_LOAD_FAILED,
          message: cause.message,
          hint: "Omit --resume to start a new session",
          cause,
        });
      default:
        return new CLIError({
          code: CLIErrorCode.APPLICATION_BOOT_FAILED,
          message: cause.message,
          hint: "Run: kairo doctor",
          cause,
        });
    }
  }
  return new CLIError({
    code: CLIErrorCode.APPLICATION_BOOT_FAILED,
    message:
      cause instanceof Error ? cause.message : "chat session failed",
    hint: "Run: kairo doctor",
    ...(cause instanceof Error ? { cause } : {}),
  });
}

/**
 * Detect provider-registry lookup failures without importing that package.
 * Codes match ProviderRegistryErrorCode (UNKNOWN_PROVIDER, DUPLICATE_MODEL, …).
 */
function isRegistryLookupError(cause: unknown): boolean {
  if (!(cause instanceof Error)) return false;
  const code = (cause as { code?: unknown }).code;
  if (typeof code !== "string") return false;
  return (
    code === "UNKNOWN_PROVIDER" ||
    code === "DUPLICATE_MODEL" ||
    code === "DEFAULT_MODEL_NOT_FOUND" ||
    code === "INVALID_CONFIG"
  );
}

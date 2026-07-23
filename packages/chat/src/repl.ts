/**
 * Chat REPL — progressive streaming chat loop.
 *
 * Ctrl+C: cancel in-flight stream (does not exit).
 * Ctrl+D / EOF: end session and exit.
 * No full-screen TUI; plain progressive rendering.
 */

import type { Application } from "@kairo/app";

import { ChatEngine } from "./engine.js";
import { ChatError, ChatErrorCode } from "./errors.js";
import { ProgressiveRenderer } from "./renderer/progressive.js";
import { SessionStore } from "./session/store.js";
import type { ChatIO } from "./types.js";

export interface ChatReplOptions {
  readonly app: Application;
  readonly io: ChatIO;
  /** Project root for JSONL sessions. */
  readonly rootDir: string;
  readonly model: string;
  readonly providerId?: string;
  readonly providerOptions?: Readonly<Record<string, unknown>>;
  /** Resume session id or "last". New session when omitted. */
  readonly resume?: string;
  /** Optional banner lines printed once at start. */
  readonly banner?: readonly string[];
  /** Prompt string (default: "> "). */
  readonly prompt?: string;
  /** When false, disable streaming (tests only). Default true. */
  readonly stream?: boolean;
  /** External signal to force-exit the REPL. */
  readonly signal?: AbortSignal;
  /** Optional store override (tests). */
  readonly store?: SessionStore;
  /** Optional engine factory (tests). */
  readonly createEngine?: (args: {
    app: Application;
    store: SessionStore;
    model: string;
    providerId?: string;
    providerOptions?: Readonly<Record<string, unknown>>;
    stream: boolean;
  }) => ChatEngine;
}

export interface ChatReplResult {
  readonly sessionId: string;
  readonly exitReason: "eof" | "signal" | "error" | "empty";
  readonly turns: number;
}

/**
 * Run the interactive chat loop until EOF or fatal error.
 * Returns a result; does not call process.exit.
 */
export async function runChatRepl(
  options: ChatReplOptions,
): Promise<ChatReplResult> {
  const io = options.io;
  const prompt = options.prompt ?? "> ";
  const store =
    options.store ??
    new SessionStore({ rootDir: options.rootDir });

  const createEngine =
    options.createEngine ??
    ((args) =>
      new ChatEngine({
        app: args.app,
        store: args.store,
        model: args.model,
        ...(args.providerId !== undefined
          ? { providerId: args.providerId }
          : {}),
        ...(args.providerOptions !== undefined
          ? { providerOptions: args.providerOptions }
          : {}),
        stream: args.stream,
      }));

  const engine = createEngine({
    app: options.app,
    store,
    model: options.model,
    ...(options.providerId !== undefined
      ? { providerId: options.providerId }
      : {}),
    ...(options.providerOptions !== undefined
      ? { providerOptions: options.providerOptions }
      : {}),
    stream: options.stream !== false,
  });

  await engine.start({
    ...(options.resume !== undefined ? { resume: options.resume } : {}),
  });

  if (options.banner !== undefined) {
    for (const line of options.banner) {
      io.writeLine(line);
    }
  }

  let turns = 0;
  let exitReason: ChatReplResult["exitReason"] = "empty";

  const onSignalAbort = (): void => {
    engine.cancel("repl-signal");
  };
  if (options.signal !== undefined) {
    if (options.signal.aborted) {
      await engine.end("signal");
      return {
        sessionId: engine.id ?? "unknown",
        exitReason: "signal",
        turns: 0,
      };
    }
    options.signal.addEventListener("abort", onSignalAbort, { once: true });
  }

  // During streaming turns, readline is not active — wire process SIGINT so
  // Ctrl+C cancels the in-flight Agent Loop instead of killing the process.
  // Presence of a listener suppresses Node's default SIGINT → exit behavior.
  const onProcessSigInt = (): void => {
    engine.cancel("SIGINT");
  };
  const hasProcess =
    typeof process !== "undefined" &&
    typeof process.on === "function" &&
    typeof process.off === "function";
  if (hasProcess) {
    process.on("SIGINT", onProcessSigInt);
  }

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (options.signal?.aborted) {
        exitReason = "signal";
        break;
      }

      let line: string | null;
      try {
        line = await io.readLine(prompt);
      } catch (error) {
        if (
          error instanceof ChatError &&
          error.code === ChatErrorCode.CANCELLED
        ) {
          // Ctrl+C at prompt: print blank and re-prompt.
          io.writeLine();
          continue;
        }
        throw error;
      }

      if (line === null) {
        // Ctrl+D / EOF
        exitReason = "eof";
        io.writeLine();
        break;
      }

      const trimmed = line.trim();
      if (trimmed.length === 0) {
        continue;
      }

      // Slash commands (minimal)
      if (trimmed === "/exit" || trimmed === "/quit") {
        exitReason = "eof";
        break;
      }

      const renderer = new ProgressiveRenderer({
        io,
        assistantPrefix: "",
      });

      try {
        await engine.turn(trimmed, { renderer });
        turns += 1;
        exitReason = "empty";
      } catch (error) {
        if (
          error instanceof ChatError &&
          error.code === ChatErrorCode.CANCELLED
        ) {
          io.writeLine();
          io.writeLine("(cancelled)");
          continue;
        }
        const message =
          error instanceof Error ? error.message : "turn failed";
        io.writeLine(`error: ${message}`);
        // Non-cancel turn failures: stay in loop (recoverable).
        continue;
      }
    }
  } catch (error) {
    exitReason = "error";
    const message = error instanceof Error ? error.message : "repl failed";
    io.writeLine(`fatal: ${message}`);
  } finally {
    if (options.signal !== undefined) {
      options.signal.removeEventListener("abort", onSignalAbort);
    }
    if (hasProcess) {
      process.off("SIGINT", onProcessSigInt);
    }
    const sessionId = engine.id ?? "unknown";
    await engine.end(exitReason === "eof" ? "user-exit" : exitReason);
    return {
      sessionId,
      exitReason,
      turns,
    };
  }
}

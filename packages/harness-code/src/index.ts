/**
 * @kairo/harness-code — the Kairo Code flagship harness.
 *
 * This is the official composition root for Kairo Code. It composes the
 * generic `@kairo/app` Application and establishes Code-specific
 * opinions:
 *
 *   - Code identity + system prompt (contributed as a context.builder module)
 *   - runtime/loop defaults (max iterations)
 *   - workspace root configuration
 *   - a small, stable lifecycle: create → run → stop
 *
 * Coding capabilities are composed as modules (today: system prompt +
 * workspace tools / read_file). The harness owns opinions and wiring,
 * not tool implementations. Further tools (shell, git, multi-file edit)
 * can be composed the same way without changing Core.
 *
 * The harness reuses existing runtime primitives rather than wrapping
 * them: a run is `runtime.sessions.create → session.turns.create →
 * runtime.agentLoop.execute`, exactly the path the chat product uses.
 */

import type { KairoConfig } from "@kairo/config";
import {
  createApplication,
  type Application,
  type HarnessBootstrapOptions,
} from "@kairo/app";
import type {
  ContextMessage,
  LoopResult,
  ProviderContentPart,
  Session,
} from "@kairo/core";
import { DEFAULT_MAX_ITERATIONS } from "@kairo/core";
import { createWorkspaceToolsModule } from "@kairo/module-workspace-tools";

import { HarnessCodeError, HarnessCodeErrorCode } from "./errors.js";
import {
  KAIRO_CODE_SYSTEM_PROMPT,
  createSystemPromptModule,
} from "./system-prompt.js";

export {
  KAIRO_CODE_SYSTEM_PROMPT,
  createSystemPromptModule,
  createSystemPromptBuilder,
} from "./system-prompt.js";
export {
  HarnessCodeError,
  HarnessCodeErrorCode,
  type HarnessCodeErrorOptions,
} from "./errors.js";

/** Kairo Code's default maximum Agent Loop iterations per turn. */
export const KAIRO_CODE_DEFAULT_MAX_ITERATIONS = DEFAULT_MAX_ITERATIONS;

/** Harness identity metadata applied to the composed Application. */
const HARNESS_NAME = "kairo-code";
const HARNESS_VERSION = "0.1.0";
const HARNESS_DESCRIPTION = "Kairo Code — AI coding harness";

/** The single permission the workspace read_file tool requires. */
const WORKSPACE_READ_PERMISSION = "workspace.read";

export interface CreateKairoCodeApplicationOptions {
  /** The already-loaded KairoConfig to compose from. */
  readonly config: KairoConfig;
  /**
   * Absolute path to the workspace root the harness operates over.
   * Defaults to `process.cwd()`. Propagated to modules via harness config.
   */
  readonly workspaceRoot?: string;
  /**
   * Override the Code system prompt. Defaults to
   * {@link KAIRO_CODE_SYSTEM_PROMPT}.
   */
  readonly systemPrompt?: string;
  /**
   * Default model id used by `run()` when the call omits `model`.
   * Falls back to `config.model` when omitted.
   */
  readonly model?: string;
  /** Default provider id used by `run()` when the call omits `providerId`. */
  readonly providerId?: string;
  /**
   * Default maximum Agent Loop iterations per turn.
   * Defaults to {@link KAIRO_CODE_DEFAULT_MAX_ITERATIONS}.
   */
  readonly maxIterations?: number;
}

export interface KairoCodeRunOptions {
  /** The user prompt for this turn. */
  readonly prompt: string;
  /** Override the model id for this turn. */
  readonly model?: string;
  /** Override the provider id for this turn. */
  readonly providerId?: string;
  /** Cancellation signal for this turn. */
  readonly signal?: AbortSignal;
}

export interface KairoCodeRunResult {
  /** Concatenated assistant text from the final provider response. */
  readonly text: string;
  /** The raw Agent Loop result. */
  readonly loopResult: LoopResult;
  /** Number of provider/tool iterations the loop ran. */
  readonly iterationCount: number;
}

export type KairoCodeStatus = "ready" | "started" | "stopped";

export interface KairoCodeApplication {
  /** The composed generic Application (full surface available). */
  readonly app: Application;
  /** The workspace root this harness operates over. */
  readonly workspaceRoot: string;
  /** The active Code system prompt. */
  readonly systemPrompt: string;
  /** Current harness lifecycle status. */
  readonly status: KairoCodeStatus;
  /** Mark the harness started (idempotent). Auto-invoked by `run()`. */
  start(): Promise<void>;
  /**
   * Run a single Agent Loop turn (tools available when the model calls
   * them) and return the final assistant text plus loop metadata.
   */
  run(options: KairoCodeRunOptions): Promise<KairoCodeRunResult>;
  /** Stop the harness and shut down the underlying Application (idempotent). */
  stop(): Promise<void>;
}

/**
 * Create the Kairo Code harness: compose the generic Application with
 * Code opinions, ready to `run()`.
 */
export async function createKairoCodeApplication(
  options: CreateKairoCodeApplicationOptions,
): Promise<KairoCodeApplication> {
  if (options === null || typeof options !== "object") {
    throw new HarnessCodeError({
      code: HarnessCodeErrorCode.INVALID_OPTIONS,
      message: "createKairoCodeApplication() requires an options object",
    });
  }
  const config = options.config;
  if (config === null || typeof config !== "object") {
    throw new HarnessCodeError({
      code: HarnessCodeErrorCode.INVALID_OPTIONS,
      message: "createKairoCodeApplication() requires a KairoConfig",
    });
  }

  const workspaceRoot = normalizeRoot(options.workspaceRoot);
  const systemPrompt =
    typeof options.systemPrompt === "string" && options.systemPrompt.length > 0
      ? options.systemPrompt
      : KAIRO_CODE_SYSTEM_PROMPT;
  const defaultModel =
    normalizeOptionalString(options.model) ??
    normalizeOptionalString((config as { model?: unknown }).model);
  const defaultProviderId = normalizeOptionalString(options.providerId);
  const maxIterations = options.maxIterations ?? KAIRO_CODE_DEFAULT_MAX_ITERATIONS;

  // Code opinions expressed as harness composition:
  //  - identity metadata
  //  - system prompt contributed as a context.builder module
  //  - workspace tools (read_file) contributed as a module — the module
  //    self-advertises its tool definitions, so the model discovers the
  //    tool through normal context assembly with no harness special-casing
  //  - the minimum permission the workspace tools require (workspace.read)
  //  - workspace root propagated via harness config
  const harnessOptions: HarnessBootstrapOptions = {
    name: HARNESS_NAME,
    version: HARNESS_VERSION,
    description: HARNESS_DESCRIPTION,
    extraModules: [
      createSystemPromptModule(systemPrompt),
      createWorkspaceToolsModule({ root: workspaceRoot }),
    ],
    permissions: [WORKSPACE_READ_PERMISSION],
    config: { workspaceRoot },
  };

  const app = await createApplication({ config, harness: harnessOptions });

  return new KairoCodeApplicationImpl({
    app,
    workspaceRoot,
    systemPrompt,
    defaultModel,
    defaultProviderId,
    maxIterations,
  });
}

interface ImplOptions {
  readonly app: Application;
  readonly workspaceRoot: string;
  readonly systemPrompt: string;
  readonly defaultModel: string | undefined;
  readonly defaultProviderId: string | undefined;
  readonly maxIterations: number;
}

class KairoCodeApplicationImpl implements KairoCodeApplication {
  readonly app: Application;
  readonly workspaceRoot: string;
  readonly systemPrompt: string;
  private readonly defaultModel: string | undefined;
  private readonly defaultProviderId: string | undefined;
  private readonly maxIterations: number;
  private lifecycle: KairoCodeStatus = "ready";

  constructor(options: ImplOptions) {
    this.app = options.app;
    this.workspaceRoot = options.workspaceRoot;
    this.systemPrompt = options.systemPrompt;
    this.defaultModel = options.defaultModel;
    this.defaultProviderId = options.defaultProviderId;
    this.maxIterations = options.maxIterations;
  }

  get status(): KairoCodeStatus {
    return this.lifecycle;
  }

  async start(): Promise<void> {
    if (this.lifecycle === "started") return;
    if (this.lifecycle === "stopped") {
      throw new HarnessCodeError({
        code: HarnessCodeErrorCode.NOT_RUNNABLE,
        message: "Kairo Code harness has been stopped and cannot restart",
      });
    }
    await this.app.start();
    this.lifecycle = "started";
  }

  async run(options: KairoCodeRunOptions): Promise<KairoCodeRunResult> {
    if (options === null || typeof options !== "object") {
      throw new HarnessCodeError({
        code: HarnessCodeErrorCode.INVALID_OPTIONS,
        message: "run() requires an options object",
      });
    }
    const prompt = typeof options.prompt === "string" ? options.prompt.trim() : "";
    if (prompt.length === 0) {
      throw new HarnessCodeError({
        code: HarnessCodeErrorCode.INVALID_OPTIONS,
        message: "run() requires a non-empty prompt",
      });
    }
    if (this.lifecycle === "stopped") {
      throw new HarnessCodeError({
        code: HarnessCodeErrorCode.NOT_RUNNABLE,
        message: "Kairo Code harness has been stopped",
      });
    }
    if (this.lifecycle === "ready") {
      await this.start();
    }

    const model =
      normalizeOptionalString(options.model) ?? this.defaultModel;
    if (model === undefined) {
      throw new HarnessCodeError({
        code: HarnessCodeErrorCode.INVALID_OPTIONS,
        message:
          "run() requires a model: pass options.model or set config.model / options.model at creation",
      });
    }
    const providerId =
      normalizeOptionalString(options.providerId) ?? this.defaultProviderId;

    let session: Session | undefined;
    try {
      session = await this.app.runtime.sessions.create();
      const turn = await session.turns.create();
      const messages: readonly ContextMessage[] = Object.freeze([
        {
          role: "user",
          content: Object.freeze([{ type: "text", text: prompt }]),
        },
      ]) as readonly ContextMessage[];

      const loopResult = await this.app.runtime.agentLoop.execute(turn, {
        model,
        ...(providerId !== undefined ? { providerId } : {}),
        maxIterations: this.maxIterations,
        messages,
        stream: false,
        ...(options.signal !== undefined ? { signal: options.signal } : {}),
      });

      return {
        text: extractText(loopResult.finalResponse.output),
        loopResult,
        iterationCount: loopResult.iterationCount,
      };
    } catch (cause) {
      if (isCancelled(cause, options.signal)) {
        throw new HarnessCodeError({
          code: HarnessCodeErrorCode.CANCELLED,
          message: "Kairo Code run cancelled",
          cause,
        });
      }
      throw new HarnessCodeError({
        code: HarnessCodeErrorCode.RUN_FAILED,
        message: cause instanceof Error ? cause.message : "Kairo Code run failed",
        cause,
      });
    } finally {
      if (session !== undefined && session.state !== "closed") {
        try {
          await session.close();
        } catch {
          // best-effort; the run result (or error) is authoritative
        }
      }
    }
  }

  async stop(): Promise<void> {
    if (this.lifecycle === "stopped") return;
    try {
      await this.app.stop();
    } finally {
      this.lifecycle = "stopped";
    }
  }
}

function extractText(output: readonly ProviderContentPart[]): string {
  return output
    .filter((p) => p.type === "text")
    .map((p) => (typeof p.text === "string" ? p.text : ""))
    .join("");
}

function isCancelled(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (error === null || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  if (code === "CANCELLED" || code === "ABORT_ERR") return true;
  const name = (error as { name?: unknown }).name;
  return name === "AbortError" || name === "APIUserAbortError";
}

function normalizeRoot(value: unknown): string {
  const normalized = normalizeOptionalString(value);
  return normalized ?? process.cwd();
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * ChatEngine — one streaming turn at a time via Agent Loop.
 *
 * Owns in-memory history + JSONL persistence.
 * Never calls ProviderGateway directly.
 * Rendering is injected via onStreamEvent / ProgressiveRenderer.
 */

import type {
  Application,
} from "@kairo/app";
import type {
  ContextMessage,
  LoopResult,
  ProviderContentPart,
  ProviderStreamEvent,
  Session,
} from "@kairo/core";

import { ChatError, ChatErrorCode } from "./errors.js";
import type { ProgressiveRenderer } from "./renderer/progressive.js";
import type { SessionStore } from "./session/store.js";
import type { ChatMessage } from "./types.js";

export interface ChatEngineOptions {
  readonly app: Application;
  readonly store: SessionStore;
  /** Required model id for Agent Loop. */
  readonly model: string;
  /** Optional explicit provider id for Gateway selection. */
  readonly providerId?: string;
  /** Opaque provider options (temperature, etc.). */
  readonly providerOptions?: Readonly<Record<string, unknown>>;
  /**
   * When true (default), each turn uses Agent Loop streaming mode.
   * Fail closed if the provider cannot stream.
   */
  readonly stream?: boolean;
}

export interface StartChatOptions {
  /** Resume an existing JSONL session id, or "last". */
  readonly resume?: string;
  /** Force a specific new session id (tests). */
  readonly sessionId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ChatTurnResult {
  readonly loopResult: LoopResult;
  readonly assistantText: string;
  readonly messages: readonly ChatMessage[];
}

export class ChatEngine {
  private readonly app: Application;
  private readonly store: SessionStore;
  private readonly model: string;
  private readonly providerId: string | undefined;
  private readonly providerOptions: Readonly<Record<string, unknown>> | undefined;
  private readonly stream: boolean;

  private sessionId: string | undefined;
  private coreSession: Session | undefined;
  private history: ChatMessage[] = [];
  private modelForSession: string;
  private providerIdForSession: string | undefined;
  private turnAbort: AbortController | undefined;

  constructor(options: ChatEngineOptions) {
    if (options === null || typeof options !== "object") {
      throw new ChatError({
        code: ChatErrorCode.INVALID_OPTIONS,
        message: "ChatEngine requires options",
      });
    }
    if (typeof options.model !== "string" || options.model.trim().length === 0) {
      throw new ChatError({
        code: ChatErrorCode.MODEL_REQUIRED,
        message: "model must be a non-empty string",
        field: "model",
      });
    }
    this.app = options.app;
    this.store = options.store;
    this.model = options.model.trim();
    this.modelForSession = this.model;
    this.providerId = options.providerId;
    this.providerIdForSession = options.providerId;
    this.providerOptions = options.providerOptions;
    this.stream = options.stream !== false;
  }

  get id(): string | undefined {
    return this.sessionId;
  }

  get messages(): readonly ChatMessage[] {
    return Object.freeze([...this.history]);
  }

  get currentModel(): string {
    return this.modelForSession;
  }

  get currentProviderId(): string | undefined {
    return this.providerIdForSession;
  }

  /**
   * Open a new session or resume an existing one.
   * Creates a Core Session for turn lifecycle.
   */
  async start(options: StartChatOptions = {}): Promise<void> {
    if (this.sessionId !== undefined) {
      throw new ChatError({
        code: ChatErrorCode.INVALID_OPTIONS,
        message: "ChatEngine already started",
        sessionId: this.sessionId,
      });
    }

    if (options.resume !== undefined) {
      const resumeId =
        options.resume === "last"
          ? await this.store.resolveLast()
          : options.resume;
      const loaded = await this.store.load(resumeId);
      this.sessionId = loaded.sessionId;
      this.history = [...loaded.messages];
      // Resume keeps stored model unless constructor overrides via same model.
      this.modelForSession = this.model || loaded.model;
      this.providerIdForSession =
        this.providerId ?? loaded.providerId;
    } else {
      const created = await this.store.create({
        model: this.model,
        ...(this.providerId !== undefined
          ? { providerId: this.providerId }
          : {}),
        ...(options.sessionId !== undefined
          ? { sessionId: options.sessionId }
          : {}),
        ...(options.metadata !== undefined
          ? { metadata: options.metadata }
          : {}),
      });
      this.sessionId = created.sessionId;
      this.history = [];
      this.modelForSession = created.model;
      this.providerIdForSession = created.providerId;
    }

    this.coreSession = await this.app.runtime.sessions.create({
      id: this.sessionId,
    });
  }

  /**
   * Run one user turn through Agent Loop with streaming.
   * Appends user + assistant messages to history and JSONL.
   */
  async turn(
    userText: string,
    options: {
      readonly signal?: AbortSignal;
      readonly onStreamEvent?: (event: ProviderStreamEvent) => void | Promise<void>;
      readonly renderer?: ProgressiveRenderer;
    } = {},
  ): Promise<ChatTurnResult> {
    this.requireStarted();
    const text = userText.trim();
    if (text.length === 0) {
      throw new ChatError({
        code: ChatErrorCode.INVALID_OPTIONS,
        message: "user message must not be empty",
        field: "userText",
        ...(this.sessionId !== undefined ? { sessionId: this.sessionId } : {}),
      });
    }

    const userMessage: ChatMessage = {
      role: "user",
      content: Object.freeze([{ type: "text", text }]),
    };
    this.history.push(userMessage);
    await this.store.appendMessage(this.sessionId!, userMessage);

    const turn = await this.coreSession!.turns.create();
    this.turnAbort = new AbortController();

    // Link external signal + internal cancel (Ctrl+C).
    const external = options.signal;
    const onExternalAbort = (): void => {
      this.turnAbort?.abort(external?.reason ?? "external");
    };
    if (external !== undefined) {
      if (external.aborted) {
        this.turnAbort.abort(external.reason);
      } else {
        external.addEventListener("abort", onExternalAbort, { once: true });
      }
    }

    const renderer = options.renderer;
    const onStreamEvent = async (event: ProviderStreamEvent): Promise<void> => {
      renderer?.onEvent(event);
      if (options.onStreamEvent !== undefined) {
        await options.onStreamEvent(event);
      }
    };

    try {
      const loopResult = await this.app.runtime.agentLoop.execute(turn, {
        model: this.modelForSession,
        ...(this.providerIdForSession !== undefined
          ? { providerId: this.providerIdForSession }
          : {}),
        ...(this.providerOptions !== undefined
          ? { providerOptions: this.providerOptions }
          : {}),
        // Snapshot history so later appends do not mutate the loop input.
        messages: Object.freeze([...this.history]) as readonly ContextMessage[],
        stream: this.stream,
        signal: this.turnAbort.signal,
        onStreamEvent,
      });

      renderer?.finish();

      const assistantText = extractAssistantText(loopResult.finalResponse.output);
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: Object.freeze(
          loopResult.finalResponse.output.map(mapProviderPartToContext),
        ),
      };
      this.history.push(assistantMessage);
      await this.store.appendMessage(this.sessionId!, assistantMessage);

      return {
        loopResult,
        assistantText,
        messages: this.messages,
      };
    } catch (error) {
      renderer?.finish();
      if (isCancelled(error) || this.turnAbort.signal.aborted) {
        throw new ChatError({
          code: ChatErrorCode.CANCELLED,
          message: "Chat turn cancelled",
          ...(this.sessionId !== undefined
            ? { sessionId: this.sessionId }
            : {}),
          cause: error,
        });
      }
      throw new ChatError({
        code: ChatErrorCode.TURN_FAILED,
        message:
          error instanceof Error ? error.message : "Chat turn failed",
        ...(this.sessionId !== undefined
          ? { sessionId: this.sessionId }
          : {}),
        cause: error,
      });
    } finally {
      if (external !== undefined) {
        external.removeEventListener("abort", onExternalAbort);
      }
      this.turnAbort = undefined;
    }
  }

  /** Cancel the in-flight turn (Ctrl+C). */
  cancel(reason: unknown = "user-cancel"): void {
    this.turnAbort?.abort(reason);
  }

  /** Persist session.end and close Core session. */
  async end(reason = "user-exit"): Promise<void> {
    if (this.sessionId === undefined) return;
    try {
      await this.store.end(this.sessionId, reason);
    } finally {
      if (this.coreSession !== undefined && this.coreSession.state !== "closed") {
        try {
          await this.coreSession.close();
        } catch {
          // best-effort
        }
      }
      this.coreSession = undefined;
      this.sessionId = undefined;
      this.history = [];
    }
  }

  private requireStarted(): void {
    if (this.sessionId === undefined || this.coreSession === undefined) {
      throw new ChatError({
        code: ChatErrorCode.INVALID_OPTIONS,
        message: "ChatEngine has not been started",
      });
    }
  }
}

function extractAssistantText(
  output: readonly ProviderContentPart[],
): string {
  return output
    .filter((p) => p.type === "text")
    .map((p) => (typeof p.text === "string" ? p.text : ""))
    .join("");
}

function mapProviderPartToContext(
  part: ProviderContentPart,
): ChatMessage["content"][number] {
  if (part.type === "text") {
    return { type: "text", text: part.text };
  }
  if (part.type === "tool_call") {
    return {
      type: "tool_call",
      id: part.id,
      name: part.name,
      arguments: part.arguments,
    };
  }
  if (part.type === "tool_result") {
    return {
      type: "tool_result",
      id: part.id,
      ...(part.name !== undefined ? { name: part.name } : {}),
      result: part.result,
    };
  }
  return { type: part.type, ...(part as Record<string, unknown>) };
}

function isCancelled(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "CANCELLED"
  );
}

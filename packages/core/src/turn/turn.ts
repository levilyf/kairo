/**
 * Turn — execution boundary for one request inside a Session.
 *
 * Owns identity, metadata, lifecycle, a cancellation child scope of the
 * Session, at most one Context, and a result placeholder. Does not execute AI,
 * assemble context, call providers/tools, or own the Agent Loop.
 *
 * Source of truth: docs/CORE.md, docs/CONTRACTS.md
 */

import {
  ContextFactory,
  type Context,
  type CreateTurnContextInput,
} from "../context/index.js";
import type { EventPublisher } from "../events/publisher.js";
import { TurnError, TurnErrorCode } from "./errors.js";
import {
  updateTurnMetadata,
  type TurnMetadata,
} from "./metadata.js";
import type { TurnState } from "./state.js";

export interface TurnCancellationScope {
  readonly signal: AbortSignal;
  abort(reason?: unknown): void;
}

export interface TurnOptions {
  metadata: TurnMetadata;
  cancellation: TurnCancellationScope;
  publisher: EventPublisher;
}

export interface CompleteTurnInput {
  readonly result?: unknown;
}

export class Turn {
  private _metadata: TurnMetadata;
  private _state: TurnState = "created";
  private _result: unknown;
  private _context: Context | undefined;
  private readonly publisher: EventPublisher;

  readonly cancellation: TurnCancellationScope;

  constructor(options: TurnOptions) {
    this._metadata = options.metadata;
    this.cancellation = options.cancellation;
    this.publisher = options.publisher;
  }

  get id(): string {
    return this._metadata.id;
  }

  get sessionId(): string {
    return this._metadata.sessionId;
  }

  get runtimeId(): string {
    return this._metadata.runtimeId;
  }

  get metadata(): TurnMetadata {
    return this._metadata;
  }

  get state(): TurnState {
    return this._state;
  }

  get result(): unknown {
    return this._result;
  }

  /**
   * Context owned by this turn. Undefined until createContext().
   * A turn owns at most one Context.
   */
  get context(): Context | undefined {
    return this._context;
  }

  /**
   * Create and attach the turn's Context shell.
   * Does not assemble or translate — that is a later milestone.
   */
  createContext(input: CreateTurnContextInput = {}): Context {
    if (
      this._state === "completed" ||
      this._state === "cancelled" ||
      this._state === "failed"
    ) {
      throw new TurnError({
        code: TurnErrorCode.INVALID_STATE,
        message: `Cannot create context for turn in state "${this._state}"`,
        turnId: this.id,
        sessionId: this.sessionId,
        runtimeId: this.runtimeId,
      });
    }
    if (this._context !== undefined) {
      throw new TurnError({
        code: TurnErrorCode.INVALID_STATE,
        message: "Turn already owns a Context",
        turnId: this.id,
        sessionId: this.sessionId,
        runtimeId: this.runtimeId,
      });
    }

    const factory = new ContextFactory({
      turnId: this.id,
      sessionId: this.sessionId,
      runtimeId: this.runtimeId,
    });
    this._context = factory.build(input);
    return this._context;
  }

  /**
   * Mark the turn completed. Lifecycle only — no Agent Loop execution.
   */
  async complete(input: CompleteTurnInput = {}): Promise<void> {
    this.assertMutable("complete");

    try {
      if (input.result !== undefined) {
        this._result = input.result;
      }
      this._metadata = updateTurnMetadata(this._metadata);
      this._state = "completed";
      this.publisher.emitCore("turn.completed", {
        sessionId: this.sessionId,
        turnId: this.id,
        data: {
          runtimeId: this.runtimeId,
          status: "completed",
        },
      });
    } catch (error) {
      this.publisher.emitCore("error", {
        sessionId: this.sessionId,
        turnId: this.id,
        data: {
          runtimeId: this.runtimeId,
          message:
            error instanceof Error ? error.message : "Turn complete failed",
        },
      });
      throw new TurnError({
        code: TurnErrorCode.COMPLETE_FAILED,
        message:
          error instanceof Error ? error.message : "Turn complete failed",
        turnId: this.id,
        sessionId: this.sessionId,
        runtimeId: this.runtimeId,
        cause: error,
      });
    }
  }

  /**
   * Cancel the turn. Aborts only this turn's cancellation scope.
   */
  async cancel(reason?: unknown): Promise<void> {
    this.assertMutable("cancel");

    try {
      this.cancellation.abort(reason ?? "turn.cancel");
      this._metadata = updateTurnMetadata(this._metadata);
      this._state = "cancelled";
      this.publisher.emitCore("turn.completed", {
        sessionId: this.sessionId,
        turnId: this.id,
        data: {
          runtimeId: this.runtimeId,
          status: "cancelled",
          ...(reason !== undefined ? { reason: String(reason) } : {}),
        },
      });
    } catch (error) {
      this.publisher.emitCore("error", {
        sessionId: this.sessionId,
        turnId: this.id,
        data: {
          runtimeId: this.runtimeId,
          message:
            error instanceof Error ? error.message : "Turn cancel failed",
        },
      });
      throw new TurnError({
        code: TurnErrorCode.CANCEL_FAILED,
        message: error instanceof Error ? error.message : "Turn cancel failed",
        turnId: this.id,
        sessionId: this.sessionId,
        runtimeId: this.runtimeId,
        cause: error,
      });
    }
  }

  private assertMutable(operation: "complete" | "cancel"): void {
    if (this._state === "completed" || this._state === "cancelled" || this._state === "failed") {
      throw new TurnError({
        code: TurnErrorCode.INVALID_STATE,
        message: `Cannot ${operation} turn in state "${this._state}"`,
        turnId: this.id,
        sessionId: this.sessionId,
        runtimeId: this.runtimeId,
      });
    }
  }
}

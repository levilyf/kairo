/**
 * Session — root execution state for a conversation/work unit.
 *
 * Owns identity, metadata, lifecycle, a cancellation child scope,
 * a TurnManager, and a placeholder for future context. Does not own
 * Agent Loop, provider/tool execution, context building, memory, or AI.
 *
 * Source of truth: docs/CORE.md, docs/CONTRACTS.md (Session)
 */

import type { EventPublisher } from "../events/publisher.js";
import { TurnManager } from "../turn/manager.js";
import { SessionError, SessionErrorCode } from "./errors.js";
import {
  updateSessionMetadata,
  type SessionMetadata,
} from "./metadata.js";
import type { SessionState } from "./state.js";

export interface SessionCancellationScope {
  readonly signal: AbortSignal;
  abort(reason?: unknown): void;
}

export interface SessionOptions {
  metadata: SessionMetadata;
  cancellation: SessionCancellationScope;
  publisher: EventPublisher;
  turns?: TurnManager;
}

export class Session {
  private _metadata: SessionMetadata;
  private _state: SessionState = "ready";
  private readonly publisher: EventPublisher;

  readonly cancellation: SessionCancellationScope;
  /** Turn lifecycle manager. Session owns it; TurnManager owns turns. */
  readonly turns: TurnManager;
  /** Placeholder only: future Context state attaches in a later milestone. */
  readonly context?: unknown;

  constructor(options: SessionOptions) {
    this._metadata = options.metadata;
    this.cancellation = options.cancellation;
    this.publisher = options.publisher;
    this.turns =
      options.turns ??
      new TurnManager({
        runtimeId: options.metadata.runtimeId,
        sessionId: options.metadata.id,
        cancellation: options.cancellation,
        publisher: options.publisher,
      });
  }

  get id(): string {
    return this._metadata.id;
  }

  get runtimeId(): string {
    return this._metadata.runtimeId;
  }

  get metadata(): SessionMetadata {
    return this._metadata;
  }

  get state(): SessionState {
    return this._state;
  }

  async close(): Promise<void> {
    if (this._state === "closed") {
      throw new SessionError({
        code: SessionErrorCode.INVALID_STATE,
        message: "Session is already closed",
        sessionId: this.id,
        runtimeId: this.runtimeId,
      });
    }
    if (this._state === "closing") {
      throw new SessionError({
        code: SessionErrorCode.INVALID_STATE,
        message: "Session is already closing",
        sessionId: this.id,
        runtimeId: this.runtimeId,
      });
    }

    this._state = "closing";
    try {
      await this.turns.close("session.close");
      this.cancellation.abort("session.close");
      this._metadata = updateSessionMetadata(this._metadata);
      this._state = "closed";
      this.publisher.emitCore("session.completed", {
        sessionId: this.id,
        data: { runtimeId: this.runtimeId, reason: "closed" },
      });
    } catch (error) {
      this._state = "ready";
      this.publisher.emitCore("error", {
        sessionId: this.id,
        data: {
          runtimeId: this.runtimeId,
          message:
            error instanceof Error ? error.message : "Session close failed",
        },
      });
      throw new SessionError({
        code: SessionErrorCode.CLOSE_FAILED,
        message: error instanceof Error ? error.message : "Session close failed",
        sessionId: this.id,
        runtimeId: this.runtimeId,
        cause: error,
      });
    }
  }
}

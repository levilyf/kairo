/**
 * TurnManager — owns Turn lifecycle for a Session.
 *
 * Session owns one manager and delegates turn lifecycle operations to it.
 * The manager owns turn identity, lifecycle, lookup, cancelAll/shutdown, and
 * lifecycle event emission. It does not implement context, provider/tool
 * execution, or the Agent Loop.
 */

import type { EventPublisher } from "../events/publisher.js";
import { TurnBuilder, type CreateTurnInput } from "./builder.js";
import { TurnError, TurnErrorCode } from "./errors.js";
import type { Turn, TurnCancellationScope } from "./turn.js";

export interface TurnManagerOptions {
  readonly runtimeId: string;
  readonly sessionId: string;
  readonly cancellation: TurnCancellationScope;
  readonly publisher: EventPublisher;
}

export class TurnManager {
  private readonly runtimeId: string;
  private readonly sessionId: string;
  private readonly publisher: EventPublisher;
  private readonly builder: TurnBuilder;
  private readonly turns = new Map<string, Turn>();
  private _closed = false;

  constructor(options: TurnManagerOptions) {
    this.runtimeId = options.runtimeId;
    this.sessionId = options.sessionId;
    this.publisher = options.publisher;
    this.builder = new TurnBuilder({
      runtimeId: options.runtimeId,
      sessionId: options.sessionId,
      parentCancellation: options.cancellation,
      publisher: options.publisher,
    });
  }

  get closed(): boolean {
    return this._closed;
  }

  get size(): number {
    return this.turns.size;
  }

  async create(input: CreateTurnInput = {}): Promise<Turn> {
    if (this._closed) {
      throw new TurnError({
        code: TurnErrorCode.MANAGER_CLOSED,
        message: "Cannot create turn: turn manager is closed",
        sessionId: this.sessionId,
        runtimeId: this.runtimeId,
      });
    }

    if (input.id !== undefined && input.id.trim().length === 0) {
      throw new TurnError({
        code: TurnErrorCode.INVALID_TURN,
        message: "Turn id must be a non-empty string",
        sessionId: this.sessionId,
        runtimeId: this.runtimeId,
        field: "id",
      });
    }

    const turn = this.builder.build(input);
    if (this.turns.has(turn.id)) {
      throw new TurnError({
        code: TurnErrorCode.DUPLICATE_TURN,
        message: `Turn "${turn.id}" already exists`,
        turnId: turn.id,
        sessionId: this.sessionId,
        runtimeId: this.runtimeId,
      });
    }

    this.turns.set(turn.id, turn);
    this.publisher.emitCore("turn.started", {
      sessionId: this.sessionId,
      turnId: turn.id,
      data: { runtimeId: this.runtimeId },
    });
    return turn;
  }

  get(turnId: string): Turn | undefined {
    return this.turns.get(turnId);
  }

  list(): readonly Turn[] {
    return [...this.turns.values()];
  }

  async complete(turnId: string, input?: { result?: unknown }): Promise<void> {
    const turn = this.require(turnId);
    await turn.complete(input);
  }

  async cancel(turnId: string, reason?: unknown): Promise<void> {
    const turn = this.require(turnId);
    await turn.cancel(reason);
  }

  async cancelAll(reason?: unknown): Promise<void> {
    for (const turn of this.turns.values()) {
      if (
        turn.state === "created" ||
        turn.state === "running"
      ) {
        await turn.cancel(reason);
      }
    }
  }

  /**
   * Close the manager: cancel active turns and reject future create().
   * Idempotent.
   */
  async close(reason: unknown = "turn.manager.close"): Promise<void> {
    if (this._closed) return;
    await this.cancelAll(reason);
    this._closed = true;
  }

  private require(turnId: string): Turn {
    const turn = this.turns.get(turnId);
    if (turn === undefined) {
      throw new TurnError({
        code: TurnErrorCode.NOT_FOUND,
        message: `Turn "${turnId}" was not found`,
        turnId,
        sessionId: this.sessionId,
        runtimeId: this.runtimeId,
      });
    }
    return turn;
  }
}

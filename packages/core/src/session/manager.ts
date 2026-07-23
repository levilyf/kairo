/**
 * SessionManager — owns Session lifecycle for a Runtime.
 *
 * Runtime owns one manager and delegates session lifecycle operations to it.
 * The manager owns session identity, lifecycle, lookup, closeAll/shutdown, and
 * lifecycle event emission. It does not implement turns, context, memory, or AI.
 */

import type { EventBus } from "../events/event-bus.js";
import { EventPublisher } from "../events/publisher.js";
import type { CancellationRoot } from "../runtime/cancellation.js";
import { SessionBuilder, type CreateSessionInput } from "./builder.js";
import { SessionError, SessionErrorCode } from "./errors.js";
import type { Session } from "./session.js";

export interface SessionManagerOptions {
  readonly runtimeId: string;
  readonly events: EventBus;
  readonly cancellation: CancellationRoot;
}

export class SessionManager {
  private readonly runtimeId: string;
  private readonly publisher: EventPublisher;
  private readonly builder: SessionBuilder;
  private readonly sessions = new Map<string, Session>();
  private _closed = false;

  constructor(options: SessionManagerOptions) {
    this.runtimeId = options.runtimeId;
    this.publisher = new EventPublisher(options.events);
    this.builder = new SessionBuilder({
      runtimeId: options.runtimeId,
      cancellation: options.cancellation,
      publisher: this.publisher,
    });
  }

  get closed(): boolean {
    return this._closed;
  }

  get size(): number {
    return this.sessions.size;
  }

  async create(input: CreateSessionInput = {}): Promise<Session> {
    if (this._closed) {
      throw new SessionError({
        code: SessionErrorCode.MANAGER_CLOSED,
        message: "Cannot create session: session manager is closed",
        runtimeId: this.runtimeId,
      });
    }

    if (input.id !== undefined && input.id.trim().length === 0) {
      throw new SessionError({
        code: SessionErrorCode.INVALID_SESSION,
        message: "Session id must be a non-empty string",
        runtimeId: this.runtimeId,
        field: "id",
      });
    }

    const session = this.builder.build(input);
    if (this.sessions.has(session.id)) {
      throw new SessionError({
        code: SessionErrorCode.DUPLICATE_SESSION,
        message: `Session "${session.id}" already exists`,
        sessionId: session.id,
        runtimeId: this.runtimeId,
      });
    }

    this.sessions.set(session.id, session);
    this.publisher.emitCore("session.created", {
      sessionId: session.id,
      data: { runtimeId: this.runtimeId },
    });
    return session;
  }

  get(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  list(): readonly Session[] {
    return [...this.sessions.values()];
  }

  async close(sessionId?: string): Promise<void> {
    if (sessionId === undefined) {
      if (this._closed) return;
      await this.closeAll();
      this._closed = true;
      return;
    }

    const session = this.sessions.get(sessionId);
    if (session === undefined) {
      throw new SessionError({
        code: SessionErrorCode.NOT_FOUND,
        message: `Session "${sessionId}" was not found`,
        sessionId,
        runtimeId: this.runtimeId,
      });
    }
    await session.close();
  }

  async closeAll(): Promise<void> {
    for (const session of this.sessions.values()) {
      if (session.state !== "closed") {
        await session.close();
      }
    }
  }

}

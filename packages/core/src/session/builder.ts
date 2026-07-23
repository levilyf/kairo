/**
 * SessionBuilder — constructs Session instances for SessionManager.
 *
 * Kept small so future persistence/resume behavior can attach without
 * moving construction logic into Runtime.
 */

import type { CancellationRoot } from "../runtime/cancellation.js";
import type { EventPublisher } from "../events/publisher.js";
import { TurnManager } from "../turn/manager.js";
import { createSessionMetadata } from "./metadata.js";
import { Session } from "./session.js";

export interface CreateSessionInput {
  /** Optional explicit id. Generated when omitted. */
  readonly id?: string;
  /** Opaque extension metadata. */
  readonly metadata?: Record<string, unknown>;
}

export interface SessionBuilderOptions {
  readonly runtimeId: string;
  readonly cancellation: CancellationRoot;
  readonly publisher: EventPublisher;
}

export class SessionBuilder {
  private readonly runtimeId: string;
  private readonly cancellation: CancellationRoot;
  private readonly publisher: EventPublisher;

  constructor(options: SessionBuilderOptions) {
    this.runtimeId = options.runtimeId;
    this.cancellation = options.cancellation;
    this.publisher = options.publisher;
  }

  build(input: CreateSessionInput = {}): Session {
    const id = input.id ?? generateSessionId();
    const metadata = createSessionMetadata({
      id,
      runtimeId: this.runtimeId,
      ...(input.metadata !== undefined ? { data: input.metadata } : {}),
    });
    const cancellation = this.cancellation.child();
    const turns = new TurnManager({
      runtimeId: this.runtimeId,
      sessionId: id,
      cancellation,
      publisher: this.publisher,
    });
    return new Session({
      metadata,
      cancellation,
      publisher: this.publisher,
      turns,
    });
  }
}

function generateSessionId(): string {
  const rand =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `session-${rand}`;
}

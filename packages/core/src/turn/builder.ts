/**
 * TurnBuilder — constructs Turn instances for TurnManager.
 *
 * Kept small so future Agent Loop / Context attachment can extend construction
 * without moving ownership into Session or Runtime.
 */

import type { EventPublisher } from "../events/publisher.js";
import { createTurnMetadata } from "./metadata.js";
import { Turn, type TurnCancellationScope } from "./turn.js";

export interface CreateTurnInput {
  /** Optional explicit id. Generated when omitted. */
  readonly id?: string;
  /** Opaque extension metadata. */
  readonly metadata?: Record<string, unknown>;
}

export interface TurnBuilderOptions {
  readonly runtimeId: string;
  readonly sessionId: string;
  readonly parentCancellation: TurnCancellationScope;
  readonly publisher: EventPublisher;
}

export class TurnBuilder {
  private readonly runtimeId: string;
  private readonly sessionId: string;
  private readonly parentCancellation: TurnCancellationScope;
  private readonly publisher: EventPublisher;

  constructor(options: TurnBuilderOptions) {
    this.runtimeId = options.runtimeId;
    this.sessionId = options.sessionId;
    this.parentCancellation = options.parentCancellation;
    this.publisher = options.publisher;
  }

  build(input: CreateTurnInput = {}): Turn {
    const id = input.id ?? generateTurnId();
    const metadata = createTurnMetadata({
      id,
      sessionId: this.sessionId,
      runtimeId: this.runtimeId,
      ...(input.metadata !== undefined ? { data: input.metadata } : {}),
    });

    return new Turn({
      metadata,
      cancellation: createChildScope(this.parentCancellation.signal),
      publisher: this.publisher,
    });
  }
}

function generateTurnId(): string {
  const rand =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `turn-${rand}`;
}

/**
 * Nest a cancellation scope under a parent AbortSignal without depending on
 * CancellationRoot.child() (Session scopes are plain signal/abort pairs).
 */
function createChildScope(parent: AbortSignal): TurnCancellationScope {
  const child = new AbortController();

  const onAbort = () => {
    if (!child.signal.aborted) {
      child.abort(parent.reason);
    }
  };

  if (parent.aborted) {
    onAbort();
  } else {
    parent.addEventListener("abort", onAbort, { once: true });
  }

  return {
    signal: child.signal,
    abort: (reason?: unknown) => {
      if (!child.signal.aborted) {
        child.abort(reason);
      }
    },
  };
}

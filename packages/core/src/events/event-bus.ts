/**
 * EventBus — the nervous system of the Kairo runtime.
 *
 * Synchronous publish/subscribe for RuntimeEvents.
 * No global singleton. Injected into Runtime.
 *
 * Ordering guarantee: subscribers are called in registration order.
 * Nested publishes are queued and delivered breadth-first.
 * Error isolation: one failing subscriber does not break others.
 *
 * Events are for observation and loose coordination only.
 * They must never become the primary execution mechanism.
 *
 * Source of truth: docs/CORE.md §10, docs/CONTRACTS.md §Runtime Events
 */

import type { RuntimeEvent, RuntimeEventListener } from "../contracts/runtime-event.js";
import { dispatchEvent, type DispatchErrorHandler } from "./dispatcher.js";
import { EventError, EventErrorCode } from "./errors.js";
import type { EventFilter } from "./filter.js";
import { EventSubscription } from "./subscription.js";

export interface SubscribeOptions {
  /** Filter events delivered to this subscriber. */
  readonly filter?: EventFilter | undefined;
  /** Optional subscriber id for diagnostics. */
  readonly id?: string | undefined;
}

export interface PublishOptions {
  /** Error handler for subscriber failures. */
  readonly onError?: (error: unknown) => void;
}

export class EventBus {
  private readonly subscriptions: EventSubscription[] = [];
  private _closed = false;

  /**
   * Queue for breadth-first nested publish delivery.
   * When dispatch is in progress, new publishes are queued
   * and drained after the current dispatch completes.
   */
  private readonly publishQueue: Array<{
    event: RuntimeEvent;
    onError?: ((error: unknown) => void) | undefined;
  }> = [];
  private dispatching = false;

  get closed(): boolean {
    return this._closed;
  }

  get subscriberCount(): number {
    return this.subscriptions.length;
  }

  /**
   * Subscribe to runtime events.
   *
   * Returns an unsubscribe function (idempotent).
   */
  subscribe(
    listener: RuntimeEventListener,
    options: SubscribeOptions = {},
  ): () => void {
    if (this._closed) {
      throw new EventError({
        code: EventErrorCode.BUS_CLOSED,
        message: "Cannot subscribe: event bus is closed",
      });
    }

    const sub = new EventSubscription({
      listener,
      filter: options.filter,
      id: options.id,
    });

    this.subscriptions.push(sub);

    let removed = false;
    return () => {
      if (removed) return;
      removed = true;
      sub.cancel();
      const idx = this.subscriptions.indexOf(sub);
      if (idx !== -1) {
        this.subscriptions.splice(idx, 1);
      }
    };
  }

  /**
   * Publish an event to all matching subscribers.
   *
   * Synchronous. Errors are isolated per subscriber.
   * Nested publishes are queued and delivered breadth-first.
   */
  publish(event: RuntimeEvent, options: PublishOptions = {}): void {
    if (this._closed) {
      throw new EventError({
        code: EventErrorCode.BUS_CLOSED,
        message: "Cannot publish: event bus is closed",
        eventType: event.type,
      });
    }

    // Queue if already dispatching (nested publish)
    if (this.dispatching) {
      this.publishQueue.push({ event, onError: options.onError });
      return;
    }

    this.dispatching = true;
    try {
      this.dispatchOne(event, options.onError);

      // Drain nested publishes breadth-first
      while (this.publishQueue.length > 0) {
        const queued = this.publishQueue.shift()!;
        this.dispatchOne(queued.event, queued.onError);
      }
    } finally {
      this.dispatching = false;
    }
  }

  /**
   * Close the bus: remove all subscribers, reject future operations.
   * Idempotent.
   */
  close(): void {
    if (this._closed) return;
    this._closed = true;
    for (const sub of this.subscriptions) {
      sub.cancel();
    }
    this.subscriptions.length = 0;
    this.publishQueue.length = 0;
  }

  private dispatchOne(
    event: RuntimeEvent,
    onError?: (error: unknown) => void,
  ): void {
    const errorHandler: DispatchErrorHandler | undefined = onError
      ? (err) => onError(err)
      : undefined;

    // Snapshot subscriptions for iteration safety
    const snapshot = [...this.subscriptions];
    dispatchEvent(event, snapshot, errorHandler);
  }
}

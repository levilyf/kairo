/**
 * Event dispatcher — synchronous delivery of one event to a set of subscriptions.
 *
 * Error isolation: a failing subscriber does not prevent delivery to others.
 * Nested publishes are queued and delivered breadth-first after the current
 * dispatch completes to preserve ordering predictability.
 */

import type { RuntimeEvent } from "../contracts/runtime-event.js";
import type { EventSubscription } from "./subscription.js";

export type DispatchErrorHandler = (
  error: unknown,
  subscription: EventSubscription,
  event: RuntimeEvent,
) => void;

/**
 * Dispatch one event to all matching subscriptions.
 *
 * Synchronous. Errors in one listener do not prevent delivery to others.
 */
export function dispatchEvent(
  event: RuntimeEvent,
  subscriptions: readonly EventSubscription[],
  onError?: DispatchErrorHandler,
): void {
  for (const sub of subscriptions) {
    if (!sub.matches(event)) continue;
    try {
      // The contract listener signature is `void | Promise<void>`.
      // We intentionally do not await: the bus is synchronous for ordering.
      // Async listeners are fire-and-forget by design.
      sub.listener(event);
    } catch (error) {
      if (onError) {
        onError(error, sub, event);
      }
      // Swallow when no handler — error isolation.
    }
  }
}

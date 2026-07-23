/**
 * Event filter — structural + predicate matching for subscriptions.
 *
 * All structural fields combine with AND logic.
 * The `types` field matches any of the listed types (OR within that field).
 * The `predicate` is evaluated after structural filters pass.
 *
 * Source of truth: docs/CONTRACTS.md (Runtime Events)
 */

import type { RuntimeEvent, RuntimeEventType } from "../contracts/runtime-event.js";

/**
 * Declarative filter for event subscriptions.
 */
export interface EventFilter {
  /** Match any of these event types (OR). */
  readonly types?: readonly RuntimeEventType[];
  /** Match only events with this sessionId. */
  readonly sessionId?: string;
  /** Match only events with this turnId. */
  readonly turnId?: string;
  /** Match only events with this moduleId. */
  readonly moduleId?: string;
  /** Custom predicate evaluated after structural filters. */
  readonly predicate?: (event: RuntimeEvent) => boolean;
}

/**
 * Test whether an event matches a filter.
 *
 * Returns true when filter is undefined or empty (match-all).
 */
export function matchesFilter(
  event: RuntimeEvent,
  filter: EventFilter | undefined,
): boolean {
  if (filter === undefined) return true;

  // Type filter (OR within types list)
  if (filter.types !== undefined && filter.types.length > 0) {
    if (!filter.types.includes(event.type)) return false;
  }

  // Attribution filters (AND)
  if (filter.sessionId !== undefined && event.sessionId !== filter.sessionId) {
    return false;
  }
  if (filter.turnId !== undefined && event.turnId !== filter.turnId) {
    return false;
  }
  if (filter.moduleId !== undefined && event.moduleId !== filter.moduleId) {
    return false;
  }

  // Custom predicate (last — most expensive)
  if (filter.predicate !== undefined && !filter.predicate(event)) {
    return false;
  }

  return true;
}

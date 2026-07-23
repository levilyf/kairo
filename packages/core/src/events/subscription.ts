/**
 * Event subscription — internal bookkeeping for a single subscriber.
 *
 * Used by EventBus; not part of the public API.
 */

import type { RuntimeEvent, RuntimeEventListener } from "../contracts/runtime-event.js";
import type { EventFilter } from "./filter.js";
import { matchesFilter } from "./filter.js";

export interface SubscriptionOptions {
  readonly listener: RuntimeEventListener;
  readonly filter?: EventFilter | undefined;
  readonly id?: string | undefined;
}

/**
 * A single subscriber registration.
 */
export class EventSubscription {
  readonly id: string;
  readonly listener: RuntimeEventListener;
  readonly filter: EventFilter | undefined;
  private _active = true;

  constructor(options: SubscriptionOptions) {
    this.id = options.id ?? generateSubscriptionId();
    this.listener = options.listener;
    this.filter = options.filter;
  }

  get active(): boolean {
    return this._active;
  }

  /**
   * Test whether the event passes this subscription's filter.
   */
  matches(event: RuntimeEvent): boolean {
    return this._active && matchesFilter(event, this.filter);
  }

  /**
   * Mark this subscription as inactive.
   * Idempotent.
   */
  cancel(): void {
    this._active = false;
  }
}

let subCounter = 0;
function generateSubscriptionId(): string {
  return `sub-${++subCounter}`;
}

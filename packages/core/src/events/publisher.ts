/**
 * EventPublisher — convenience producer for the EventBus.
 *
 * Generates event ids/timestamps, provides typed convenience methods
 * for core and extension events. Publishers never know subscribers.
 *
 * Source of truth: docs/CONTRACTS.md (Runtime Events)
 */

import type {
  CoreRuntimeEvent,
  CoreRuntimeEventType,
  ExtensionRuntimeEvent,
  RuntimeEvent,
} from "../contracts/runtime-event.js";
import type { EventBus, PublishOptions } from "./event-bus.js";

export interface EventPublisherOptions {
  /** Default onError handler for all publishes from this publisher. */
  readonly onError?: ((error: unknown) => void) | undefined;
}

export interface CoreEventInput {
  readonly sessionId?: string;
  readonly turnId?: string;
  readonly moduleId?: string;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface ExtensionEventInput {
  readonly sessionId?: string;
  readonly turnId?: string;
  readonly moduleId?: string;
  readonly data: Readonly<Record<string, unknown>>;
}

export class EventPublisher {
  private readonly bus: EventBus;
  private readonly defaultOnError?: ((error: unknown) => void) | undefined;

  constructor(bus: EventBus, options: EventPublisherOptions = {}) {
    this.bus = bus;
    this.defaultOnError = options.onError;
  }

  /**
   * Publish a pre-built RuntimeEvent.
   */
  publish(event: RuntimeEvent, options?: PublishOptions): void {
    const opts = options ?? (this.defaultOnError ? { onError: this.defaultOnError } : {});
    this.bus.publish(event, opts);
  }

  /**
   * Emit a core platform event with auto-generated id and timestamp.
   */
  emitCore(
    type: CoreRuntimeEventType,
    input: CoreEventInput,
  ): CoreRuntimeEvent {
    const event: CoreRuntimeEvent = {
      type,
      id: generateEventId(),
      timestamp: Date.now(),
      data: input.data,
      ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
      ...(input.turnId !== undefined ? { turnId: input.turnId } : {}),
      ...(input.moduleId !== undefined ? { moduleId: input.moduleId } : {}),
    };

    this.publish(event);
    return event;
  }

  /**
   * Emit a namespaced extension event.
   */
  emitExtension(
    namespace: string,
    name: string,
    input: ExtensionEventInput,
  ): ExtensionRuntimeEvent {
    const event: ExtensionRuntimeEvent = {
      type: "extension",
      id: generateEventId(),
      timestamp: Date.now(),
      namespace,
      name,
      data: input.data,
      ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
      ...(input.turnId !== undefined ? { turnId: input.turnId } : {}),
      ...(input.moduleId !== undefined ? { moduleId: input.moduleId } : {}),
    };

    this.publish(event);
    return event;
  }
}

let eventCounter = 0;
function generateEventId(): string {
  return `evt-${Date.now().toString(36)}-${(++eventCounter).toString(36)}`;
}

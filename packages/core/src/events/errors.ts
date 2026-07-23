/**
 * Event system errors.
 *
 * Distinct from RuntimeError, ModuleError, HarnessError, ContractError, BindingError.
 * Attribute failures to event bus operations.
 */

export enum EventErrorCode {
  INVALID_EVENT = "INVALID_EVENT",
  PUBLISH_FAILED = "PUBLISH_FAILED",
  SUBSCRIPTION_FAILED = "SUBSCRIPTION_FAILED",
  BUS_CLOSED = "BUS_CLOSED",
}

export interface EventErrorOptions {
  code: EventErrorCode;
  message: string;
  eventType?: string;
  subscriberId?: string;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class EventError extends Error {
  readonly code: EventErrorCode;
  readonly eventType?: string;
  readonly subscriberId?: string;
  readonly details?: Record<string, unknown>;
  override readonly cause?: unknown;

  constructor(options: EventErrorOptions) {
    const parts = [
      options.eventType ? `event=${options.eventType}` : undefined,
      options.subscriberId ? `subscriber=${options.subscriberId}` : undefined,
    ].filter(Boolean);

    const prefix = parts.length > 0 ? `[${parts.join(" ")}] ` : "";
    super(`${prefix}${options.message}`, { cause: options.cause });
    this.name = "EventError";
    this.code = options.code;
    if (options.eventType !== undefined) this.eventType = options.eventType;
    if (options.subscriberId !== undefined)
      this.subscriberId = options.subscriberId;
    if (options.details !== undefined) this.details = options.details;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

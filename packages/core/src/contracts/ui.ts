/**
 * UI surface contract.
 *
 * Replaceable observation/control surfaces over public contracts.
 * No Ink, CLI, web framework, or product persona in Core.
 *
 * Source of truth: docs/CONTRACTS.md (UI)
 *
 * Headless operation must remain possible without any UI registration.
 */

import type { RuntimeEvent } from "./runtime-event.js";
import { ContractError, ContractErrorCode } from "./errors.js";

/**
 * Inputs a UI (or automation) may submit through public contracts.
 * Runtime will consume these later; this milestone only defines the shape.
 */
export type UIInput =
  | { type: "message"; text: string; metadata?: Readonly<Record<string, unknown>> }
  | {
      type: "command";
      commandId: string;
      args?: Readonly<Record<string, unknown>>;
      metadata?: Readonly<Record<string, unknown>>;
    }
  | {
      type: "cancel";
      target?: "turn" | "session" | string;
      metadata?: Readonly<Record<string, unknown>>;
    }
  | {
      type: "approval";
      requestId: string;
      decision: "allow" | "deny";
      metadata?: Readonly<Record<string, unknown>>;
    }
  | {
      type: "custom";
      name: string;
      payload?: unknown;
      metadata?: Readonly<Record<string, unknown>>;
    };

export interface UISubmitContext {
  sessionId?: string;
  turnId?: string;
  metadata?: Readonly<Record<string, unknown>>;
}

/**
 * UI contract.
 *
 * Implementations must:
 * - consume Runtime Events rather than scraping private state
 * - submit inputs/commands/cancellations/approvals through public contracts
 * - respect session boundaries
 * - avoid assuming a single product persona or domain
 */
export interface UI {
  /** Stable unique identifier (namespaced). */
  readonly id: string;
  /** Human-readable surface name. */
  readonly name: string;
  readonly description?: string;
  /** Receive a runtime event for display/observation. */
  onEvent(event: RuntimeEvent): void | Promise<void>;
  /**
   * Submit an operator/user input into the platform.
   * Actual routing is a future Runtime concern; the method is part of the surface contract.
   */
  submit(input: UIInput, context?: UISubmitContext): void | Promise<void>;
}

export function assertUI(value: unknown): asserts value is UI {
  if (!isPlainObject(value)) {
    throw invalid("ui", "UI must be an object");
  }
  assertNonEmptyString(value.id, "id");
  assertNonEmptyString(value.name, "name", value.id);
  if (typeof value.onEvent !== "function") {
    throw invalid("ui", "onEvent must be a function", "onEvent", value.id);
  }
  if (typeof value.submit !== "function") {
    throw invalid("ui", "submit must be a function", "submit", value.id);
  }
}

function invalid(
  contract: "ui",
  message: string,
  field?: string,
  id?: string,
): ContractError {
  return new ContractError({
    code: ContractErrorCode.INVALID_CONTRACT,
    message,
    contract,
    ...(field !== undefined ? { field } : {}),
    ...(id !== undefined ? { id } : {}),
  });
}

function assertNonEmptyString(
  value: unknown,
  field: string,
  id?: string,
): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw invalid("ui", `${field} must be a non-empty string`, field, id);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Provider contract.
 *
 * Abstract model inference backends. Provider-neutral, vendor-free.
 * Core owns the contract; modules own implementations.
 *
 * Source of truth: docs/CONTRACTS.md (Provider)
 *
 * Baseline: complete(). Streaming is additive via capabilities.streaming +
 * optional stream(). No vendor adapters here.
 */

import { ContractError, ContractErrorCode } from "./errors.js";

/** Declared optional capabilities a provider may support. */
export interface ProviderCapabilities {
  /** Whether the provider can stream partial results. */
  streaming: boolean;
  /** Whether the provider can request tool calls. */
  tools: boolean;
  /** Modalities this provider can handle in the baseline path. */
  modalities: readonly ProviderModality[];
}

export type ProviderModality = "text" | "image" | "audio" | "file" | string;

/**
 * A single content part in provider-neutral form.
 * Vendors map to/from this at the adapter boundary.
 */
export type ProviderContentPart =
  | { type: "text"; text: string }
  | { type: "image"; mimeType?: string; data?: string; uri?: string }
  | { type: "tool_call"; id: string; name: string; arguments: unknown }
  | { type: "tool_result"; id: string; name?: string; result: unknown }
  | { type: "data"; mimeType?: string; value: unknown };

export type ProviderMessageRole =
  | "system"
  | "user"
  | "assistant"
  | "tool"
  | string;

export interface ProviderMessage {
  role: ProviderMessageRole;
  content: readonly ProviderContentPart[];
}

export interface ProviderToolDefinition {
  id: string;
  name: string;
  description?: string;
  parameters?: unknown;
}

/**
 * Provider invocation request.
 * Intentionally minimal and vendor-neutral.
 */
export interface ProviderRequest {
  model: string;
  input: readonly ProviderMessage[];
  tools?: readonly ProviderToolDefinition[];
  /** Opaque provider options (temperature, etc.) — not interpreted by Core. */
  options?: Readonly<Record<string, unknown>>;
  /** Abort signal for cancellation propagation. */
  signal?: AbortSignal;
}

export type ProviderStopReason =
  | "end"
  | "tool_calls"
  | "length"
  | "cancelled"
  | "error"
  | string;

export interface ProviderResponse {
  id: string;
  output: readonly ProviderContentPart[];
  stopReason: ProviderStopReason;
  /** Optional model identifier actually used. */
  model?: string;
  /** Opaque usage / diagnostics — not required by Core. */
  usage?: Readonly<Record<string, unknown>>;
  metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Provider-neutral stream event.
 *
 * Produced by Provider.stream() when capabilities.streaming is true.
 * Gateway yields these with attribution; UI/chat consume them.
 * Partial tool-call deltas are reserved for later; message_end carries
 * the full ProviderResponse (including any tool_calls).
 */
export type ProviderStreamEvent =
  | { readonly type: "message_start" }
  | { readonly type: "text_delta"; readonly text: string }
  | {
      readonly type: "tool_call_delta";
      readonly id?: string;
      readonly name?: string;
      readonly argumentsDelta?: string;
    }
  | {
      readonly type: "usage";
      readonly usage: Readonly<Record<string, unknown>>;
    }
  | {
      readonly type: "message_end";
      readonly response: ProviderResponse;
    }
  | {
      readonly type: "error";
      readonly message: string;
      readonly cause?: unknown;
    };

/**
 * Provider contract.
 *
 * Implementations must:
 * - accept ProviderRequest
 * - return ProviderResponse from complete()
 * - when capabilities.streaming is true, implement stream()
 * - surface cancellations and failures in platform terms
 * - declare capabilities without forcing all providers to support everything
 *
 * Implementations must not:
 * - own tools, sessions, or UI
 * - require Core to understand vendor-only payloads for the baseline path
 */
export interface Provider {
  /** Stable unique identifier (namespaced). */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Optional short description. */
  readonly description?: string;
  /** Declared capabilities for negotiation. */
  readonly capabilities: ProviderCapabilities;
  /**
   * Perform a non-streaming completion. Always required.
   */
  complete(request: ProviderRequest): Promise<ProviderResponse>;
  /**
   * Stream partial results. Required when capabilities.streaming is true;
   * must be omitted (or absent) when streaming is false.
   */
  stream?(request: ProviderRequest): AsyncIterable<ProviderStreamEvent>;
}

export function assertProvider(value: unknown): asserts value is Provider {
  if (!isPlainObject(value)) {
    throw invalid("provider", "Provider must be an object");
  }
  assertNonEmptyString(value.id, "provider", "id");
  assertNonEmptyString(value.name, "provider", "name", value.id);
  if (!isPlainObject(value.capabilities)) {
    throw invalid("provider", "capabilities must be an object", "capabilities", value.id);
  }
  if (typeof value.capabilities.streaming !== "boolean") {
    throw invalid(
      "provider",
      "capabilities.streaming must be a boolean",
      "capabilities.streaming",
      value.id,
    );
  }
  if (typeof value.capabilities.tools !== "boolean") {
    throw invalid(
      "provider",
      "capabilities.tools must be a boolean",
      "capabilities.tools",
      value.id,
    );
  }
  if (!Array.isArray(value.capabilities.modalities)) {
    throw invalid(
      "provider",
      "capabilities.modalities must be an array",
      "capabilities.modalities",
      value.id,
    );
  }
  if (typeof value.complete !== "function") {
    throw invalid("provider", "complete must be a function", "complete", value.id);
  }

  const hasStream = typeof value.stream === "function";
  if (value.capabilities.streaming === true && !hasStream) {
    throw invalid(
      "provider",
      "stream must be a function when capabilities.streaming is true",
      "stream",
      value.id,
    );
  }
  if (hasStream && value.capabilities.streaming !== true) {
    throw invalid(
      "provider",
      "capabilities.streaming must be true when stream() is implemented",
      "capabilities.streaming",
      value.id,
    );
  }
}

function invalid(
  contract: "provider",
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
  contract: "provider",
  field: string,
  id?: string,
): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw invalid(contract, `${field} must be a non-empty string`, field, id);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

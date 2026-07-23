/**
 * Agent Loop options — harness-visible generic loop controls.
 *
 * Source of truth: docs/CONTRACTS.md (Agent Loop), docs/CORE.md
 */

import type { ContextMessage } from "../context/context.js";
import type { ProviderStreamEvent } from "../contracts/provider.js";

/** Default maximum provider/tool iterations for a single turn. */
export const DEFAULT_MAX_ITERATIONS = 8;

export interface LoopOptions {
  /**
   * Model identifier for Provider Gateway invocations.
   * Required — Core does not invent model defaults.
   */
  readonly model: string;
  /**
   * Optional explicit provider id. When omitted, Provider Gateway
   * selects the only registered provider or fails closed.
   */
  readonly providerId?: string;
  /**
   * Opaque provider options (temperature, etc.) forwarded to Provider Gateway.
   * Not interpreted by the loop.
   */
  readonly providerOptions?: Readonly<Record<string, unknown>>;
  /**
   * Maximum provider iterations (each assemble → provider call is one iteration).
   * Defaults to DEFAULT_MAX_ITERATIONS.
   */
  readonly maxIterations?: number;
  /**
   * Optional seed messages for this turn (user/system inputs).
   * Contributed via an ephemeral builder before registered builders.
   */
  readonly messages?: readonly ContextMessage[];
  /**
   * Optional seed instructions for this turn.
   * Contributed via an ephemeral builder before registered builders.
   */
  readonly instructions?: readonly string[];
  /**
   * Optional cancellation signal. Defaults to turn.cancellation.signal,
   * then AgentLoop's default signal.
   */
  readonly signal?: AbortSignal;
  /**
   * Opaque metadata forwarded to assembly and tool invocations.
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
  /**
   * When true, each provider iteration uses ProviderGateway.stream()
   * instead of invoke(). Fail closed if the provider cannot stream.
   * Tool execution still runs only after a full ProviderResponse is available.
   */
  readonly stream?: boolean;
  /**
   * Optional observer for provider-neutral stream events (per provider iteration).
   * Observation only — must not control loop flow.
   */
  readonly onStreamEvent?: (
    event: ProviderStreamEvent,
  ) => void | Promise<void>;
}

/**
 * ContextBuilder contract — module-facing contribution interface.
 *
 * Builders contribute provider-neutral fragments. They do not assemble a final
 * Context, do not translate vendor requests, and do not execute tools/providers.
 *
 * Source of truth: docs/CONTRACTS.md (Context Builder)
 */

import type { ContextBuilderContext } from "./context.js";
import {
  ContextBuilderError,
  ContextBuilderErrorCode,
} from "./errors.js";
import type { ContextBuilderResult } from "./result.js";

/**
 * Context Builder contribution contract.
 *
 * Implementations must:
 * - declare identity and optional ordering
 * - read only allowed inputs from ContextBuilderContext
 * - return provider-neutral fragments
 * - never mutate an existing Context
 * - never write provider payloads
 */
export interface ContextBuilder {
  /** Stable unique identifier (namespaced). */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** What this builder contributes. */
  readonly description?: string;
  /**
   * Explicit ordering priority. Lower numbers run first.
   * Default is 100. Ties are broken by registration order.
   */
  readonly priority?: number;
  /** Optional module attribution. */
  readonly moduleId?: string;
  /**
   * Optional tags describing contribution kinds
   * (e.g. "instructions", "messages", "tools") for discovery.
   */
  readonly tags?: readonly string[];
  /**
   * Contribute fragments for the given builder context.
   *
   * Must not mutate Context or Runtime internals.
   * Must remain provider-neutral.
   */
  build(
    context: ContextBuilderContext,
  ): ContextBuilderResult | Promise<ContextBuilderResult>;
}

/**
 * Validate a ContextBuilder contract value.
 */
export function assertContextBuilder(
  value: unknown,
): asserts value is ContextBuilder {
  if (!isPlainObject(value)) {
    throw new ContextBuilderError({
      code: ContextBuilderErrorCode.INVALID_BUILDER,
      message: "ContextBuilder must be an object",
    });
  }

  if (typeof value.id !== "string" || value.id.trim().length === 0) {
    throw new ContextBuilderError({
      code: ContextBuilderErrorCode.INVALID_BUILDER,
      message: "id must be a non-empty string",
      field: "id",
      ...(typeof value.id === "string" ? { builderId: value.id } : {}),
    });
  }

  if (typeof value.name !== "string" || value.name.trim().length === 0) {
    throw new ContextBuilderError({
      code: ContextBuilderErrorCode.INVALID_BUILDER,
      message: "name must be a non-empty string",
      field: "name",
      builderId: value.id,
    });
  }

  if (typeof value.build !== "function") {
    throw new ContextBuilderError({
      code: ContextBuilderErrorCode.INVALID_BUILDER,
      message: "build must be a function",
      field: "build",
      builderId: value.id,
    });
  }

  if (
    value.priority !== undefined &&
    (typeof value.priority !== "number" || !Number.isFinite(value.priority))
  ) {
    throw new ContextBuilderError({
      code: ContextBuilderErrorCode.INVALID_BUILDER,
      message: "priority must be a finite number when provided",
      field: "priority",
      builderId: value.id,
    });
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

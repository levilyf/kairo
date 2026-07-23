/**
 * Context Assembler options.
 *
 * Assembler is a pure Core service: inject a registry (or explicit builders),
 * pass turn attribution, get an immutable Context. No Runtime attachment.
 */

import type { ContextBuilder } from "../context-builder/builder.js";
import type { ContextBuilderRegistry } from "../context-builder/registry.js";

export interface ContextAssemblerOptions {
  /**
   * Registry used when assemble() does not override builders.
   * Optional if every assemble() call provides explicit builders.
   */
  readonly registry?: ContextBuilderRegistry;
  /** Optional default seed variables applied before builder fragments. */
  readonly variables?: Readonly<Record<string, unknown>>;
  /** Optional default seed metadata applied before builder fragments. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Per-assembly overrides. Explicit builders replace registry.resolve().
 */
export interface AssembleOptions {
  /** Override ordered builder list for this assembly only. */
  readonly builders?: readonly ContextBuilder[];
  /** Seed variables merged before builder fragments (last-write-wins later). */
  readonly variables?: Readonly<Record<string, unknown>>;
  /**
   * Seed metadata merged before builder fragments.
   * Input context.metadata is always included first when present.
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
  /** Optional explicit context id for the assembled Context. */
  readonly contextId?: string;
}

/**
 * Assembly result — immutable Context plus attribution of how it was built.
 */

import type { Context } from "../context/context.js";
import type { ContextBuilder } from "../context-builder/builder.js";
import type { ContextFragment } from "../context-builder/result.js";

export interface BuilderAssemblyRecord {
  readonly builderId: string;
  readonly fragmentCount: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface AssemblyResult {
  /** Immutable assembled Context (state = "assembled"). */
  readonly context: Context;
  /** Builders that ran, in execution order. */
  readonly builders: readonly ContextBuilder[];
  /** Flattened fragments in merge order (copies; original builder outputs untouched). */
  readonly fragments: readonly ContextFragment[];
  /** Per-builder bookkeeping for observability. */
  readonly builderResults: readonly BuilderAssemblyRecord[];
}

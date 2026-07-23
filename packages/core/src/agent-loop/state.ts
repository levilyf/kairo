/**
 * Agent Loop execution state.
 *
 * Loop-owned coordination state for a single Turn execution.
 * Not a product feature store. Not shared across turns.
 */

import type { ContextMessage } from "../context/context.js";
import type { LoopIteration } from "./iteration.js";

export type LoopStatus =
  | "idle"
  | "running"
  | "completed"
  | "cancelled"
  | "failed";

export interface LoopState {
  readonly status: LoopStatus;
  readonly turnId: string;
  readonly sessionId: string;
  readonly runtimeId: string;
  readonly iteration: number;
  readonly maxIterations: number;
  /** Accumulated conversation messages for subsequent assemblies. */
  readonly conversation: readonly ContextMessage[];
  readonly iterations: readonly LoopIteration[];
}

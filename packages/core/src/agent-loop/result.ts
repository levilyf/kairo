/**
 * Agent Loop result for one Turn execution.
 */

import type { ProviderResponse } from "../contracts/provider.js";
import type { LoopIteration } from "./iteration.js";
import type { LoopStatus } from "./state.js";

export interface LoopResult {
  readonly status: Extract<LoopStatus, "completed">;
  readonly turnId: string;
  readonly sessionId: string;
  readonly runtimeId: string;
  readonly iterations: readonly LoopIteration[];
  readonly finalResponse: ProviderResponse;
  readonly iterationCount: number;
}

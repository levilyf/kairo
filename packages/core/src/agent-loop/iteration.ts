/**
 * One Agent Loop iteration record.
 *
 * Captures the assemble → provider → optional tools step for observability
 * and LoopResult. Does not drive control-flow.
 */

import type { Context } from "../context/context.js";
import type {
  ProviderContentPart,
  ProviderResponse,
} from "../contracts/provider.js";
import type { ToolResult } from "../contracts/tool.js";

export interface LoopToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly toolId: string;
}

export interface LoopToolResult {
  readonly callId: string;
  readonly toolId: string;
  readonly name: string;
  readonly result: ToolResult;
}

export interface LoopIteration {
  readonly index: number;
  readonly context: Context;
  readonly response: ProviderResponse;
  readonly toolCalls: readonly LoopToolCall[];
  readonly toolResults: readonly LoopToolResult[];
  /** Raw assistant output content parts from the provider. */
  readonly assistantOutput: readonly ProviderContentPart[];
}

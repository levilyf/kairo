/**
 * Agent Loop public surface.
 *
 * Thin orchestration over ContextAssembler, ProviderGateway, ToolRouter.
 */

export { AgentLoop, type AgentLoopOptions, type LoopTurn } from "./loop.js";
export {
  DEFAULT_MAX_ITERATIONS,
  type LoopOptions,
} from "./options.js";
export type { LoopResult } from "./result.js";
export type { LoopState, LoopStatus } from "./state.js";
export type {
  LoopIteration,
  LoopToolCall,
  LoopToolResult,
} from "./iteration.js";
export {
  AgentLoopError,
  AgentLoopErrorCode,
  type AgentLoopErrorOptions,
} from "./errors.js";

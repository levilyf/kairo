/**
 * Tool Router public surface.
 *
 * Sole Core path to Tool.execute(). Provider-neutral execution boundary.
 */

export {
  ToolRouter,
  type ToolInvokeInput,
  type ToolRouterOptions,
} from "./router.js";
export {
  selectTool,
  type ToolSelection,
  type ToolSelectionInput,
} from "./selection.js";
export {
  validateToolArguments,
  type ValidateToolArgumentsOptions,
} from "./validation.js";
export {
  assertToolResult,
  type ToolInvocation,
  type ToolRouterResult,
} from "./result.js";
export {
  ToolRouterError,
  ToolRouterErrorCode,
  type ToolRouterErrorOptions,
} from "./errors.js";

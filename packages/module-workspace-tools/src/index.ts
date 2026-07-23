/**
 * @kairo/module-workspace-tools
 *
 * Minimal, secure filesystem capabilities for Kairo, delivered as a
 * composable module. Today it contributes exactly one tool: read_file.
 *
 * The module plugs into Core's contribution-binding path (capability
 * "tool"); it owns no provider, Agent Loop, ToolRouter, CLI, or harness
 * lifecycle logic. Core remains unchanged.
 */

export {
  createReadFileTool,
  READ_FILE_TOOL_ID,
  READ_FILE_TOOL_NAME,
  DEFAULT_MAX_BYTES,
  type ReadFileToolOptions,
  type ReadFileData,
} from "./read-file.js";

export {
  createWorkspaceToolsModule,
  WORKSPACE_TOOLS_MODULE_ID,
  type WorkspaceToolsModuleOptions,
} from "./module.js";

export {
  createWorkspaceToolDefinitionsBuilder,
  WORKSPACE_TOOL_DEFINITIONS_BUILDER_ID,
} from "./tool-definitions.js";

export { ReadFileErrorCode } from "./errors.js";

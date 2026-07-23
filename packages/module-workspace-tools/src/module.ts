/**
 * Workspace tools module.
 *
 * Wraps the workspace tools as a self-contained {@link ModuleSource} so a
 * harness can compose them through Core's normal contribution-binding
 * path. The module declares a `"tool"` capability and, on
 * `initialize()`, registers each tool against the tool contribution
 * surface. It bypasses no Core mechanism and special-cases no harness.
 *
 * Today it contributes exactly one tool: read_file.
 */

import type { Module, ModuleManifest, ModuleSource } from "@kairo/core";

import { createReadFileTool, DEFAULT_MAX_BYTES } from "./read-file.js";
import { createWorkspaceToolDefinitionsBuilder } from "./tool-definitions.js";

/** Stable module id. */
export const WORKSPACE_TOOLS_MODULE_ID = "kairo/workspace-tools";
const MODULE_VERSION = "0.1.0";

export interface WorkspaceToolsModuleOptions {
  /** Absolute path to the workspace root the tools are confined to. */
  readonly root: string;
  /** Maximum number of bytes a single read returns. Defaults to 1 MiB. */
  readonly maxBytes?: number;
}

/**
 * Create the workspace tools {@link ModuleSource}.
 */
export function createWorkspaceToolsModule(
  options: WorkspaceToolsModuleOptions,
): ModuleSource {
  if (options === null || typeof options !== "object") {
    throw new TypeError(
      "createWorkspaceToolsModule() requires an options object with a 'root'",
    );
  }
  if (typeof options.root !== "string" || options.root.trim().length === 0) {
    throw new TypeError(
      "createWorkspaceToolsModule() requires a non-empty 'root' path",
    );
  }

  const readFileTool = createReadFileTool({
    root: options.root,
    ...(options.maxBytes !== undefined ? { maxBytes: options.maxBytes } : {}),
  });
  const tools = [readFileTool];
  const toolDefinitionsBuilder = createWorkspaceToolDefinitionsBuilder(tools);

  const manifest: ModuleManifest = {
    id: WORKSPACE_TOOLS_MODULE_ID,
    name: "Kairo workspace tools",
    version: MODULE_VERSION,
    description: "Minimal, workspace-confined filesystem tools (read_file).",
    // The module both registers tools and advertises their model-facing
    // definitions, so the model can discover them through normal context
    // assembly without any harness special-casing.
    capabilities: ["tool", "context.builder"],
    dependencies: [],
    // Manifest permissions must be granted by the composing harness. The
    // tool declares its own informational `permissions` ("workspace.read")
    // which the ToolRouter forwards via grantedPermissions; the module
    // itself needs no harness-granted permission to be composed.
    permissions: [],
    compatibility: { min: "0.1.0" },
  };

  const module: Module = {
    manifest,
    async initialize(context) {
      for (const tool of tools) {
        context.registerContribution({
          capability: "tool",
          id: tool.id,
          value: tool,
        });
      }
      context.registerContribution({
        capability: "context.builder",
        id: toolDefinitionsBuilder.id,
        value: toolDefinitionsBuilder,
      });
    },
  };

  return {
    manifest,
    load: async () => module,
  };
}

export { DEFAULT_MAX_BYTES };

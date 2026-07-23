/**
 * Tool selection — resolve which Tool to invoke.
 *
 * Explicit toolId is required. The Tool Router never chooses tools.
 * Selection is lookup only; the future Agent Loop decides which tool to call.
 */

import type { Tool } from "../contracts/tool.js";
import type { ToolRegistry } from "../registries/tool-registry.js";
import {
  ToolRouterError,
  ToolRouterErrorCode,
  type ToolRouterErrorOptions,
} from "./errors.js";

export interface ToolSelectionInput {
  readonly toolId: string;
  readonly tools: ToolRegistry;
  readonly sessionId?: string;
  readonly turnId?: string;
  readonly runtimeId?: string;
}

export interface ToolSelection {
  readonly tool: Tool;
  readonly toolId: string;
}

export function selectTool(input: ToolSelectionInput): ToolSelection {
  const attribution = pickAttribution(input);

  if (typeof input.toolId !== "string" || input.toolId.trim().length === 0) {
    throw new ToolRouterError({
      code: ToolRouterErrorCode.INVALID_INVOCATION,
      message: "toolId must be a non-empty string",
      field: "toolId",
      ...attribution,
    });
  }

  const tool = input.tools.get(input.toolId);
  if (tool === undefined) {
    throw new ToolRouterError({
      code: ToolRouterErrorCode.TOOL_NOT_FOUND,
      message: `Tool "${input.toolId}" was not found`,
      toolId: input.toolId,
      ...attribution,
    });
  }

  return { tool, toolId: tool.id };
}

function pickAttribution(
  input: ToolSelectionInput,
): Pick<ToolRouterErrorOptions, "sessionId" | "turnId" | "runtimeId"> {
  return {
    ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
    ...(input.turnId !== undefined ? { turnId: input.turnId } : {}),
    ...(input.runtimeId !== undefined ? { runtimeId: input.runtimeId } : {}),
  };
}

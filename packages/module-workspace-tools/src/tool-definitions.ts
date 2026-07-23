/**
 * Tool-definitions context builder.
 *
 * A registered {@link Tool} is invocable through the ToolRouter, but the
 * *model* only discovers it when its definition is assembled into the
 * Context (`toolDefinitions`). Rather than special-case the harness, the
 * workspace-tools module self-advertises its tools: it contributes a
 * `context.builder` that emits one tool definition per tool it owns.
 *
 * This keeps composition symmetric — composing the module delivers both
 * the tool (capability "tool") and its model-facing definition
 * (capability "context.builder") through Core's normal paths. Core is
 * unchanged.
 */

import type { ContextBuilder, Tool } from "@kairo/core";
import { createContextFragment } from "@kairo/core";

/** Builder id for the workspace tool-definitions advertiser. */
export const WORKSPACE_TOOL_DEFINITIONS_BUILDER_ID =
  "kairo/workspace-tools/tool-definitions";

/**
 * Build a {@link ContextBuilder} that advertises the given tools' model
 * facing definitions (id, name, description, parameters) as a single
 * `toolDefinitions` fragment.
 */
export function createWorkspaceToolDefinitionsBuilder(
  tools: readonly Tool[],
): ContextBuilder {
  const definitions = tools.map((tool) => ({
    id: tool.id,
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));

  return {
    id: WORKSPACE_TOOL_DEFINITIONS_BUILDER_ID,
    name: "Kairo workspace tool definitions",
    description:
      "Advertises workspace tool definitions so the model can call them.",
    // Run after the system prompt; ordering among tool defs is irrelevant.
    priority: 20,
    tags: Object.freeze(["tools"]),
    build() {
      return {
        fragments: [createContextFragment({ toolDefinitions: definitions })],
      };
    },
  };
}

/**
 * Tool registry — lookup only.
 * Does not execute tools.
 */

import { assertTool, type Tool } from "../contracts/tool.js";
import { Registry } from "./registry.js";

export class ToolRegistry extends Registry<Tool> {
  constructor() {
    super("tool", assertTool);
  }
}

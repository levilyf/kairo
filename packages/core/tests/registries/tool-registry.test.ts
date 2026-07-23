import { describe, expect, it } from "vitest";
import {
  ContractError,
  ContractErrorCode,
  ToolRegistry,
  type Tool,
} from "../../src/index.js";

function makeTool(id: string): Tool {
  return {
    id,
    name: id,
    description: `Tool ${id}`,
    parameters: { type: "object", properties: {} },
    async execute() {
      return { ok: true };
    },
  };
}

describe("ToolRegistry", () => {
  it("registers, gets, has, lists, and unregisters", () => {
    const registry = new ToolRegistry();
    const tool = makeTool("acme/echo");
    registry.register(tool);

    expect(registry.has("acme/echo")).toBe(true);
    expect(registry.get("acme/echo")).toBe(tool);
    expect(registry.list()).toHaveLength(1);
    expect(registry.unregister("acme/echo")).toBe(true);
    expect(registry.has("acme/echo")).toBe(false);
  });

  it("rejects duplicates without silent override", () => {
    const registry = new ToolRegistry();
    registry.register(makeTool("acme/echo"));
    expect(() => registry.register(makeTool("acme/echo"))).toThrow(
      ContractError,
    );
    try {
      registry.register(makeTool("acme/echo"));
    } catch (error) {
      expect(error).toMatchObject({
        code: ContractErrorCode.DUPLICATE_ID,
        contract: "tool",
      });
    }
  });

  it("validates tools on register", () => {
    const registry = new ToolRegistry();
    expect(() => registry.register(makeTool(""))).toThrow(ContractError);
  });
});

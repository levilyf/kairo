import { describe, expect, it } from "vitest";
import {
  assertTool,
  ContractError,
  ContractErrorCode,
  type Tool,
} from "../../src/index.js";

function makeTool(overrides: Partial<Tool> = {}): Tool {
  return {
    id: "test/echo",
    name: "Echo",
    description: "Echoes input",
    parameters: {
      type: "object",
      properties: {
        message: { type: "string" },
      },
      required: ["message"],
    },
    async execute(args) {
      return { ok: true, data: args };
    },
    ...overrides,
  };
}

describe("Tool contract", () => {
  it("accepts a valid tool", () => {
    expect(() => assertTool(makeTool())).not.toThrow();
  });

  it("rejects missing description", () => {
    try {
      assertTool(makeTool({ description: "" }));
    } catch (error) {
      expect(error).toMatchObject({
        code: ContractErrorCode.INVALID_CONTRACT,
        contract: "tool",
        field: "description",
      });
    }
  });

  it("rejects missing execute", () => {
    const tool = makeTool();
    // @ts-expect-error intentional
    delete tool.execute;
    expect(() => assertTool(tool)).toThrow(ContractError);
  });

  it("keeps tools distinct from commands by shape", () => {
    const tool = makeTool();
    expect("parameters" in tool).toBe(true);
    expect("execute" in tool).toBe(true);
  });
});

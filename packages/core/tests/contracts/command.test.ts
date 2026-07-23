import { describe, expect, it } from "vitest";
import {
  assertCommand,
  ContractError,
  ContractErrorCode,
  type Command,
} from "../../src/index.js";

function makeCommand(overrides: Partial<Command> = {}): Command {
  return {
    id: "test/status",
    name: "status",
    description: "Show status",
    parameters: {
      type: "object",
      properties: {},
    },
    async execute() {
      return { ok: true, message: "ok" };
    },
    ...overrides,
  };
}

describe("Command contract", () => {
  it("accepts a valid command", () => {
    expect(() => assertCommand(makeCommand())).not.toThrow();
  });

  it("rejects missing name", () => {
    try {
      assertCommand(makeCommand({ name: "" }));
    } catch (error) {
      expect(error).toMatchObject({
        code: ContractErrorCode.INVALID_CONTRACT,
        contract: "command",
        field: "name",
      });
    }
  });

  it("rejects missing execute", () => {
    const command = makeCommand();
    // @ts-expect-error intentional
    delete command.execute;
    expect(() => assertCommand(command)).toThrow(ContractError);
  });
});

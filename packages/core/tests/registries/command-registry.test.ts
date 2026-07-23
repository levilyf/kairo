import { describe, expect, it } from "vitest";
import {
  CommandRegistry,
  ContractError,
  ContractErrorCode,
  type Command,
} from "../../src/index.js";

function makeCommand(id: string): Command {
  return {
    id,
    name: id,
    description: `Command ${id}`,
    parameters: { type: "object", properties: {} },
    async execute() {
      return { ok: true };
    },
  };
}

describe("CommandRegistry", () => {
  it("registers, gets, has, lists, and unregisters", () => {
    const registry = new CommandRegistry();
    const command = makeCommand("acme/status");
    registry.register(command);

    expect(registry.has("acme/status")).toBe(true);
    expect(registry.get("acme/status")).toBe(command);
    expect(registry.list().map((c) => c.id)).toEqual(["acme/status"]);
    expect(registry.unregister("acme/status")).toBe(true);
    expect(registry.get("missing")).toBeUndefined();
  });

  it("rejects duplicates", () => {
    const registry = new CommandRegistry();
    registry.register(makeCommand("acme/status"));
    expect(() => registry.register(makeCommand("acme/status"))).toThrow(
      ContractError,
    );
    try {
      registry.register(makeCommand("acme/status"));
    } catch (error) {
      expect(error).toMatchObject({
        code: ContractErrorCode.DUPLICATE_ID,
        contract: "command",
      });
    }
  });
});

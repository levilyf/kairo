import { describe, expect, it } from "vitest";
import {
  ContractError,
  ContractErrorCode,
  UIRegistry,
  type UI,
} from "../../src/index.js";

function makeUI(id: string): UI {
  return {
    id,
    name: id,
    async onEvent() {},
    async submit() {},
  };
}

describe("UIRegistry", () => {
  it("registers, gets, has, lists, and unregisters", () => {
    const registry = new UIRegistry();
    const ui = makeUI("acme/tui");
    registry.register(ui);

    expect(registry.has("acme/tui")).toBe(true);
    expect(registry.get("acme/tui")).toBe(ui);
    expect(registry.list()).toHaveLength(1);
    expect(registry.unregister("acme/tui")).toBe(true);
    expect(registry.has("acme/tui")).toBe(false);
  });

  it("rejects duplicates", () => {
    const registry = new UIRegistry();
    registry.register(makeUI("acme/tui"));
    expect(() => registry.register(makeUI("acme/tui"))).toThrow(ContractError);
    try {
      registry.register(makeUI("acme/tui"));
    } catch (error) {
      expect(error).toMatchObject({
        code: ContractErrorCode.DUPLICATE_ID,
        contract: "ui",
      });
    }
  });

  it("validates UI contracts on register", () => {
    const registry = new UIRegistry();
    expect(() => registry.register(makeUI(""))).toThrow(ContractError);
  });
});

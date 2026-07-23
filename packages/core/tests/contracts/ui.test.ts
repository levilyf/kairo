import { describe, expect, it } from "vitest";
import {
  assertUI,
  ContractError,
  ContractErrorCode,
  type UI,
  type UIInput,
} from "../../src/index.js";

function makeUI(overrides: Partial<UI> = {}): UI {
  return {
    id: "test/headless-ui",
    name: "Headless UI",
    description: "Test surface",
    async onEvent() {},
    async submit() {},
    ...overrides,
  };
}

describe("UI contract", () => {
  it("accepts a valid UI surface", () => {
    expect(() => assertUI(makeUI())).not.toThrow();
  });

  it("rejects missing onEvent", () => {
    const ui = makeUI();
    // @ts-expect-error intentional
    delete ui.onEvent;
    expect(() => assertUI(ui)).toThrow(ContractError);
  });

  it("rejects empty id", () => {
    try {
      assertUI(makeUI({ id: "" }));
    } catch (error) {
      expect(error).toMatchObject({
        code: ContractErrorCode.INVALID_CONTRACT,
        contract: "ui",
        field: "id",
      });
    }
  });

  it("describes provider-neutral UI input kinds", () => {
    const inputs: UIInput[] = [
      { type: "message", text: "hello" },
      { type: "command", commandId: "test/status", args: {} },
      { type: "cancel", target: "turn" },
      { type: "approval", requestId: "req-1", decision: "allow" },
    ];
    expect(inputs).toHaveLength(4);
  });
});

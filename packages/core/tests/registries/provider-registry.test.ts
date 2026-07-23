import { describe, expect, it } from "vitest";
import {
  ContractError,
  ContractErrorCode,
  ProviderRegistry,
  type Provider,
} from "../../src/index.js";

function makeProvider(id: string): Provider {
  return {
    id,
    name: id,
    capabilities: { streaming: false, tools: false, modalities: ["text"] },
    async complete() {
      return {
        id: "r",
        output: [{ type: "text", text: "x" }],
        stopReason: "end",
      };
    },
  };
}

describe("ProviderRegistry", () => {
  it("registers, gets, has, and lists providers", () => {
    const registry = new ProviderRegistry();
    const provider = makeProvider("acme/p1");

    registry.register(provider);

    expect(registry.has("acme/p1")).toBe(true);
    expect(registry.get("acme/p1")).toBe(provider);
    expect(registry.list().map((p) => p.id)).toEqual(["acme/p1"]);
  });

  it("rejects duplicate ids", () => {
    const registry = new ProviderRegistry();
    registry.register(makeProvider("acme/p1"));

    expect(() => registry.register(makeProvider("acme/p1"))).toThrow(
      ContractError,
    );
    try {
      registry.register(makeProvider("acme/p1"));
    } catch (error) {
      expect(error).toMatchObject({
        code: ContractErrorCode.DUPLICATE_ID,
        contract: "provider",
        id: "acme/p1",
      });
    }
  });

  it("unregisters providers", () => {
    const registry = new ProviderRegistry();
    registry.register(makeProvider("acme/p1"));

    expect(registry.unregister("acme/p1")).toBe(true);
    expect(registry.has("acme/p1")).toBe(false);
    expect(registry.unregister("acme/p1")).toBe(false);
  });

  it("validates contracts on register", () => {
    const registry = new ProviderRegistry();
    expect(() =>
      registry.register(makeProvider("")),
    ).toThrow(ContractError);
  });

  it("lists in stable id order", () => {
    const registry = new ProviderRegistry();
    registry.register(makeProvider("acme/b"));
    registry.register(makeProvider("acme/a"));
    expect(registry.list().map((p) => p.id)).toEqual(["acme/a", "acme/b"]);
  });

  it("does not execute providers", () => {
    let called = false;
    const registry = new ProviderRegistry();
    registry.register({
      ...makeProvider("acme/p1"),
      async complete() {
        called = true;
        return {
          id: "r",
          output: [{ type: "text", text: "x" }],
          stopReason: "end",
        };
      },
    });
    registry.get("acme/p1");
    registry.list();
    expect(called).toBe(false);
  });
});

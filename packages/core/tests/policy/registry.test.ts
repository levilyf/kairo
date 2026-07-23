import { describe, expect, it } from "vitest";
import {
  PolicyRegistry,
  PolicyError,
  PolicyErrorCode,
  type PolicyHook,
} from "../../src/index.js";

function makeHook(
  id: string,
  overrides: Partial<PolicyHook> = {},
): PolicyHook {
  return {
    id,
    evaluate: overrides.evaluate ?? (() => ({ verdict: "allow" as const })),
    ...overrides,
  };
}

describe("PolicyRegistry", () => {
  // ── Registration ──

  it("registers a hook and retrieves it by id", () => {
    const reg = new PolicyRegistry();
    const hook = makeHook("test/allow-all");
    reg.register(hook);

    expect(reg.size).toBe(1);
    expect(reg.get("test/allow-all")).toBe(hook);
  });

  it("rejects duplicate hook ids", () => {
    const reg = new PolicyRegistry();
    reg.register(makeHook("dup"));

    expect(() => reg.register(makeHook("dup"))).toThrow(PolicyError);
    try {
      reg.register(makeHook("dup"));
    } catch (error) {
      expect((error as PolicyError).code).toBe(PolicyErrorCode.DUPLICATE_HOOK);
    }
  });

  it("rejects hooks with empty id", () => {
    const reg = new PolicyRegistry();
    expect(() => reg.register(makeHook(""))).toThrow(PolicyError);
    try {
      reg.register(makeHook(""));
    } catch (error) {
      expect((error as PolicyError).code).toBe(PolicyErrorCode.INVALID_HOOK);
    }
  });

  it("rejects hooks without evaluate function", () => {
    const reg = new PolicyRegistry();
    const bad = { id: "no-eval" } as unknown as PolicyHook;
    expect(() => reg.register(bad)).toThrow(PolicyError);
  });

  it("rejects registration after close", () => {
    const reg = new PolicyRegistry();
    reg.close();
    expect(() => reg.register(makeHook("late"))).toThrow(PolicyError);
    try {
      reg.register(makeHook("late"));
    } catch (error) {
      expect((error as PolicyError).code).toBe(PolicyErrorCode.MANAGER_CLOSED);
    }
  });

  // ── Removal ──

  it("removes a hook by id", () => {
    const reg = new PolicyRegistry();
    reg.register(makeHook("r1"));
    expect(reg.remove("r1")).toBe(true);
    expect(reg.size).toBe(0);
    expect(reg.get("r1")).toBeUndefined();
  });

  it("returns false when removing non-existent hook", () => {
    const reg = new PolicyRegistry();
    expect(reg.remove("nope")).toBe(false);
  });

  it("allows re-registration after removal", () => {
    const reg = new PolicyRegistry();
    reg.register(makeHook("re"));
    reg.remove("re");
    expect(() => reg.register(makeHook("re"))).not.toThrow();
    expect(reg.size).toBe(1);
  });

  // ── Resolution ──

  it("resolves hooks applicable to a given action", () => {
    const reg = new PolicyRegistry();
    reg.register(makeHook("tool-gate", { actions: ["tool.invoke"] }));
    reg.register(makeHook("provider-gate", { actions: ["provider.call"] }));
    reg.register(makeHook("universal")); // no actions → applies to all

    const toolHooks = reg.resolve("tool.invoke");
    expect(toolHooks.map((h) => h.id)).toEqual(["tool-gate", "universal"]);

    const providerHooks = reg.resolve("provider.call");
    expect(providerHooks.map((h) => h.id)).toEqual([
      "provider-gate",
      "universal",
    ]);
  });

  it("sorts resolved hooks by priority (ascending), then registration order", () => {
    const reg = new PolicyRegistry();
    reg.register(makeHook("c", { priority: 200 }));
    reg.register(makeHook("a", { priority: 10 }));
    reg.register(makeHook("b", { priority: 10 })); // tie with "a"
    reg.register(makeHook("d")); // default priority 100

    const hooks = reg.resolve("anything");
    expect(hooks.map((h) => h.id)).toEqual(["a", "b", "d", "c"]);
  });

  it("returns empty array when no hooks match", () => {
    const reg = new PolicyRegistry();
    reg.register(makeHook("specific", { actions: ["tool.invoke"] }));
    expect(reg.resolve("provider.call")).toEqual([]);
  });

  // ── List ──

  it("lists all registered hooks in registration order", () => {
    const reg = new PolicyRegistry();
    reg.register(makeHook("x"));
    reg.register(makeHook("y"));
    reg.register(makeHook("z"));

    const listed = reg.list();
    expect(listed.map((h) => h.id)).toEqual(["x", "y", "z"]);
  });

  // ── Clear ──

  it("clears all hooks", () => {
    const reg = new PolicyRegistry();
    reg.register(makeHook("a"));
    reg.register(makeHook("b"));
    reg.clear();
    expect(reg.size).toBe(0);
    expect(reg.list()).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import {
  assertPolicyHook,
  PolicyError,
  PolicyErrorCode,
} from "../../src/index.js";

describe("assertPolicyHook", () => {
  it("accepts a valid hook with id and evaluate", () => {
    expect(() =>
      assertPolicyHook({
        id: "test/hook",
        evaluate: () => ({ verdict: "allow" }),
      }),
    ).not.toThrow();
  });

  it("accepts a hook with all optional fields", () => {
    expect(() =>
      assertPolicyHook({
        id: "test/full",
        description: "A full hook",
        actions: ["provider.call", "tool.invoke"],
        priority: 10,
        evaluate: () => ({ verdict: "allow" }),
      }),
    ).not.toThrow();
  });

  it("rejects non-object values", () => {
    expect(() => assertPolicyHook(null)).toThrow(PolicyError);
    expect(() => assertPolicyHook("string")).toThrow(PolicyError);
    expect(() => assertPolicyHook(42)).toThrow(PolicyError);
    expect(() => assertPolicyHook(undefined)).toThrow(PolicyError);
  });

  it("rejects missing or invalid id", () => {
    expect(() =>
      assertPolicyHook({ evaluate: () => ({ verdict: "allow" }) }),
    ).toThrow(PolicyError);
    expect(() =>
      assertPolicyHook({ id: "", evaluate: () => ({ verdict: "allow" }) }),
    ).toThrow(PolicyError);
    expect(() =>
      assertPolicyHook({ id: 42, evaluate: () => ({ verdict: "allow" }) }),
    ).toThrow(PolicyError);
  });

  it("rejects missing or invalid evaluate", () => {
    expect(() => assertPolicyHook({ id: "test/hook" })).toThrow(PolicyError);
    expect(() =>
      assertPolicyHook({ id: "test/hook", evaluate: "not-a-function" }),
    ).toThrow(PolicyError);
  });

  it("rejects invalid priority", () => {
    expect(() =>
      assertPolicyHook({
        id: "test/hook",
        evaluate: () => ({ verdict: "allow" }),
        priority: "high",
      }),
    ).toThrow(PolicyError);
    expect(() =>
      assertPolicyHook({
        id: "test/hook",
        evaluate: () => ({ verdict: "allow" }),
        priority: NaN,
      }),
    ).toThrow(PolicyError);
    expect(() =>
      assertPolicyHook({
        id: "test/hook",
        evaluate: () => ({ verdict: "allow" }),
        priority: Infinity,
      }),
    ).toThrow(PolicyError);
  });

  it("rejects invalid actions", () => {
    expect(() =>
      assertPolicyHook({
        id: "test/hook",
        evaluate: () => ({ verdict: "allow" }),
        actions: "not-an-array",
      }),
    ).toThrow(PolicyError);
    expect(() =>
      assertPolicyHook({
        id: "test/hook",
        evaluate: () => ({ verdict: "allow" }),
        actions: [42],
      }),
    ).toThrow(PolicyError);
  });

  it("uses INVALID_HOOK error code", () => {
    try {
      assertPolicyHook({ id: "" });
      expect.unreachable("expected to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PolicyError);
      expect((error as PolicyError).code).toBe(PolicyErrorCode.INVALID_HOOK);
    }
  });
});

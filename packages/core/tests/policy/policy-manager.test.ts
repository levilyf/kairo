import { describe, expect, it, vi } from "vitest";
import {
  PolicyManager,
  PolicyError,
  PolicyErrorCode,
  type PolicyContext,
  type PolicyHook,
} from "../../src/index.js";

function ctx(
  action = "tool.invoke",
  subject = "test/echo",
  extra: Partial<PolicyContext> = {},
): PolicyContext {
  return { action, subject, ...extra };
}

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

describe("PolicyManager", () => {
  // ── allow ──

  it("returns allow when a single hook allows", async () => {
    const mgr = new PolicyManager();
    mgr.registry.register(makeHook("gate", {
      evaluate: () => ({ verdict: "allow", reason: "all good" }),
    }));

    const decision = await mgr.evaluate(ctx());
    expect(decision.verdict).toBe("allow");
    expect(decision.allowed).toBe(true);
    expect(decision.denied).toBe(false);
    expect(decision.decisions).toHaveLength(1);
    expect(decision.decisions[0]!.verdict).toBe("allow");
    expect(decision.decisions[0]!.reason).toBe("all good");
  });

  it("returns allow when multiple hooks allow", async () => {
    const mgr = new PolicyManager();
    mgr.registry.register(makeHook("a", {
      evaluate: () => ({ verdict: "allow" }),
    }));
    mgr.registry.register(makeHook("b", {
      evaluate: () => ({ verdict: "allow" }),
    }));

    const decision = await mgr.evaluate(ctx());
    expect(decision.verdict).toBe("allow");
    expect(decision.decisions).toHaveLength(2);
  });

  // ── deny ──

  it("returns deny when a hook denies", async () => {
    const mgr = new PolicyManager();
    mgr.registry.register(makeHook("blocker", {
      evaluate: () => ({ verdict: "deny", reason: "forbidden" }),
    }));

    const decision = await mgr.evaluate(ctx());
    expect(decision.verdict).toBe("deny");
    expect(decision.denied).toBe(true);
    expect(decision.denyReasons).toEqual(["forbidden"]);
  });

  it("short-circuits on first deny", async () => {
    const mgr = new PolicyManager();
    const calls: string[] = [];

    mgr.registry.register(makeHook("pass", {
      priority: 1,
      evaluate: () => { calls.push("pass"); return { verdict: "allow" }; },
    }));
    mgr.registry.register(makeHook("block", {
      priority: 2,
      evaluate: () => { calls.push("block"); return { verdict: "deny", reason: "nope" }; },
    }));
    mgr.registry.register(makeHook("never", {
      priority: 3,
      evaluate: () => { calls.push("never"); return { verdict: "allow" }; },
    }));

    const decision = await mgr.evaluate(ctx());
    expect(decision.verdict).toBe("deny");
    expect(calls).toEqual(["pass", "block"]);
    // "never" was not called
    expect(decision.decisions).toHaveLength(2);
  });

  // ── abstain ──

  it("returns abstain when all hooks abstain", async () => {
    const mgr = new PolicyManager();
    mgr.registry.register(makeHook("a", {
      evaluate: () => ({ verdict: "abstain" }),
    }));
    mgr.registry.register(makeHook("b", {
      evaluate: () => ({ verdict: "abstain" }),
    }));

    const decision = await mgr.evaluate(ctx());
    expect(decision.verdict).toBe("abstain");
    expect(decision.allowed).toBe(false);
    expect(decision.denied).toBe(false);
  });

  it("returns abstain when no hooks are registered", async () => {
    const mgr = new PolicyManager();
    const decision = await mgr.evaluate(ctx());
    expect(decision.verdict).toBe("abstain");
    expect(decision.decisions).toHaveLength(0);
  });

  // ── mixed decisions ──

  it("allow wins over abstain (no deny present)", async () => {
    const mgr = new PolicyManager();
    mgr.registry.register(makeHook("ab", {
      evaluate: () => ({ verdict: "abstain" }),
    }));
    mgr.registry.register(makeHook("ok", {
      evaluate: () => ({ verdict: "allow" }),
    }));
    mgr.registry.register(makeHook("ab2", {
      evaluate: () => ({ verdict: "abstain" }),
    }));

    const decision = await mgr.evaluate(ctx());
    expect(decision.verdict).toBe("allow");
  });

  it("deny overrides all allows", async () => {
    const mgr = new PolicyManager();
    mgr.registry.register(makeHook("ok1", {
      priority: 1,
      evaluate: () => ({ verdict: "allow" }),
    }));
    mgr.registry.register(makeHook("block", {
      priority: 2,
      evaluate: () => ({ verdict: "deny", reason: "blocked" }),
    }));

    const decision = await mgr.evaluate(ctx());
    expect(decision.verdict).toBe("deny");
    expect(decision.allowed).toBe(true); // an earlier hook did allow
    expect(decision.denied).toBe(true);
  });

  // ── ordering ──

  it("evaluates hooks in priority order", async () => {
    const mgr = new PolicyManager();
    const order: string[] = [];

    mgr.registry.register(makeHook("c", {
      priority: 300,
      evaluate: () => { order.push("c"); return { verdict: "allow" }; },
    }));
    mgr.registry.register(makeHook("a", {
      priority: 10,
      evaluate: () => { order.push("a"); return { verdict: "allow" }; },
    }));
    mgr.registry.register(makeHook("b", {
      priority: 50,
      evaluate: () => { order.push("b"); return { verdict: "allow" }; },
    }));

    await mgr.evaluate(ctx());
    expect(order).toEqual(["a", "b", "c"]);
  });

  // ── action filtering ──

  it("only evaluates hooks matching the action", async () => {
    const mgr = new PolicyManager();
    const calls: string[] = [];

    mgr.registry.register(makeHook("tool-only", {
      actions: ["tool.invoke"],
      evaluate: () => { calls.push("tool-only"); return { verdict: "allow" }; },
    }));
    mgr.registry.register(makeHook("provider-only", {
      actions: ["provider.call"],
      evaluate: () => { calls.push("provider-only"); return { verdict: "allow" }; },
    }));
    mgr.registry.register(makeHook("all", {
      evaluate: () => { calls.push("all"); return { verdict: "allow" }; },
    }));

    await mgr.evaluate(ctx("tool.invoke", "echo"));
    expect(calls).toEqual(["tool-only", "all"]);
  });

  // ── error isolation (fail-closed) ──

  it("treats hook errors as deny (fail-closed)", async () => {
    const mgr = new PolicyManager();
    mgr.registry.register(makeHook("broken", {
      evaluate: () => { throw new Error("crash"); },
    }));

    const decision = await mgr.evaluate(ctx());
    expect(decision.verdict).toBe("deny");
    expect(decision.denied).toBe(true);
    expect(decision.decisions[0]!.verdict).toBe("deny");
    expect(decision.decisions[0]!.reason).toContain("crash");
    expect(decision.decisions[0]!.metadata).toEqual({ error: true });
  });

  it("calls onHookError when a hook throws", async () => {
    const errors: unknown[] = [];
    const mgr = new PolicyManager({
      onHookError: (err) => { errors.push(err); },
    });
    mgr.registry.register(makeHook("bad", {
      evaluate: () => { throw new Error("oops"); },
    }));

    await mgr.evaluate(ctx());
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(Error);
  });

  it("hook error short-circuits like deny", async () => {
    const mgr = new PolicyManager();
    const calls: string[] = [];

    mgr.registry.register(makeHook("err", {
      priority: 1,
      evaluate: () => { calls.push("err"); throw new Error("fail"); },
    }));
    mgr.registry.register(makeHook("after", {
      priority: 2,
      evaluate: () => { calls.push("after"); return { verdict: "allow" }; },
    }));

    const decision = await mgr.evaluate(ctx());
    expect(decision.verdict).toBe("deny");
    expect(calls).toEqual(["err"]);
  });

  // ── async hooks ──

  it("supports async hook evaluate", async () => {
    const mgr = new PolicyManager();
    mgr.registry.register(makeHook("async-gate", {
      evaluate: async () => {
        await new Promise((r) => { setTimeout(r, 1); });
        return { verdict: "allow", reason: "async ok" };
      },
    }));

    const decision = await mgr.evaluate(ctx());
    expect(decision.verdict).toBe("allow");
    expect(decision.decisions[0]!.reason).toBe("async ok");
  });

  // ── metadata ──

  it("preserves hook metadata in decisions", async () => {
    const mgr = new PolicyManager();
    mgr.registry.register(makeHook("meta", {
      evaluate: () => ({
        verdict: "deny",
        reason: "audit required",
        metadata: { rule: "SOC2-4.1", severity: "high" },
      }),
    }));

    const decision = await mgr.evaluate(ctx());
    expect(decision.decisions[0]!.metadata).toEqual({
      rule: "SOC2-4.1",
      severity: "high",
    });
  });

  // ── decision attribution ──

  it("includes action and subject in decision", async () => {
    const mgr = new PolicyManager();
    const decision = await mgr.evaluate(ctx("tool.invoke", "fs/write"));
    expect(decision.action).toBe("tool.invoke");
    expect(decision.subject).toBe("fs/write");
  });

  // ── close ──

  it("rejects evaluation after close", async () => {
    const mgr = new PolicyManager();
    mgr.close();

    await expect(mgr.evaluate(ctx())).rejects.toThrow(PolicyError);
    try {
      await mgr.evaluate(ctx());
    } catch (error) {
      expect((error as PolicyError).code).toBe(PolicyErrorCode.MANAGER_CLOSED);
    }
  });

  it("double close is idempotent", () => {
    const mgr = new PolicyManager();
    mgr.close();
    expect(() => mgr.close()).not.toThrow();
  });

  // ── registration via registry ──

  it("exposes registry for hook registration", () => {
    const mgr = new PolicyManager();
    expect(mgr.registry).toBeDefined();
    mgr.registry.register(makeHook("h1"));
    expect(mgr.registry.size).toBe(1);
  });

  it("supports hook removal via registry", async () => {
    const mgr = new PolicyManager();
    mgr.registry.register(makeHook("removable", {
      evaluate: () => ({ verdict: "deny", reason: "temp" }),
    }));

    let decision = await mgr.evaluate(ctx());
    expect(decision.verdict).toBe("deny");

    mgr.registry.remove("removable");
    decision = await mgr.evaluate(ctx());
    expect(decision.verdict).toBe("abstain");
  });
});

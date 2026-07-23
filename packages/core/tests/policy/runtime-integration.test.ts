import { describe, expect, it } from "vitest";
import {
  createHarness,
  createRuntime,
  defineHarness,
  PolicyManager,
} from "../../src/index.js";
import {
  createManifest,
  createSource,
} from "../helpers/fixtures.js";

async function readyRuntime(name = "PolicyRT") {
  const harness = await createHarness(
    defineHarness({
      name,
      modules: [createSource(createManifest({ id: "acme/a" }))],
    }),
  );
  return createRuntime(harness);
}

describe("Runtime + PolicyManager integration", () => {
  it("runtime exposes a PolicyManager via runtime.policy", async () => {
    const runtime = await readyRuntime("WithPolicy");
    expect(runtime.policy).toBeInstanceOf(PolicyManager);
    expect(runtime.policy.closed).toBe(false);
  });

  it("policy hooks can be registered and evaluated through runtime.policy", async () => {
    const runtime = await readyRuntime("Evaluate");
    runtime.policy.registry.register({
      id: "test/gate",
      evaluate: () => ({ verdict: "deny" as const, reason: "blocked" }),
    });

    const decision = await runtime.policy.evaluate({
      action: "tool.invoke",
      subject: "fs/write",
    });

    expect(decision.verdict).toBe("deny");
    expect(decision.denyReasons).toEqual(["blocked"]);
  });

  it("shutdown closes the policy manager", async () => {
    const runtime = await readyRuntime("Shutdown");
    expect(runtime.policy.closed).toBe(false);

    await runtime.shutdown();
    expect(runtime.policy.closed).toBe(true);
  });

  it("each runtime has its own independent policy manager", async () => {
    const harness = await createHarness(
      defineHarness({
        name: "Shared",
        modules: [],
      }),
    );

    const rt1 = await createRuntime(harness, { id: "rt1" });
    const rt2 = await createRuntime(harness, { id: "rt2" });

    expect(rt1.policy).not.toBe(rt2.policy);

    rt1.policy.registry.register({
      id: "only-rt1",
      evaluate: () => ({ verdict: "deny" as const }),
    });

    expect(rt1.policy.registry.size).toBe(1);
    expect(rt2.policy.registry.size).toBe(0);
  });

  it("policy evaluation returns abstain when no hooks registered", async () => {
    const runtime = await readyRuntime("NoHooks");
    const decision = await runtime.policy.evaluate({
      action: "tool.invoke",
      subject: "echo",
    });

    expect(decision.verdict).toBe("abstain");
    expect(decision.decisions).toHaveLength(0);
  });
});

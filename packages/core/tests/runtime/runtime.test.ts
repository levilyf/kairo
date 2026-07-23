import { describe, expect, it } from "vitest";
import {
  createHarness,
  createRuntime,
  defineHarness,
  Runtime,
  RuntimeError,
  RuntimeErrorCode,
  type RuntimeStatus,
} from "../../src/index.js";
import {
  createManifest,
  createSource,
} from "../helpers/fixtures.js";

async function readyHarness(name = "Demo") {
  return createHarness(
    defineHarness({
      name,
      version: "1.0.0",
      description: "Runtime test harness",
      modules: [createSource(createManifest({ id: "acme/a" }))],
    }),
  );
}

describe("createRuntime / Runtime", () => {
  it("creates a ready runtime from a ready harness", async () => {
    const harness = await readyHarness("Starter");
    const runtime = await createRuntime(harness);

    expect(runtime).toBeInstanceOf(Runtime);
    expect(runtime.status).toBe("ready");
    expect(runtime.harness).toBe(harness);
    expect(runtime.metadata.harnessName).toBe("Starter");
    expect(runtime.metadata.harnessVersion).toBe("1.0.0");
    expect(runtime.metadata.coreVersion).toBe(harness.definition.coreVersion);
    expect(typeof runtime.metadata.createdAt).toBe("number");
    expect(runtime.metadata.createdAt).toBeGreaterThan(0);
  });

  it("exposes a cancellation root that is not aborted while ready", async () => {
    const runtime = await createRuntime(await readyHarness());

    expect(runtime.cancellation).toBeDefined();
    expect(runtime.cancellation.signal).toBeInstanceOf(AbortSignal);
    expect(runtime.cancellation.signal.aborted).toBe(false);
    expect(runtime.cancellation.aborted).toBe(false);
  });

  it("rejects a non-ready harness", async () => {
    const harness = await readyHarness("Stopped");
    await harness.stop();

    await expect(createRuntime(harness)).rejects.toMatchObject({
      code: RuntimeErrorCode.INVALID_HARNESS,
    });
  });

  it("rejects invalid harness values", async () => {
    await expect(createRuntime(null as never)).rejects.toBeInstanceOf(
      RuntimeError,
    );
    await expect(createRuntime({} as never)).rejects.toMatchObject({
      code: RuntimeErrorCode.INVALID_HARNESS,
    });
  });

  it("shuts down cleanly and aborts the cancellation root", async () => {
    const harness = await readyHarness("Shutdown");
    const runtime = await createRuntime(harness);

    expect(runtime.status).toBe("ready");
    await runtime.shutdown();

    expect(runtime.status).toBe("stopped");
    expect(runtime.cancellation.aborted).toBe(true);
    expect(runtime.cancellation.signal.aborted).toBe(true);
    // Runtime does not stop the harness — composition remains owned by caller.
    expect(harness.status).toBe("ready");
  });

  it("rejects double shutdown", async () => {
    const runtime = await createRuntime(await readyHarness("Once"));
    await runtime.shutdown();

    await expect(runtime.shutdown()).rejects.toMatchObject({
      code: RuntimeErrorCode.INVALID_STATE,
    });
  });

  it("cannot restart after shutdown", async () => {
    const harness = await readyHarness("NoRestart");
    const runtime = await createRuntime(harness);
    await runtime.shutdown();

    await expect(createRuntime(harness)).resolves.toBeInstanceOf(Runtime);
    // A stopped runtime itself has no restart API.
    expect("start" in runtime).toBe(false);
    expect("restart" in runtime).toBe(false);
  });

  it("exposes stable service extension points as unset placeholders", async () => {
    const runtime = await createRuntime(await readyHarness("Slots"));

    expect(runtime.services).toBeDefined();
    expect(runtime.services.sessions).toBeUndefined();
    expect(runtime.services.events).toBeUndefined();
    expect(runtime.services.policy).toBeUndefined();
    expect(runtime.services.providers).toBeUndefined();
    expect(runtime.services.tools).toBeUndefined();
    expect(runtime.services.context).toBeUndefined();
    expect(runtime.services.agentLoop).toBeUndefined();
  });

  it("does not implement execution-engine concerns", async () => {
    const runtime = await createRuntime(await readyHarness("PureHost"));

    // Runtime hosts services; it does not invent private engine APIs.
    expect("runTurn" in runtime).toBe(false);
    expect("createSession" in runtime).toBe(false);
    expect("sessionManager" in runtime).toBe(false);
    // Agent Loop is a hosted orchestration service, not an engine on Runtime.
    expect(runtime.agentLoop).toBeDefined();
    expect(typeof runtime.agentLoop.execute).toBe("function");
  });

  it("tracks lifecycle status transitions only through public API", async () => {
    const statuses: RuntimeStatus[] = [];
    const runtime = await createRuntime(await readyHarness("Lifecycle"));
    statuses.push(runtime.status);
    await runtime.shutdown();
    statuses.push(runtime.status);

    expect(statuses).toEqual(["ready", "stopped"]);
  });

  it("accepts optional runtime id via createRuntime options", async () => {
    const runtime = await createRuntime(await readyHarness("Named"), {
      id: "runtime-test-1",
    });

    expect(runtime.metadata.id).toBe("runtime-test-1");
  });

  it("generates a runtime id when none is provided", async () => {
    const a = await createRuntime(await readyHarness("A"));
    const b = await createRuntime(await readyHarness("B"));

    expect(a.metadata.id.length).toBeGreaterThan(0);
    expect(b.metadata.id.length).toBeGreaterThan(0);
    expect(a.metadata.id).not.toBe(b.metadata.id);
  });

  it("exposes harness registries only through the harness handle", async () => {
    const harness = await readyHarness("Regs");
    const runtime = await createRuntime(harness);

    expect(runtime.harness.providers).toBe(harness.providers);
    expect(runtime.harness.tools).toBe(harness.tools);
    expect(runtime.harness.commands).toBe(harness.commands);
    expect(runtime.harness.uis).toBe(harness.uis);
  });
});

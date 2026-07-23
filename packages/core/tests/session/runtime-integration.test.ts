import { describe, expect, it } from "vitest";
import {
  createHarness,
  createRuntime,
  defineHarness,
  SessionManager,
  type RuntimeEvent,
} from "../../src/index.js";
import { createManifest, createSource } from "../helpers/fixtures.js";

async function readyRuntime(name = "SessionRT") {
  const harness = await createHarness(
    defineHarness({
      name,
      modules: [createSource(createManifest({ id: "acme/session-test" }))],
    }),
  );
  return createRuntime(harness);
}

describe("Runtime + SessionManager integration", () => {
  it("runtime exposes a SessionManager via runtime.sessions", async () => {
    const runtime = await readyRuntime("WithSessions");

    expect(runtime.sessions).toBeInstanceOf(SessionManager);
    expect(runtime.sessions.closed).toBe(false);
  });

  it("creates sessions through runtime.sessions.create()", async () => {
    const runtime = await readyRuntime("CreateSession");
    const session = await runtime.sessions.create({ id: "runtime-session" });

    expect(session.id).toBe("runtime-session");
    expect(session.runtimeId).toBe(runtime.metadata.id);
    expect(runtime.sessions.get("runtime-session")).toBe(session);
  });

  it("does not add session lifecycle methods directly to Runtime", async () => {
    const runtime = await readyRuntime("DelegationOnly");

    expect("createSession" in runtime).toBe(false);
    expect("closeSession" in runtime).toBe(false);
  });

  it("runtime shutdown closes existing sessions", async () => {
    const runtime = await readyRuntime("ShutdownCloses");
    const a = await runtime.sessions.create({ id: "a" });
    const b = await runtime.sessions.create({ id: "b" });

    await runtime.shutdown();

    expect(a.state).toBe("closed");
    expect(b.state).toBe("closed");
    expect(a.cancellation.signal.aborted).toBe(true);
    expect(b.cancellation.signal.aborted).toBe(true);
    expect(runtime.sessions.closed).toBe(true);
  });

  it("runtime shutdown aborts all sessions through cancellation inheritance", async () => {
    const runtime = await readyRuntime("CancelInheritance");
    const session = await runtime.sessions.create({ id: "session-cancel" });

    await runtime.shutdown();

    expect(runtime.cancellation.signal.aborted).toBe(true);
    expect(session.cancellation.signal.aborted).toBe(true);
  });

  it("emits session lifecycle events before runtime closes the event bus", async () => {
    const runtime = await readyRuntime("EventsOnShutdown");
    const received: RuntimeEvent[] = [];
    runtime.events.subscribe((event) => {
      received.push(event);
    });

    const session = await runtime.sessions.create({ id: "s1" });
    await runtime.shutdown();

    expect(session.state).toBe("closed");
    expect(received.map((event) => event.type)).toEqual([
      "session.created",
      "session.completed",
    ]);
  });

  it("each runtime has an independent SessionManager", async () => {
    const harness = await createHarness(
      defineHarness({ name: "Shared", modules: [] }),
    );
    const one = await createRuntime(harness, { id: "runtime-one" });
    const two = await createRuntime(harness, { id: "runtime-two" });

    const session = await one.sessions.create({ id: "only-one" });

    expect(one.sessions).not.toBe(two.sessions);
    expect(one.sessions.size).toBe(1);
    expect(two.sessions.size).toBe(0);
    expect(session.runtimeId).toBe("runtime-one");
  });
});

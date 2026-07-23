import { describe, expect, it } from "vitest";
import {
  createHarness,
  createRuntime,
  defineHarness,
  TurnManager,
  type RuntimeEvent,
} from "../../src/index.js";
import { createManifest, createSource } from "../helpers/fixtures.js";

async function readyRuntime(name = "TurnSessionRT") {
  const harness = await createHarness(
    defineHarness({
      name,
      modules: [createSource(createManifest({ id: "acme/turn-test" }))],
    }),
  );
  return createRuntime(harness);
}

describe("Session + TurnManager integration", () => {
  it("session exposes a TurnManager via session.turns", async () => {
    const runtime = await readyRuntime();
    const session = await runtime.sessions.create({ id: "s1" });

    expect(session.turns).toBeInstanceOf(TurnManager);
    expect(session.turns.closed).toBe(false);
  });

  it("creates turns through session.turns.create()", async () => {
    const runtime = await readyRuntime();
    const session = await runtime.sessions.create({ id: "s1" });
    const turn = await session.turns.create({
      id: "t1",
      metadata: { request: "Fix failing tests" },
    });

    expect(turn.id).toBe("t1");
    expect(turn.sessionId).toBe(session.id);
    expect(turn.runtimeId).toBe(runtime.metadata.id);
    expect(session.turns.get("t1")).toBe(turn);
  });

  it("session close cancels active turns and closes the turn manager", async () => {
    const runtime = await readyRuntime();
    const session = await runtime.sessions.create({ id: "s1" });
    const active = await session.turns.create({ id: "active" });
    const completed = await session.turns.create({ id: "completed" });
    await completed.complete();

    await session.close();

    expect(active.state).toBe("cancelled");
    expect(completed.state).toBe("completed");
    expect(session.turns.closed).toBe(true);
  });

  it("session cancellation aborts turn cancellation scopes", async () => {
    const runtime = await readyRuntime();
    const session = await runtime.sessions.create({ id: "s1" });
    const turn = await session.turns.create({ id: "t1" });

    session.cancellation.abort("manual session abort");

    expect(turn.cancellation.signal.aborted).toBe(true);
  });

  it("runtime shutdown cancels turns through sessions", async () => {
    const runtime = await readyRuntime();
    const session = await runtime.sessions.create({ id: "s1" });
    const turn = await session.turns.create({ id: "t1" });

    await runtime.shutdown();

    expect(turn.state).toBe("cancelled");
    expect(turn.cancellation.signal.aborted).toBe(true);
    expect(session.state).toBe("closed");
  });

  it("emits turn lifecycle events before session and runtime shutdown closes event bus", async () => {
    const runtime = await readyRuntime();
    const received: RuntimeEvent[] = [];
    runtime.events.subscribe((event) => {
      received.push(event);
    });

    const session = await runtime.sessions.create({ id: "s1" });
    const turn = await session.turns.create({ id: "t1" });
    await turn.complete();

    expect(received.map((event) => event.type)).toEqual([
      "session.created",
      "turn.started",
      "turn.completed",
    ]);
    expect(received[1]!.sessionId).toBe("s1");
    expect(received[1]!.turnId).toBe("t1");
  });

  it("does not expose Turn APIs directly on Runtime", async () => {
    const runtime = await readyRuntime();

    expect("turns" in runtime).toBe(false);
    expect("createTurn" in runtime).toBe(false);
  });
});

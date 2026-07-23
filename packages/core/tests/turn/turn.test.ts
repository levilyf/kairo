import { describe, expect, it } from "vitest";
import {
  CancellationRoot,
  EventBus,
  EventPublisher,
  Turn,
  TurnError,
  TurnErrorCode,
  TurnManager,
  type RuntimeEvent,
} from "../../src/index.js";

function setup() {
  const events = new EventBus();
  const runtimeCancellation = new CancellationRoot();
  const sessionCancellation = runtimeCancellation.child();
  const publisher = new EventPublisher(events);
  const manager = new TurnManager({
    runtimeId: "runtime-test",
    sessionId: "session-test",
    cancellation: sessionCancellation,
    publisher,
  });
  return { events, runtimeCancellation, sessionCancellation, manager };
}

describe("Turn", () => {
  it("creates a turn with identity, metadata, timestamps, session/runtime attribution, and placeholders", async () => {
    const { manager } = setup();
    const turn = await manager.create({
      id: "turn-1",
      metadata: { request: "Fix tests" },
    });

    expect(turn).toBeInstanceOf(Turn);
    expect(turn.id).toBe("turn-1");
    expect(turn.sessionId).toBe("session-test");
    expect(turn.runtimeId).toBe("runtime-test");
    expect(turn.state).toBe("created");
    expect(turn.metadata.id).toBe("turn-1");
    expect(turn.metadata.sessionId).toBe("session-test");
    expect(turn.metadata.runtimeId).toBe("runtime-test");
    expect(turn.metadata.data).toEqual({ request: "Fix tests" });
    expect(turn.metadata.createdAt).toBeGreaterThan(0);
    expect(turn.metadata.updatedAt).toBe(turn.metadata.createdAt);
    expect(turn.cancellation.signal.aborted).toBe(false);
    expect(turn.context).toBeUndefined();
    expect(turn.result).toBeUndefined();
  });

  it("freezes metadata and metadata data", async () => {
    const { manager } = setup();
    const turn = await manager.create({ metadata: { a: 1 } });

    expect(Object.isFrozen(turn.metadata)).toBe(true);
    expect(Object.isFrozen(turn.metadata.data)).toBe(true);
  });

  it("completes a created turn", async () => {
    const { manager } = setup();
    const turn = await manager.create({ id: "complete-me" });

    await turn.complete({ result: { ok: true } });

    expect(turn.state).toBe("completed");
    expect(turn.result).toEqual({ ok: true });
    expect(turn.cancellation.signal.aborted).toBe(false);
    expect(turn.metadata.updatedAt).toBeGreaterThanOrEqual(
      turn.metadata.createdAt,
    );
  });

  it("cancels a created turn and aborts only that turn cancellation scope", async () => {
    const { manager, sessionCancellation } = setup();
    const turn = await manager.create({ id: "cancel-me" });

    await turn.cancel("user cancelled");

    expect(turn.state).toBe("cancelled");
    expect(turn.cancellation.signal.aborted).toBe(true);
    expect(sessionCancellation.signal.aborted).toBe(false);
  });

  it("rejects double completion", async () => {
    const { manager } = setup();
    const turn = await manager.create();
    await turn.complete();

    await expect(turn.complete()).rejects.toBeInstanceOf(TurnError);
    await expect(turn.complete()).rejects.toMatchObject({
      code: TurnErrorCode.INVALID_STATE,
    });
  });

  it("rejects double cancellation", async () => {
    const { manager } = setup();
    const turn = await manager.create();
    await turn.cancel();

    await expect(turn.cancel()).rejects.toBeInstanceOf(TurnError);
    await expect(turn.cancel()).rejects.toMatchObject({
      code: TurnErrorCode.INVALID_STATE,
    });
  });

  it("rejects cancellation after completion", async () => {
    const { manager } = setup();
    const turn = await manager.create();
    await turn.complete();

    await expect(turn.cancel()).rejects.toMatchObject({
      code: TurnErrorCode.INVALID_STATE,
    });
  });

  it("inherits cancellation from the session scope", async () => {
    const { manager, sessionCancellation } = setup();
    const turn = await manager.create();

    sessionCancellation.abort("session closed");

    expect(turn.cancellation.signal.aborted).toBe(true);
  });

  it("emits turn.started on creation and turn.completed on complete", async () => {
    const { manager, events } = setup();
    const received: RuntimeEvent[] = [];
    events.subscribe((event) => {
      received.push(event);
    });

    const turn = await manager.create({ id: "events" });
    await turn.complete();

    expect(received.map((event) => event.type)).toEqual([
      "turn.started",
      "turn.completed",
    ]);
    expect(received[0]!.sessionId).toBe("session-test");
    expect(received[0]!.turnId).toBe("events");
    expect(received[1]!.turnId).toBe("events");
  });

  it("emits turn.completed on cancel using existing event kinds", async () => {
    const { manager, events } = setup();
    const received: RuntimeEvent[] = [];
    events.subscribe((event) => {
      received.push(event);
    });

    const turn = await manager.create({ id: "cancel-event" });
    await turn.cancel("no longer needed");

    expect(received.map((event) => event.type)).toEqual([
      "turn.started",
      "turn.completed",
    ]);
    expect(received[1]!.data.status).toBe("cancelled");
  });
});

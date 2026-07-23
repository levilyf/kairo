import { describe, expect, it } from "vitest";
import {
  CancellationRoot,
  EventBus,
  Session,
  SessionError,
  SessionErrorCode,
  SessionManager,
  type RuntimeEvent,
} from "../../src/index.js";

function setup() {
  const events = new EventBus();
  const cancellation = new CancellationRoot();
  return {
    events,
    cancellation,
    manager: new SessionManager({
      runtimeId: "runtime-test",
      events,
      cancellation,
    }),
  };
}

describe("Session", () => {
  it("creates a ready session with identity, metadata, timestamps, runtime reference, and placeholders", async () => {
    const { manager } = setup();
    const session = await manager.create({
      id: "session-1",
      metadata: { purpose: "test" },
    });

    expect(session).toBeInstanceOf(Session);
    expect(session.id).toBe("session-1");
    expect(session.runtimeId).toBe("runtime-test");
    expect(session.state).toBe("ready");
    expect(session.metadata.id).toBe("session-1");
    expect(session.metadata.runtimeId).toBe("runtime-test");
    expect(session.metadata.data).toEqual({ purpose: "test" });
    expect(session.metadata.createdAt).toBeGreaterThan(0);
    expect(session.metadata.updatedAt).toBe(session.metadata.createdAt);
    expect(session.cancellation.signal.aborted).toBe(false);
    expect(session.turns.size).toBe(0);
    expect(session.context).toBeUndefined();
  });

  it("freezes metadata", async () => {
    const { manager } = setup();
    const session = await manager.create({ metadata: { a: 1 } });

    expect(Object.isFrozen(session.metadata)).toBe(true);
    expect(Object.isFrozen(session.metadata.data)).toBe(true);
  });

  it("closes a ready session and aborts only that session cancellation scope", async () => {
    const { manager, cancellation } = setup();
    const session = await manager.create({ id: "session-close" });

    await session.close();

    expect(session.state).toBe("closed");
    expect(session.cancellation.signal.aborted).toBe(true);
    expect(cancellation.signal.aborted).toBe(false);
    expect(session.metadata.updatedAt).toBeGreaterThanOrEqual(
      session.metadata.createdAt,
    );
  });

  it("rejects double close", async () => {
    const { manager } = setup();
    const session = await manager.create();
    await session.close();

    await expect(session.close()).rejects.toMatchObject({
      code: SessionErrorCode.INVALID_STATE,
    });
    await expect(session.close()).rejects.toBeInstanceOf(SessionError);
  });

  it("inherits cancellation from the runtime root", async () => {
    const { manager, cancellation } = setup();
    const session = await manager.create();

    cancellation.abort("runtime shutdown");

    expect(session.cancellation.signal.aborted).toBe(true);
  });

  it("emits session.created and session.completed events using existing event kinds", async () => {
    const { manager, events } = setup();
    const received: RuntimeEvent[] = [];
    events.subscribe((event) => {
      received.push(event);
    });

    const session = await manager.create({ id: "session-events" });
    await session.close();

    expect(received.map((event) => event.type)).toEqual([
      "session.created",
      "session.completed",
    ]);
    expect(received[0]!.sessionId).toBe("session-events");
    expect(received[1]!.sessionId).toBe("session-events");
  });
});

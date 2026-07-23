import { describe, expect, it } from "vitest";
import {
  CancellationRoot,
  EventBus,
  SessionError,
  SessionErrorCode,
  SessionManager,
  type RuntimeEvent,
} from "../../src/index.js";

function setup() {
  const events = new EventBus();
  const cancellation = new CancellationRoot();
  const manager = new SessionManager({
    runtimeId: "runtime-manager",
    events,
    cancellation,
  });
  return { manager, events, cancellation };
}

describe("SessionManager", () => {
  it("creates sessions and stores them by id", async () => {
    const { manager } = setup();
    const session = await manager.create({ id: "s1" });

    expect(manager.size).toBe(1);
    expect(manager.get("s1")).toBe(session);
    expect(manager.list()).toEqual([session]);
  });

  it("generates unique session identifiers", async () => {
    const { manager } = setup();
    const a = await manager.create();
    const b = await manager.create();

    expect(a.id.length).toBeGreaterThan(0);
    expect(b.id.length).toBeGreaterThan(0);
    expect(a.id).not.toBe(b.id);
  });

  it("rejects duplicate session ids", async () => {
    const { manager } = setup();
    await manager.create({ id: "duplicate" });

    await expect(manager.create({ id: "duplicate" })).rejects.toMatchObject({
      code: SessionErrorCode.DUPLICATE_SESSION,
    });
  });

  it("rejects empty explicit session id", async () => {
    const { manager } = setup();
    await expect(manager.create({ id: "" })).rejects.toMatchObject({
      code: SessionErrorCode.INVALID_SESSION,
    });
  });

  it("closes a session by id", async () => {
    const { manager } = setup();
    const session = await manager.create({ id: "close-by-id" });

    await manager.close("close-by-id");

    expect(session.state).toBe("closed");
  });

  it("rejects closing an unknown session id", async () => {
    const { manager } = setup();
    await expect(manager.close("missing")).rejects.toBeInstanceOf(SessionError);
    await expect(manager.close("missing")).rejects.toMatchObject({
      code: SessionErrorCode.NOT_FOUND,
    });
  });

  it("tracks independent sessions with independent cancellation scopes", async () => {
    const { manager, cancellation } = setup();
    const a = await manager.create({ id: "a" });
    const b = await manager.create({ id: "b" });

    await a.close();

    expect(a.cancellation.signal.aborted).toBe(true);
    expect(b.cancellation.signal.aborted).toBe(false);
    expect(cancellation.signal.aborted).toBe(false);
  });

  it("closes all sessions", async () => {
    const { manager } = setup();
    const a = await manager.create({ id: "a" });
    const b = await manager.create({ id: "b" });

    await manager.closeAll();

    expect(a.state).toBe("closed");
    expect(b.state).toBe("closed");
  });

  it("closeAll is safe when some sessions are already closed", async () => {
    const { manager } = setup();
    const a = await manager.create({ id: "a" });
    const b = await manager.create({ id: "b" });
    await a.close();

    await expect(manager.closeAll()).resolves.toBeUndefined();
    expect(a.state).toBe("closed");
    expect(b.state).toBe("closed");
  });

  it("closes the manager and rejects future session creation", async () => {
    const { manager } = setup();
    await manager.close();

    expect(manager.closed).toBe(true);
    await expect(manager.create()).rejects.toMatchObject({
      code: SessionErrorCode.MANAGER_CLOSED,
    });
  });

  it("manager close closes existing sessions", async () => {
    const { manager } = setup();
    const session = await manager.create();

    await manager.close();

    expect(session.state).toBe("closed");
  });

  it("manager close is idempotent", async () => {
    const { manager } = setup();
    await manager.close();
    await expect(manager.close()).resolves.toBeUndefined();
  });

  it("emits session.created for each created session", async () => {
    const { manager, events } = setup();
    const received: RuntimeEvent[] = [];
    events.subscribe((event) => {
      received.push(event);
    });

    await manager.create({ id: "one" });
    await manager.create({ id: "two" });

    expect(received.map((event) => event.type)).toEqual([
      "session.created",
      "session.created",
    ]);
    expect(received.map((event) => event.sessionId)).toEqual(["one", "two"]);
  });
});

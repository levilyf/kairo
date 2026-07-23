import { describe, expect, it } from "vitest";
import {
  CancellationRoot,
  EventBus,
  EventPublisher,
  TurnError,
  TurnErrorCode,
  TurnManager,
} from "../../src/index.js";

function setup() {
  const events = new EventBus();
  const runtimeCancellation = new CancellationRoot();
  const sessionCancellation = runtimeCancellation.child();
  const manager = new TurnManager({
    runtimeId: "runtime-manager",
    sessionId: "session-manager",
    cancellation: sessionCancellation,
    publisher: new EventPublisher(events),
  });
  return { manager, runtimeCancellation, sessionCancellation };
}

describe("TurnManager", () => {
  it("creates turns and stores them by id", async () => {
    const { manager } = setup();
    const turn = await manager.create({ id: "t1" });

    expect(manager.size).toBe(1);
    expect(manager.get("t1")).toBe(turn);
    expect(manager.list()).toEqual([turn]);
  });

  it("generates unique turn identifiers", async () => {
    const { manager } = setup();
    const a = await manager.create();
    const b = await manager.create();

    expect(a.id.length).toBeGreaterThan(0);
    expect(b.id.length).toBeGreaterThan(0);
    expect(a.id).not.toBe(b.id);
  });

  it("rejects duplicate turn ids", async () => {
    const { manager } = setup();
    await manager.create({ id: "duplicate" });

    await expect(manager.create({ id: "duplicate" })).rejects.toMatchObject({
      code: TurnErrorCode.DUPLICATE_TURN,
    });
  });

  it("rejects empty explicit turn id", async () => {
    const { manager } = setup();
    await expect(manager.create({ id: "" })).rejects.toMatchObject({
      code: TurnErrorCode.INVALID_TURN,
    });
  });

  it("completes a turn by id", async () => {
    const { manager } = setup();
    const turn = await manager.create({ id: "complete-by-id" });

    await manager.complete("complete-by-id", { result: "done" });

    expect(turn.state).toBe("completed");
    expect(turn.result).toBe("done");
  });

  it("cancels a turn by id", async () => {
    const { manager } = setup();
    const turn = await manager.create({ id: "cancel-by-id" });

    await manager.cancel("cancel-by-id", "stop");

    expect(turn.state).toBe("cancelled");
    expect(turn.cancellation.signal.aborted).toBe(true);
  });

  it("rejects completing an unknown turn id", async () => {
    const { manager } = setup();
    await expect(manager.complete("missing")).rejects.toBeInstanceOf(TurnError);
    await expect(manager.complete("missing")).rejects.toMatchObject({
      code: TurnErrorCode.NOT_FOUND,
    });
  });

  it("rejects cancelling an unknown turn id", async () => {
    const { manager } = setup();
    await expect(manager.cancel("missing")).rejects.toMatchObject({
      code: TurnErrorCode.NOT_FOUND,
    });
  });

  it("tracks independent turns with independent cancellation scopes", async () => {
    const { manager, sessionCancellation } = setup();
    const a = await manager.create({ id: "a" });
    const b = await manager.create({ id: "b" });

    await a.cancel();

    expect(a.cancellation.signal.aborted).toBe(true);
    expect(b.cancellation.signal.aborted).toBe(false);
    expect(sessionCancellation.signal.aborted).toBe(false);
  });

  it("cancels all active turns", async () => {
    const { manager } = setup();
    const a = await manager.create({ id: "a" });
    const b = await manager.create({ id: "b" });
    await b.complete();

    await manager.cancelAll("session closed");

    expect(a.state).toBe("cancelled");
    expect(b.state).toBe("completed");
  });

  it("closes the manager and rejects future turn creation", async () => {
    const { manager } = setup();
    await manager.close();

    expect(manager.closed).toBe(true);
    await expect(manager.create()).rejects.toMatchObject({
      code: TurnErrorCode.MANAGER_CLOSED,
    });
  });

  it("manager close cancels existing active turns", async () => {
    const { manager } = setup();
    const turn = await manager.create();

    await manager.close();

    expect(turn.state).toBe("cancelled");
  });

  it("manager close is idempotent", async () => {
    const { manager } = setup();
    await manager.close();
    await expect(manager.close()).resolves.toBeUndefined();
  });
});

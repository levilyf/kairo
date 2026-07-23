import { describe, expect, it } from "vitest";
import {
  CancellationRoot,
  Context,
  ContextErrorCode,
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
    runtimeId: "runtime-ctx",
    sessionId: "session-ctx",
    cancellation: sessionCancellation,
    publisher: new EventPublisher(events),
  });
  return { manager };
}

describe("Turn + Context integration", () => {
  it("turn starts without a context", async () => {
    const { manager } = setup();
    const turn = await manager.create({ id: "t1" });
    expect(turn.context).toBeUndefined();
  });

  it("creates and attaches exactly one context to a turn", async () => {
    const { manager } = setup();
    const turn = await manager.create({ id: "t1" });

    const context = turn.createContext({
      metadata: { request: "assemble later" },
      instructions: ["stay provider-neutral"],
    });

    expect(context).toBeInstanceOf(Context);
    expect(turn.context).toBe(context);
    expect(context.turnId).toBe(turn.id);
    expect(context.sessionId).toBe(turn.sessionId);
    expect(context.runtimeId).toBe(turn.runtimeId);
    expect(context.instructions).toEqual(["stay provider-neutral"]);
    expect(context.metadata.data).toEqual({ request: "assemble later" });
  });

  it("rejects creating a second context on the same turn", async () => {
    const { manager } = setup();
    const turn = await manager.create({ id: "t1" });
    turn.createContext();

    expect(() => turn.createContext()).toThrow(TurnError);
    try {
      turn.createContext();
      expect.unreachable("expected throw");
    } catch (error) {
      expect(error).toMatchObject({
        code: TurnErrorCode.INVALID_STATE,
      });
    }
  });

  it("rejects context creation on completed turns", async () => {
    const { manager } = setup();
    const turn = await manager.create({ id: "t1" });
    await turn.complete();

    expect(() => turn.createContext()).toThrow(TurnError);
    try {
      turn.createContext();
      expect.unreachable("expected throw");
    } catch (error) {
      expect(error).toMatchObject({ code: TurnErrorCode.INVALID_STATE });
    }
  });

  it("rejects context creation on cancelled turns", async () => {
    const { manager } = setup();
    const turn = await manager.create({ id: "t1" });
    await turn.cancel();

    expect(() => turn.createContext()).toThrow(TurnError);
  });

  it("keeps contexts independent across turns", async () => {
    const { manager } = setup();
    const a = await manager.create({ id: "a" });
    const b = await manager.create({ id: "b" });

    const ca = a.createContext({ variables: { n: 1 } });
    const cb = b.createContext({ variables: { n: 2 } });

    expect(ca).not.toBe(cb);
    expect(a.context).toBe(ca);
    expect(b.context).toBe(cb);
    expect(ca.variables).toEqual({ n: 1 });
    expect(cb.variables).toEqual({ n: 2 });
  });

  it("does not invent assembly or provider-specific fields", async () => {
    const { manager } = setup();
    const turn = await manager.create({ id: "t1" });
    const context = turn.createContext();

    expect("model" in context).toBe(false);
    expect("provider" in context).toBe(false);
    expect("openai" in context).toBe(false);
    expect("anthropic" in context).toBe(false);
    // Context remains a platform object with placeholders only.
    expect(context.state).toBe("created");
    expect(ContextErrorCode.INVALID_CONTEXT).toBe("INVALID_CONTEXT");
  });
});

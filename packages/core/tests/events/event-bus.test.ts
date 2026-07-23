import { describe, expect, it, vi } from "vitest";
import {
  EventBus,
  EventError,
  EventErrorCode,
  type RuntimeEvent,
  type RuntimeEventListener,
} from "../../src/index.js";

function coreEvent(
  type: string,
  overrides: Partial<RuntimeEvent> = {},
): RuntimeEvent {
  return {
    type: type as RuntimeEvent["type"],
    id: overrides.id ?? `evt-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: overrides.timestamp ?? Date.now(),
    data: overrides.data ?? {},
    ...overrides,
  } as RuntimeEvent;
}

describe("EventBus", () => {
  // ── Creation ──

  it("creates an open event bus", () => {
    const bus = new EventBus();
    expect(bus.closed).toBe(false);
  });

  // ── Publish ──

  it("publishes an event to zero subscribers without error", () => {
    const bus = new EventBus();
    expect(() => bus.publish(coreEvent("turn.started"))).not.toThrow();
  });

  it("publishes an event to one subscriber", () => {
    const bus = new EventBus();
    const received: RuntimeEvent[] = [];
    bus.subscribe((e) => { received.push(e); });

    const event = coreEvent("turn.started", { id: "e1" });
    bus.publish(event);

    expect(received).toHaveLength(1);
    expect(received[0]).toBe(event);
  });

  it("publishes to multiple subscribers in registration order", () => {
    const bus = new EventBus();
    const order: string[] = [];
    bus.subscribe(() => { order.push("first"); });
    bus.subscribe(() => { order.push("second"); });
    bus.subscribe(() => { order.push("third"); });

    bus.publish(coreEvent("turn.started"));

    expect(order).toEqual(["first", "second", "third"]);
  });

  it("rejects publish after close", () => {
    const bus = new EventBus();
    bus.close();

    expect(() => bus.publish(coreEvent("turn.started"))).toThrow(EventError);
    try {
      bus.publish(coreEvent("turn.started"));
    } catch (error) {
      expect((error as EventError).code).toBe(EventErrorCode.BUS_CLOSED);
    }
  });

  // ── Subscribe ──

  it("returns an unsubscribe function", () => {
    const bus = new EventBus();
    const received: RuntimeEvent[] = [];
    const unsub = bus.subscribe((e) => { received.push(e); });

    bus.publish(coreEvent("turn.started"));
    expect(received).toHaveLength(1);

    unsub();
    bus.publish(coreEvent("turn.completed"));
    expect(received).toHaveLength(1);
  });

  it("double unsubscribe is a no-op", () => {
    const bus = new EventBus();
    const unsub = bus.subscribe(() => {});
    unsub();
    expect(() => unsub()).not.toThrow();
  });

  it("rejects subscribe after close", () => {
    const bus = new EventBus();
    bus.close();

    expect(() => bus.subscribe(() => {})).toThrow(EventError);
    try {
      bus.subscribe(() => {});
    } catch (error) {
      expect((error as EventError).code).toBe(EventErrorCode.BUS_CLOSED);
    }
  });

  // ── Filtered subscribe ──

  it("filters events by type string", () => {
    const bus = new EventBus();
    const received: RuntimeEvent[] = [];
    bus.subscribe((e) => { received.push(e); }, { filter: { types: ["turn.started"] } });

    bus.publish(coreEvent("turn.started"));
    bus.publish(coreEvent("turn.completed"));
    bus.publish(coreEvent("turn.started"));

    expect(received).toHaveLength(2);
    expect(received.every((e) => e.type === "turn.started")).toBe(true);
  });

  it("filters events by multiple types", () => {
    const bus = new EventBus();
    const received: RuntimeEvent[] = [];
    bus.subscribe((e) => { received.push(e); }, {
      filter: { types: ["turn.started", "turn.completed"] },
    });

    bus.publish(coreEvent("turn.started"));
    bus.publish(coreEvent("provider.called"));
    bus.publish(coreEvent("turn.completed"));

    expect(received).toHaveLength(2);
  });

  it("filters events by sessionId", () => {
    const bus = new EventBus();
    const received: RuntimeEvent[] = [];
    bus.subscribe((e) => { received.push(e); }, {
      filter: { sessionId: "s1" },
    });

    bus.publish(coreEvent("turn.started", { sessionId: "s1" }));
    bus.publish(coreEvent("turn.started", { sessionId: "s2" }));
    bus.publish(coreEvent("turn.started")); // no sessionId

    expect(received).toHaveLength(1);
    expect(received[0]!.sessionId).toBe("s1");
  });

  it("filters events by moduleId", () => {
    const bus = new EventBus();
    const received: RuntimeEvent[] = [];
    bus.subscribe((e) => { received.push(e); }, {
      filter: { moduleId: "acme/tools" },
    });

    bus.publish(coreEvent("tool.invoked", { moduleId: "acme/tools" }));
    bus.publish(coreEvent("tool.invoked", { moduleId: "other/tools" }));

    expect(received).toHaveLength(1);
  });

  it("combines type + sessionId filters (AND logic)", () => {
    const bus = new EventBus();
    const received: RuntimeEvent[] = [];
    bus.subscribe((e) => { received.push(e); }, {
      filter: { types: ["turn.started"], sessionId: "s1" },
    });

    bus.publish(coreEvent("turn.started", { sessionId: "s1" }));
    bus.publish(coreEvent("turn.started", { sessionId: "s2" }));
    bus.publish(coreEvent("turn.completed", { sessionId: "s1" }));

    expect(received).toHaveLength(1);
  });

  it("supports custom predicate filter", () => {
    const bus = new EventBus();
    const received: RuntimeEvent[] = [];
    bus.subscribe((e) => { received.push(e); }, {
      filter: { predicate: (e) => (e.data as Record<string, unknown>)?.urgent === true },
    });

    bus.publish(coreEvent("error", { data: { urgent: true } }));
    bus.publish(coreEvent("error", { data: { urgent: false } }));
    bus.publish(coreEvent("error", { data: {} }));

    expect(received).toHaveLength(1);
  });

  // ── Error isolation ──

  it("isolates subscriber errors: one failing subscriber does not break others", () => {
    const bus = new EventBus();
    const received: RuntimeEvent[] = [];
    const errors: unknown[] = [];

    bus.subscribe(() => {
      throw new Error("boom");
    });
    bus.subscribe((e) => { received.push(e); });

    const onError = vi.fn((err: unknown) => { errors.push(err); });
    bus.publish(coreEvent("turn.started"), { onError });

    expect(received).toHaveLength(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(errors[0]).toBeInstanceOf(Error);
  });

  it("swallows subscriber errors silently when no onError is provided", () => {
    const bus = new EventBus();
    const received: RuntimeEvent[] = [];

    bus.subscribe(() => {
      throw new Error("silent boom");
    });
    bus.subscribe((e) => { received.push(e); });

    expect(() => bus.publish(coreEvent("turn.started"))).not.toThrow();
    expect(received).toHaveLength(1);
  });

  // ── Ordering ──

  it("delivers events in publish order within a single publish call", () => {
    const bus = new EventBus();
    const ids: string[] = [];
    bus.subscribe((e) => { ids.push(e.id); });

    bus.publish(coreEvent("turn.started", { id: "e1" }));
    bus.publish(coreEvent("turn.completed", { id: "e2" }));
    bus.publish(coreEvent("provider.called", { id: "e3" }));

    expect(ids).toEqual(["e1", "e2", "e3"]);
  });

  // ── Nested publish ──

  it("handles nested publish: event published from a subscriber callback", () => {
    const bus = new EventBus();
    const order: string[] = [];

    bus.subscribe((e) => {
      order.push(`first:${e.type}`);
      if (e.type === "turn.started") {
        bus.publish(coreEvent("turn.completed", { id: "e2" }));
      }
    });
    bus.subscribe((e) => {
      order.push(`second:${e.type}`);
    });

    bus.publish(coreEvent("turn.started", { id: "e1" }));

    // All subscribers for "turn.started" complete first (breadth-first),
    // then nested events are delivered.
    expect(order).toEqual([
      "first:turn.started",
      "second:turn.started",
      "first:turn.completed",
      "second:turn.completed",
    ]);
  });

  // ── Close ──

  it("closes the bus and unsubscribes all listeners", () => {
    const bus = new EventBus();
    const received: RuntimeEvent[] = [];
    bus.subscribe((e) => { received.push(e); });
    bus.subscribe((e) => { received.push(e); });

    bus.close();
    expect(bus.closed).toBe(true);
    expect(bus.subscriberCount).toBe(0);
  });

  it("double close is idempotent", () => {
    const bus = new EventBus();
    bus.close();
    expect(() => bus.close()).not.toThrow();
  });

  // ── Introspection ──

  it("reports subscriber count", () => {
    const bus = new EventBus();
    expect(bus.subscriberCount).toBe(0);

    const unsub1 = bus.subscribe(() => {});
    expect(bus.subscriberCount).toBe(1);

    const unsub2 = bus.subscribe(() => {});
    expect(bus.subscriberCount).toBe(2);

    unsub1();
    expect(bus.subscriberCount).toBe(1);

    unsub2();
    expect(bus.subscriberCount).toBe(0);
  });
});

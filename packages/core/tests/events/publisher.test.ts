import { describe, expect, it } from "vitest";
import {
  EventBus,
  EventPublisher,
  type RuntimeEvent,
} from "../../src/index.js";

describe("EventPublisher", () => {
  it("publishes events through the bus", () => {
    const bus = new EventBus();
    const received: RuntimeEvent[] = [];
    bus.subscribe((e) => { received.push(e); });

    const publisher = new EventPublisher(bus);
    publisher.publish({
      type: "turn.started",
      id: "p1",
      timestamp: 1,
      data: {},
    });

    expect(received).toHaveLength(1);
    expect(received[0]!.id).toBe("p1");
  });

  it("publishes core events with convenience method", () => {
    const bus = new EventBus();
    const received: RuntimeEvent[] = [];
    bus.subscribe((e) => { received.push(e); });

    const publisher = new EventPublisher(bus);
    const event = publisher.emitCore("turn.completed", {
      sessionId: "s1",
      turnId: "t1",
      data: { reason: "done" },
    });

    expect(received).toHaveLength(1);
    expect(event.type).toBe("turn.completed");
    expect(event.sessionId).toBe("s1");
    expect(event.turnId).toBe("t1");
    expect(typeof event.id).toBe("string");
    expect(event.id.length).toBeGreaterThan(0);
    expect(event.timestamp).toBeGreaterThan(0);
  });

  it("publishes extension events with convenience method", () => {
    const bus = new EventBus();
    const received: RuntimeEvent[] = [];
    bus.subscribe((e) => { received.push(e); });

    const publisher = new EventPublisher(bus);
    const event = publisher.emitExtension("acme.research", "source.fetched", {
      moduleId: "acme/research",
      data: { url: "https://example.test" },
    });

    expect(received).toHaveLength(1);
    expect(event.type).toBe("extension");
    if (event.type === "extension") {
      expect(event.namespace).toBe("acme.research");
      expect(event.name).toBe("source.fetched");
    }
  });

  it("generates unique event ids", () => {
    const bus = new EventBus();
    const publisher = new EventPublisher(bus);

    const e1 = publisher.emitCore("turn.started", { data: {} });
    const e2 = publisher.emitCore("turn.started", { data: {} });

    expect(e1.id).not.toBe(e2.id);
  });

  it("accepts an optional onError callback", () => {
    const bus = new EventBus();
    bus.subscribe(() => {
      throw new Error("subscriber boom");
    });

    const errors: unknown[] = [];
    const publisher = new EventPublisher(bus, {
      onError: (err) => { errors.push(err); },
    });

    publisher.emitCore("error", { data: {} });
    expect(errors).toHaveLength(1);
  });
});

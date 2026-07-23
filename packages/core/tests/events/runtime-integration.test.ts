import { describe, expect, it } from "vitest";
import {
  createHarness,
  createRuntime,
  defineHarness,
  EventBus,
  type RuntimeEvent,
} from "../../src/index.js";
import {
  createManifest,
  createSource,
} from "../helpers/fixtures.js";

async function readyRuntime(name = "EventRT") {
  const harness = await createHarness(
    defineHarness({
      name,
      modules: [createSource(createManifest({ id: "acme/a" }))],
    }),
  );
  return createRuntime(harness);
}

describe("Runtime + EventBus integration", () => {
  it("runtime exposes an EventBus via runtime.events", async () => {
    const runtime = await readyRuntime("WithBus");
    expect(runtime.events).toBeInstanceOf(EventBus);
    expect(runtime.events.closed).toBe(false);
  });

  it("events can be published and subscribed through runtime.events", async () => {
    const runtime = await readyRuntime("PubSub");
    const received: RuntimeEvent[] = [];
    runtime.events.subscribe((e) => { received.push(e); });

    runtime.events.publish({
      type: "turn.started",
      id: "re1",
      timestamp: Date.now(),
      data: {},
    });

    expect(received).toHaveLength(1);
    expect(received[0]!.type).toBe("turn.started");
  });

  it("shutdown closes the event bus", async () => {
    const runtime = await readyRuntime("Shutdown");
    expect(runtime.events.closed).toBe(false);

    await runtime.shutdown();

    expect(runtime.events.closed).toBe(true);
  });

  it("shutdown removes all event subscribers", async () => {
    const runtime = await readyRuntime("Cleanup");
    runtime.events.subscribe(() => {});
    runtime.events.subscribe(() => {});
    expect(runtime.events.subscriberCount).toBe(2);

    await runtime.shutdown();
    expect(runtime.events.subscriberCount).toBe(0);
  });

  it("each runtime has its own independent event bus", async () => {
    const harness = await createHarness(
      defineHarness({
        name: "Shared",
        modules: [],
      }),
    );

    const rt1 = await createRuntime(harness, { id: "rt1" });
    const rt2 = await createRuntime(harness, { id: "rt2" });

    expect(rt1.events).not.toBe(rt2.events);

    const received1: RuntimeEvent[] = [];
    const received2: RuntimeEvent[] = [];
    rt1.events.subscribe((e) => { received1.push(e); });
    rt2.events.subscribe((e) => { received2.push(e); });

    rt1.events.publish({
      type: "turn.started",
      id: "only-rt1",
      timestamp: 1,
      data: {},
    });

    expect(received1).toHaveLength(1);
    expect(received2).toHaveLength(0);
  });
});

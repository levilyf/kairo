import { describe, expect, it } from "vitest";
import {
  RUNTIME_EVENT_TYPES,
  isRuntimeEventType,
  type RuntimeEvent,
} from "../../src/index.js";

describe("RuntimeEvent contract", () => {
  it("lists core event kinds", () => {
    expect(RUNTIME_EVENT_TYPES).toContain("turn.started");
    expect(RUNTIME_EVENT_TYPES).toContain("turn.completed");
    expect(RUNTIME_EVENT_TYPES).toContain("provider.called");
    expect(RUNTIME_EVENT_TYPES).toContain("tool.invoked");
    expect(RUNTIME_EVENT_TYPES).toContain("policy.denied");
    expect(RUNTIME_EVENT_TYPES).toContain("cancelled");
    expect(RUNTIME_EVENT_TYPES).toContain("module.failed");
    expect(RUNTIME_EVENT_TYPES).toContain("error");
  });

  it("type-guards known event types", () => {
    expect(isRuntimeEventType("turn.started")).toBe(true);
    expect(isRuntimeEventType("not.a.real.event")).toBe(false);
  });

  it("supports attributed core events", () => {
    const event: RuntimeEvent = {
      type: "tool.invoked",
      id: "evt-1",
      timestamp: 1,
      sessionId: "sess-1",
      turnId: "turn-1",
      moduleId: "acme/tools",
      data: { toolId: "test/echo" },
    };

    expect(event.type).toBe("tool.invoked");
    expect(event.sessionId).toBe("sess-1");
    expect(event.data.toolId).toBe("test/echo");
  });

  it("supports namespaced extension events", () => {
    const event: RuntimeEvent = {
      type: "extension",
      id: "evt-2",
      timestamp: 2,
      namespace: "acme.research",
      name: "source.fetched",
      data: { url: "https://example.test" },
    };

    expect(event.type).toBe("extension");
    expect(event.namespace).toBe("acme.research");
  });
});

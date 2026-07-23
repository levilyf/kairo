import { describe, expect, it } from "vitest";
import {
  EventBus,
  type EventFilter,
  matchesFilter,
  type RuntimeEvent,
} from "../../src/index.js";

function coreEvent(
  type: string,
  overrides: Partial<RuntimeEvent> = {},
): RuntimeEvent {
  return {
    type: type as RuntimeEvent["type"],
    id: overrides.id ?? "e1",
    timestamp: overrides.timestamp ?? 1,
    data: overrides.data ?? {},
    ...overrides,
  } as RuntimeEvent;
}

describe("EventFilter / matchesFilter", () => {
  it("matches everything when filter is undefined", () => {
    expect(matchesFilter(coreEvent("turn.started"), undefined)).toBe(true);
  });

  it("matches everything when filter is empty", () => {
    expect(matchesFilter(coreEvent("turn.started"), {})).toBe(true);
  });

  it("filters by single type", () => {
    const filter: EventFilter = { types: ["turn.started"] };
    expect(matchesFilter(coreEvent("turn.started"), filter)).toBe(true);
    expect(matchesFilter(coreEvent("turn.completed"), filter)).toBe(false);
  });

  it("filters by multiple types (OR)", () => {
    const filter: EventFilter = {
      types: ["turn.started", "turn.completed"],
    };
    expect(matchesFilter(coreEvent("turn.started"), filter)).toBe(true);
    expect(matchesFilter(coreEvent("turn.completed"), filter)).toBe(true);
    expect(matchesFilter(coreEvent("provider.called"), filter)).toBe(false);
  });

  it("filters by sessionId", () => {
    const filter: EventFilter = { sessionId: "s1" };
    expect(
      matchesFilter(coreEvent("turn.started", { sessionId: "s1" }), filter),
    ).toBe(true);
    expect(
      matchesFilter(coreEvent("turn.started", { sessionId: "s2" }), filter),
    ).toBe(false);
    expect(matchesFilter(coreEvent("turn.started"), filter)).toBe(false);
  });

  it("filters by moduleId", () => {
    const filter: EventFilter = { moduleId: "acme/tools" };
    expect(
      matchesFilter(
        coreEvent("tool.invoked", { moduleId: "acme/tools" }),
        filter,
      ),
    ).toBe(true);
    expect(
      matchesFilter(
        coreEvent("tool.invoked", { moduleId: "other/tools" }),
        filter,
      ),
    ).toBe(false);
  });

  it("filters by turnId", () => {
    const filter: EventFilter = { turnId: "t1" };
    expect(
      matchesFilter(coreEvent("turn.started", { turnId: "t1" }), filter),
    ).toBe(true);
    expect(
      matchesFilter(coreEvent("turn.started", { turnId: "t2" }), filter),
    ).toBe(false);
  });

  it("combines all structural filters with AND logic", () => {
    const filter: EventFilter = {
      types: ["turn.started"],
      sessionId: "s1",
      moduleId: "acme/core",
    };

    // All match
    expect(
      matchesFilter(
        coreEvent("turn.started", {
          sessionId: "s1",
          moduleId: "acme/core",
        }),
        filter,
      ),
    ).toBe(true);

    // Wrong type
    expect(
      matchesFilter(
        coreEvent("turn.completed", {
          sessionId: "s1",
          moduleId: "acme/core",
        }),
        filter,
      ),
    ).toBe(false);

    // Wrong session
    expect(
      matchesFilter(
        coreEvent("turn.started", {
          sessionId: "s2",
          moduleId: "acme/core",
        }),
        filter,
      ),
    ).toBe(false);
  });

  it("applies custom predicate after structural filters", () => {
    const filter: EventFilter = {
      types: ["error"],
      predicate: (e) =>
        (e.data as Record<string, unknown>)?.severity === "critical",
    };

    expect(
      matchesFilter(
        coreEvent("error", { data: { severity: "critical" } }),
        filter,
      ),
    ).toBe(true);
    expect(
      matchesFilter(
        coreEvent("error", { data: { severity: "warning" } }),
        filter,
      ),
    ).toBe(false);
    // Structural filter fails first — predicate not even reached
    expect(
      matchesFilter(
        coreEvent("turn.started", { data: { severity: "critical" } }),
        filter,
      ),
    ).toBe(false);
  });
});

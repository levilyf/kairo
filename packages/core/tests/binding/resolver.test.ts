import { describe, expect, it } from "vitest";
import {
  BINDABLE_CONTRIBUTION_TYPES,
  ContributionRegistry,
  ContributionResolver,
  isBindableContributionType,
} from "../../src/index.js";
import { makeProvider, makeTool } from "../helpers/contracts.js";

describe("ContributionResolver", () => {
  it("lists known bindable contribution types", () => {
    expect(BINDABLE_CONTRIBUTION_TYPES).toEqual([
      "provider",
      "tool",
      "command",
      "ui",
      "context.builder",
      "policy.hook",
    ]);
    expect(isBindableContributionType("provider")).toBe(true);
    expect(isBindableContributionType("context.builder")).toBe(true);
    expect(isBindableContributionType("policy.hook")).toBe(true);
    expect(isBindableContributionType("demo.feature")).toBe(false);
  });

  it("discovers only bindable contributions from the host registry", () => {
    const contributions = new ContributionRegistry();
    contributions.register("acme/mod", {
      capability: "provider",
      id: "acme/p1",
      value: makeProvider("acme/p1"),
    });
    contributions.register("acme/mod", {
      capability: "demo.feature",
      id: "demo.feature/one",
      value: { ok: true },
    });
    contributions.register("acme/tools", {
      capability: "tool",
      id: "acme/echo",
      value: makeTool("acme/echo"),
      order: 10,
    });

    const resolver = new ContributionResolver();
    const discovered = resolver.discover(contributions);

    expect(discovered.map((d) => d.id)).toEqual(["acme/p1", "acme/echo"]);
    expect(discovered[0]).toMatchObject({
      type: "provider",
      moduleId: "acme/mod",
      capability: "provider",
      state: "discovered",
    });
    expect(discovered[1]).toMatchObject({
      type: "tool",
      moduleId: "acme/tools",
      order: 10,
    });
  });

  it("classifies known capabilities and rejects unknowns as unclassifiable", () => {
    const resolver = new ContributionResolver();
    expect(resolver.classify("provider")).toBe("provider");
    expect(resolver.classify("tool")).toBe("tool");
    expect(resolver.classify("command")).toBe("command");
    expect(resolver.classify("ui")).toBe("ui");
    expect(resolver.classify("context.builder")).toBe("context.builder");
    expect(resolver.classify("policy.hook")).toBe("policy.hook");
    expect(resolver.classify("demo.feature")).toBeUndefined();
  });

  it("preserves module attribution on discovery", () => {
    const contributions = new ContributionRegistry();
    contributions.register("vendor/a", {
      capability: "command",
      id: "vendor/status",
      value: { id: "vendor/status" },
    });

    const [first] = new ContributionResolver().discover(contributions);
    expect(first?.moduleId).toBe("vendor/a");
    expect(first?.id).toBe("vendor/status");
  });
});

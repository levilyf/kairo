import { describe, expect, it } from "vitest";
import {
  BindingError,
  BindingErrorCode,
  CommandRegistry,
  ContextBuilderRegistry,
  ContributionBinder,
  ContributionRegistry,
  PolicyRegistry,
  ProviderRegistry,
  ToolRegistry,
  UIRegistry,
  type ContextBuilder,
  type PolicyHook,
} from "../../src/index.js";
import {
  makeCommand,
  makeProvider,
  makeTool,
  makeUI,
} from "../helpers/contracts.js";

function makeRegistries() {
  return {
    providers: new ProviderRegistry(),
    tools: new ToolRegistry(),
    commands: new CommandRegistry(),
    uis: new UIRegistry(),
    contextBuilders: new ContextBuilderRegistry(),
    policyHooks: new PolicyRegistry(),
  };
}

function makeContextBuilder(
  id: string,
  overrides: Partial<ContextBuilder> = {},
): ContextBuilder {
  const base: ContextBuilder = {
    id,
    name: overrides.name ?? id,
    build:
      overrides.build ??
      (() => ({
        fragments: [{ instructions: [`from ${id}`] }],
      })),
  };
  if (overrides.priority !== undefined) {
    (base as { priority: number }).priority = overrides.priority;
  }
  if (overrides.description !== undefined) {
    (base as { description: string }).description = overrides.description;
  }
  if (overrides.moduleId !== undefined) {
    (base as { moduleId: string }).moduleId = overrides.moduleId;
  }
  if (overrides.tags !== undefined) {
    (base as { tags: readonly string[] }).tags = overrides.tags;
  }
  return base;
}

function makePolicyHook(
  id: string,
  overrides: Partial<PolicyHook> = {},
): PolicyHook {
  return {
    id,
    evaluate:
      overrides.evaluate ??
      (() => ({
        verdict: "allow",
      })),
    ...(overrides.description !== undefined
      ? { description: overrides.description }
      : {}),
    ...(overrides.actions !== undefined ? { actions: overrides.actions } : {}),
    ...(overrides.priority !== undefined ? { priority: overrides.priority } : {}),
    ...(overrides.moduleId !== undefined ? { moduleId: overrides.moduleId } : {}),
  };
}

function registerAll(
  contributions: ContributionRegistry,
  moduleId: string,
  items: Array<{
    capability: string;
    id: string;
    value: unknown;
    order?: number;
  }>,
): void {
  for (const item of items) {
    contributions.register(moduleId, item);
  }
}

describe("ContributionBinder", () => {
  it("binds providers, tools, commands, UIs, context builders, and policy hooks", () => {
    const contributions = new ContributionRegistry();
    registerAll(contributions, "acme/pack", [
      {
        capability: "provider",
        id: "acme/p1",
        value: makeProvider("acme/p1"),
      },
      {
        capability: "tool",
        id: "acme/echo",
        value: makeTool("acme/echo"),
      },
      {
        capability: "command",
        id: "acme/status",
        value: makeCommand("acme/status"),
      },
      {
        capability: "ui",
        id: "acme/headless",
        value: makeUI("acme/headless"),
      },
      {
        capability: "context.builder",
        id: "acme/system",
        value: makeContextBuilder("acme/system", { priority: 10 }),
      },
      {
        capability: "policy.hook",
        id: "acme/deny-tools",
        value: makePolicyHook("acme/deny-tools", {
          actions: ["tool.invoke"],
          priority: 1,
        }),
      },
    ]);

    const registries = makeRegistries();
    const binder = new ContributionBinder({ registries });
    const result = binder.bind(contributions);

    expect(result.bound).toHaveLength(6);
    expect(registries.providers.has("acme/p1")).toBe(true);
    expect(registries.tools.has("acme/echo")).toBe(true);
    expect(registries.commands.has("acme/status")).toBe(true);
    expect(registries.uis.has("acme/headless")).toBe(true);
    expect(registries.contextBuilders.has("acme/system")).toBe(true);
    expect(registries.policyHooks.get("acme/deny-tools")?.id).toBe(
      "acme/deny-tools",
    );
    expect(binder.list().every((b) => b.state === "bound")).toBe(true);
  });

  it("binds context builders and policy hooks independently", () => {
    const contributions = new ContributionRegistry();
    registerAll(contributions, "acme/ctx", [
      {
        capability: "context.builder",
        id: "acme/memory",
        value: makeContextBuilder("acme/memory", { priority: 50 }),
      },
    ]);
    registerAll(contributions, "acme/policy", [
      {
        capability: "policy.hook",
        id: "acme/audit",
        value: makePolicyHook("acme/audit"),
      },
    ]);

    const registries = makeRegistries();
    const binder = new ContributionBinder({ registries });
    binder.bind(contributions);

    expect(registries.contextBuilders.list().map((b) => b.id)).toEqual([
      "acme/memory",
    ]);
    expect(registries.policyHooks.list().map((h) => h.id)).toEqual([
      "acme/audit",
    ]);
  });

  it("skips non-bindable generic contributions", () => {
    const contributions = new ContributionRegistry();
    contributions.register("acme/mod", {
      capability: "demo.feature",
      id: "demo.feature/one",
      value: { ok: true },
    });
    contributions.register("acme/mod", {
      capability: "provider",
      id: "acme/p1",
      value: makeProvider("acme/p1"),
    });

    const registries = makeRegistries();
    const binder = new ContributionBinder({ registries });
    const result = binder.bind(contributions);

    expect(result.bound).toHaveLength(1);
    expect(result.skipped).toEqual([
      expect.objectContaining({
        id: "demo.feature/one",
        capability: "demo.feature",
        reason: "unbindable_capability",
      }),
    ]);
    expect(registries.providers.list()).toHaveLength(1);
  });

  it("rejects invalid contracts with module attribution", () => {
    const contributions = new ContributionRegistry();
    contributions.register("acme/bad", {
      capability: "tool",
      id: "acme/broken",
      value: { id: "acme/broken", name: "Broken" },
    });

    const binder = new ContributionBinder({ registries: makeRegistries() });

    try {
      binder.bind(contributions);
      expect.unreachable("expected bind to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(BindingError);
      expect(error).toMatchObject({
        code: BindingErrorCode.INVALID_CONTRIBUTION,
        moduleId: "acme/bad",
        contributionId: "acme/broken",
        contributionType: "tool",
      });
    }
  });

  it("rejects duplicate contribution ids across modules", () => {
    const contributions = new ContributionRegistry();
    // ContributionRegistry itself rejects duplicate ids — simulate
    // registry-level collision via sequential bind of two sources is
    // not possible through one ContributionRegistry. Validate that
    // binder rejects when the target registry already has the id.
    const registries = makeRegistries();
    registries.providers.register(makeProvider("acme/p1"));

    contributions.register("acme/mod", {
      capability: "provider",
      id: "acme/p1",
      value: makeProvider("acme/p1"),
    });

    const binder = new ContributionBinder({ registries });
    try {
      binder.bind(contributions);
      expect.unreachable("expected bind to throw");
    } catch (error) {
      expect(error).toMatchObject({
        code: BindingErrorCode.DUPLICATE_CONTRIBUTION,
        contributionId: "acme/p1",
        contributionType: "provider",
        moduleId: "acme/mod",
      });
    }
  });

  it("validate() reports issues without mutating registries", () => {
    const contributions = new ContributionRegistry();
    contributions.register("acme/bad", {
      capability: "command",
      id: "acme/cmd",
      value: { id: "acme/cmd" },
    });
    contributions.register("acme/good", {
      capability: "provider",
      id: "acme/p1",
      value: makeProvider("acme/p1"),
    });

    const registries = makeRegistries();
    const binder = new ContributionBinder({ registries });
    const report = binder.validate(contributions);

    expect(report.ok).toBe(false);
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]).toMatchObject({
      code: BindingErrorCode.INVALID_CONTRIBUTION,
      moduleId: "acme/bad",
      contributionId: "acme/cmd",
    });
    expect(report.candidates).toHaveLength(2);
    expect(registries.providers.size).toBe(0);
    expect(registries.commands.size).toBe(0);
  });

  it("unbind removes bound items and empties binder state", () => {
    const contributions = new ContributionRegistry();
    contributions.register("acme/mod", {
      capability: "provider",
      id: "acme/p1",
      value: makeProvider("acme/p1"),
    });
    contributions.register("acme/mod", {
      capability: "ui",
      id: "acme/ui",
      value: makeUI("acme/ui"),
    });
    contributions.register("acme/mod", {
      capability: "context.builder",
      id: "acme/system",
      value: makeContextBuilder("acme/system"),
    });
    contributions.register("acme/mod", {
      capability: "policy.hook",
      id: "acme/policy",
      value: makePolicyHook("acme/policy"),
    });

    const registries = makeRegistries();
    const binder = new ContributionBinder({ registries });
    binder.bind(contributions);

    expect(registries.providers.has("acme/p1")).toBe(true);
    expect(registries.uis.has("acme/ui")).toBe(true);
    expect(registries.contextBuilders.has("acme/system")).toBe(true);
    expect(registries.policyHooks.get("acme/policy")).toBeDefined();

    binder.unbind();

    expect(registries.providers.has("acme/p1")).toBe(false);
    expect(registries.uis.has("acme/ui")).toBe(false);
    expect(registries.contextBuilders.has("acme/system")).toBe(false);
    expect(registries.policyHooks.get("acme/policy")).toBeUndefined();
    expect(binder.list()).toHaveLength(0);
  });

  it("rolls back context builder and policy hook bindings on failure", () => {
    const contributions = new ContributionRegistry();
    contributions.register("acme/mod", {
      capability: "context.builder",
      id: "acme/system",
      value: makeContextBuilder("acme/system"),
    });
    contributions.register("acme/mod", {
      capability: "policy.hook",
      id: "acme/policy",
      value: makePolicyHook("acme/policy"),
    });
    contributions.register("acme/mod", {
      capability: "tool",
      id: "acme/broken",
      value: { id: "acme/broken" },
    });

    const registries = makeRegistries();
    const binder = new ContributionBinder({ registries });

    expect(() => binder.bind(contributions)).toThrow(BindingError);
    expect(registries.contextBuilders.size).toBe(0);
    expect(registries.policyHooks.size).toBe(0);
    expect(registries.tools.size).toBe(0);
  });

  it("rejects contribution id mismatch with implementation id", () => {
    const contributions = new ContributionRegistry();
    contributions.register("acme/mod", {
      capability: "provider",
      id: "acme/alias",
      value: makeProvider("acme/real"),
    });

    const binder = new ContributionBinder({ registries: makeRegistries() });
    expect(() => binder.bind(contributions)).toThrow(BindingError);
    try {
      binder.bind(contributions);
    } catch (error) {
      expect(error).toMatchObject({
        code: BindingErrorCode.INVALID_CONTRIBUTION,
        contributionId: "acme/alias",
        moduleId: "acme/mod",
      });
    }
  });

  it("bind is idempotent only after unbind (rejects double bind)", () => {
    const contributions = new ContributionRegistry();
    contributions.register("acme/mod", {
      capability: "tool",
      id: "acme/echo",
      value: makeTool("acme/echo"),
    });

    const binder = new ContributionBinder({ registries: makeRegistries() });
    binder.bind(contributions);

    expect(() => binder.bind(contributions)).toThrow(BindingError);
    try {
      binder.bind(contributions);
    } catch (error) {
      expect(error).toMatchObject({
        code: BindingErrorCode.INVALID_STATE,
      });
    }
  });

  it("rolls back partial bindings when a later contribution fails", () => {
    const contributions = new ContributionRegistry();
    contributions.register("acme/mod", {
      capability: "provider",
      id: "acme/p1",
      value: makeProvider("acme/p1"),
    });
    contributions.register("acme/mod", {
      capability: "tool",
      id: "acme/broken",
      value: { id: "acme/broken" },
    });

    const registries = makeRegistries();
    const binder = new ContributionBinder({ registries });

    expect(() => binder.bind(contributions)).toThrow(BindingError);
    expect(registries.providers.size).toBe(0);
    expect(registries.tools.size).toBe(0);
    expect(binder.list()).toHaveLength(0);
  });

  it("does not execute bound contributions", () => {
    let executed = false;
    const contributions = new ContributionRegistry();
    contributions.register("acme/mod", {
      capability: "tool",
      id: "acme/echo",
      value: makeTool("acme/echo", {
        async execute() {
          executed = true;
          return { ok: true };
        },
      }),
    });

    const registries = makeRegistries();
    const binder = new ContributionBinder({ registries });
    binder.bind(contributions);
    registries.tools.get("acme/echo");
    registries.tools.list();
    binder.list();
    expect(executed).toBe(false);
  });

  it("records bound contribution metadata with attribution", () => {
    const contributions = new ContributionRegistry();
    contributions.register("acme/mod", {
      capability: "command",
      id: "acme/status",
      value: makeCommand("acme/status"),
      order: 5,
    });

    const binder = new ContributionBinder({ registries: makeRegistries() });
    binder.bind(contributions);

    expect(binder.list()[0]).toEqual({
      id: "acme/status",
      type: "command",
      capability: "command",
      moduleId: "acme/mod",
      order: 5,
      state: "bound",
      value: expect.objectContaining({ id: "acme/status" }),
    });
  });
});

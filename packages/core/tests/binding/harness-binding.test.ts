import { describe, expect, it } from "vitest";
import {
  BindingError,
  BindingErrorCode,
  createHarness,
  defineHarness,
  type ContextBuilder,
  type PolicyHook,
} from "../../src/index.js";
import {
  makeCommand,
  makeProvider,
  makeTool,
  makeUI,
} from "../helpers/contracts.js";
import {
  createManifest,
  createModule,
  createSource,
} from "../helpers/fixtures.js";

function makeContextBuilder(id: string): ContextBuilder {
  return {
    id,
    name: id,
    build: () => ({ fragments: [{ instructions: [`from ${id}`] }] }),
  };
}

function makePolicyHook(id: string): PolicyHook {
  return {
    id,
    evaluate: () => ({ verdict: "allow" }),
  };
}

describe("Harness contribution binding", () => {
  it("populates registries from module contributions on boot", async () => {
    const manifest = createManifest({
      id: "acme/pack",
      capabilities: ["provider", "tool", "command", "ui", "context.builder", "policy.hook"],
    });

    const harness = await createHarness(
      defineHarness({
        name: "Bound",
        modules: [
          createSource(
            manifest,
            createModule(manifest, {
              initialize(context) {
                context.registerContribution({
                  capability: "provider",
                  id: "acme/p1",
                  value: makeProvider("acme/p1"),
                });
                context.registerContribution({
                  capability: "tool",
                  id: "acme/echo",
                  value: makeTool("acme/echo"),
                });
                context.registerContribution({
                  capability: "command",
                  id: "acme/status",
                  value: makeCommand("acme/status"),
                });
                context.registerContribution({
                  capability: "ui",
                  id: "acme/ui",
                  value: makeUI("acme/ui"),
                });
                context.registerContribution({
                  capability: "context.builder",
                  id: "acme/system",
                  value: makeContextBuilder("acme/system"),
                });
                context.registerContribution({
                  capability: "policy.hook",
                  id: "acme/audit",
                  value: makePolicyHook("acme/audit"),
                });
              },
            }),
          ),
        ],
      }),
    );

    expect(harness.providers.get("acme/p1")?.id).toBe("acme/p1");
    expect(harness.tools.get("acme/echo")?.id).toBe("acme/echo");
    expect(harness.commands.get("acme/status")?.id).toBe("acme/status");
    expect(harness.uis.get("acme/ui")?.id).toBe("acme/ui");
    expect(harness.contextBuilders.has("acme/system")).toBe(true);
    expect(harness.policyHooks.get("acme/audit")?.id).toBe("acme/audit");
    expect(harness.bindings.list()).toHaveLength(6);
  });

  it("leaves non-bindable contributions in the generic registry only", async () => {
    const manifest = createManifest({
      id: "acme/mod",
      capabilities: ["demo.feature"],
    });

    const harness = await createHarness(
      defineHarness({
        name: "GenericOnly",
        modules: [
          createSource(
            manifest,
            createModule(manifest, {
              initialize(context) {
                context.registerContribution({
                  capability: "demo.feature",
                  id: "demo.feature/one",
                  value: { ok: true },
                });
              },
            }),
          ),
        ],
      }),
    );

    expect(harness.contributions.list("demo.feature")).toHaveLength(1);
    expect(harness.providers.list()).toHaveLength(0);
    expect(harness.bindings.list()).toHaveLength(0);
  });

  it("fails harness boot when a contribution contract is invalid", async () => {
    const manifest = createManifest({ id: "acme/bad" });

    await expect(
      createHarness(
        defineHarness({
          name: "InvalidBind",
          modules: [
            createSource(
              manifest,
              createModule(manifest, {
                initialize(context) {
                  context.registerContribution({
                    capability: "provider",
                    id: "acme/broken",
                    value: { id: "acme/broken", name: "Broken" },
                  });
                },
              }),
            ),
          ],
        }),
      ),
    ).rejects.toMatchObject({
      code: expect.any(String),
      cause: expect.any(BindingError),
    });
  });

  it("unbinds all registries including context builders and policy hooks on harness stop", async () => {
    const manifest = createManifest({
      id: "acme/mod",
      capabilities: ["tool", "context.builder", "policy.hook"],
    });

    const harness = await createHarness(
      defineHarness({
        name: "Cleanup",
        modules: [
          createSource(
            manifest,
            createModule(manifest, {
              initialize(context) {
                context.registerContribution({
                  capability: "tool",
                  id: "acme/echo",
                  value: makeTool("acme/echo"),
                });
                context.registerContribution({
                  capability: "context.builder",
                  id: "acme/system",
                  value: makeContextBuilder("acme/system"),
                });
                context.registerContribution({
                  capability: "policy.hook",
                  id: "acme/audit",
                  value: makePolicyHook("acme/audit"),
                });
              },
            }),
          ),
        ],
      }),
    );

    expect(harness.tools.has("acme/echo")).toBe(true);
    expect(harness.contextBuilders.has("acme/system")).toBe(true);
    expect(harness.policyHooks.get("acme/audit")).toBeDefined();
    await harness.stop();
    expect(harness.tools.has("acme/echo")).toBe(false);
    expect(harness.contextBuilders.has("acme/system")).toBe(false);
    expect(harness.policyHooks.get("acme/audit")).toBeUndefined();
    expect(harness.bindings.list()).toHaveLength(0);
  });

  it("fails harness boot for invalid context builder contract", async () => {
    const manifest = createManifest({ id: "acme/bad-builder" });

    try {
      await createHarness(
        defineHarness({
          name: "BadBuilder",
          modules: [
            createSource(
              manifest,
              createModule(manifest, {
                initialize(context) {
                  context.registerContribution({
                    capability: "context.builder",
                    id: "acme/broken",
                    value: { id: "acme/broken" },
                  });
                },
              }),
            ),
          ],
        }),
      );
      expect.unreachable("expected createHarness to throw");
    } catch (error) {
      const cause = (error as { cause?: unknown }).cause;
      expect(cause).toBeInstanceOf(BindingError);
      expect(cause).toMatchObject({
        code: BindingErrorCode.INVALID_CONTRIBUTION,
        moduleId: "acme/bad-builder",
        contributionId: "acme/broken",
        contributionType: "context.builder",
      });
    }
  });

  it("fails harness boot for invalid policy hook contract", async () => {
    const manifest = createManifest({ id: "acme/bad-policy" });

    try {
      await createHarness(
        defineHarness({
          name: "BadPolicy",
          modules: [
            createSource(
              manifest,
              createModule(manifest, {
                initialize(context) {
                  context.registerContribution({
                    capability: "policy.hook",
                    id: "acme/broken",
                    value: { id: "acme/broken" },
                  });
                },
              }),
            ),
          ],
        }),
      );
      expect.unreachable("expected createHarness to throw");
    } catch (error) {
      const cause = (error as { cause?: unknown }).cause;
      expect(cause).toBeInstanceOf(BindingError);
      expect(cause).toMatchObject({
        code: BindingErrorCode.INVALID_CONTRIBUTION,
        moduleId: "acme/bad-policy",
        contributionId: "acme/broken",
        contributionType: "policy.hook",
      });
    }
  });

  it("attributes binding failures to the contributing module", async () => {
    const manifest = createManifest({ id: "vendor/broken-tools" });

    try {
      await createHarness(
        defineHarness({
          name: "Attr",
          modules: [
            createSource(
              manifest,
              createModule(manifest, {
                initialize(context) {
                  context.registerContribution({
                    capability: "tool",
                    id: "vendor/x",
                    value: { id: "vendor/x" },
                  });
                },
              }),
            ),
          ],
        }),
      );
      expect.unreachable("expected createHarness to throw");
    } catch (error) {
      const cause = (error as { cause?: unknown }).cause;
      expect(cause).toBeInstanceOf(BindingError);
      expect(cause).toMatchObject({
        code: BindingErrorCode.INVALID_CONTRIBUTION,
        moduleId: "vendor/broken-tools",
        contributionId: "vendor/x",
        contributionType: "tool",
      });
    }
  });
});

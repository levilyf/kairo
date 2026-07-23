import { describe, expect, it } from "vitest";
import {
  HarnessError,
  HarnessErrorCode,
  HarnessBuilder,
  defineHarness,
} from "../../src/index.js";
import {
  createManifest,
  createModule,
  createSource,
  createTrackingModule,
} from "../helpers/fixtures.js";

describe("HarnessBuilder", () => {
  it("builds a ready harness from a valid definition", async () => {
    const aManifest = createManifest({ id: "acme/a" });
    const bManifest = createManifest({
      id: "acme/b",
      dependencies: [{ type: "module", id: "acme/a" }],
    });
    const a = createTrackingModule(aManifest);
    const b = createTrackingModule(bManifest);

    const definition = defineHarness({
      name: "Starter",
      modules: [
        createSource(aManifest, a.module),
        createSource(bManifest, b.module),
      ],
    });

    const harness = await new HarnessBuilder().build(definition);

    expect(harness.status).toBe("ready");
    expect(harness.metadata.name).toBe("Starter");
    expect(harness.modules.map((m) => m.manifest.id)).toEqual([
      "acme/a",
      "acme/b",
    ]);
    expect(a.calls).toEqual(["load", "initialize", "start"]);
    expect(b.calls).toEqual(["load", "initialize", "start"]);
  });

  it("passes permissions and module config into ModuleHost", async () => {
    const manifest = createManifest({
      id: "acme/secured",
      permissions: ["network.outbound"],
    });

    let seenConfig: Record<string, unknown> | undefined;
    let seenPermissions: ReadonlySet<string> | undefined;

    const definition = defineHarness({
      name: "Secured",
      permissions: ["network.outbound", "fs.read"],
      modules: [
        {
          source: createSource(
            manifest,
            createModule(manifest, {
              initialize(context) {
                seenConfig = { ...context.config };
                seenPermissions = context.grantedPermissions;
              },
            }),
          ),
          config: { endpoint: "https://example.test" },
        },
      ],
    });

    await new HarnessBuilder().build(definition);

    expect(seenConfig).toEqual({ endpoint: "https://example.test" });
    expect(seenPermissions?.has("network.outbound")).toBe(true);
    expect(seenPermissions?.has("fs.read")).toBe(true);
  });

  it("fails build when ModuleHost boot fails", async () => {
    const manifest = createManifest({ id: "acme/broken" });
    const definition = defineHarness({
      name: "Broken",
      modules: [
        {
          source: {
            manifest,
            load: async () => {
              throw new Error("load exploded");
            },
          },
        },
      ],
    });

    await expect(new HarnessBuilder().build(definition)).rejects.toBeInstanceOf(
      HarnessError,
    );

    try {
      await new HarnessBuilder().build(definition);
    } catch (error) {
      expect(error).toMatchObject({
        code: HarnessErrorCode.BOOT_FAILED,
        harnessName: "Broken",
      });
      expect((error as HarnessError).cause).toBeDefined();
    }
  });

  it("fails build when a required dependency is missing", async () => {
    const definition = defineHarness({
      name: "Incomplete",
      modules: [
        createSource(
          createManifest({
            id: "acme/consumer",
            dependencies: [{ type: "module", id: "acme/missing" }],
          }),
        ),
      ],
    });

    await expect(new HarnessBuilder().build(definition)).rejects.toMatchObject({
      code: HarnessErrorCode.BOOT_FAILED,
    });
  });

  it("allows optional module boot failures", async () => {
    const required = createSource(createManifest({ id: "acme/required" }));
    const optionalManifest = createManifest({ id: "acme/optional" });

    const definition = defineHarness({
      name: "Degraded",
      modules: [
        required,
        {
          source: {
            manifest: optionalManifest,
            load: async () => {
              throw new Error("optional failed");
            },
          },
          optional: true,
        },
      ],
    });

    const harness = await new HarnessBuilder().build(definition);

    expect(harness.status).toBe("ready");
    expect(harness.getModule("acme/required")?.state).toBe("started");
    expect(harness.getModule("acme/optional")?.state).toBe("failed");
    expect(harness.bootInfo.failedOptional.map((f) => f.moduleId)).toEqual([
      "acme/optional",
    ]);
  });

  it("forwards module host events when listener provided on definition", async () => {
    const events: string[] = [];
    const definition = defineHarness({
      name: "Observed",
      modules: [createSource(createManifest({ id: "acme/a" }))],
      onModuleEvent: (event) => {
        events.push(event.type);
      },
    });

    await new HarnessBuilder().build(definition);

    expect(events).toContain("module.registered");
    expect(events).toContain("module.started");
  });
});

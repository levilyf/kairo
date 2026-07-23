import { describe, expect, it } from "vitest";
import {
  HarnessError,
  HarnessErrorCode,
  createHarness,
  defineHarness,
} from "../../src/index.js";
import {
  createManifest,
  createModule,
  createSource,
  createTrackingModule,
} from "../helpers/fixtures.js";

describe("createHarness / Harness", () => {
  it("creates a ready harness via the public entrypoint", async () => {
    const definition = defineHarness({
      name: "Starter",
      version: "1.2.3",
      description: "Public entry",
      modules: [createSource(createManifest({ id: "acme/a" }))],
      config: { mode: "test" },
      environment: { KAIRO_ENV: "test" },
      permissions: [],
    });

    const harness = await createHarness(definition);

    expect(harness.status).toBe("ready");
    expect(harness.metadata).toEqual({
      name: "Starter",
      version: "1.2.3",
      description: "Public entry",
      intent: "",
    });
    expect(harness.config.values).toEqual({ mode: "test" });
    expect(harness.environment).toEqual({ KAIRO_ENV: "test" });
    expect(harness.definition).toBe(definition);
    expect(harness.modules).toHaveLength(1);
    expect(harness.getModule("acme/a")?.state).toBe("started");
  });

  it("exposes contributions registered by modules", async () => {
    const manifest = createManifest({
      id: "acme/contrib",
      capabilities: ["demo.feature"],
    });

    const harness = await createHarness(
      defineHarness({
        name: "Contrib",
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
    expect(harness.contributions.list("demo.feature")[0]?.value).toEqual({
      ok: true,
    });
  });

  it("exposes the owned ModuleHost for later runtime consumption", async () => {
    const harness = await createHarness(
      defineHarness({
        name: "Hosted",
        modules: [createSource(createManifest({ id: "acme/a" }))],
      }),
    );

    expect(harness.moduleHost.get("acme/a")?.state).toBe("started");
  });

  it("stops cleanly and updates lifecycle status", async () => {
    const manifest = createManifest({ id: "acme/a" });
    const tracking = createTrackingModule(manifest);

    const harness = await createHarness(
      defineHarness({
        name: "Stoppable",
        modules: [createSource(manifest, tracking.module)],
      }),
    );

    await harness.stop();

    expect(harness.status).toBe("stopped");
    expect(tracking.calls.slice(-2)).toEqual(["stop", "unload"]);
    expect(harness.getModule("acme/a")?.state).toBe("unloaded");
  });

  it("rejects double stop", async () => {
    const harness = await createHarness(
      defineHarness({
        name: "Once",
        modules: [],
      }),
    );

    await harness.stop();
    await expect(harness.stop()).rejects.toMatchObject({
      code: HarnessErrorCode.INVALID_STATE,
    });
  });

  it("accepts a definition input object through createHarness", async () => {
    const harness = await createHarness({
      name: "Inline",
      modules: [createSource(createManifest({ id: "acme/a" }))],
    });

    expect(harness.metadata.name).toBe("Inline");
    expect(harness.status).toBe("ready");
  });

  it("surfaces definition validation errors from createHarness", async () => {
    await expect(
      createHarness({
        name: "",
        modules: [],
      }),
    ).rejects.toBeInstanceOf(HarnessError);
  });

  it("does not expose runtime or session concepts", async () => {
    const harness = await createHarness(
      defineHarness({
        name: "PureComposition",
        modules: [],
      }),
    );

    expect("runtime" in harness).toBe(false);
    expect("session" in harness).toBe(false);
    expect("agentLoop" in harness).toBe(false);
  });
});

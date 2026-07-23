import { describe, expect, it, vi } from "vitest";
import {
  ModuleError,
  ModuleErrorCode,
  ModuleHost,
} from "../src/index.js";
import {
  createManifest,
  createModule,
  createSource,
  createTrackingModule,
} from "./helpers/fixtures.js";

describe("ModuleHost", () => {
  it("boots modules in dependency order through the full lifecycle", async () => {
    const aManifest = createManifest({ id: "acme/a" });
    const bManifest = createManifest({
      id: "acme/b",
      dependencies: [{ type: "module", id: "acme/a" }],
    });

    const a = createTrackingModule(aManifest);
    const b = createTrackingModule(bManifest);

    const host = new ModuleHost({ coreVersion: "0.1.0" });
    host.register(createSource(aManifest, a.module));
    host.register(createSource(bManifest, b.module));

    const result = await host.boot();

    expect(result.ok).toBe(true);
    expect(a.calls).toEqual(["load", "initialize", "start"]);
    expect(b.calls).toEqual(["load", "initialize", "start"]);
    expect(host.get("acme/a")?.state).toBe("started");
    expect(host.get("acme/b")?.state).toBe("started");

    // a before b for each phase
    // ensure load order: a then b by checking host order
    expect(host.list().map((e) => e.manifest.id)).toEqual([
      "acme/a",
      "acme/b",
    ]);
  });

  it("shuts down in reverse dependency order", async () => {
    const aManifest = createManifest({ id: "acme/a" });
    const bManifest = createManifest({
      id: "acme/b",
      dependencies: [{ type: "module", id: "acme/a" }],
    });

    const timeline: string[] = [];
    const host = new ModuleHost({ coreVersion: "0.1.0" });
    host.register(
      createSource(
        aManifest,
        createModule(aManifest, {
          async stop() {
            timeline.push("a:stop");
          },
          async unload() {
            timeline.push("a:unload");
          },
        }),
      ),
    );
    host.register(
      createSource(
        bManifest,
        createModule(bManifest, {
          async stop() {
            timeline.push("b:stop");
          },
          async unload() {
            timeline.push("b:unload");
          },
        }),
      ),
    );
    await host.boot();
    await host.shutdown();

    expect(timeline).toEqual(["b:stop", "b:unload", "a:stop", "a:unload"]);
    expect(host.get("acme/a")?.state).toBe("unloaded");
    expect(host.get("acme/b")?.state).toBe("unloaded");
  });

  it("emits lifecycle diagnostics events", async () => {
    const manifest = createManifest({ id: "acme/a" });
    const events: string[] = [];
    const host = new ModuleHost({
      coreVersion: "0.1.0",
      onEvent: (event) => {
        events.push(`${event.type}:${event.moduleId}`);
      },
    });

    host.register(createSource(manifest));
    await host.boot();
    await host.shutdown();

    expect(events).toEqual([
      "module.registered:acme/a",
      "module.resolved:acme/a",
      "module.loading:acme/a",
      "module.loaded:acme/a",
      "module.initializing:acme/a",
      "module.initialized:acme/a",
      "module.starting:acme/a",
      "module.started:acme/a",
      "module.stopping:acme/a",
      "module.stopped:acme/a",
      "module.unloading:acme/a",
      "module.unloaded:acme/a",
    ]);
  });

  it("fails boot for required module load failure", async () => {
    const manifest = createManifest({ id: "acme/a" });
    const host = new ModuleHost({ coreVersion: "0.1.0" });
    host.register({
      manifest,
      load: async () => {
        throw new Error("boom");
      },
    });

    const result = await host.boot();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(ModuleErrorCode.LOAD_FAILED);
    expect(result.error.moduleId).toBe("acme/a");
    expect(host.get("acme/a")?.state).toBe("failed");
  });

  it("continues boot when an optional module fails to load", async () => {
    const requiredManifest = createManifest({ id: "acme/required" });
    const optionalManifest = createManifest({ id: "acme/optional" });

    const host = new ModuleHost({ coreVersion: "0.1.0" });
    host.register(createSource(requiredManifest));
    host.register(
      {
        manifest: optionalManifest,
        load: async () => {
          throw new Error("optional broken");
        },
      },
      { optional: true },
    );

    const result = await host.boot();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(host.get("acme/required")?.state).toBe("started");
    expect(host.get("acme/optional")?.state).toBe("failed");
    expect(result.failedOptional.map((f) => f.moduleId)).toEqual([
      "acme/optional",
    ]);
  });

  it("treats optional modules as required when required modules depend on them", async () => {
    const optionalManifest = createManifest({ id: "acme/optional" });
    const requiredManifest = createManifest({
      id: "acme/required",
      dependencies: [{ type: "module", id: "acme/optional" }],
    });

    const host = new ModuleHost({ coreVersion: "0.1.0" });
    host.register(
      {
        manifest: optionalManifest,
        load: async () => {
          throw new Error("broken");
        },
      },
      { optional: true },
    );
    host.register(createSource(requiredManifest));

    const result = await host.boot();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.moduleId).toBe("acme/optional");
  });

  it("rejects registration after start (no hot reload)", async () => {
    const host = new ModuleHost({ coreVersion: "0.1.0" });
    host.register(createSource(createManifest({ id: "acme/a" })));
    await host.boot();

    expect(() =>
      host.register(createSource(createManifest({ id: "acme/b" }))),
    ).toThrow(ModuleError);

    try {
      host.register(createSource(createManifest({ id: "acme/b" })));
    } catch (error) {
      expect(error).toMatchObject({
        code: ModuleErrorCode.REGISTRATION_CLOSED,
        phase: "registration",
      });
    }
  });

  it("provides module context with config and granted permissions", async () => {
    const manifest = createManifest({
      id: "acme/a",
      permissions: ["fs.read"],
    });
    const initialize = vi.fn();
    const host = new ModuleHost({
      coreVersion: "0.1.0",
      grantedPermissions: ["fs.read", "network.outbound"],
    });

    host.register(createSource(manifest, createModule(manifest, { initialize })), {
      config: { root: "/tmp" },
    });

    await host.boot();

    expect(initialize).toHaveBeenCalledOnce();
    const context = initialize.mock.calls[0]?.[0];
    expect(context.moduleId).toBe("acme/a");
    expect(context.config).toEqual({ root: "/tmp" });
    expect(context.grantedPermissions.has("fs.read")).toBe(true);
    expect(context.grantedPermissions.has("network.outbound")).toBe(true);
  });

  it("allows modules to register generic contributions during initialize", async () => {
    const manifest = createManifest({
      id: "acme/a",
      capabilities: ["demo.feature"],
    });

    const host = new ModuleHost({ coreVersion: "0.1.0" });
    host.register(
      createSource(
        manifest,
        createModule(manifest, {
          initialize(context) {
            context.registerContribution({
              capability: "demo.feature",
              id: "demo.feature/one",
              value: { hello: "world" },
            });
          },
        }),
      ),
    );

    await host.boot();

    const contributions = host.contributions.list("demo.feature");
    expect(contributions).toHaveLength(1);
    expect(contributions[0]).toMatchObject({
      moduleId: "acme/a",
      capability: "demo.feature",
      id: "demo.feature/one",
      value: { hello: "world" },
    });
  });

  it("clears contributions on unload", async () => {
    const manifest = createManifest({ id: "acme/a" });
    const host = new ModuleHost({ coreVersion: "0.1.0" });
    host.register(
      createSource(
        manifest,
        createModule(manifest, {
          initialize(context) {
            context.registerContribution({
              capability: "demo.feature",
              id: "demo.feature/one",
              value: 1,
            });
          },
        }),
      ),
    );

    await host.boot();
    await host.shutdown();

    expect(host.contributions.list()).toHaveLength(0);
  });

  it("keeps core integrity when stop fails and still attempts unload", async () => {
    const manifest = createManifest({ id: "acme/a" });
    const calls: string[] = [];
    const host = new ModuleHost({ coreVersion: "0.1.0" });

    host.register(
      createSource(
        manifest,
        createModule(manifest, {
          async stop() {
            calls.push("stop");
            throw new Error("stop failed");
          },
          async unload() {
            calls.push("unload");
          },
        }),
      ),
    );

    await host.boot();
    await host.shutdown();

    expect(calls).toEqual(["stop", "unload"]);
    expect(host.get("acme/a")?.state).toBe("unloaded");
  });

  it("fails resolution when required dependency is missing", async () => {
    const host = new ModuleHost({ coreVersion: "0.1.0" });
    host.register(
      createSource(
        createManifest({
          id: "acme/a",
          dependencies: [{ type: "module", id: "acme/missing" }],
        }),
      ),
    );

    const result = await host.boot();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(ModuleErrorCode.MISSING_DEPENDENCY);
  });

  it("is inspectable: list and get reflect current state", async () => {
    const host = new ModuleHost({ coreVersion: "0.1.0" });
    host.register(createSource(createManifest({ id: "acme/a", name: "A" })));

    expect(host.list()).toHaveLength(1);
    expect(host.get("acme/a")?.state).toBe("registered");

    await host.boot();
    expect(host.get("acme/a")?.state).toBe("started");
  });
});

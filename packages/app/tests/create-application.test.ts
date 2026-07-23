import { describe, expect, it } from "vitest";

import { createApplication, type Application } from "../src/index.js";
import { makeConfig, makeLocalConfig, isProvider } from "./helpers.js";

describe("createApplication — full bootstrap", () => {
  it("builds an Application exposing all four handles from a local config", async () => {
    const app = await createApplication({ config: makeLocalConfig() });
    expect(app).toBeDefined();
    expect(app.config).toBeDefined();
    expect(app.registry).toBeDefined();
    expect(app.harness).toBeDefined();
    expect(app.runtime).toBeDefined();
    expect(app.providers.length).toBe(2);
    expect(app.providers.every(isProvider)).toBe(true);

    await app.stop();
  });

  it("registry is wired: configured providers are constructible and lookups work", async () => {
    const app = await createApplication({ config: makeLocalConfig() });
    expect(app.registry.has("ollama")).toBe(true);
    expect(app.registry.has("lmstudio")).toBe(true);
    expect(app.registry.get("ollama").id).toBe("ollama");
    expect(app.registry.get("lmstudio").id).toBe("lmstudio");

    await app.stop();
  });

  it("harness is ready and contains the configured providers in its contract registry", async () => {
    const app = await createApplication({ config: makeLocalConfig() });
    expect(app.harness.status).toBe("ready");
    // The harness's provider registry should have been populated by the
    // ContributionBinder from the synthesized provider-wrapper modules.
    const ids = [...app.harness.providers.list()].map((p) => p.id).sort();
    expect(ids).toEqual(["lmstudio", "ollama"]);
    await app.stop();
  });

  it("runtime is ready and bound to the same harness", async () => {
    const app = await createApplication({ config: makeLocalConfig() });
    expect(app.runtime.status).toBe("ready");
    expect(app.runtime.harness).toBe(app.harness);
    await app.stop();
  });

  it("does NOT modify the input config (it stays frozen)", async () => {
    const config = makeLocalConfig();
    const snapshot = JSON.stringify(config);
    const app = await createApplication({ config });
    expect(JSON.stringify(app.config)).toBe(snapshot);
    expect(JSON.stringify(config)).toBe(snapshot);
    await app.stop();
  });

  it("Application object itself is frozen (immutable)", async () => {
    const app = await createApplication({ config: makeLocalConfig() });
    expect(Object.isFrozen(app)).toBe(true);
    await app.stop();
  });

  it("with an empty providers block, returns an Application with zero providers", async () => {
    const app = await createApplication({
      config: makeConfig({ providers: {} }),
    });
    expect(app.providers.length).toBe(0);
    expect([...app.harness.providers.list()].length).toBe(0);
    await app.stop();
  });

  it("providers array order matches config insertion order", async () => {
    const app = await createApplication({
      config: makeConfig({
        providers: {
          lmstudio: { defaultModel: "m" },
          ollama: { defaultModel: "q" },
        },
      }),
    });
    expect(app.providers.map((p) => p.id)).toEqual(["lmstudio", "ollama"]);
    await app.stop();
  });
});

describe("createApplication — harness options override", () => {
  it("passes through harness.name and harness.version overrides", async () => {
    const app = await createApplication({
      config: makeLocalConfig(),
      harness: { name: "my-harness", version: "9.9.9" },
    });
    expect(app.harness.metadata.name).toBe("my-harness");
    expect(app.harness.metadata.version).toBe("9.9.9");
    await app.stop();
  });
});

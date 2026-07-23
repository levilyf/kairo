import { describe, expect, it } from "vitest";

import {
  wrapProviderAsModule,
  createProviderModuleManifest,
} from "../src/index.js";
import { makeProvider } from "./helpers-provider.js";

describe("provider-module — wrapping a Provider as a ModuleSource", () => {
  it("creates a manifest with a provider-derived stable id", () => {
    const provider = makeProvider("nvidia");
    const manifest = createProviderModuleManifest(provider);
    expect(manifest.id).toBe("kairo/provider:nvidia");
    expect(manifest.name).toBe("Provider module: NVIDIA");
    expect(manifest.capabilities).toEqual(["provider"]);
    expect(manifest.dependencies).toEqual([]);
    expect(manifest.compatibility.min).toBe("0.1.0");
  });

  it("wrapProviderAsModule yields a ModuleSource whose load() resolves to a module", async () => {
    const provider = makeProvider("groq");
    const source = wrapProviderAsModule({ provider });
    const module = await source.load();
    expect(typeof module.initialize).toBe("function");
  });

  it("the wrapped module's initialize() registers a provider contribution", async () => {
    const provider = makeProvider("ollama");
    const source = wrapProviderAsModule({ provider });
    const module = await source.load();

    const recorded: Array<{ capability: string; id: string; value: unknown }> =
      [];
    const context = {
      moduleId: "kairo/provider:ollama",
      config: {},
      grantedPermissions: new Set<string>(),
      registerContribution: (c: {
        capability: string;
        id: string;
        value: unknown;
      }) => {
        recorded.push(c);
      },
    };

    await module.initialize?.(context as never);
    expect(recorded.length).toBe(1);
    expect(recorded[0]!.capability).toBe("provider");
    expect(recorded[0]!.id).toBe("ollama");
    expect(recorded[0]!.value).toBe(provider);
  });
});

import { describe, expect, it } from "vitest";

import {
  buildHarness,
  buildHarnessDefinition,
  buildRuntime,
} from "../src/index.js";
import type { Harness } from "@kairo/core";
import { makeProvider } from "./helpers-provider.js";

describe("buildHarnessDefinition / buildHarness / buildRuntime", () => {
  it("produces a frozen HarnessDefinition with provider-wrapper modules", () => {
    const [a, b] = [makeProvider("ollama"), makeProvider("groq")];
    const def = buildHarnessDefinition([a, b], { name: "test-harness" });
    expect(def.metadata.name).toBe("test-harness");
    expect(def.modules.length).toBe(2);
    expect(def.modules.map((m) => m.source.manifest.id).sort()).toEqual([
      "kairo/provider:groq",
      "kairo/provider:ollama",
    ]);
  });

  it("default harness name is 'kairo' with version '0.1.0'", () => {
    const def = buildHarnessDefinition([], {});
    expect(def.metadata.name).toBe("kairo");
    expect(def.metadata.version).toBe("0.1.0");
  });

  it("buildHarness actually boots a ready Harness", async () => {
    const provider = makeProvider("ollama");
    const harness = await buildHarness([provider]);
    expect(harness).toBeInstanceOf(Object);
    expect((harness as Harness).status).toBe("ready");
    // The ContributionBinder should have populated the harness.providers registry.
    const fetched = (harness as Harness).providers.get("ollama");
    expect(fetched).toBeDefined();
    expect(fetched!.id).toBe("ollama");
    await harness.stop();
  });

  it("buildRuntime constructs a ready Runtime from a ready Harness", async () => {
    const provider = makeProvider("ollama");
    const harness = await buildHarness([provider]);
    const runtime = await buildRuntime(harness);
    expect(runtime).toBeDefined();
    expect(runtime.status).toBe("ready");
    expect(runtime.harness).toBe(harness);
    await runtime.shutdown();
    await harness.stop();
  });
});

import { beforeEach, describe, expect, it } from "vitest";

import { ProviderRegistry } from "../src/index.js";
import { fakeFactory, makeConfig } from "./helpers.js";

describe("ProviderRegistry — immutability", () => {
  let registry: ProviderRegistry;
  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  it("listProviders() returns a frozen snapshot; mutating it does not affect the next call", () => {
    registry.register("nvidia", fakeFactory("nvidia"));
    registry.register("groq", fakeFactory("groq"));
    registry.createProviders(
      makeConfig({
        providers: { nvidia: { apiKey: "k1" }, groq: { apiKey: "k2" } },
      }),
    );
    const first = registry.listProviders();
    expect(Object.isFrozen(first)).toBe(true);
    // Try to mutate (must throw in strict mode):
    expect(() => (first as unknown as { push: (x: unknown) => void }).push({} as never))
      .toThrow(TypeError);
    // Second call returns a fresh array with new identity:
    const second = registry.listProviders();
    expect(second).not.toBe(first);
    expect(second.length).toBe(2);
  });

  it("listModels() returns a frozen snapshot", () => {
    registry.register("nvidia", fakeFactory("nvidia"));
    registry.createProviders(
      makeConfig({
        providers: { nvidia: { apiKey: "k", models: ["m1", "m2"] } },
      }),
    );
    const first = registry.listModels();
    expect(Object.isFrozen(first)).toBe(true);
    expect(first[0]!.providers).toBeDefined();
    expect(Object.isFrozen(first[0]!.providers)).toBe(true);
    expect(() => (first as unknown as { push: (x: unknown) => void }).push({} as never))
      .toThrow(TypeError);
  });

  it("ModelEntry.providers array is frozen", () => {
    registry.register("nvidia", fakeFactory("nvidia"));
    registry.register("groq", fakeFactory("groq"));
    registry.createProviders(
      makeConfig({
        providers: {
          nvidia: { apiKey: "k", models: ["m1"] },
          groq: { apiKey: "k", models: ["m1"] },
        },
      }),
    );
    const first = registry.listModels();
    const entry = first[0]!;
    expect(Object.isFrozen(entry.providers)).toBe(true);
  });

  it("cannot be tricked into sharing state across registries", () => {
    const a = new ProviderRegistry();
    const b = new ProviderRegistry();
    a.register("nvidia", fakeFactory("nvidia"));
    a.createProviders(
      makeConfig({ providers: { nvidia: { apiKey: "k" } } }),
    );
    expect(b.has("nvidia")).toBe(false);
    expect(() => b.get("nvidia")).toThrow();
  });

  it("clear() detaches all factories and providers", () => {
    registry.register("nvidia", fakeFactory("nvidia"));
    registry.createProviders(
      makeConfig({ providers: { nvidia: { apiKey: "k" } } }),
    );
    expect(registry.has("nvidia")).toBe(true);
    registry.clear();
    expect(registry.has("nvidia")).toBe(false);
  });
});

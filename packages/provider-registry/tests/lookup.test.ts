import { beforeEach, describe, expect, it } from "vitest";

import {
  ProviderRegistry,
  ProviderRegistryError,
  ProviderRegistryErrorCode,
} from "../src/index.js";
import { fakeFactory, makeConfig } from "./helpers.js";

describe("ProviderRegistry — lookup", () => {
  let registry: ProviderRegistry;
  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  it("get() returns the constructed provider instance", () => {
    registry.register("nvidia", fakeFactory("nvidia"));
    registry.createProviders(
      makeConfig({ providers: { nvidia: { apiKey: "k" } } }),
    );
    const provider = registry.get("nvidia");
    expect(provider.id).toBe("nvidia");
    expect(provider.capabilities.streaming).toBe(true);
  });

  it("get() returns the same instance across calls (no re-construction)", () => {
    const nvidia = fakeFactory("nvidia");
    registry.register("nvidia", nvidia);
    registry.createProviders(
      makeConfig({ providers: { nvidia: { apiKey: "k" } } }),
    );
    expect(nvidia.calls.length).toBe(1);
    const a = registry.get("nvidia");
    const b = registry.get("nvidia");
    expect(a).toBe(b);
    expect(nvidia.calls.length).toBe(1);
  });

  it("get() throws UNKNOWN_PROVIDER for a configured-but-never-registered id", () => {
    // No factory registered for "groq";
    // createProviders would throw UNKNOWN_PROVIDER before reaching here,
    // so test lookup by registering another provider, leaving groq absent.
    registry.register("another", fakeFactory("another"));
    registry.createProviders(
      makeConfig({ providers: { another: { apiKey: "k" } } }),
    );
    try {
      registry.get("groq");
      expect.unreachable("should throw");
    } catch (error) {
      expect((error as ProviderRegistryError).code).toBe(
        ProviderRegistryErrorCode.UNKNOWN_PROVIDER,
      );
    }
  });

  it("get() throws UNKNOWN_PROVIDER for a registered-but-unconfigured id", () => {
    registry.register("nvidia", fakeFactory("nvidia"));
    // createProviders with an empty providers object means nvidia is not configured.
    registry.createProviders(makeConfig({ providers: {} }));
    try {
      registry.get("nvidia");
      expect.unreachable("should throw");
    } catch (error) {
      expect((error as ProviderRegistryError).code).toBe(
        ProviderRegistryErrorCode.UNKNOWN_PROVIDER,
      );
    }
  });

  it("get() throws INVALID_CONFIG if createProviders() was never called", () => {
    registry.register("nvidia", fakeFactory("nvidia"));
    try {
      registry.get("nvidia");
      expect.unreachable("should throw");
    } catch (error) {
      expect((error as ProviderRegistryError).code).toBe(
        ProviderRegistryErrorCode.INVALID_CONFIG,
      );
    }
  });

  it("listProviders() throws INVALID_CONFIG if createProviders() was never called", () => {
    registry.register("nvidia", fakeFactory("nvidia"));
    try {
      registry.listProviders();
      expect.unreachable("should throw");
    } catch (error) {
      expect((error as ProviderRegistryError).code).toBe(
        ProviderRegistryErrorCode.INVALID_CONFIG,
      );
    }
  });

  it("listProviders() returns all configured providers", () => {
    registry.register("nvidia", fakeFactory("nvidia"));
    registry.register("groq", fakeFactory("groq"));
    registry.createProviders(
      makeConfig({
        providers: {
          nvidia: { apiKey: "k1" },
          groq: { apiKey: "k2" },
        },
      }),
    );
    expect(registry.listProviders().length).toBe(2);
    expect(registry.listProviders().map((p) => p.id).sort()).toEqual([
      "groq",
      "nvidia",
    ]);
  });
});

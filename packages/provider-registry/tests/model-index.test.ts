import { beforeEach, describe, expect, it } from "vitest";

import {
  ProviderRegistry,
  ProviderRegistryError,
  ProviderRegistryErrorCode,
} from "../src/index.js";
import { fakeFactory, makeConfig } from "./helpers.js";

describe("ProviderRegistry — model index", () => {
  let registry: ProviderRegistry;
  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  it("listModels() is empty when no provider declares models", () => {
    registry.register("nvidia", fakeFactory("nvidia"));
    registry.createProviders(
      makeConfig({ providers: { nvidia: { apiKey: "k" } } }),
    );
    expect(registry.listModels().length).toBe(0);
  });

  it("indexes models declared under a provider block", () => {
    registry.register("nvidia", fakeFactory("nvidia"));
    registry.register("ollama", fakeFactory("ollama"));
    registry.createProviders(
      makeConfig({
        providers: {
          nvidia: { apiKey: "k", models: ["moonshotai/kimi-k2-instruct"] },
          ollama: { models: ["qwen3-coder:30b"] },
        },
      }),
    );
    const entries = registry.listModels();
    expect(entries.map((e) => e.model).sort()).toEqual([
      "moonshotai/kimi-k2-instruct",
      "qwen3-coder:30b",
    ]);
    const kimi = entries.find((e) => e.model === "moonshotai/kimi-k2-instruct")!;
    expect(kimi.providers).toEqual(["nvidia"]);
    expect(kimi.providerId).toBe("nvidia");
    expect(kimi.ambiguous).toBe(false);
  });

  it("does not register the per-provider defaultModel as a model on its own", () => {
    // defaultModel is a *preferred* model when config.model is unset, but it is
    // not itself a member of the model→provider index unless also listed in `models`.
    registry.register("nvidia", fakeFactory("nvidia"));
    registry.createProviders(
      makeConfig({
        providers: { nvidia: { defaultModel: "moonshotai/kimi-k2-instruct" } },
      }),
    );
    expect(registry.listModels().length).toBe(0);
  });

  it("records every provider claiming a duplicate model and flags it ambiguous", () => {
    registry.register("nvidia", fakeFactory("nvidia"));
    registry.register("openrouter", fakeFactory("openrouter"));
    registry.createProviders(
      makeConfig({
        providers: {
          nvidia: { apiKey: "k1", models: ["deepseek-r1", "m1"] },
          openrouter: { apiKey: "k2", models: ["deepseek-r1", "m2"] },
        },
      }),
    );
    const entries = registry.listModels();
    const ds = entries.find((e) => e.model === "deepseek-r1")!;
    expect(ds.ambiguous).toBe(true);
    expect([...ds.providers].sort()).toEqual(["nvidia", "openrouter"]);
    expect(ds.providerId).toBeUndefined();
  });

  it("collapses a duplicate within a single provider block (same id twice)", () => {
    registry.register("nvidia", fakeFactory("nvidia"));
    registry.createProviders(
      makeConfig({
        providers: {
          nvidia: { apiKey: "k", models: ["m1", "m1", "m1"] },
        },
      }),
    );
    const entries = registry.listModels();
    expect(entries.filter((e) => e.model === "m1").length).toBe(1);
    expect(entries[0]!.providers).toEqual(["nvidia"]);
    expect(entries[0]!.ambiguous).toBe(false);
  });

  it("resolveModel() returns the owning provider when unambiguous", () => {
    registry.register("nvidia", fakeFactory("nvidia"));
    registry.createProviders(
      makeConfig({
        providers: { nvidia: { apiKey: "k", models: ["moonshotai/kimi-k2-instruct"] } },
      }),
    );
    const { provider } = registry.resolveModel("moonshotai/kimi-k2-instruct");
    expect(provider.id).toBe("nvidia");
  });

  it("resolveModel() trims whitespace on the model string", () => {
    registry.register("nvidia", fakeFactory("nvidia"));
    registry.createProviders(
      makeConfig({
        providers: { nvidia: { apiKey: "k", models: ["m1"] } },
      }),
    );
    const { provider } = registry.resolveModel("  m1  ");
    expect(provider.id).toBe("nvidia");
  });

  it("resolveModel() throws DUPLICATE_MODEL for an ambiguous model", () => {
    registry.register("nvidia", fakeFactory("nvidia"));
    registry.register("openrouter", fakeFactory("openrouter"));
    registry.createProviders(
      makeConfig({
        providers: {
          nvidia: { apiKey: "k1", models: ["deepseek-r1"] },
          openrouter: { apiKey: "k2", models: ["deepseek-r1"] },
        },
      }),
    );
    try {
      registry.resolveModel("deepseek-r1");
      expect.unreachable("should throw");
    } catch (error) {
      expect((error as ProviderRegistryError).code).toBe(
        ProviderRegistryErrorCode.DUPLICATE_MODEL,
      );
      expect((error as ProviderRegistryError).model).toBe("deepseek-r1");
      expect(
        (error as ProviderRegistryError).conflictingProviders?.slice().sort(),
      ).toEqual(["nvidia", "openrouter"]);
    }
  });

  it("resolveModel() throws UNKNOWN_PROVIDER when no provider declares the model", () => {
    registry.register("nvidia", fakeFactory("nvidia"));
    registry.createProviders(
      makeConfig({ providers: { nvidia: { apiKey: "k", models: ["m1"] } } }),
    );
    try {
      registry.resolveModel("unknown-model");
      expect.unreachable("should throw");
    } catch (error) {
      expect((error as ProviderRegistryError).code).toBe(
        ProviderRegistryErrorCode.UNKNOWN_PROVIDER,
      );
      expect((error as ProviderRegistryError).model).toBe("unknown-model");
    }
  });

  it("resolveModel() rejects empty model strings", () => {
    registry.register("nvidia", fakeFactory("nvidia"));
    registry.createProviders(
      makeConfig({ providers: { nvidia: { apiKey: "k", models: ["m1"] } } }),
    );
    try {
      registry.resolveModel("   ");
      expect.unreachable("should throw");
    } catch (error) {
      expect((error as ProviderRegistryError).code).toBe(
        ProviderRegistryErrorCode.INVALID_CONFIG,
      );
    }
  });

  it("listModels() throws INVALID_CONFIG if createProviders() was never called", () => {
    registry.register("nvidia", fakeFactory("nvidia"));
    try {
      registry.listModels();
      expect.unreachable("should throw");
    } catch (error) {
      expect((error as ProviderRegistryError).code).toBe(
        ProviderRegistryErrorCode.INVALID_CONFIG,
      );
    }
  });
});

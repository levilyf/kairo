import { beforeEach, describe, expect, it } from "vitest";

import {
  ProviderRegistry,
  ProviderRegistryError,
  ProviderRegistryErrorCode,
} from "../src/index.js";
import { fakeFactory, makeConfig } from "./helpers.js";

describe("ProviderRegistry — default model resolution", () => {
  let registry: ProviderRegistry;
  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  it("getDefault() resolves config.model to its owning provider", () => {
    registry.register("nvidia", fakeFactory("nvidia"));
    registry.createProviders(
      makeConfig({
        model: "moonshotai/kimi-k2-instruct",
        providers: {
          nvidia: { apiKey: "k", models: ["moonshotai/kimi-k2-instruct"] },
        },
      }),
    );
    const { provider, model } = registry.getDefault();
    expect(provider.id).toBe("nvidia");
    expect(model).toBe("moonshotai/kimi-k2-instruct");
  });

  it("getDefault() throws DEFAULT_MODEL_NOT_FOUND when config.model is set but not declared by any provider", () => {
    registry.register("nvidia", fakeFactory("nvidia"));
    registry.createProviders(
      makeConfig({
        model: "missing-model",
        providers: {
          nvidia: { apiKey: "k", models: ["other-model"] },
        },
      }),
    );
    try {
      registry.getDefault();
      expect.unreachable("should throw");
    } catch (error) {
      expect((error as ProviderRegistryError).code).toBe(
        ProviderRegistryErrorCode.DEFAULT_MODEL_NOT_FOUND,
      );
      expect((error as ProviderRegistryError).model).toBe("missing-model");
    }
  });

  it("getDefault() throws DUPLICATE_MODEL when config.model maps to ambiguous owners", () => {
    registry.register("nvidia", fakeFactory("nvidia"));
    registry.register("openrouter", fakeFactory("openrouter"));
    registry.createProviders(
      makeConfig({
        model: "deepseek-r1",
        providers: {
          nvidia: { apiKey: "k1", models: ["deepseek-r1"] },
          openrouter: { apiKey: "k2", models: ["deepseek-r1"] },
        },
      }),
    );
    try {
      registry.getDefault();
      expect.unreachable("should throw");
    } catch (error) {
      expect((error as ProviderRegistryError).code).toBe(
        ProviderRegistryErrorCode.DUPLICATE_MODEL,
      );
      expect((error as ProviderRegistryError).model).toBe("deepseek-r1");
    }
  });

  it("getDefault() falls back to the first configured provider's own defaultModel when config.model is unset", () => {
    registry.register("nvidia", fakeFactory("nvidia"));
    registry.register("ollama", fakeFactory("ollama"));
    registry.createProviders(
      makeConfig({
        providers: {
          nvidia: {
            apiKey: "k",
            defaultModel: "moonshotai/kimi-k2-instruct",
            models: ["moonshotai/kimi-k2-instruct"],
          },
          ollama: {
            defaultModel: "qwen3-coder:30b",
            models: ["qwen3-coder:30b"],
          },
        },
      }),
    );
    const { provider, model } = registry.getDefault();
    expect(provider.id).toBe("nvidia");
    expect(model).toBe("moonshotai/kimi-k2-instruct");
  });

  it("getDefault() fallback requires the provider's defaultModel to also be in its `models` for the index lookup", () => {
    // The fallback model must appear in the byModel index; if a provider declares
    // `defaultModel` but NOT in `models`, the fallback model is unindexed →
    // DEFAULT_MODEL_NOT_FOUND.
    registry.register("nvidia", fakeFactory("nvidia"));
    registry.createProviders(
      makeConfig({
        providers: {
          nvidia: { defaultModel: "sole-default" },
        },
      }),
    );
    try {
      registry.getDefault();
      expect.unreachable("should throw");
    } catch (error) {
      expect((error as ProviderRegistryError).code).toBe(
        ProviderRegistryErrorCode.DEFAULT_MODEL_NOT_FOUND,
      );
    }
  });

  it("getDefault() throws DEFAULT_MODEL_NOT_FOUND when no default is configured anywhere", () => {
    registry.register("nvidia", fakeFactory("nvidia"));
    registry.createProviders(
      makeConfig({
        providers: { nvidia: { apiKey: "k", models: ["m1"] } },
      }),
    );
    try {
      registry.getDefault();
      expect.unreachable("should throw");
    } catch (error) {
      expect((error as ProviderRegistryError).code).toBe(
        ProviderRegistryErrorCode.DEFAULT_MODEL_NOT_FOUND,
      );
    }
  });

  it("getDefault() treats config.model === null as unset (no default)", () => {
    registry.register("nvidia", fakeFactory("nvidia"));
    registry.createProviders(
      makeConfig({
        model: null,
        providers: {
          nvidia: { apiKey: "k", models: ["m1"] },
        },
      }),
    );
    try {
      registry.getDefault();
      expect.unreachable("should throw");
    } catch (error) {
      expect((error as ProviderRegistryError).code).toBe(
        ProviderRegistryErrorCode.DEFAULT_MODEL_NOT_FOUND,
      );
    }
  });

  it("getDefault() throws INVALID_CONFIG if createProviders() was never called", () => {
    registry.register("nvidia", fakeFactory("nvidia"));
    try {
      registry.getDefault();
      expect.unreachable("should throw");
    } catch (error) {
      expect((error as ProviderRegistryError).code).toBe(
        ProviderRegistryErrorCode.INVALID_CONFIG,
      );
    }
  });
});

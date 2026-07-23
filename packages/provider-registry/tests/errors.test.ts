import { describe, expect, it } from "vitest";

import {
  ProviderRegistry,
  ProviderRegistryError,
  ProviderRegistryErrorCode,
} from "../src/index.js";

describe("ProviderRegistryError", () => {
  it("exposes fixed error codes", () => {
    expect(ProviderRegistryErrorCode.UNKNOWN_PROVIDER).toBe("UNKNOWN_PROVIDER");
    expect(ProviderRegistryErrorCode.DUPLICATE_PROVIDER).toBe(
      "DUPLICATE_PROVIDER",
    );
    expect(ProviderRegistryErrorCode.DUPLICATE_MODEL).toBe("DUPLICATE_MODEL");
    expect(ProviderRegistryErrorCode.DEFAULT_MODEL_NOT_FOUND).toBe(
      "DEFAULT_MODEL_NOT_FOUND",
    );
    expect(ProviderRegistryErrorCode.PROVIDER_CONSTRUCTION_FAILED).toBe(
      "PROVIDER_CONSTRUCTION_FAILED",
    );
    expect(ProviderRegistryErrorCode.INVALID_PROVIDER_ID).toBe(
      "INVALID_PROVIDER_ID",
    );
    expect(ProviderRegistryErrorCode.INVALID_CONFIG).toBe("INVALID_CONFIG");
  });

  it("is an Error subclass with code + optional fields", () => {
    const err = new ProviderRegistryError({
      code: ProviderRegistryErrorCode.UNKNOWN_PROVIDER,
      message: "boom",
      providerId: "nvidia",
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ProviderRegistryError");
    expect(err.code).toBe("UNKNOWN_PROVIDER");
    expect(err.message).toBe("boom");
    expect(err.providerId).toBe("nvidia");
    expect(err.model).toBeUndefined();
    expect(err.conflictingProviders).toBeUndefined();
    expect(err.cause).toBeUndefined();
  });

  it("preserves the cause when supplied (Error-typed)", () => {
    const inner = new Error("inner");
    const err = new ProviderRegistryError({
      code: ProviderRegistryErrorCode.PROVIDER_CONSTRUCTION_FAILED,
      message: "outer",
      cause: inner,
    });
    expect(err.cause).toBe(inner);
  });

  it("carries conflictingProviders when supplied", () => {
    const err = new ProviderRegistryError({
      code: ProviderRegistryErrorCode.DUPLICATE_MODEL,
      message: "amb",
      model: "deepseek-r1",
      conflictingProviders: ["nvidia", "openrouter"],
    });
    expect(err.conflictingProviders).toEqual(["nvidia", "openrouter"]);
    expect(err.model).toBe("deepseek-r1");
  });

  it("omits optional fields when not supplied (exactOptionalPropertyTypes safe)", () => {
    const err = new ProviderRegistryError({
      code: ProviderRegistryErrorCode.INVALID_CONFIG,
      message: "x",
    });
    expect("providerId" in err).toBe(false);
    expect("model" in err).toBe(false);
    expect("conflictingProviders" in err).toBe(false);
    expect("cause" in err).toBe(false);
  });
});

describe("ProviderRegistryErrorCode — typing sanity", () => {
  it("every value is a string literal", () => {
    for (const code of Object.values(ProviderRegistryErrorCode)) {
      expect(typeof code).toBe("string");
    }
  });
});

describe("ProviderRegistry — error correlation with operations", () => {
  it("UNKNOWN_PROVIDER flows from register+get mismatches", () => {
    const registry = new ProviderRegistry();
    registry.register(
      "nvidia",
      (() => ({
        id: "nvidia",
        name: "nvidia",
        capabilities: { streaming: false, tools: true, modalities: [] },
        async complete() {
          return { id: "x", output: [], stopReason: "end" };
        },
      })) as never,
    );
    registry.createProviders({
      version: 1,
      providers: { nvidia: {} },
    } as never);
    try {
      registry.get("groq");
      expect.unreachable("should throw");
    } catch (error) {
      expect((error as ProviderRegistryError).code).toBe(
        ProviderRegistryErrorCode.UNKNOWN_PROVIDER,
      );
      expect((error as ProviderRegistryError).providerId).toBe("groq");
    }
  });
});

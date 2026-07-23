import { beforeEach, describe, expect, it } from "vitest";

import {
  ProviderRegistry,
  ProviderRegistryError,
  ProviderRegistryErrorCode,
} from "../src/index.js";
import { fakeFactory, makeConfig, throwingFactory } from "./helpers.js";

describe("ProviderRegistry — createProviders()", () => {
  let registry: ProviderRegistry;
  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  it("constructs configured provider instances via their protocol factory", () => {
    const openaiCompatible = fakeFactory();
    registry.registerProtocol("openai-compatible", openaiCompatible);

    registry.createProviders(
      makeConfig({
        providers: {
          work: {
            protocol: "openai-compatible",
            apiKey: "k1",
            defaultModel: "gpt-4o-mini",
          },
          local: {
            protocol: "openai-compatible",
            baseURL: "http://localhost:11434/v1",
            defaultModel: "llama3.2",
          },
        },
      }),
    );

    expect(openaiCompatible.calls.length).toBe(2);
    expect(openaiCompatible.calls[0]).toEqual({
      id: "work",
      protocol: "openai-compatible",
      config: {
        protocol: "openai-compatible",
        apiKey: "k1",
        defaultModel: "gpt-4o-mini",
      },
    });
    expect(openaiCompatible.calls[1]).toEqual({
      id: "local",
      protocol: "openai-compatible",
      config: {
        protocol: "openai-compatible",
        baseURL: "http://localhost:11434/v1",
        defaultModel: "llama3.2",
      },
    });
    expect(registry.get("work").id).toBe("work");
    expect(registry.get("local").id).toBe("local");
  });

  it("forwards the entire opaque config block to the protocol factory", () => {
    const openaiCompatible = fakeFactory();
    registry.registerProtocol("openai-compatible", openaiCompatible);
    registry.createProviders(
      makeConfig({
        providers: {
          work: {
            protocol: "openai-compatible",
            apiKey: "k",
            defaultModel: "openai/gpt-5",
            headers: { "X-Title": "my-app" },
            anythingElse: [1, 2, 3],
          },
        },
      }),
    );
    expect(openaiCompatible.calls[0]).toMatchObject({
      id: "work",
      protocol: "openai-compatible",
      config: {
        headers: { "X-Title": "my-app" },
        anythingElse: [1, 2, 3],
      },
    });
  });

  it("throws UNKNOWN_PROTOCOL when config references an unregistered protocol", () => {
    registry.registerProtocol("openai-compatible", fakeFactory());
    try {
      registry.createProviders(
        makeConfig({
          providers: {
            work: { protocol: "anthropic", apiKey: "k" },
          },
        }),
      );
      expect.unreachable("should throw");
    } catch (error) {
      expect((error as ProviderRegistryError).code).toBe(
        ProviderRegistryErrorCode.UNKNOWN_PROTOCOL,
      );
      expect((error as ProviderRegistryError).providerId).toBe("work");
    }
  });

  it("throws PROVIDER_CONSTRUCTION_FAILED wrapping the cause when the factory throws", () => {
    registry.registerProtocol(
      "openai-compatible",
      throwingFactory("boom: bad api key"),
    );
    try {
      registry.createProviders(
        makeConfig({
          providers: {
            work: { protocol: "openai-compatible", apiKey: "k" },
          },
        }),
      );
      expect.unreachable("should throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderRegistryError);
      expect((error as ProviderRegistryError).code).toBe(
        ProviderRegistryErrorCode.PROVIDER_CONSTRUCTION_FAILED,
      );
      expect((error as ProviderRegistryError).providerId).toBe("work");
      // cause is forwarded, Error-typed cause preserved
      expect((error as ProviderRegistryError).cause).toBeInstanceOf(Error);
      expect(((error as ProviderRegistryError).cause as Error).message).toBe(
        "boom: bad api key",
      );
    }
  });

  it("throws PROVIDER_CONSTRUCTION_FAILED without a cause for non-Error throws", () => {
    registry.registerProtocol(
      "openai-compatible",
      (() => {
        throw "literally a string";
      }) as unknown as never,
    );
    try {
      registry.createProviders(
        makeConfig({
          providers: {
            work: { protocol: "openai-compatible", apiKey: "k" },
          },
        }),
      );
      expect.unreachable("should throw");
    } catch (error) {
      expect((error as ProviderRegistryError).code).toBe(
        ProviderRegistryErrorCode.PROVIDER_CONSTRUCTION_FAILED,
      );
      expect((error as ProviderRegistryError).cause).toBeUndefined();
    }
  });

  it("tolerates an empty providers object", () => {
    registry.registerProtocol("openai-compatible", fakeFactory());
    registry.createProviders(makeConfig({ providers: {} }));
    expect(() => registry.get("nvidia")).toThrow(ProviderRegistryError);
    expect(registry.listProviders().length).toBe(0);
  });

  it("tolerates an absent providers object entirely", () => {
    registry.registerProtocol("openai-compatible", fakeFactory());
    registry.createProviders(makeConfig({}));
    expect(registry.listProviders().length).toBe(0);
  });

  it("throws INVALID_CONFIG when providers is not an object", () => {
    registry.registerProtocol("openai-compatible", fakeFactory());
    try {
      registry.createProviders({
        version: 1,
        providers: "not-an-object" as unknown as never,
      } as never);
      expect.unreachable("should throw");
    } catch (error) {
      expect((error as ProviderRegistryError).code).toBe(
        ProviderRegistryErrorCode.INVALID_CONFIG,
      );
    }
  });

  it("is idempotent: a second call replaces the prior snapshot", () => {
    const openaiCompatible = fakeFactory();
    registry.registerProtocol("openai-compatible", openaiCompatible);
    registry.createProviders(
      makeConfig({
        providers: {
          work: { protocol: "openai-compatible", apiKey: "k1", models: ["m1"] },
        },
      }),
    );
    expect(openaiCompatible.calls.length).toBe(1);
    expect(registry.listModels().filter((e) => e.model === "m1").length).toBe(1);

    registry.createProviders(
      makeConfig({
        providers: {
          work: { protocol: "openai-compatible", apiKey: "k2", models: ["m2"] },
        },
      }),
    );
    expect(openaiCompatible.calls.length).toBe(2);
    expect(registry.listModels().filter((e) => e.model === "m1").length).toBe(0);
    expect(registry.listModels().filter((e) => e.model === "m2").length).toBe(1);
  });

  it("throws DUPLICATE_PROVIDER if the same id appears twice in config.providers (trimmed keys)", () => {
    // Note: object literals can't have two identical string keys, but trimming
    // can create a collision: "work " and "work".
    registry.registerProtocol("openai-compatible", fakeFactory());
    try {
      registry.createProviders(
        makeConfig({
          providers: {
            "work ": { protocol: "openai-compatible", apiKey: "k1" },
            work: { protocol: "openai-compatible", apiKey: "k2" },
          } as Record<string, Readonly<Record<string, unknown>>>,
        }),
      );
      expect.unreachable("should throw");
    } catch (error) {
      expect((error as ProviderRegistryError).code).toBe(
        ProviderRegistryErrorCode.DUPLICATE_PROVIDER,
      );
    }
  });

  it("infers a configured compatibility protocol for legacy provider ids", () => {
    registry = new ProviderRegistry({
      compatibilityProtocols: { nvidia: "openai-compatible" },
    });
    const openaiCompatible = fakeFactory();
    registry.registerProtocol("openai-compatible", openaiCompatible);

    registry.createProviders(
      makeConfig({
        providers: {
          nvidia: { apiKey: "legacy", defaultModel: "model" },
        },
      }),
    );

    expect(openaiCompatible.calls[0]).toEqual({
      id: "nvidia",
      protocol: "openai-compatible",
      config: { apiKey: "legacy", defaultModel: "model" },
    });
    expect(registry.get("nvidia").id).toBe("nvidia");
  });
});

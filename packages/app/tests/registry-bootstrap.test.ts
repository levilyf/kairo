import { describe, expect, it } from "vitest";

import {
  ApplicationError,
  ApplicationErrorCode,
  bootstrapProviderRegistry,
} from "../src/index.js";
import { ProviderRegistryError } from "@kairo/provider-registry";
import { makeConfig, makeLocalConfig } from "./helpers.js";

describe("bootstrapProviderRegistry — registry + provider construction", () => {
  it("registers the openai-compatible protocol and constructs legacy-configured instances", () => {
    const { registry, providers } = bootstrapProviderRegistry(makeLocalConfig());
    // ollama + lmstudio were configured (legacy vendor ids, no explicit protocol).
    expect(providers.length).toBe(2);
    expect(providers.map((p) => p.id).sort()).toEqual(["lmstudio", "ollama"]);
    // The same providers (constructed instances) are available via registry.get().
    expect(registry.get("ollama").id).toBe("ollama");
    expect(registry.get("lmstudio").id).toBe("lmstudio");
    // The protocol (not vendor ids) is what the registry actually registered.
    expect(registry.hasProtocol("openai-compatible")).toBe(true);
  });

  it("with an empty providers block, returns an empty provider list but the registry is still populated with protocols", () => {
    const { registry, providers } = bootstrapProviderRegistry(
      makeConfig({ providers: {} }),
    );
    expect(providers.length).toBe(0);
    expect(registry.hasProtocol("openai-compatible")).toBe(true);
  });

  it("respects config.provider insertion order in the returned providers array", () => {
    const { providers } = bootstrapProviderRegistry(
      makeConfig({
        providers: {
          lmstudio: { defaultModel: "m" },
          ollama: { defaultModel: "q" },
        },
      }),
    );
    expect(providers.map((p) => p.id)).toEqual(["lmstudio", "ollama"]);
  });

  it("throws ApplicationError(BOTSTRAP_FAILED) when a configured provider declares an unknown protocol", () => {
    try {
      bootstrapProviderRegistry(
        makeConfig({
          providers: {
            "totally-fake-provider": {
              protocol: "totally-fake",
              apiKey: "k",
            },
          },
        }),
      );
      expect.unreachable("should throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApplicationError);
      expect((error as ApplicationError).code).toBe(
        ApplicationErrorCode.BOOTSTRAP_FAILED,
      );
      const cause = (error as ApplicationError).cause;
      expect(cause).toBeInstanceOf(ProviderRegistryError);
    }
  });

  it("throws ApplicationError(BOTSTRAP_FAILED) when a legacy vendor id has no compatibility mapping", () => {
    try {
      bootstrapProviderRegistry(
        makeConfig({
          providers: { "totally-fake-provider": { apiKey: "k" } },
        }),
      );
      expect.unreachable("should throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApplicationError);
      expect((error as ApplicationError).code).toBe(
        ApplicationErrorCode.BOOTSTRAP_FAILED,
      );
      const cause = (error as ApplicationError).cause;
      expect(cause).toBeInstanceOf(ProviderRegistryError);
    }
  });

  it("rejects invalid KairoConfig (non-object config)", () => {
    try {
      bootstrapProviderRegistry("not-a-config" as unknown as never);
      expect.unreachable("should throw");
    } catch (error) {
      // @kairo/provider-registry's createProviders throws INVALID_CONFIG,
      // which bootstrapProviderRegistry wraps into ApplicationError(BOOTSTRAP_FAILED).
      expect(error).toBeInstanceOf(ApplicationError);
      expect((error as ApplicationError).code).toBe(
        ApplicationErrorCode.BOOTSTRAP_FAILED,
      );
    }
  });
});

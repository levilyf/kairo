import { beforeEach, describe, expect, it } from "vitest";

import {
  ApplicationError,
  ApplicationErrorCode,
  BootstrapPhase,
  BUILTIN_PROVIDER_PROTOCOLS,
  listBuiltinProviderProtocolIds,
  registerBuiltinProviderProtocols,
  bootstrapProviderRegistry,
} from "../src/index.js";
import { ProviderRegistry } from "@kairo/provider-registry";
import type { KairoConfig } from "@kairo/config";

describe("builtin-providers — registration", () => {
  it("exposes the built-in provider protocol ids", () => {
    const ids = listBuiltinProviderProtocolIds();
    expect([...ids]).toEqual(["openai-compatible"]);
  });

  it("BUILTIN_PROVIDER_PROTOCOLS entries each have a protocol + factory function", () => {
    for (const entry of BUILTIN_PROVIDER_PROTOCOLS) {
      expect(typeof entry.protocol).toBe("string");
      expect(entry.protocol.length).toBeGreaterThan(0);
      expect(typeof entry.factory).toBe("function");
    }
  });

  it("registerBuiltinProviderProtocols registers openai-compatible in a fresh registry", () => {
    const registry = new ProviderRegistry();
    expect(() => registerBuiltinProviderProtocols(registry)).not.toThrow();
    expect(registry.hasProtocol("openai-compatible")).toBe(true);
  });

  it("registerBuiltinProviderProtocols throws PROVIDER_REGISTRATION_FAILED on a duplicate call", () => {
    const registry = new ProviderRegistry();
    registerBuiltinProviderProtocols(registry);
    try {
      registerBuiltinProviderProtocols(registry);
      expect.unreachable("should throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApplicationError);
      expect((error as ApplicationError).code).toBe(
        ApplicationErrorCode.PROVIDER_REGISTRATION_FAILED,
      );
      expect((error as ApplicationError).phase).toBe(
        BootstrapPhase.PROVIDER_REGISTER,
      );
      expect((error as ApplicationError).providerId).toBe("openai-compatible");
      expect((error as ApplicationError).cause).toBeDefined();
    }
  });
});

describe("builtin-providers — protocol bootstrap", () => {
  function makeProtocolConfig(
    providers: Record<string, Readonly<Record<string, unknown>>>,
  ): KairoConfig {
    return Object.freeze({
      version: 1,
      providers,
    }) as unknown as KairoConfig;
  }

  it("bootstraps an openai-compatible provider instance from protocol config", () => {
    const bootstrapped = bootstrapProviderRegistry(
      makeProtocolConfig({
        work: {
          protocol: "openai-compatible",
          baseURL: "https://example.invalid/v1",
          apiKey: "k",
          models: ["gpt-4o-mini"],
          defaultModel: "gpt-4o-mini",
        },
      }),
    );

    const provider = bootstrapped.registry.get("work");
    expect(provider.id).toBe("work");
    expect(provider.name).toBe("work");
    expect(provider.capabilities.streaming).toBe(true);
    expect(bootstrapped.providers.length).toBe(1);
    expect(bootstrapped.providers[0]!.id).toBe("work");
  });

  it("bootstraps a legacy vendor config by inferring openai-compatible", () => {
    const bootstrapped = bootstrapProviderRegistry(
      makeProtocolConfig({
        nvidia: {
          apiKey: "legacy",
          models: ["moonshotai/kimi-k2-instruct"],
          defaultModel: "moonshotai/kimi-k2-instruct",
        },
      }),
    );

    const provider = bootstrapped.registry.get("nvidia");
    expect(provider.id).toBe("nvidia");
    expect(listBuiltinProviderProtocolIds()).toEqual([
      "openai-compatible",
    ]);
    expect(BUILTIN_PROVIDER_PROTOCOLS[0]!.protocol).toBe(
      "openai-compatible",
    );
  });
});

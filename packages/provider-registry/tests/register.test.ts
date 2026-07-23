import { beforeEach, describe, expect, it } from "vitest";

import {
  ProviderRegistry,
  ProviderRegistryError,
  ProviderRegistryErrorCode,
} from "../src/index.js";
import { fakeFactory } from "./helpers.js";

describe("ProviderRegistry — register()", () => {
  let registry: ProviderRegistry;
  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  it("registers a factory that becomes resolvable via has()", () => {
    registry.register("nvidia", fakeFactory("nvidia"));
    expect(registry.has("nvidia")).toBe(true);
    expect(registry.has("groq")).toBe(false);
  });

  it("supports multiple distinct registrations", () => {
    registry.register("nvidia", fakeFactory("nvidia"));
    registry.register("groq", fakeFactory("groq"));
    registry.register("ollama", fakeFactory("ollama"));
    expect(registry.has("nvidia")).toBe(true);
    expect(registry.has("groq")).toBe(true);
    expect(registry.has("ollama")).toBe(true);
  });

  it("rejects duplicate registration of the same id", () => {
    registry.register("nvidia", fakeFactory("nvidia"));
    expect(() => registry.register("nvidia", fakeFactory("nvidia"))).toThrow(
      ProviderRegistryError,
    );
    try {
      registry.register("nvidia", fakeFactory("nvidia"));
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderRegistryError);
      expect((error as ProviderRegistryError).code).toBe(
        ProviderRegistryErrorCode.DUPLICATE_PROVIDER,
      );
      expect((error as ProviderRegistryError).providerId).toBe("nvidia");
    }
  });

  it("rejects non-string ids", () => {
    expect(() => registry.register(123 as unknown as string, fakeFactory("x"))).toThrow(
      ProviderRegistryError,
    );
  });

  it("rejects empty-string ids", () => {
    try {
      registry.register("   ", fakeFactory("x"));
      expect.unreachable("should throw");
    } catch (error) {
      expect((error as ProviderRegistryError).code).toBe(
        ProviderRegistryErrorCode.INVALID_PROVIDER_ID,
      );
    }
  });

  it("rejects non-function factories", () => {
    try {
      registry.register("nvidia", 42 as unknown as never);
      expect.unreachable("should throw");
    } catch (error) {
      expect((error as ProviderRegistryError).code).toBe(
        ProviderRegistryErrorCode.INVALID_PROVIDER_ID,
      );
    }
  });

  it("normalizes ids by trimming before uniqueness check", () => {
    // Trimming happens at validation; the registered key is the trimmed form.
    registry.register("  nvidia  ", fakeFactory("nvidia"));
    expect(registry.has("nvidia")).toBe(true);
  });
});

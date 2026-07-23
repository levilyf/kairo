import { describe, expect, it } from "vitest";

import {
  validateConfig,
  isPlainObject,
  ConfigError,
  ConfigErrorCode,
  CURRENT_CONFIG_VERSION,
} from "../src/index.js";

describe("validateConfig", () => {
  describe("happy path", () => {
    it("accepts a minimal config with only version", () => {
      const config = validateConfig({ version: 1 });
      expect(config.version).toBe(1);
      expect(Object.isFrozen(config)).toBe(true);
    });

    it("accepts a full config", () => {
      const config = validateConfig({
        version: 1,
        model: "gpt-4o",
        providers: { openai: { apiKey: "sk-x" } },
        agent: { maxIterations: 3 },
        permissions: { allow: ["read"] },
        workspace: { root: "." },
      });
      expect(config.version).toBe(1);
      expect(config.model).toBe("gpt-4o");
      expect(config.providers?.openai).toEqual({ apiKey: "sk-x" });
    });

    it("accepts model: null", () => {
      const config = validateConfig({ version: 1, model: null });
      expect(config.model).toBe(null);
    });

    it("accepts an empty providers object", () => {
      const config = validateConfig({ version: 1, providers: {} });
      expect(config.providers).toEqual({});
    });

    it("returns an immutable object (top-level and nested)", () => {
      const config = validateConfig({
        version: 1,
        providers: { openai: { apiKey: "sk-x" } },
      });
      expect(Object.isFrozen(config)).toBe(true);
      expect(Object.isFrozen(config.providers?.openai)).toBe(true);
    });
  });

  describe("version validation", () => {
    it("rejects missing version", () => {
      try {
        validateConfig({});
        expect.unreachable("should throw");
      } catch (error) {
        expect((error as ConfigError).code).toBe(ConfigErrorCode.INVALID_SCHEMA);
        expect((error as ConfigError).field).toBe("version");
      }
    });

    it("rejects non-integer version", () => {
      try {
        validateConfig({ version: 1.5 });
        expect.unreachable("should throw");
      } catch (error) {
        expect((error as ConfigError).code).toBe(ConfigErrorCode.INVALID_SCHEMA);
      }
    });

    it("rejects string version", () => {
      try {
        validateConfig({ version: "1" });
        expect.unreachable("should throw");
      } catch (error) {
        expect((error as ConfigError).code).toBe(ConfigErrorCode.INVALID_SCHEMA);
      }
    });

    it("rejects mismatched version", () => {
      try {
        validateConfig({ version: 2 });
        expect.unreachable("should throw");
      } catch (error) {
        expect((error as ConfigError).code).toBe(ConfigErrorCode.INVALID_SCHEMA);
        expect((error as ConfigError).message).toContain(
          String(CURRENT_CONFIG_VERSION),
        );
        expect((error as ConfigError).message).toContain("2");
      }
    });
  });

  describe("top-level shape", () => {
    it("rejects null", () => {
      try {
        validateConfig(null);
        expect.unreachable("should throw");
      } catch (error) {
        expect((error as ConfigError).code).toBe(ConfigErrorCode.INVALID_SCHEMA);
      }
    });

    it("rejects array", () => {
      try {
        validateConfig([]);
        expect.unreachable("should throw");
      } catch (error) {
        expect((error as ConfigError).code).toBe(ConfigErrorCode.INVALID_SCHEMA);
      }
    });

    it("rejects string", () => {
      try {
        validateConfig("hello");
        expect.unreachable("should throw");
      } catch (error) {
        expect((error as ConfigError).code).toBe(ConfigErrorCode.INVALID_SCHEMA);
      }
    });

    it("rejects unknown top-level key", () => {
      try {
        validateConfig({ version: 1, foo: "bar" });
        expect.unreachable("should throw");
      } catch (error) {
        expect((error as ConfigError).code).toBe(ConfigErrorCode.INVALID_SCHEMA);
        expect((error as ConfigError).field).toBe("foo");
      }
    });
  });

  describe("providers validation", () => {
    it("rejects non-object providers", () => {
      try {
        validateConfig({ version: 1, providers: "x" });
        expect.unreachable("should throw");
      } catch (error) {
        expect((error as ConfigError).code).toBe(ConfigErrorCode.INVALID_SCHEMA);
        expect((error as ConfigError).field).toBe("providers");
      }
    });

    it("rejects array providers", () => {
      try {
        validateConfig({ version: 1, providers: [] });
        expect.unreachable("should throw");
      } catch (error) {
        expect((error as ConfigError).code).toBe(ConfigErrorCode.INVALID_SCHEMA);
        expect((error as ConfigError).field).toBe("providers");
      }
    });

    it("rejects null provider entry", () => {
      try {
        validateConfig({ version: 1, providers: { foo: null } });
        expect.unreachable("should throw");
      } catch (error) {
        expect((error as ConfigError).code).toBe(ConfigErrorCode.INVALID_SCHEMA);
        expect((error as ConfigError).field).toBe("providers.foo");
      }
    });

    it("rejects array provider entry", () => {
      try {
        validateConfig({ version: 1, providers: { foo: [] } });
        expect.unreachable("should throw");
      } catch (error) {
        expect((error as ConfigError).code).toBe(ConfigErrorCode.INVALID_SCHEMA);
        expect((error as ConfigError).field).toBe("providers.foo");
      }
    });

    it("accepts empty object provider entry", () => {
      const config = validateConfig({
        version: 1,
        providers: { foo: {} },
      });
      expect(config.providers?.foo).toEqual({});
    });
  });

  describe("model validation", () => {
    it("rejects non-string non-null model", () => {
      try {
        validateConfig({ version: 1, model: 5 });
        expect.unreachable("should throw");
      } catch (error) {
        expect((error as ConfigError).code).toBe(ConfigErrorCode.INVALID_SCHEMA);
        expect((error as ConfigError).field).toBe("model");
      }
    });

    it("rejects object model", () => {
      try {
        validateConfig({ version: 1, model: {} });
        expect.unreachable("should throw");
      } catch (error) {
        expect((error as ConfigError).code).toBe(ConfigErrorCode.INVALID_SCHEMA);
      }
    });
  });

  describe("section validation (agent/permissions/workspace)", () => {
    for (const field of ["agent", "permissions", "workspace"] as const) {
      it(`rejects non-object ${field} (array)`, () => {
        try {
          validateConfig({ version: 1, [field]: [] });
          expect.unreachable("should throw");
        } catch (error) {
          expect((error as ConfigError).code).toBe(
            ConfigErrorCode.INVALID_SCHEMA,
          );
          expect((error as ConfigError).field).toBe(field);
        }
      });

      it(`rejects non-object ${field} (string)`, () => {
        try {
          validateConfig({ version: 1, [field]: "x" });
          expect.unreachable("should throw");
        } catch (error) {
          expect((error as ConfigError).code).toBe(
            ConfigErrorCode.INVALID_SCHEMA,
          );
        }
      });

      it(`accepts object ${field}`, () => {
        const config = validateConfig({ version: 1, [field]: { a: 1 } });
        expect((config as unknown as Record<string, unknown>)[field]).toEqual({ a: 1 });
      });
    }
  });
});

describe("isPlainObject helper", () => {
  it("returns true for plain records", () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1 })).toBe(true);
  });

  it("returns false for null and primitives", () => {
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject(undefined)).toBe(false);
    expect(isPlainObject(42)).toBe(false);
    expect(isPlainObject("hi")).toBe(false);
  });

  it("returns false for arrays", () => {
    expect(isPlainObject([])).toBe(false);
  });

  it("returns false for class instances", () => {
    class Foo {}
    expect(isPlainObject(new Foo())).toBe(false);
  });

  it("returns true for Object.create(null)", () => {
    expect(isPlainObject(Object.create(null))).toBe(true);
  });
});

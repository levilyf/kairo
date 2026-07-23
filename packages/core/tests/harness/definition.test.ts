import { describe, expect, it } from "vitest";
import {
  HarnessError,
  HarnessErrorCode,
  defineHarness,
} from "../../src/index.js";
import {
  createManifest,
  createSource,
} from "../helpers/fixtures.js";

describe("defineHarness", () => {
  it("creates an immutable definition with metadata and modules", () => {
    const source = createSource(createManifest({ id: "acme/logger" }));

    const definition = defineHarness({
      name: "Starter",
      version: "1.0.0",
      description: "A starter harness",
      intent: "Demonstrate composition",
      modules: [source],
      permissions: ["fs.read"],
      config: { theme: "dark" },
      environment: { NODE_ENV: "test" },
    });

    expect(definition.metadata).toEqual({
      name: "Starter",
      version: "1.0.0",
      description: "A starter harness",
      intent: "Demonstrate composition",
    });
    expect(definition.modules).toHaveLength(1);
    expect(definition.modules[0]?.source.manifest.id).toBe("acme/logger");
    expect(definition.permissions.has("fs.read")).toBe(true);
    expect(definition.config.values).toEqual({ theme: "dark" });
    expect(definition.environment).toEqual({ NODE_ENV: "test" });
    expect(definition.coreVersion).toBe("0.1.0");

    expect(Object.isFrozen(definition)).toBe(true);
    expect(Object.isFrozen(definition.metadata)).toBe(true);
    expect(Object.isFrozen(definition.modules)).toBe(true);
  });

  it("normalizes bare ModuleSource entries", () => {
    const source = createSource(createManifest({ id: "acme/a" }));
    const definition = defineHarness({
      name: "Demo",
      modules: [source],
    });

    expect(definition.modules[0]).toMatchObject({
      optional: false,
      config: {},
    });
    expect(definition.modules[0]?.source).toBe(source);
  });

  it("accepts explicit module registration options", () => {
    const source = createSource(createManifest({ id: "acme/optional" }));
    const definition = defineHarness({
      name: "Demo",
      modules: [
        {
          source,
          optional: true,
          config: { flag: true },
        },
      ],
    });

    expect(definition.modules[0]?.optional).toBe(true);
    expect(definition.modules[0]?.config).toEqual({ flag: true });
  });

  it("rejects missing name", () => {
    expect(() =>
      defineHarness({
        name: "  ",
        modules: [],
      }),
    ).toThrow(HarnessError);

    try {
      defineHarness({ name: "", modules: [] });
    } catch (error) {
      expect(error).toMatchObject({
        code: HarnessErrorCode.INVALID_DEFINITION,
        field: "name",
      });
    }
  });

  it("rejects non-array modules", () => {
    expect(() =>
      defineHarness({
        name: "Demo",
        // @ts-expect-error intentional invalid input
        modules: null,
      }),
    ).toThrow(HarnessError);
  });

  it("rejects duplicate module ids in the definition", () => {
    const a = createSource(createManifest({ id: "acme/a" }));
    const a2 = createSource(createManifest({ id: "acme/a", version: "2.0.0" }));

    expect(() =>
      defineHarness({
        name: "Demo",
        modules: [a, a2],
      }),
    ).toThrow(HarnessError);

    try {
      defineHarness({ name: "Demo", modules: [a, a2] });
    } catch (error) {
      expect(error).toMatchObject({
        code: HarnessErrorCode.DUPLICATE_MODULE,
        moduleId: "acme/a",
      });
    }
  });

  it("rejects invalid permission entries", () => {
    expect(() =>
      defineHarness({
        name: "Demo",
        modules: [],
        permissions: ["ok", ""],
      }),
    ).toThrow(HarnessError);

    try {
      defineHarness({
        name: "Demo",
        modules: [],
        // @ts-expect-error intentional invalid input
        permissions: [123],
      });
    } catch (error) {
      expect(error).toMatchObject({
        code: HarnessErrorCode.INVALID_PERMISSIONS,
      });
    }
  });

  it("rejects invalid environment values", () => {
    expect(() =>
      defineHarness({
        name: "Demo",
        modules: [],
        // @ts-expect-error intentional invalid input
        environment: { FOO: 1 },
      }),
    ).toThrow(HarnessError);
  });

  it("rejects invalid module sources", () => {
    expect(() =>
      defineHarness({
        name: "Demo",
        modules: [
          // @ts-expect-error intentional invalid input
          { notASource: true },
        ],
      }),
    ).toThrow(HarnessError);
  });

  it("defaults optional metadata fields", () => {
    const definition = defineHarness({
      name: "Minimal",
      modules: [],
    });

    expect(definition.metadata.version).toBe("0.0.0");
    expect(definition.metadata.description).toBe("");
    expect(definition.metadata.intent).toBe("");
    expect(definition.permissions.size).toBe(0);
    expect(definition.config.values).toEqual({});
    expect(definition.environment).toEqual({});
  });
});

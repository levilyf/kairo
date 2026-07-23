import { describe, expect, it } from "vitest";
import { ModuleError, ModuleErrorCode, ModuleRegistry } from "../src/index.js";
import { createManifest, createSource } from "./helpers/fixtures.js";

describe("ModuleRegistry", () => {
  it("registers module metadata and lists entries", () => {
    const registry = new ModuleRegistry();
    const manifest = createManifest({ id: "acme/a" });

    registry.register(createSource(manifest));

    const entries = registry.list();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.manifest.id).toBe("acme/a");
    expect(entries[0]?.state).toBe("registered");
  });

  it("rejects duplicate module ids", () => {
    const registry = new ModuleRegistry();
    const source = createSource(createManifest({ id: "acme/a" }));
    registry.register(source);

    expect(() => registry.register(source)).toThrow(ModuleError);
    try {
      registry.register(source);
    } catch (error) {
      expect(error).toMatchObject({
        code: ModuleErrorCode.DUPLICATE_MODULE,
        moduleId: "acme/a",
        phase: "registration",
      });
    }
  });

  it("returns a module by id", () => {
    const registry = new ModuleRegistry();
    registry.register(createSource(createManifest({ id: "acme/a" })));

    expect(registry.get("acme/a")?.manifest.id).toBe("acme/a");
    expect(registry.get("missing")).toBeUndefined();
  });

  it("updates lifecycle state", () => {
    const registry = new ModuleRegistry();
    registry.register(createSource(createManifest({ id: "acme/a" })));
    registry.setState("acme/a", "resolved");

    expect(registry.get("acme/a")?.state).toBe("resolved");
  });
});

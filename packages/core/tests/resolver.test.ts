import { describe, expect, it } from "vitest";
import {
  DependencyResolver,
  ModuleError,
  ModuleErrorCode,
} from "../src/index.js";
import { createManifest } from "./helpers/fixtures.js";

describe("DependencyResolver", () => {
  const resolver = new DependencyResolver({ coreVersion: "0.1.0" });

  it("returns topological order for module dependencies", () => {
    const a = createManifest({ id: "acme/a" });
    const b = createManifest({
      id: "acme/b",
      dependencies: [{ type: "module", id: "acme/a" }],
    });
    const c = createManifest({
      id: "acme/c",
      dependencies: [{ type: "module", id: "acme/b" }],
    });

    const result = resolver.resolve([c, b, a]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.map((m) => m.id)).toEqual([
      "acme/a",
      "acme/b",
      "acme/c",
    ]);
  });

  it("detects circular dependencies", () => {
    const a = createManifest({
      id: "acme/a",
      dependencies: [{ type: "module", id: "acme/b" }],
    });
    const b = createManifest({
      id: "acme/b",
      dependencies: [{ type: "module", id: "acme/a" }],
    });

    const result = resolver.resolve([a, b]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(ModuleError);
    expect(result.error.code).toBe(ModuleErrorCode.CIRCULAR_DEPENDENCY);
    expect(result.error.phase).toBe("resolution");
  });

  it("fails when a required module dependency is missing", () => {
    const a = createManifest({
      id: "acme/a",
      dependencies: [{ type: "module", id: "acme/missing" }],
    });

    const result = resolver.resolve([a]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(ModuleErrorCode.MISSING_DEPENDENCY);
    expect(result.error.moduleId).toBe("acme/a");
  });

  it("allows missing optional module dependencies", () => {
    const a = createManifest({
      id: "acme/a",
      dependencies: [
        { type: "module", id: "acme/missing", optional: true },
      ],
    });

    const result = resolver.resolve([a]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.map((m) => m.id)).toEqual(["acme/a"]);
    expect(result.missingOptional).toEqual([
      {
        moduleId: "acme/a",
        dependency: { type: "module", id: "acme/missing", optional: true },
      },
    ]);
  });

  it("satisfies capability dependencies from contributing modules", () => {
    const provider = createManifest({
      id: "acme/provider",
      capabilities: ["provider.reference"],
    });
    const consumer = createManifest({
      id: "acme/consumer",
      dependencies: [{ type: "capability", id: "provider.reference" }],
    });

    const result = resolver.resolve([consumer, provider]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.map((m) => m.id)).toEqual([
      "acme/provider",
      "acme/consumer",
    ]);
  });

  it("fails when a required capability is missing", () => {
    const consumer = createManifest({
      id: "acme/consumer",
      dependencies: [{ type: "capability", id: "provider.reference" }],
    });

    const result = resolver.resolve([consumer]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(ModuleErrorCode.MISSING_CAPABILITY);
  });

  it("fails when module version is outside dependency range", () => {
    const a = createManifest({ id: "acme/a", version: "1.0.0" });
    const b = createManifest({
      id: "acme/b",
      dependencies: [
        {
          type: "module",
          id: "acme/a",
          versionRange: { min: "2.0.0" },
        },
      ],
    });

    const result = resolver.resolve([a, b]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(ModuleErrorCode.VERSION_MISMATCH);
  });

  it("fails when module is incompatible with core version", () => {
    const a = createManifest({
      id: "acme/a",
      compatibility: { min: "2.0.0" },
    });

    const result = resolver.resolve([a]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(ModuleErrorCode.CORE_INCOMPATIBLE);
  });

  it("fails when permissions are not granted", () => {
    const a = createManifest({
      id: "acme/a",
      permissions: ["network.outbound"],
    });

    const restricted = new DependencyResolver({
      coreVersion: "0.1.0",
      grantedPermissions: new Set(),
    });

    const result = restricted.resolve([a]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(ModuleErrorCode.PERMISSION_DENIED);
    expect(result.error.moduleId).toBe("acme/a");
  });

  it("passes when requested permissions are granted", () => {
    const a = createManifest({
      id: "acme/a",
      permissions: ["network.outbound"],
    });

    const allowed = new DependencyResolver({
      coreVersion: "0.1.0",
      grantedPermissions: new Set(["network.outbound"]),
    });

    const result = allowed.resolve([a]);
    expect(result.ok).toBe(true);
  });
});

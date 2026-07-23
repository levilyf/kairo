/**
 * Dependency resolver for the module system.
 *
 * Checks:
 * - Core compatibility
 * - Module dependencies (with version ranges)
 * - Capability dependencies
 * - Permission grants
 * - Cycles
 *
 * Returns topological order for init/start (reverse for stop/unload).
 */

import { ModuleError, ModuleErrorCode } from "./errors.js";
import type { ModuleDependency, ModuleManifest } from "./types.js";
import { isVersionInRange } from "./version.js";

export interface DependencyResolverOptions {
  coreVersion: string;
  grantedPermissions?: ReadonlySet<string>;
}

export interface MissingOptionalDependency {
  moduleId: string;
  dependency: ModuleDependency;
}

export type ResolveResult =
  | {
      ok: true;
      order: ModuleManifest[];
      missingOptional: MissingOptionalDependency[];
    }
  | {
      ok: false;
      error: ModuleError;
    };

export class DependencyResolver {
  private readonly coreVersion: string;
  private readonly grantedPermissions: ReadonlySet<string>;

  constructor(options: DependencyResolverOptions) {
    this.coreVersion = options.coreVersion;
    this.grantedPermissions = options.grantedPermissions ?? new Set();
  }

  resolve(manifests: readonly ModuleManifest[]): ResolveResult {
    try {
      const byId = new Map<string, ModuleManifest>();
      for (const manifest of manifests) {
        if (byId.has(manifest.id)) {
          throw new ModuleError({
            code: ModuleErrorCode.DUPLICATE_MODULE,
            message: `Duplicate module id in resolution set: "${manifest.id}"`,
            phase: "resolution",
            moduleId: manifest.id,
          });
        }
        byId.set(manifest.id, manifest);
      }

      for (const manifest of manifests) {
        this.assertCoreCompatible(manifest);
        this.assertPermissions(manifest);
      }

      const missingOptional: MissingOptionalDependency[] = [];
      const capabilityProviders = this.indexCapabilities(manifests);

      // Build adjacency: dependency -> dependents edges for topo,
      // and validate each dependency declaration.
      const graph = new Map<string, Set<string>>();
      for (const manifest of manifests) {
        graph.set(manifest.id, new Set());
      }

      for (const manifest of manifests) {
        for (const dep of manifest.dependencies) {
          this.validateAndLinkDependency(
            manifest,
            dep,
            byId,
            capabilityProviders,
            graph,
            missingOptional,
          );
        }
      }

      const orderIds = this.topologicalSort(
        [...byId.keys()],
        graph,
        manifests,
      );
      const order = orderIds.map((id) => {
        const manifest = byId.get(id);
        if (!manifest) {
          throw new ModuleError({
            code: ModuleErrorCode.RESOLUTION_FAILED,
            message: `Internal error: missing manifest for "${id}"`,
            phase: "resolution",
            moduleId: id,
          });
        }
        return manifest;
      });

      return { ok: true, order, missingOptional };
    } catch (error) {
      if (error instanceof ModuleError) {
        return { ok: false, error };
      }
      return {
        ok: false,
        error: new ModuleError({
          code: ModuleErrorCode.RESOLUTION_FAILED,
          message:
            error instanceof Error ? error.message : "Unknown resolution error",
          phase: "resolution",
          cause: error,
        }),
      };
    }
  }

  private assertCoreCompatible(manifest: ModuleManifest): void {
    if (!isVersionInRange(this.coreVersion, manifest.compatibility)) {
      throw new ModuleError({
        code: ModuleErrorCode.CORE_INCOMPATIBLE,
        message: `Module requires Core ${formatRange(manifest.compatibility)}, running ${this.coreVersion}`,
        phase: "resolution",
        moduleId: manifest.id,
        details: {
          coreVersion: this.coreVersion,
          compatibility: manifest.compatibility,
        },
      });
    }
  }

  private assertPermissions(manifest: ModuleManifest): void {
    for (const permission of manifest.permissions) {
      if (!this.grantedPermissions.has(permission)) {
        throw new ModuleError({
          code: ModuleErrorCode.PERMISSION_DENIED,
          message: `Permission not granted: "${permission}"`,
          phase: "resolution",
          moduleId: manifest.id,
          details: { permission },
        });
      }
    }
  }

  private indexCapabilities(
    manifests: readonly ModuleManifest[],
  ): Map<string, string[]> {
    const index = new Map<string, string[]>();
    for (const manifest of manifests) {
      for (const capability of manifest.capabilities) {
        const providers = index.get(capability) ?? [];
        providers.push(manifest.id);
        index.set(capability, providers);
      }
    }
    return index;
  }

  private validateAndLinkDependency(
    manifest: ModuleManifest,
    dep: ModuleDependency,
    byId: Map<string, ModuleManifest>,
    capabilityProviders: Map<string, string[]>,
    graph: Map<string, Set<string>>,
    missingOptional: MissingOptionalDependency[],
  ): void {
    if (dep.type === "module") {
      const target = byId.get(dep.id);
      if (!target) {
        if (dep.optional) {
          missingOptional.push({ moduleId: manifest.id, dependency: dep });
          return;
        }
        throw new ModuleError({
          code: ModuleErrorCode.MISSING_DEPENDENCY,
          message: `Missing required module dependency: "${dep.id}"`,
          phase: "resolution",
          moduleId: manifest.id,
          details: { dependency: dep },
        });
      }

      if (dep.versionRange && !isVersionInRange(target.version, dep.versionRange)) {
        throw new ModuleError({
          code: ModuleErrorCode.VERSION_MISMATCH,
          message: `Module "${dep.id}" version ${target.version} does not satisfy ${formatRange(dep.versionRange)}`,
          phase: "resolution",
          moduleId: manifest.id,
          details: {
            dependency: dep,
            actualVersion: target.version,
          },
        });
      }

      // Edge: dependency must come before dependent
      graph.get(dep.id)?.add(manifest.id);
      return;
    }

    // capability dependency
    const providers = capabilityProviders.get(dep.id) ?? [];
    if (providers.length === 0) {
      if (dep.optional) {
        missingOptional.push({ moduleId: manifest.id, dependency: dep });
        return;
      }
      throw new ModuleError({
        code: ModuleErrorCode.MISSING_CAPABILITY,
        message: `Missing required capability: "${dep.id}"`,
        phase: "resolution",
        moduleId: manifest.id,
        details: { dependency: dep },
      });
    }

    for (const providerId of providers) {
      if (providerId === manifest.id) continue;
      graph.get(providerId)?.add(manifest.id);
    }
  }

  /**
   * Kahn topological sort. `graph` maps node -> set of dependents
   * (edges from dependency to dependent).
   */
  private topologicalSort(
    nodes: string[],
    graph: Map<string, Set<string>>,
    manifests: readonly ModuleManifest[],
  ): string[] {
    const inDegree = new Map<string, number>();
    for (const node of nodes) {
      inDegree.set(node, 0);
    }
    for (const dependents of graph.values()) {
      for (const dependent of dependents) {
        inDegree.set(dependent, (inDegree.get(dependent) ?? 0) + 1);
      }
    }

    // Deterministic: seed queue sorted by id
    const queue = nodes
      .filter((node) => (inDegree.get(node) ?? 0) === 0)
      .sort((a, b) => a.localeCompare(b));

    const order: string[] = [];
    while (queue.length > 0) {
      const node = queue.shift();
      if (node === undefined) break;
      order.push(node);

      const dependents = [...(graph.get(node) ?? [])].sort((a, b) =>
        a.localeCompare(b),
      );
      for (const dependent of dependents) {
        const next = (inDegree.get(dependent) ?? 0) - 1;
        inDegree.set(dependent, next);
        if (next === 0) {
          queue.push(dependent);
          queue.sort((a, b) => a.localeCompare(b));
        }
      }
    }

    if (order.length !== nodes.length) {
      const remaining = nodes.filter((n) => !order.includes(n));
      throw new ModuleError({
        code: ModuleErrorCode.CIRCULAR_DEPENDENCY,
        message: `Circular dependency detected among: ${remaining.join(", ")}`,
        phase: "resolution",
        details: {
          cycleParticipants: remaining,
          manifests: remaining.map((id) =>
            manifests.find((m) => m.id === id)?.id,
          ),
        },
      });
    }

    return order;
  }
}

function formatRange(range: { min: string; max?: string }): string {
  return range.max ? `[${range.min}, ${range.max}]` : `>= ${range.min}`;
}

/**
 * Generic contribution registry.
 *
 * Domain registries (providers, tools, commands, ...) will be built later.
 * For the Module Host milestone, modules may register opaque contributions
 * keyed by capability during initialize — keeping the host domain-agnostic.
 */

import { ModuleError, ModuleErrorCode } from "./errors.js";
import type { ContributionInput, ContributionRecord } from "./types.js";

export class ContributionRegistry {
  private readonly byId = new Map<string, ContributionRecord>();

  register(moduleId: string, input: ContributionInput): void {
    if (this.byId.has(input.id)) {
      throw new ModuleError({
        code: ModuleErrorCode.DUPLICATE_CONTRIBUTION,
        message: `Contribution id already registered: "${input.id}"`,
        phase: "initialization",
        moduleId,
        details: { contributionId: input.id, capability: input.capability },
      });
    }

    const record: ContributionRecord = {
      moduleId,
      capability: input.capability,
      id: input.id,
      value: input.value,
      ...(input.order !== undefined ? { order: input.order } : {}),
    };
    this.byId.set(input.id, record);
  }

  list(capability?: string): ContributionRecord[] {
    const all = [...this.byId.values()];
    const filtered =
      capability === undefined
        ? all
        : all.filter((entry) => entry.capability === capability);

    return filtered.sort((a, b) => {
      const orderA = a.order ?? 0;
      const orderB = b.order ?? 0;
      if (orderA !== orderB) return orderA - orderB;
      return a.id.localeCompare(b.id);
    });
  }

  get(id: string): ContributionRecord | undefined {
    return this.byId.get(id);
  }

  removeByModule(moduleId: string): void {
    for (const [id, record] of this.byId) {
      if (record.moduleId === moduleId) {
        this.byId.delete(id);
      }
    }
  }

  clear(): void {
    this.byId.clear();
  }
}

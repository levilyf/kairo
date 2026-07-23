/**
 * ContributionResolver — discover and classify module contributions.
 *
 * Does not register into contract registries. That is ContributionBinder's job.
 */

import type { ContributionRegistry } from "../module/contributions.js";
import type { ContributionRecord } from "../module/types.js";
import {
  BINDABLE_CONTRIBUTION_TYPES,
  isBindableContributionType,
  type BindableContributionType,
  type BoundContribution,
  type SkippedContribution,
} from "./contribution.js";

export interface DiscoveryResult {
  readonly candidates: BoundContribution[];
  readonly skipped: SkippedContribution[];
}

export class ContributionResolver {
  /**
   * Discover bindable contributions from the host's generic registry.
   * Non-bindable capabilities are returned as skipped (not errors).
   */
  discover(contributions: ContributionRegistry): BoundContribution[] {
    return this.discoverAll(contributions).candidates;
  }

  discoverAll(contributions: ContributionRegistry): DiscoveryResult {
    const candidates: BoundContribution[] = [];
    const skipped: SkippedContribution[] = [];

    for (const record of contributions.list()) {
      const type = this.classify(record.capability);
      if (type === undefined) {
        skipped.push({
          id: record.id,
          capability: record.capability,
          moduleId: record.moduleId,
          reason: "unbindable_capability",
        });
        continue;
      }

      candidates.push(this.toCandidate(record, type));
    }

    return { candidates, skipped };
  }

  /**
   * Map a capability string to a bindable contribution type.
   * Unknown capabilities are not errors — they remain generic contributions.
   */
  classify(capability: string): BindableContributionType | undefined {
    if (isBindableContributionType(capability)) {
      return capability;
    }
    return undefined;
  }

  /** Supported bindable types (stable list for introspection). */
  supportedTypes(): readonly BindableContributionType[] {
    return BINDABLE_CONTRIBUTION_TYPES;
  }

  private toCandidate(
    record: ContributionRecord,
    type: BindableContributionType,
  ): BoundContribution {
    return {
      id: record.id,
      type,
      capability: record.capability,
      moduleId: record.moduleId,
      ...(record.order !== undefined ? { order: record.order } : {}),
      value: record.value,
      state: "discovered",
    };
  }
}

/**
 * ContributionBinder — bridge Modules → Contracts → Registries.
 *
 * Responsibilities:
 * - discover contributions from ModuleHost's generic registry
 * - validate contract implementations
 * - register into Provider/Tool/Command/UI/ContextBuilder/PolicyHook registries
 * - unregister on unbind / shutdown
 * - attribute failures to module + contribution id
 *
 * Does NOT execute providers/tools/commands/UI/builders/policies.
 * Does NOT own Runtime, sessions, or AI logic.
 *
 * Source of truth: docs/MODULES.md (Registration), docs/CORE.md (Registries)
 */

import { ContractError } from "../contracts/errors.js";
import { assertCommand } from "../contracts/command.js";
import { assertProvider } from "../contracts/provider.js";
import { assertTool } from "../contracts/tool.js";
import { assertUI } from "../contracts/ui.js";
import {
  assertContextBuilder,
  type ContextBuilder,
} from "../context-builder/builder.js";
import type { ContextBuilderRegistry } from "../context-builder/registry.js";
import type { ContributionRegistry } from "../module/contributions.js";
import { PolicyError } from "../policy/errors.js";
import { assertPolicyHook, type PolicyHook } from "../policy/hook.js";
import type { PolicyRegistry } from "../policy/registry.js";
import type { CommandRegistry } from "../registries/command-registry.js";
import type { ProviderRegistry } from "../registries/provider-registry.js";
import type { ToolRegistry } from "../registries/tool-registry.js";
import type { UIRegistry } from "../registries/ui-registry.js";
import {
  type BindableContributionType,
  type BindingIssue,
  type BindingResult,
  type BindingValidationReport,
  type BoundContribution,
  type SkippedContribution,
} from "./contribution.js";
import { BindingError, BindingErrorCode } from "./errors.js";
import { ContributionResolver } from "./resolver.js";

export interface ContractRegistries {
  providers: ProviderRegistry;
  tools: ToolRegistry;
  commands: CommandRegistry;
  uis: UIRegistry;
  contextBuilders: ContextBuilderRegistry;
  policyHooks: PolicyRegistry;
}

export interface ContributionBinderOptions {
  registries: ContractRegistries;
  resolver?: ContributionResolver;
}

type BinderPhase = "idle" | "bound";

export class ContributionBinder {
  private readonly registries: ContractRegistries;
  private readonly resolver: ContributionResolver;
  private readonly bound = new Map<string, BoundContribution>();
  private phase: BinderPhase = "idle";

  constructor(options: ContributionBinderOptions) {
    this.registries = options.registries;
    this.resolver = options.resolver ?? new ContributionResolver();
  }

  /**
   * Validate bindable contributions without mutating registries.
   */
  validate(contributions: ContributionRegistry): BindingValidationReport {
    const { candidates, skipped } = this.resolver.discoverAll(contributions);
    const issues: BindingIssue[] = [];
    const validated: BoundContribution[] = [];

    for (const candidate of candidates) {
      try {
        this.assertContract(candidate.type, candidate.value);
        this.assertIdMatch(candidate);
        validated.push({ ...candidate, state: "validated" });
      } catch (error) {
        issues.push(this.toIssue(candidate, error));
      }
    }

    // Detect id collisions within the candidate set.
    const seen = new Map<string, BoundContribution>();
    for (const candidate of candidates) {
      const prior = seen.get(candidate.id);
      if (prior) {
        issues.push({
          code: BindingErrorCode.DUPLICATE_CONTRIBUTION,
          message: `Duplicate contribution id "${candidate.id}" (also from module "${prior.moduleId}")`,
          moduleId: candidate.moduleId,
          contributionId: candidate.id,
          contributionType: candidate.type,
          capability: candidate.capability,
        });
      } else {
        seen.set(candidate.id, candidate);
      }
    }

    // Detect collisions with already-registered target registry entries.
    for (const candidate of candidates) {
      if (this.registryHas(candidate.type, candidate.id)) {
        issues.push({
          code: BindingErrorCode.DUPLICATE_CONTRIBUTION,
          message: `Contribution id "${candidate.id}" already exists in ${candidate.type} registry`,
          moduleId: candidate.moduleId,
          contributionId: candidate.id,
          contributionType: candidate.type,
          capability: candidate.capability,
        });
      }
    }

    const byId = new Map(validated.map((c) => [c.id, c]));
    const reportCandidates = candidates.map(
      (c) => byId.get(c.id) ?? { ...c, state: "failed" as const },
    );

    return {
      ok: issues.length === 0,
      candidates: reportCandidates,
      skipped,
      issues,
    };
  }

  /**
   * Bind all bindable contributions into contract registries.
   * Non-bindable contributions are skipped (remain in generic host registry).
   *
   * Atomic: on failure, rolls back any partial registrations from this call.
   */
  bind(contributions: ContributionRegistry): BindingResult {
    if (this.phase !== "idle") {
      throw new BindingError({
        code: BindingErrorCode.INVALID_STATE,
        message: "ContributionBinder is already bound; unbind before rebinding",
      });
    }

    const { candidates, skipped } = this.resolver.discoverAll(contributions);
    const registered: BoundContribution[] = [];
    let current: BoundContribution | undefined;

    try {
      for (const candidate of candidates) {
        current = candidate;
        this.assertContract(candidate.type, candidate.value);
        this.assertIdMatch(candidate);

        if (this.registryHas(candidate.type, candidate.id)) {
          throw new BindingError({
            code: BindingErrorCode.DUPLICATE_CONTRIBUTION,
            message: `Contribution id "${candidate.id}" already exists in ${candidate.type} registry`,
            moduleId: candidate.moduleId,
            contributionId: candidate.id,
            contributionType: candidate.type,
            capability: candidate.capability,
          });
        }

        this.registerInto(candidate.type, candidate.value);
        const bound: BoundContribution = { ...candidate, state: "bound" };
        registered.push(bound);
        this.bound.set(bound.id, bound);
      }
    } catch (error) {
      this.rollback(registered);
      throw this.asBindingError(error, current);
    }

    this.phase = "bound";
    return {
      bound: [...registered],
      skipped: [...skipped],
    };
  }

  /**
   * Unregister everything this binder registered.
   * Idempotent: safe when already idle.
   */
  unbind(): void {
    const items = [...this.bound.values()];
    for (const item of items) {
      this.unregisterFrom(item.type, item.id);
      this.bound.set(item.id, { ...item, state: "unbound" });
    }
    this.bound.clear();
    this.phase = "idle";
  }

  /** Currently bound contributions (copy). */
  list(): BoundContribution[] {
    return [...this.bound.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  get(id: string): BoundContribution | undefined {
    return this.bound.get(id);
  }

  get registriesView(): ContractRegistries {
    return this.registries;
  }

  private assertContract(type: BindableContributionType, value: unknown): void {
    switch (type) {
      case "provider":
        assertProvider(value);
        return;
      case "tool":
        assertTool(value);
        return;
      case "command":
        assertCommand(value);
        return;
      case "ui":
        assertUI(value);
        return;
      case "context.builder":
        assertContextBuilder(value);
        return;
      case "policy.hook":
        assertPolicyHook(value);
        return;
      default: {
        const _exhaustive: never = type;
        throw new BindingError({
          code: BindingErrorCode.UNKNOWN_CONTRIBUTION_TYPE,
          message: `Unknown contribution type: ${String(_exhaustive)}`,
          contributionType: type,
        });
      }
    }
  }

  /**
   * Contribution id must match the implementation's contract id so
   * registry lookups, ownership, and unbind stay consistent.
   */
  private assertIdMatch(candidate: BoundContribution): void {
    const valueId = extractContractId(candidate.value);
    if (valueId === undefined) {
      return; // assertContract already fails when id is missing
    }
    if (valueId !== candidate.id) {
      throw new BindingError({
        code: BindingErrorCode.INVALID_CONTRIBUTION,
        message: `Contribution id "${candidate.id}" must match implementation id "${valueId}"`,
        moduleId: candidate.moduleId,
        contributionId: candidate.id,
        contributionType: candidate.type,
        capability: candidate.capability,
        details: { implementationId: valueId },
      });
    }
  }

  private registerInto(type: BindableContributionType, value: unknown): void {
    switch (type) {
      case "provider":
        assertProvider(value);
        this.registries.providers.register(value);
        return;
      case "tool":
        assertTool(value);
        this.registries.tools.register(value);
        return;
      case "command":
        assertCommand(value);
        this.registries.commands.register(value);
        return;
      case "ui":
        assertUI(value);
        this.registries.uis.register(value);
        return;
      case "context.builder":
        assertContextBuilder(value);
        this.registries.contextBuilders.register(value as ContextBuilder);
        return;
      case "policy.hook":
        assertPolicyHook(value);
        this.registries.policyHooks.register(value as PolicyHook);
        return;
      default: {
        const _exhaustive: never = type;
        throw new BindingError({
          code: BindingErrorCode.REGISTRY_MISMATCH,
          message: `No registry for contribution type: ${String(_exhaustive)}`,
          contributionType: type,
        });
      }
    }
  }

  private unregisterFrom(type: BindableContributionType, id: string): void {
    switch (type) {
      case "provider":
        this.registries.providers.unregister(id);
        return;
      case "tool":
        this.registries.tools.unregister(id);
        return;
      case "command":
        this.registries.commands.unregister(id);
        return;
      case "ui":
        this.registries.uis.unregister(id);
        return;
      case "context.builder":
        this.registries.contextBuilders.unregister(id);
        return;
      case "policy.hook":
        this.registries.policyHooks.remove(id);
        return;
      default: {
        const _exhaustive: never = type;
        void _exhaustive;
      }
    }
  }

  private registryHas(type: BindableContributionType, id: string): boolean {
    switch (type) {
      case "provider":
        return this.registries.providers.has(id);
      case "tool":
        return this.registries.tools.has(id);
      case "command":
        return this.registries.commands.has(id);
      case "ui":
        return this.registries.uis.has(id);
      case "context.builder":
        return this.registries.contextBuilders.has(id);
      case "policy.hook":
        return this.registries.policyHooks.get(id) !== undefined;
      default: {
        const _exhaustive: never = type;
        void _exhaustive;
        return false;
      }
    }
  }

  private rollback(registered: readonly BoundContribution[]): void {
    for (const item of [...registered].reverse()) {
      this.unregisterFrom(item.type, item.id);
      this.bound.delete(item.id);
    }
    this.phase = "idle";
  }

  private toIssue(candidate: BoundContribution, error: unknown): BindingIssue {
    if (error instanceof BindingError) {
      return {
        code: error.code,
        message: error.message,
        moduleId: error.moduleId ?? candidate.moduleId,
        contributionId: error.contributionId ?? candidate.id,
        contributionType: error.contributionType ?? candidate.type,
        capability: error.capability ?? candidate.capability,
        ...(error.cause !== undefined ? { cause: error.cause } : {}),
      };
    }

    if (error instanceof ContractError || error instanceof PolicyError) {
      return {
        code: BindingErrorCode.INVALID_CONTRIBUTION,
        message: error.message,
        moduleId: candidate.moduleId,
        contributionId: candidate.id,
        contributionType: candidate.type,
        capability: candidate.capability,
        cause: error,
      };
    }

    // ContextBuilderError and similar
    if (
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof (error as { message: unknown }).message === "string"
    ) {
      return {
        code: BindingErrorCode.INVALID_CONTRIBUTION,
        message: (error as { message: string }).message,
        moduleId: candidate.moduleId,
        contributionId: candidate.id,
        contributionType: candidate.type,
        capability: candidate.capability,
        cause: error,
      };
    }

    return {
      code: BindingErrorCode.BIND_FAILED,
      message: error instanceof Error ? error.message : String(error),
      moduleId: candidate.moduleId,
      contributionId: candidate.id,
      contributionType: candidate.type,
      capability: candidate.capability,
      cause: error,
    };
  }

  private asBindingError(
    error: unknown,
    last?: BoundContribution,
  ): BindingError {
    if (error instanceof BindingError) {
      return error;
    }

    if (error instanceof ContractError) {
      return new BindingError({
        code: BindingErrorCode.INVALID_CONTRIBUTION,
        message: error.message,
        ...(last?.moduleId !== undefined ? { moduleId: last.moduleId } : {}),
        ...(last?.id !== undefined || error.id !== undefined
          ? { contributionId: last?.id ?? error.id }
          : {}),
        contributionType: last?.type ?? error.contract,
        ...(last?.capability !== undefined
          ? { capability: last.capability }
          : {}),
        cause: error,
      });
    }

    if (
      error instanceof PolicyError ||
      (typeof error === "object" &&
        error !== null &&
        "message" in error &&
        typeof (error as { message: unknown }).message === "string")
    ) {
      return new BindingError({
        code: BindingErrorCode.INVALID_CONTRIBUTION,
        message: (error as { message: string }).message,
        ...(last?.moduleId !== undefined ? { moduleId: last.moduleId } : {}),
        ...(last?.id !== undefined ? { contributionId: last.id } : {}),
        ...(last?.type !== undefined ? { contributionType: last.type } : {}),
        ...(last?.capability !== undefined
          ? { capability: last.capability }
          : {}),
        cause: error,
      });
    }

    return new BindingError({
      code: BindingErrorCode.BIND_FAILED,
      message: error instanceof Error ? error.message : String(error),
      ...(last?.moduleId !== undefined ? { moduleId: last.moduleId } : {}),
      ...(last?.id !== undefined ? { contributionId: last.id } : {}),
      ...(last?.type !== undefined ? { contributionType: last.type } : {}),
      ...(last?.capability !== undefined
        ? { capability: last.capability }
        : {}),
      cause: error,
    });
  }
}

function extractContractId(value: unknown): string | undefined {
  if (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof (value as { id: unknown }).id === "string"
  ) {
    return (value as { id: string }).id;
  }
  return undefined;
}

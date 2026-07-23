/**
 * HarnessBuilder — composition orchestrator.
 *
 * Flow:
 *   HarnessDefinition
 *     → create ModuleHost
 *     → register modules
 *     → boot ModuleHost
 *     → ContributionBinder.bind (Modules → Contract registries)
 *     → construct Harness
 *     → ready
 *
 * Does not execute AI. Does not own sessions/turns/context.
 */

import {
  ContributionBinder,
  type ContractRegistries,
} from "../binding/binder.js";
import { BindingError, BindingErrorCode } from "../binding/errors.js";
import { ContextBuilderRegistry } from "../context-builder/registry.js";
import {
  ModuleHost,
  type ModuleHostOptions,
} from "../module/host.js";
import { PolicyRegistry } from "../policy/registry.js";
import { CommandRegistry } from "../registries/command-registry.js";
import { ProviderRegistry } from "../registries/provider-registry.js";
import { ToolRegistry } from "../registries/tool-registry.js";
import { UIRegistry } from "../registries/ui-registry.js";
import {
  defineHarness,
  type HarnessDefinition,
  type HarnessDefinitionInput,
} from "./definition.js";
import { HarnessError, HarnessErrorCode } from "./errors.js";
import { Harness } from "./harness.js";

export interface HarnessBuilderOptions {
  /**
   * Override ModuleHost construction (tests / advanced composition).
   * Receives options the builder would pass to ModuleHost.
   */
  createModuleHost?: (options: ModuleHostOptions) => ModuleHost;
  /**
   * Override registry construction (tests / advanced composition).
   */
  createRegistries?: () => ContractRegistries;
  /**
   * Override binder construction (tests / advanced composition).
   */
  createBinder?: (registries: ContractRegistries) => ContributionBinder;
}

export class HarnessBuilder {
  private readonly createModuleHost: (
    options: ModuleHostOptions,
  ) => ModuleHost;
  private readonly createRegistries: () => ContractRegistries;
  private readonly createBinder: (
    registries: ContractRegistries,
  ) => ContributionBinder;

  constructor(options: HarnessBuilderOptions = {}) {
    this.createModuleHost =
      options.createModuleHost ?? ((hostOptions) => new ModuleHost(hostOptions));
    this.createRegistries =
      options.createRegistries ??
      (() => ({
        providers: new ProviderRegistry(),
        tools: new ToolRegistry(),
        commands: new CommandRegistry(),
        uis: new UIRegistry(),
        contextBuilders: new ContextBuilderRegistry(),
        policyHooks: new PolicyRegistry(),
      }));
    this.createBinder =
      options.createBinder ??
      ((registries) => new ContributionBinder({ registries }));
  }

  /**
   * Build a ready Harness from an immutable definition.
   * Validates by construction of the definition; boots ModuleHost;
   * binds module contributions into contract registries.
   */
  async build(definition: HarnessDefinition): Promise<Harness> {
    const hostOptions: ModuleHostOptions = {
      coreVersion: definition.coreVersion,
      grantedPermissions: definition.permissions,
      ...(definition.onModuleEvent
        ? { onEvent: definition.onModuleEvent }
        : {}),
    };

    const host = this.createModuleHost(hostOptions);
    const registries = this.createRegistries();
    const binder = this.createBinder(registries);

    try {
      for (const entry of definition.modules) {
        host.register(entry.source, {
          optional: entry.optional,
          config: { ...entry.config },
        });
      }
    } catch (error) {
      throw new HarnessError({
        code: HarnessErrorCode.BOOT_FAILED,
        message:
          error instanceof Error
            ? error.message
            : "Module registration failed",
        harnessName: definition.metadata.name,
        cause: error,
      });
    }

    const bootResult = await host.boot();
    if (!bootResult.ok) {
      // Best-effort cleanup of any partially started modules
      try {
        await host.shutdown();
      } catch {
        // Preserve the original boot failure as the primary error.
      }

      throw new HarnessError({
        code: HarnessErrorCode.BOOT_FAILED,
        message: bootResult.error.message,
        harnessName: definition.metadata.name,
        ...(bootResult.error.moduleId !== undefined
          ? { moduleId: bootResult.error.moduleId }
          : {}),
        cause: bootResult.error,
        details: {
          moduleErrorCode: bootResult.error.code,
          phase: bootResult.error.phase,
          failedOptional: bootResult.failedOptional.map((f) => f.moduleId),
        },
      });
    }

    try {
      binder.bind(host.contributions);
    } catch (error) {
      try {
        binder.unbind();
      } catch {
        // Best-effort.
      }
      try {
        await host.shutdown();
      } catch {
        // Preserve the binding failure as the primary error.
      }

      const bindingError =
        error instanceof BindingError
          ? error
          : new BindingError({
              code: BindingErrorCode.BIND_FAILED,
              message:
                error instanceof Error
                  ? error.message
                  : "Contribution binding failed",
              cause: error,
            });

      throw new HarnessError({
        code: HarnessErrorCode.BOOT_FAILED,
        message: bindingError.message,
        harnessName: definition.metadata.name,
        ...(bindingError.moduleId !== undefined
          ? { moduleId: bindingError.moduleId }
          : {}),
        cause: bindingError,
        details: {
          phase: "binding",
          contributionId: bindingError.contributionId,
          contributionType: bindingError.contributionType,
          bindingErrorCode: bindingError.code,
        },
      });
    }

    return new Harness({
      definition,
      moduleHost: host,
      bootResult,
      registries,
      binder,
    });
  }
}

/**
 * Public entry: accept a definition or definition input and build a Harness.
 */
export async function createHarness(
  definitionOrInput: HarnessDefinition | HarnessDefinitionInput,
): Promise<Harness> {
  const definition = isHarnessDefinition(definitionOrInput)
    ? definitionOrInput
    : defineHarness(definitionOrInput);

  return new HarnessBuilder().build(definition);
}

function isHarnessDefinition(
  value: HarnessDefinition | HarnessDefinitionInput,
): value is HarnessDefinition {
  return (
    typeof value === "object" &&
    value !== null &&
    "metadata" in value &&
    "modules" in value &&
    "permissions" in value &&
    "config" in value &&
    "environment" in value &&
    "coreVersion" in value &&
    Object.isFrozen(value)
  );
}

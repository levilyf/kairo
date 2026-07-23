/**
 * Harness + Runtime bootstrap for the application layer.
 *
 * The application layer turns constructed providers into a Harness (by
 * wrapping each provider as a thin ModuleSource that registers a
 * "provider" contribution during `initialize()`) and then builds a
 * Runtime over that ready Harness.
 *
 * Nothing here talks to providers over the network, reads the
 * filesystem, or knows about the CLI/TUI. It is pure composition.
 */

import type {
  Harness,
  HarnessDefinition,
  HarnessDefinitionInput,
  ModuleSource,
  Provider,
  Runtime,
} from "@kairo/core";
import { createHarness, createRuntime, defineHarness } from "@kairo/core";

import {
  ApplicationError,
  ApplicationErrorCode,
  BootstrapPhase,
} from "./errors.js";
import { wrapProviderAsModule } from "./provider-module.js";

/** Author-facing input for the synthesized harness. */
export interface HarnessBootstrapOptions {
  /** Harness name (default: "kairo"). */
  readonly name?: string;
  /** Harness version (default: "0.1.0"). */
  readonly version?: string;
  /** Harness description (default: derived from provider set). */
  readonly description?: string;
  /**
   * Extra ModuleSources to include beyond the provider-wrapper modules
   * (e.g. modules contributed by the harness / TUI / tests). Wired
   * exactly as if supplied directly to `defineHarness`.
   */
  readonly extraModules?: readonly ModuleSource[];
  /** Harness permissions grant set (default: empty). */
  readonly permissions?: readonly string[];
  /** Harness-level config values (default: empty). */
  readonly config?: Record<string, unknown>;
  /** Harness environment bindings (default: empty). */
  readonly environment?: Record<string, string>;
}

/**
 * Builds a `HarnessDefinition` from the constructed providers, wrapping
 * each as a module that contributes it to the "provider" capability
 * surface during `initialize()`.
 */
export function buildHarnessDefinition(
  providers: readonly Provider[],
  options: HarnessBootstrapOptions = {},
): HarnessDefinition {
  const name = options.name ?? "kairo";
  const version = options.version ?? "0.1.0";
  const description =
    options.description ??
    `Kairo application harness (${providers.length} provider${providers.length === 1 ? "" : "s"})`;

  const providerModules: ModuleSource[] = providers.map((provider) =>
    wrapProviderAsModule({ provider }),
  );
  const extraModules = options.extraModules
    ? [...options.extraModules]
    : [];

  const input: HarnessDefinitionInput = {
    name,
    version,
    description,
    modules: [...providerModules, ...extraModules],
    ...(options.permissions !== undefined
      ? { permissions: options.permissions }
      : {}),
    ...(options.config !== undefined ? { config: options.config } : {}),
    ...(options.environment !== undefined
      ? { environment: options.environment }
      : {}),
  };

  try {
    return defineHarness(input);
  } catch (cause) {
    throw new ApplicationError({
      code: ApplicationErrorCode.BOOTSTRAP_FAILED,
      message:
        cause instanceof Error
          ? `harness definition failed: ${cause.message}`
          : "harness definition failed",
      phase: BootstrapPhase.HARNESS_DEFINE,
      ...(cause instanceof Error ? { cause } : {}),
    });
  }
}

/**
 * Boots a ready Harness from the supplied providers (+ optional extra
 * modules). Wraps `createHarness` to surface failures as
 * `ApplicationError` carrying the underlying HarnessError.
 */
export async function buildHarness(
  providers: readonly Provider[],
  options: HarnessBootstrapOptions = {},
): Promise<Harness> {
  const definition = buildHarnessDefinition(providers, options);
  try {
    return await createHarness(definition);
  } catch (cause) {
    throw new ApplicationError({
      code: ApplicationErrorCode.BOOTSTRAP_FAILED,
      message:
        cause instanceof Error
          ? `harness build failed: ${cause.message}`
          : "harness build failed",
      phase: BootstrapPhase.HARNESS_BUILD,
      ...(cause instanceof Error ? { cause } : {}),
    });
  }
}

/**
 * Builds a Runtime over the supplied ready Harness. Wraps
 * `createRuntime` to surface failures as `ApplicationError`.
 */
export async function buildRuntime(harness: Harness): Promise<Runtime> {
  try {
    return await createRuntime(harness);
  } catch (cause) {
    throw new ApplicationError({
      code: ApplicationErrorCode.BOOTSTRAP_FAILED,
      message:
        cause instanceof Error
          ? `runtime build failed: ${cause.message}`
          : "runtime build failed",
      phase: BootstrapPhase.RUNTIME_BUILD,
      ...(cause instanceof Error ? { cause } : {}),
    });
  }
}

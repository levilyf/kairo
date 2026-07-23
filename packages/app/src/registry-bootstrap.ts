/**
 * ProviderRegistry bootstrap.
 *
 * Constructs a `ProviderRegistry`, registers every built-in factory, and
 * instantiates the providers listed in `KairoConfig.providers`. The
 * resulting registry + the constructed providers feed into the Harness
 * definition via {@link wrapProviderAsModule}.
 */

import type { KairoConfig } from "@kairo/config";
import type { Provider } from "@kairo/core";
import {
  ProviderRegistry,
  ProviderRegistryError,
} from "@kairo/provider-registry";

import {
  ApplicationError,
  ApplicationErrorCode,
  BootstrapPhase,
} from "./errors.js";
import {
  BUILTIN_COMPATIBILITY_PROTOCOLS,
  registerBuiltinProviderProtocols,
} from "./builtin-providers.js";

export interface BootstrappedRegistry {
  readonly registry: ProviderRegistry;
  /** Constructed providers in configuration order. */
  readonly providers: readonly Provider[];
}

/**
 * Builds and populates a `ProviderRegistry` from the supplied KairoConfig.
 * Returns the registry and the resolved provider instances.
 */
export function bootstrapProviderRegistry(
  config: KairoConfig,
): BootstrappedRegistry {
  const registry = new ProviderRegistry({
    compatibilityProtocols: BUILTIN_COMPATIBILITY_PROTOCOLS,
  });

  // 1. Register every built-in protocol factory.
  registerBuiltinProviderProtocols(registry);

  // 2. Construct configured providers from the loaded config.
  try {
    registry.createProviders(config);
  } catch (cause) {
    throw new ApplicationError({
      code:
        cause instanceof ProviderRegistryError &&
        cause.code === "DUPLICATE_PROVIDER"
          ? ApplicationErrorCode.PROVIDER_REGISTRATION_FAILED
          : ApplicationErrorCode.BOOTSTRAP_FAILED,
      message:
        cause instanceof Error
          ? `provider construction failed: ${cause.message}`
          : "provider construction failed",
      phase: BootstrapPhase.PROVIDER_CONSTRUCT,
      ...(cause instanceof ProviderRegistryError && cause.providerId
        ? { providerId: cause.providerId }
        : {}),
      ...(cause instanceof Error ? { cause } : {}),
    });
  }

  // 3. Collect the constructed provider instances (in config order).
  const providers: Provider[] = [];
  try {
    for (const provider of registry.listProviders()) {
      providers.push(provider);
    }
  } catch (cause) {
    throw new ApplicationError({
      code: ApplicationErrorCode.BOOTSTRAP_FAILED,
      message: "failed to enumerate constructed providers",
      phase: BootstrapPhase.PROVIDER_CONSTRUCT,
      ...(cause instanceof Error ? { cause } : {}),
    });
  }

  return {
    registry,
    providers: Object.freeze(providers) as readonly Provider[],
  };
}

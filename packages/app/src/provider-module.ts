/**
 * Wraps a constructed `Provider` as a self-contained `ModuleSource` so the
 * application layer can contribute providers into a Harness's contract
 * registry through Core's normal contribution-binding path.
 *
 * The Core `Provider` contract defines no model catalog and no module
 * surface; providers are not themselves modules. So the application layer
 * synthesizes the thinnest possible module that:
 *   - declares a manifest with a unique id and a single "provider"
 *     contribution,
 *   - on `initialize()`, registers the supplied Provider under its own
 *     id against the "provider" capability surface.
 *
 * This keeps provider packages free of Module-system knowledge and keeps
 * the Core contribution path the single source of truth for how a
 * provider arrives in the ProviderRegistry.
 */

import type {
  Module,
  ModuleManifest,
  ModuleSource,
  Provider,
} from "@kairo/core";

export interface ProviderModuleOptions {
  /** The provider to wrap. */
  readonly provider: Provider;
  /** Optional harness-level config for the module (default: empty object). */
  readonly config?: Readonly<Record<string, unknown>>;
}

/** Manifest version all generated provider-modules share. */
const PROVIDER_MODULE_VERSION = "1.0.0";

/**
 * Builds the minimal manifest for a provider-wrapper module.
 * The manifest's `id` is derived from the provider id so duplicate
 * detection in `defineHarness` works without further coordination.
 */
export function createProviderModuleManifest(
  provider: Provider,
): ModuleManifest {
  return {
    id: `kairo/provider:${provider.id}`,
    name: `Provider module: ${provider.name}`,
    version: PROVIDER_MODULE_VERSION,
    description:
      provider.description ?? `Provider "${provider.id}" wrapper module`,
    capabilities: ["provider"],
    dependencies: [],
    permissions: [],
    compatibility: { min: "0.1.0" },
  };
}

/**
 * Wraps the given provider as a `ModuleSource` suitable for passing to
 * `defineHarness({ modules: [...] })`. The module's `initialize()` hook
 * calls `context.registerContribution({ capability: "provider",
 * id: provider.id, value: provider })`.
 */
export function wrapProviderAsModule(
  options: ProviderModuleOptions,
): ModuleSource {
  const { provider } = options;
  const manifest = createProviderModuleManifest(provider);
  const config = options.config ?? {};

  const module: Module = {
    manifest,
    async initialize(context) {
      context.registerContribution({
        capability: "provider",
        id: provider.id,
        value: provider,
      });
    },
  };

  return {
    manifest,
    load: async () => module,
  };
}

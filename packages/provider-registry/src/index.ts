/**
 * @kairo/provider-registry public surface.
 *
 * Configuration-driven provider factory and model-indexing layer.
 * Not part of Core.
 */

export {
  ProviderRegistry,
  type DefaultModel,
  type ConfiguredProvider,
} from "./registry.js";

export {
  buildModelIndex,
  type ModelEntry,
  type ModelIndex,
} from "./model-index.js";

export {
  type ProviderFactory,
  type ProviderFactoryInput,
  type ProviderConfigBlock,
  type RegisteredFactory,
} from "./factory.js";

export { readModels, readDefaultModel } from "./config.js";

export {
  ProviderRegistryError,
  ProviderRegistryErrorCode,
  type ProviderRegistryErrorOptions,
} from "./errors.js";

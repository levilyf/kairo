/**
 * Provider factory typing.
 *
 * A factory is a function that accepts a provider instance id, the selected
 * protocol id, and the opaque per-instance config block (an arbitrary object
 * from @kairo/config's perspective), then returns a `Provider` (as defined by
 * @kairo/core). The registry reads only routing metadata and reserved model
 * fields; it forwards the config block unchanged to the factory.
 */

import type { Provider } from "@kairo/core";

/**
 * The per-provider config block. @kairo/config types this as an opaque
 * `Readonly<Record<string, unknown>>`; the registry reads only routing
 * metadata (`protocol`) and the two reserved model fields it owns (`models`,
 * `defaultModel`) and forwards the rest untouched to the factory.
 */
export type ProviderConfigBlock = Readonly<Record<string, unknown>>;

/** Input supplied to a protocol factory for one configured provider instance. */
export interface ProviderFactoryInput {
  /** Provider instance id from config.providers, e.g. "work" or "local". */
  readonly id: string;
  /** Protocol selected by the config block, e.g. "openai-compatible". */
  readonly protocol: string;
  /** Original opaque per-instance config block, forwarded unchanged. */
  readonly config: ProviderConfigBlock;
}

/**
 * A registered protocol factory. Implementations live in provider packages;
 * the registry never imports those packages itself.
 */
export type ProviderFactory = (input: ProviderFactoryInput) => Provider;

/**
 * Internal record for a registered-but-not-yet-instantiated protocol factory.
 */
export interface RegisteredFactory {
  readonly protocol: string;
  readonly factory: ProviderFactory;
}

/**
 * Built-in protocol factory registration.
 *
 * The application layer registers protocol factories (e.g.
 * "openai-compatible") against the ProviderRegistry. The registry then
 * constructs a Provider instance for every entry in
 * `config.providers` by selecting the protocol declared on that block
 * (or a compatibility-inferred protocol for legacy config).
 *
 * Vendors are no longer registered here. Only protocols are.
 */

import type { Provider } from "@kairo/core";
import type {
  ProviderConfigBlock,
  ProviderFactory,
  ProviderRegistry,
} from "@kairo/provider-registry";

import { createOpenAICompatibleProvider } from "@kairo/provider-openai-compatible";

import {
  ApplicationError,
  ApplicationErrorCode,
  BootstrapPhase,
} from "./errors.js";

/**
 * A built-in protocol registration.
 */
export interface BuiltinProtocolEntry {
  readonly protocol: string;
  readonly factory: ProviderFactory;
}

/**
 * Built-in protocol factories. Order is registration order; lookups in
 * @kairo/provider-registry are by protocol id, so order is not behavioral,
 * only diagnostic.
 */
export const BUILTIN_PROVIDER_PROTOCOLS: readonly BuiltinProtocolEntry[] =
  Object.freeze([
    {
      protocol: "openai-compatible",
      factory: createOpenAICompatibleProvider,
    },
  ]);

/**
 * Compatibility map for config blocks that predate explicit `protocol`.
 * Legacy vendor ids that were always OpenAI-compatible route here.
 */
export const BUILTIN_COMPATIBILITY_PROTOCOLS: Readonly<Record<string, string>> =
  Object.freeze({
    openai: "openai-compatible",
    nvidia: "openai-compatible",
    openrouter: "openai-compatible",
    groq: "openai-compatible",
    fireworks: "openai-compatible",
    together: "openai-compatible",
    deepinfra: "openai-compatible",
    ollama: "openai-compatible",
    lmstudio: "openai-compatible",
  });

/**
 * Registers every built-in protocol factory against the supplied registry.
 * Throws `ApplicationError` (PROVIDER_REGISTRATION_FAILED) on any failure,
 * wrapping the underlying ProviderRegistryError as the `cause`.
 */
export function registerBuiltinProviderProtocols(
  registry: ProviderRegistry,
): void {
  for (const { protocol, factory } of BUILTIN_PROVIDER_PROTOCOLS) {
    try {
      registry.registerProtocol(protocol, factory);
    } catch (cause) {
      throw new ApplicationError({
        code: ApplicationErrorCode.PROVIDER_REGISTRATION_FAILED,
        message: `failed to register built-in protocol "${protocol}"`,
        phase: BootstrapPhase.PROVIDER_REGISTER,
        providerId: protocol,
        ...(cause instanceof Error ? { cause } : {}),
      });
    }
  }
}

/**
 * Returns the set of built-in protocol ids exported by this package.
 * Useful for diagnostics and tests.
 */
export function listBuiltinProviderProtocolIds(): readonly string[] {
  return Object.freeze(BUILTIN_PROVIDER_PROTOCOLS.map((p) => p.protocol));
}

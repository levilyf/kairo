/**
 * Dedicated errors for @kairo/provider-registry.
 *
 * The registry owns exactly five responsibilities and surfaces all
 * failures through this single error class. Error codes are small and
 * closed for this milestone; the `providerId` and `model` fields let
 * callers disambiguate failures (e.g. which provider failed to
 * construct, which model is ambiguous).
 */

export const ProviderRegistryErrorCode = {
  /** A provider id was passed to `get()` that has no configured instance. */
  UNKNOWN_PROVIDER: "UNKNOWN_PROVIDER",
  /** A config block selected a protocol with no registered factory. */
  UNKNOWN_PROTOCOL: "UNKNOWN_PROTOCOL",
  /** A factory was registered twice for the same id, or two configured
   *  provider blocks collided on the same id. */
  DUPLICATE_PROVIDER: "DUPLICATE_PROVIDER",
  /** `resolveModel()` or `getDefault()` encountered a model claimed by
   *  more than one configured provider. The conflicting provider ids are
   *  carried in `conflictingProviders`. */
  DUPLICATE_MODEL: "DUPLICATE_MODEL",
  /** `config.model` (or the fallback defaultModel) names a model that no
   *  configured provider declares. */
  DEFAULT_MODEL_NOT_FOUND: "DEFAULT_MODEL_NOT_FOUND",
  /** A registered factory threw during `createProviders()`. The original
   *  error is carried in `cause`. */
  PROVIDER_CONSTRUCTION_FAILED: "PROVIDER_CONSTRUCTION_FAILED",
  /** A provider id failed validation (not a non-empty string). */
  INVALID_PROVIDER_ID: "INVALID_PROVIDER_ID",
  /** The supplied `KairoConfig` was structurally invalid in a way the
   *  registry cares about (e.g. `providers` is not a record). */
  INVALID_CONFIG: "INVALID_CONFIG",
} as const;

export type ProviderRegistryErrorCode =
  (typeof ProviderRegistryErrorCode)[keyof typeof ProviderRegistryErrorCode];

export interface ProviderRegistryErrorOptions {
  readonly code: ProviderRegistryErrorCode;
  readonly message: string;
  readonly providerId?: string;
  readonly model?: string;
  readonly conflictingProviders?: readonly string[];
  readonly cause?: unknown;
}

export class ProviderRegistryError extends Error {
  readonly code: ProviderRegistryErrorCode;
  declare readonly providerId?: string;
  declare readonly model?: string;
  declare readonly conflictingProviders?: readonly string[];
  declare readonly cause?: unknown;

  constructor(options: ProviderRegistryErrorOptions) {
    super(
      options.message,
      options.cause !== undefined ? { cause: options.cause } : undefined,
    );
    this.name = "ProviderRegistryError";
    this.code = options.code;
    if (options.providerId !== undefined) this.providerId = options.providerId;
    if (options.model !== undefined) this.model = options.model;
    if (options.conflictingProviders !== undefined) {
      this.conflictingProviders = options.conflictingProviders;
    }
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

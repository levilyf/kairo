/**
 * Kairo project configuration schema.
 *
 * Designed for forward growth but intentionally minimal at v1. Unknown
 * top-level keys are rejected so future schema additions are explicit.
 */

export type ProviderConfig = Readonly<Record<string, unknown>>;

export interface ProvidersConfig {
  readonly [providerId: string]: ProviderConfig;
}

export interface AgentConfig {
  readonly [key: string]: unknown;
}

export interface PermissionsConfig {
  readonly [key: string]: unknown;
}

export interface WorkspaceConfig {
  readonly [key: string]: unknown;
}

export interface KairoConfig {
  readonly version: 1;

  /**
   * Provider configurations keyed by provider id. Entries are opaque
   * records from this package's perspective — provider packages own
   * their own provider-specific shape. Defaults to `{}`.
   */
  readonly providers?: ProvidersConfig;

  /**
   * Default model identifier; `null` means "no default". Provider
   * packages interpret this string.
   */
  readonly model?: string | null;

  /**
   * Agent behavior configuration; opaque to this package.
   */
  readonly agent?: AgentConfig;

  /**
   * Permissions/policy configuration; opaque to this package.
   */
  readonly permissions?: PermissionsConfig;

  /**
   * Workspace configuration; opaque to this package.
   */
  readonly workspace?: WorkspaceConfig;
}

export const CURRENT_CONFIG_VERSION = 1 as const;

/**
 * The set of recognized top-level keys. Used by validation to reject
 * unknown fields.
 */
export const KNOWN_TOP_LEVEL_KEYS = [
  "version",
  "providers",
  "model",
  "agent",
  "permissions",
  "workspace",
] as const;

export type KnownTopLevelKey = (typeof KNOWN_TOP_LEVEL_KEYS)[number];

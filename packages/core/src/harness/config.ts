/**
 * Harness-level configuration.
 *
 * Holds composition values and per-module config bindings.
 * Does not own runtime/session/turn settings execution — only values
 * the composition layer carries for modules and future consumers.
 */

export interface HarnessConfig {
  /**
   * Harness-level configuration values (feature flags, defaults, wiring keys).
   * Opaque to Core; interpreted by harness authors and modules.
   */
  readonly values: Readonly<Record<string, unknown>>;
}

export interface HarnessConfigInput {
  values?: Record<string, unknown>;
}

export function createHarnessConfig(input: HarnessConfigInput = {}): HarnessConfig {
  return Object.freeze({
    values: Object.freeze({ ...(input.values ?? {}) }),
  });
}

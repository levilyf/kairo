/**
 * Test helpers for @kairo/app.
 *
 * `createApplication()` exercises the full pipeline; these helpers give
 * tests small, predictable KairoConfig objects. The application layer
 * uses the *real* provider packages (the SDK clients construct without
 * network access), so no SDK mock is required for these tests.
 */

import type { KairoConfig } from "@kairo/config";
import type { Provider } from "@kairo/core";

/** Builds a minimal KairoConfig. */
export function makeConfig(args: {
  providers?: Record<string, Readonly<Record<string, unknown>>>;
  model?: string | null;
}): KairoConfig {
  const config: Record<string, unknown> = { version: 1 };
  if (args.providers !== undefined) config.providers = args.providers;
  if (args.model !== undefined) config.model = args.model;
  return Object.freeze(config) as unknown as KairoConfig;
}

/**
 * Builds a minimal config that constructs every api-required built-in
 * provider's factory via an opaque empty options block. We use ollama +
 * lmstudio (api-optional) as the *actually constructible* set for tests
 * that want a fully-bootstrapped Application.
 */
export function makeLocalConfig(): KairoConfig {
  return makeConfig({
    providers: {
      ollama: { defaultModel: "qwen3-coder:30b" },
      lmstudio: { defaultModel: "local-model" },
    },
  });
}

/** Type guard for a Provider (avoids importing @kairo/core's assert for tests). */
export function isProvider(value: unknown): value is Provider {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { name?: unknown }).name === "string" &&
    typeof (value as { complete?: unknown }).complete === "function"
  );
}

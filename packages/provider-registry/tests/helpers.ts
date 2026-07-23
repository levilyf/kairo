/**
 * Test helpers for @kairo/provider-registry.
 *
 * The registry has zero compile-time knowledge of any concrete provider
 * package; tests mirror that by registering fake factories that return
 * hand-built `Provider`-shaped objects. This keeps the test suite
 * self-contained and proves the registry's neutrality.
 */

import type { Provider } from "@kairo/core";
import type { KairoConfig } from "@kairo/config";
import type { ProviderFactory } from "../src/index.js";

export interface FakeProvider extends Provider {
  /** extra field so tests can prove identity without touching internals */
  readonly __tag: string;
  /** captured factory input */
  readonly __received: Parameters<ProviderFactory>[0];
}

/**
 * Builds a fake protocol factory that records the input it was called with and
 * returns a Provider-shaped object tagged with the provider instance id.
 */
export function fakeFactory(
  capabilitiesOrLegacyId?:
    | string
    | {
        streaming?: boolean;
        tools?: boolean;
      },
): ProviderFactory & { calls: ReadonlyArray<Parameters<ProviderFactory>[0]> } {
  const calls: Array<Parameters<ProviderFactory>[0]> = [];
  const factory = ((input: Parameters<ProviderFactory>[0]) => {
    calls.push(input);
    const capabilities =
      typeof capabilitiesOrLegacyId === "string"
        ? undefined
        : capabilitiesOrLegacyId;
    const streaming = capabilities?.streaming ?? true;
    const provider: FakeProvider = {
      id: input.id,
      name: input.id,
      capabilities: {
        streaming,
        tools: capabilities?.tools ?? true,
        modalities: Object.freeze(["text"] as const),
      },
      async complete() {
        return {
          id: "fake",
          output: Object.freeze([{ type: "text", text: "ok" }]),
          stopReason: "end",
        };
      },
      ...(streaming
        ? {
            async *stream() {
              yield { type: "message_start" as const };
              yield {
                type: "message_end" as const,
                response: {
                  id: "fake-stream",
                  output: Object.freeze([
                    { type: "text" as const, text: "ok" },
                  ]),
                  stopReason: "end" as const,
                },
              };
            },
          }
        : {}),
      __tag: `fake:${input.id}`,
      __received: input,
    };
    Object.freeze(provider);
    return provider;
  }) as unknown as ProviderFactory;
  Object.defineProperty(factory, "calls", { get: () => Object.freeze([...calls]) });
  return factory as ProviderFactory & {
    calls: ReadonlyArray<Parameters<ProviderFactory>[0]>;
  };
}

/**
 * A factory that always throws. Used to exercise
 * PROVIDER_CONSTRUCTION_FAILED.
 */
export function throwingFactory(message: string): ProviderFactory {
  return (() => {
    throw new Error(message);
  }) as ProviderFactory;
}

/**
 * Builds a minimal KairoConfig. Provide `providers` keyed by id and the
 * helper shapes a valid v1 config object. Pass `model` to set the
 * top-level default model.
 */
export function makeConfig(args: {
  providers?: Record<string, Readonly<Record<string, unknown>>>;
  model?: string | null;
}): KairoConfig {
  const config: Record<string, unknown> = { version: 1 };
  if (args.providers !== undefined) config.providers = args.providers;
  if (args.model !== undefined) config.model = args.model;
  return Object.freeze(config) as unknown as KairoConfig;
}

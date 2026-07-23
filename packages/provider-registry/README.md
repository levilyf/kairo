# @kairo/provider-registry

Configuration-driven provider factory and model-indexing layer for **Kairo**.
Bridges [@kairo/config](../config) and protocol-based provider packages
(e.g. [@kairo/provider-openai-compatible](../provider-openai-compatible)).
**Not part of Core.**

## Role

The registry owns exactly five responsibilities:

1. **register protocol factories** — `registerProtocol(protocol, factory)`
2. **construct providers from config** — `createProviders(config)`
3. **lookup providers** — `get(id)`
4. **expose configured models** — `listModels()`
5. **resolve the default model/provider** — `getDefault()`, `resolveModel(name)`

It does NOT read `.kairo/config.json`, touch the filesystem, access
environment variables, create Harnesses or Runtimes, implement protocol
logic, or talk to providers over HTTP. Construction is the only thing it
triggers — by calling a registered factory.

## Dependency direction

```
@kairo/config
       │
       ▼
@kairo/provider-registry
       │
       ▼
protocol providers  (@kairo/provider-openai-compatible, …)
```

`@kairo/core` remains untouched; the registry imports only
`@kairo/core`'s `Provider` *type* and `@kairo/config`'s `KairoConfig`
*type*.

## Public API

```ts
import { ProviderRegistry } from "@kairo/provider-registry";

const registry = new ProviderRegistry();

// 1. Register protocol factories (callers wire concrete provider packages).
//    Vendors are config presets, not packages — one factory serves them all:
registry.registerProtocol("openai-compatible", createOpenAICompatibleProvider);

// 2. Construct from an already-loaded KairoConfig. Each provider block
//    selects its protocol via an explicit `protocol` field (or a
//    compatibility-inferred protocol for legacy vendor ids):
registry.createProviders(config);

// 3. Lookup (by the provider id declared in config.providers):
registry.get("nvidia");
registry.listProviders();

// 4. Models:
registry.listModels();      // every model declared across all providers
registry.resolveModel("moonshotai/kimi-k2-instruct");  // → { provider }

// 5. Default:
registry.getDefault();      // → { provider, model }
```

> `register(id, factory)` and `has(id)` remain as thin compatibility
> aliases for `registerProtocol` / protocol-or-instance lookup, but new
> callers should register **protocols**, not vendor ids.

## Configuration

The registry consumes the real `KairoConfig` from `@kairo/config`:

```jsonc
{
  "version": 1,
  "providers": {
    "nvidia": {
      "apiKey": "...",
      "defaultModel": "moonshotai/kimi-k2-instruct",
      "models": ["moonshotai/kimi-k2-instruct"]   // ← declared catalog
    },
    "openrouter": {
      "apiKey": "...",
      "defaultModel": "openai/gpt-5",
      "models": ["openai/gpt-5"]
    },
    "ollama": {
      "defaultModel": "qwen3-coder:30b",
      "models": ["qwen3-coder:30b"]
    }
  },
  "model": "moonshotai/kimi-k2-instruct"   // top-level default model
}
```

The registry owns **two reserved keys** on each per-provider block:

- `models?: string[]`     — explicit list of models the provider serves.
- `defaultModel?: string` — the provider's own preferred model.

Everything else in the block is opaque to the registry and forwarded
*untouched* to the factory.

## Model resolution

The Core `Provider` contract (see
`packages/core/src/contracts/provider.ts`) declares no model catalog —
`ProviderCapabilities` only covers `streaming`, `tools`, `modalities`.
So the registry learns which models a provider serves **from the
config itself** — there is no hardcoded model database and no runtime
probing of providers.

- `resolveModel("moonshotai/kimi-k2-instruct")` → `{ provider }` for the
  single provider that declares it.
- When a model is declared by exactly one provider, `ModelEntry.providerId`
  is set and `ambiguous` is `false`.
- When two or more configured providers declare the same model,
  `ModelEntry.ambiguous` is `true`, `ModelEntry.providers` carries all
  owner ids, and `resolveModel()` (and `getDefault()` if the default is
  ambiguous) throw `DUPLICATE_MODEL` carrying `conflictingProviders`.

The registry **never silently chooses** an owner for an ambiguous model.

## Default model

- If `config.model` (top-level, possibly `null`) is set and resolvable
  → `getDefault()` returns `{ provider, model }`.
- If `config.model === null`/unset → fall back to the *first configured*
  provider's own `defaultModel`, **only if** that model is also listed
  in the provider's `models` (so it appears in the index). Otherwise
  `DEFAULT_MODEL_NOT_FOUND`.
- If `config.model` is set but no configured provider declares it →
  `DEFAULT_MODEL_NOT_FOUND`.
- If the resolved default is ambiguous → `DUPLICATE_MODEL`.

## Errors

```ts
export const ProviderRegistryErrorCode = {
  UNKNOWN_PROVIDER:             "UNKNOWN_PROVIDER",
  DUPLICATE_PROVIDER:           "DUPLICATE_PROVIDER",
  DUPLICATE_MODEL:              "DUPLICATE_MODEL",
  DEFAULT_MODEL_NOT_FOUND:      "DEFAULT_MODEL_NOT_FOUND",
  PROVIDER_CONSTRUCTION_FAILED: "PROVIDER_CONSTRUCTION_FAILED",
  INVALID_PROVIDER_ID:          "INVALID_PROVIDER_ID",
  INVALID_CONFIG:               "INVALID_CONFIG",
} as const;

export class ProviderRegistryError extends Error {
  readonly code: ProviderRegistryErrorCode;
  readonly providerId?: string;
  readonly model?: string;
  readonly conflictingProviders?: readonly string[];
  readonly cause?: unknown;
}
```

## What this package does NOT do

- Read `.kairo/config.json`, the filesystem, or env vars (that's
  `@kairo/config`'s job).
- Implement protocol logic, HTTP clients, request/response mapping,
  streaming, or tool-call parsing (that's the provider packages'
  job via `@kairo/protocol-openai`).
- Create Harnesses, Runtimes, sessions, turns, context, or TUI.
- Import any concrete provider package. Callers wire protocol factories
  at the application boundary.

/**
 * @kairo/provider-registry
 *
 * Configuration-driven provider factory and model-indexing layer.
 *
 * The registry is the bridge between @kairo/config (an already-loaded
 * KairoConfig) and provider protocol factories registered by the
 * application layer. It owns exactly:
 *
 *   1. registering protocol factories,
 *   2. constructing provider instances from config,
 *   3. looking up provider instances by id,
 *   4. exposing configured models, and
 *   5. resolving the default model→provider instance.
 *
 * It does NOT read .kairo/config.json, touch the filesystem, access
 * environment variables, create Harnesses or Runtimes, implement
 * protocol logic, or talk to providers over HTTP. Construction is the
 * only thing it triggers, by calling a registered factory.
 */

import type { KairoConfig } from "@kairo/config";
import type { Provider } from "@kairo/core";

import {
  ProviderRegistryError,
  ProviderRegistryErrorCode,
} from "./errors.js";
import type { ProviderFactory, RegisteredFactory } from "./factory.js";
import { readDefaultModel, readModels } from "./config.js";
import {
  buildModelIndex,
  type ModelEntry,
  type ModelIndex,
} from "./model-index.js";

/** A resolved default: which provider owns which model. */
export interface DefaultModel {
  readonly provider: Provider;
  readonly model: string;
}

/** A provider instance plus the models it declared in config. */
export interface ConfiguredProvider {
  readonly id: string;
  readonly provider: Provider;
  readonly models: readonly string[];
  readonly defaultModel: string | undefined;
}

export interface ProviderRegistryOptions {
  /** Compatibility map for config blocks that predate explicit `protocol`. */
  readonly compatibilityProtocols?: Readonly<Record<string, string>>;
}

export class ProviderRegistry {
  /** registered protocol factories, keyed by protocol id, in registration order */
  private readonly factories = new Map<string, RegisteredFactory>();
  private readonly compatibilityProtocols: ReadonlyMap<string, string>;
  /** instantiated providers keyed by id, in config order */
  private readonly providers = new Map<string, ConfiguredProvider>();
  /** the model index, built at the end of createProviders() */
  private index: ModelIndex | undefined;
  /** the original default model string as supplied via KairoConfig.model */
  private configuredDefaultModel: string | undefined;

  constructor(options: ProviderRegistryOptions = {}) {
    this.configuredDefaultModel = undefined;
    this.compatibilityProtocols = new Map(
      Object.entries(options.compatibilityProtocols ?? {}).map(([id, protocol]) => [
        id.trim(),
        protocol.trim(),
      ]),
    );
  }

  // ── registration ────────────────────────────────────────────────

  registerProtocol(protocol: string, factory: ProviderFactory): void {
    assertProviderId(protocol);
    const key = protocol.trim();
    if (typeof factory !== "function") {
      throw new ProviderRegistryError({
        code: ProviderRegistryErrorCode.INVALID_PROVIDER_ID,
        message: `factory for protocol "${key}" must be a function`,
        providerId: key,
      });
    }
    if (this.factories.has(key)) {
      throw new ProviderRegistryError({
        code: ProviderRegistryErrorCode.DUPLICATE_PROVIDER,
        message: `protocol "${key}" is already registered`,
        providerId: key,
      });
    }
    this.factories.set(key, { protocol: key, factory });
  }

  /** Compatibility alias for the pre-protocol API. */
  register(id: string, factory: ProviderFactory): void {
    this.registerProtocol(id, factory);
  }

  hasProtocol(protocol: string): boolean {
    return typeof protocol === "string" && this.factories.has(protocol.trim());
  }

  /**
   * True iff `id` is usable: either a constructed provider instance
   * (post-createProviders) or a registered protocol factory id.
   * Compatibility alias for the pre-protocol API.
   */
  has(id: string): boolean {
    if (typeof id !== "string") return false;
    const key = id.trim();
    if (this.providers.has(key)) return true;
    return this.factories.has(key);
  }

  /** True iff a provider instance with `id` was constructed. */
  hasProvider(id: string): boolean {
    return typeof id === "string" && this.providers.has(id.trim());
  }

  // ── construction ─────────────────────────────────────────────────

  /**
   * Constructs one provider instance per entry in `config.providers`,
   * delegating to the registered factory for that id. After this
   * returns, `get()`, `listProviders()`, `listModels()`,
   * `getDefault()`, and `resolveModel()` are usable.
   *
   * Idempotency: a second call replaces the prior snapshot (re-using
   * the same registered factories). Callers should treat the prior
   * provider instances as retired.
   */
  createProviders(config: KairoConfig): void {
    if (config === null || typeof config !== "object") {
      throw new ProviderRegistryError({
        code: ProviderRegistryErrorCode.INVALID_CONFIG,
        message: "config must be a KairoConfig object",
      });
    }

    // Validate the top-level default-model field up front.
    let defaultModel: string | undefined = undefined;
    const rawDefault = config.model;
    if (rawDefault !== undefined && rawDefault !== null) {
      if (typeof rawDefault !== "string") {
        throw new ProviderRegistryError({
          code: ProviderRegistryErrorCode.INVALID_CONFIG,
          message: "config.model must be a string or null",
        });
      }
      const trimmed = rawDefault.trim();
      if (trimmed.length === 0) {
        throw new ProviderRegistryError({
          code: ProviderRegistryErrorCode.INVALID_CONFIG,
          message: "config.model must not be empty",
        });
      }
      defaultModel = trimmed;
    }

    const providersBlock = config.providers;
    if (providersBlock !== undefined && providersBlock !== null) {
      if (typeof providersBlock !== "object" || Array.isArray(providersBlock)) {
        throw new ProviderRegistryError({
          code: ProviderRegistryErrorCode.INVALID_CONFIG,
          message: "config.providers must be an object keyed by provider id",
        });
      }
    }

    // Reset prior state for idempotent re-runs.
    this.providers.clear();
    this.index = undefined;
    this.configuredDefaultModel = defaultModel;

    const declarations: Array<{
      providerId: string;
      models: readonly string[];
    }> = [];

    if (providersBlock !== undefined && providersBlock !== null) {
      for (const [rawId, block] of Object.entries(providersBlock)) {
        const id = rawId.trim();
        if (id.length === 0) {
          throw new ProviderRegistryError({
            code: ProviderRegistryErrorCode.INVALID_PROVIDER_ID,
            message: "config.providers contains a whitespace-only key",
          });
        }
        checkProviderBlock(block, id);
        const blockObj = block as Readonly<Record<string, unknown>>;
        const protocol = this.resolveProtocol(id, blockObj);
        const registered = this.factories.get(protocol);
        if (registered === undefined) {
          throw new ProviderRegistryError({
            code: ProviderRegistryErrorCode.UNKNOWN_PROTOCOL,
            message: `no factory registered for protocol "${protocol}"`,
            providerId: id,
          });
        }
        const models = readModels(blockObj, id);
        const providerDefaultModel = readDefaultModel(blockObj, id);

        let provider: Provider;
        try {
          provider = registered.factory({ id, protocol, config: blockObj });
        } catch (cause) {
          throw new ProviderRegistryError({
            code: ProviderRegistryErrorCode.PROVIDER_CONSTRUCTION_FAILED,
            message: `provider "${id}" failed to construct`,
            providerId: id,
            ...(cause instanceof Error ? { cause } : {}),
          });
        }

        if (this.providers.has(id)) {
          throw new ProviderRegistryError({
            code: ProviderRegistryErrorCode.DUPLICATE_PROVIDER,
            message: `provider "${id}" appears more than once in config.providers`,
            providerId: id,
          });
        }
        this.providers.set(id, {
          id,
          provider,
          models,
          defaultModel: providerDefaultModel,
        });
        declarations.push({ providerId: id, models });
      }
    }

    this.index = buildModelIndex(declarations, defaultModel);
  }

  // ── lookup ───────────────────────────────────────────────────────

  get(id: string): Provider {
    assertProviderId(id);
    this.requireIndex();
    const entry = this.providers.get(id.trim());
    if (entry === undefined) {
      throw new ProviderRegistryError({
        code: ProviderRegistryErrorCode.UNKNOWN_PROVIDER,
        message: `provider "${id.trim()}" is not configured`,
        providerId: id.trim(),
      });
    }
    return entry.provider;
  }

  listProviders(): readonly Provider[] {
    this.requireIndex();
    return Object.freeze([...this.providers.values()].map((e) => e.provider));
  }

  listModels(): readonly ModelEntry[] {
    const idx = this.requireIndex();
    return Object.freeze([...idx.entries]);
  }

  // ── default / model resolution ───────────────────────────────────

  getDefault(): DefaultModel {
    const idx = this.requireIndex();
    const target = this.resolveDefaultTarget(idx);
    if (target === undefined) {
      throw new ProviderRegistryError({
        code: ProviderRegistryErrorCode.DEFAULT_MODEL_NOT_FOUND,
        message: "no default model is configured",
      });
    }
    const owners = idx.byModel.get(target.model);
    if (owners === undefined || owners.length === 0) {
      throw new ProviderRegistryError({
        code: ProviderRegistryErrorCode.DEFAULT_MODEL_NOT_FOUND,
        message: `default model "${target.model}" is not declared by any configured provider`,
        model: target.model,
      });
    }
    if (owners.length > 1) {
      throw new ProviderRegistryError({
        code: ProviderRegistryErrorCode.DUPLICATE_MODEL,
        message: `default model "${target.model}" is declared by multiple providers`,
        model: target.model,
        conflictingProviders: Object.freeze([...owners]) as readonly string[],
      });
    }
    const ownerId = owners[0]!;
    const configured = this.providers.get(ownerId);
    if (configured === undefined) {
      // Should never happen: the index only references configured ids.
      throw new ProviderRegistryError({
        code: ProviderRegistryErrorCode.DEFAULT_MODEL_NOT_FOUND,
        message: `default model "${target.model}" maps to unknown provider "${ownerId}"`,
        model: target.model,
        providerId: ownerId,
      });
    }
    return { provider: configured.provider, model: target.model };
  }

  resolveModel(model: string): { provider: Provider } {
    if (typeof model !== "string" || model.trim().length === 0) {
      throw new ProviderRegistryError({
        code: ProviderRegistryErrorCode.INVALID_CONFIG,
        message: "model must be a non-empty string",
        model,
      });
    }
    const idx = this.requireIndex();
    const trimmed = model.trim();
    const owners = idx.byModel.get(trimmed);
    if (owners === undefined) {
      throw new ProviderRegistryError({
        code: ProviderRegistryErrorCode.UNKNOWN_PROVIDER,
        message: `model "${trimmed}" is not declared by any configured provider`,
        model: trimmed,
      });
    }
    if (owners.length > 1) {
      throw new ProviderRegistryError({
        code: ProviderRegistryErrorCode.DUPLICATE_MODEL,
        message: `model "${trimmed}" is declared by multiple providers`,
        model: trimmed,
        conflictingProviders: Object.freeze([...owners]) as readonly string[],
      });
    }
    const ownerId = owners[0]!;
    const configured = this.providers.get(ownerId);
    if (configured === undefined) {
      throw new ProviderRegistryError({
        code: ProviderRegistryErrorCode.UNKNOWN_PROVIDER,
        message: `model "${trimmed}" maps to unknown provider "${ownerId}"`,
        model: trimmed,
        providerId: ownerId,
      });
    }
    return { provider: configured.provider };
  }

  // ── lifecycle ───────────────────────────────────────────────────

  /** Resets the registry to its post-construction state. */
  clear(): void {
    this.factories.clear();
    this.providers.clear();
    this.index = undefined;
    this.configuredDefaultModel = undefined;
  }

  // ── internal ─────────────────────────────────────────────────────

  private resolveProtocol(
    providerId: string,
    block: Readonly<Record<string, unknown>>,
  ): string {
    const raw = block["protocol"];
    if (raw !== undefined) {
      if (typeof raw !== "string" || raw.trim().length === 0) {
        throw new ProviderRegistryError({
          code: ProviderRegistryErrorCode.INVALID_CONFIG,
          message: `provider "${providerId}": "protocol" must be a non-empty string`,
          providerId,
        });
      }
      return raw.trim();
    }
    const compatibilityProtocol = this.compatibilityProtocols.get(providerId);
    if (compatibilityProtocol !== undefined) {
      return compatibilityProtocol;
    }
    // Compatibility with the old register(providerId, factory) API.
    if (this.factories.has(providerId)) {
      return providerId;
    }
    throw new ProviderRegistryError({
      code: ProviderRegistryErrorCode.UNKNOWN_PROTOCOL,
      message: `provider "${providerId}" does not declare a protocol`,
      providerId,
    });
  }

  private requireIndex(): ModelIndex {
    if (this.index === undefined) {
      throw new ProviderRegistryError({
        code: ProviderRegistryErrorCode.INVALID_CONFIG,
        message: "createProviders() must be called before queries",
      });
    }
    return this.index;
  }

  /**
   * Decides which (model) the default should resolve to.
   *
   *   1. If config.model is set, it is authoritative — even when no
   *      configured provider lists it. The caller (`getDefault`) then
   *      either finds it in the index or throws DEFAULT_MODEL_NOT_FOUND.
   *   2. If config.model is unset, fall back to the first configured
   *      provider's own `defaultModel`, if any.
   *   3. Otherwise there is no default → undefined.
   */
  private resolveDefaultTarget(
    idx: ModelIndex,
  ): { model: string } | undefined {
    if (idx.defaultModel !== undefined) {
      return { model: idx.defaultModel };
    }
    for (const { defaultModel } of this.providers.values()) {
      if (defaultModel !== undefined) {
        return { model: defaultModel };
      }
    }
    return undefined;
  }
}

// ── validation helpers ─────────────────────────────────────────────

function assertProviderId(id: unknown): asserts id is string {
  if (typeof id !== "string" || id.trim().length === 0) {
    throw new ProviderRegistryError({
      code: ProviderRegistryErrorCode.INVALID_PROVIDER_ID,
      message: "provider id must be a non-empty string",
      ...(typeof id === "string" ? { providerId: id } : {}),
    });
  }
}

function checkProviderBlock(
  block: unknown,
  providerId: string,
): asserts block is Readonly<Record<string, unknown>> {
  if (block === null || typeof block !== "object" || Array.isArray(block)) {
    throw new ProviderRegistryError({
      code: ProviderRegistryErrorCode.INVALID_CONFIG,
      message: `config.providers["${providerId}"] must be an object`,
      providerId,
    });
  }
}

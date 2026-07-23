/**
 * The model→provider index built by the registry.
 *
 * The Core `Provider` contract (see packages/core/src/contracts/provider.ts)
 * defines **no model catalog** — capabilities cover only streaming,
 * tools, and modalities. The registry therefore learns which models a
 * provider serves from the KairoConfig itself: each provider block may
 * declare `models: string[]` and/or `defaultModel: string`.
 *
 * The index preserves duplicate information rather than silently choosing
 * one owner: an entry whose `providers` array has length > 1 is marked
 * `ambiguous: true`. `resolveModel()` refuses to pick for ambiguous
 * entries and surfaces the conflicting ids via the error.
 */

/** The result of a model lookup. */
export interface ModelEntry {
  /** The model string. */
  readonly model: string;
  /** The owning provider id when unambiguous; undefined otherwise. */
  readonly providerId?: string;
  /** Every provider id that declares this model (length ≥ 1). */
  readonly providers: readonly string[];
  /** True when more than one provider declares the same model. */
  readonly ambiguous: boolean;
}

/** Internal accumulator used while building the index. */
export interface ModelIndex {
  /** Maps model → ordered list of provider ids that declare it. */
  readonly byModel: ReadonlyMap<string, readonly string[]>;
  /** All entries, in insertion order of the model string. */
  readonly entries: readonly ModelEntry[];
  /** The configured default model identifier, if any. */
  readonly defaultModel: string | undefined;
}

/**
 * Builds an immutable model index from a list of (providerId, models)
 * pairs plus an optional default model string. Caller supplies the
 * `(providerId, models)` pairs in provider-configuration order so that
 * insertion ordering is deterministic.
 */
export function buildModelIndex(
  declarations: ReadonlyArray<{
    readonly providerId: string;
    readonly models: readonly string[];
  }>,
  defaultModel: string | undefined,
): ModelIndex {
  const map = new Map<string, string[]>();
  const order: string[] = [];

  for (const { providerId, models } of declarations) {
    for (const model of models) {
      let owners = map.get(model);
      if (owners === undefined) {
        owners = [];
        map.set(model, owners);
        order.push(model);
      }
      // De-duplicate within a single provider block; cross-provider
      // duplicates are the whole point of the `ambiguous` flag, so the
      // same providerId appearing twice for the same model collapses.
      if (!owners.includes(providerId)) {
        owners.push(providerId);
      }
    }
  }

  const entries: ModelEntry[] = order.map((model) => {
    const providers = map.get(model)!;
    return {
      model,
      ...(providers.length === 1
        ? {
            providerId: providers[0]!,
            providers: Object.freeze([...providers]) as readonly string[],
          }
        : { providers: Object.freeze([...providers]) as readonly string[] }),
      ambiguous: providers.length > 1,
    };
  });
  Object.freeze(entries);

  return {
    byModel: map,
    entries,
    defaultModel,
  };
}

/**
 * ContextBuilderRegistry — catalog of registered Context Builders.
 *
 * Passive registry: register, unregister, get, list, resolve ordered pipeline.
 * Does not assemble Context. Does not execute builders as a pipeline.
 * The future Context Assembler will resolve() and call build().
 *
 * Ordering: priority ascending (default 100), then registration order.
 *
 * Source of truth: docs/CORE.md, docs/CONTRACTS.md, docs/MODULES.md
 */

import {
  assertContextBuilder,
  type ContextBuilder,
} from "./builder.js";
import {
  ContextBuilderError,
  ContextBuilderErrorCode,
} from "./errors.js";

const DEFAULT_PRIORITY = 100;

interface RegisteredBuilder {
  readonly builder: ContextBuilder;
  readonly registrationOrder: number;
}

export class ContextBuilderRegistry {
  private readonly entries: RegisteredBuilder[] = [];
  private readonly builderIds = new Set<string>();
  private registrationCounter = 0;
  private _closed = false;

  get closed(): boolean {
    return this._closed;
  }

  get size(): number {
    return this.entries.length;
  }

  /**
   * Register a Context Builder.
   * Throws on duplicate id, invalid contract, or closed registry.
   */
  register(builder: ContextBuilder): void {
    if (this._closed) {
      throw new ContextBuilderError({
        code: ContextBuilderErrorCode.REGISTRY_CLOSED,
        message: "Cannot register builder: context builder registry is closed",
        builderId: builder.id,
      });
    }

    assertContextBuilder(builder);

    if (this.builderIds.has(builder.id)) {
      throw new ContextBuilderError({
        code: ContextBuilderErrorCode.DUPLICATE_BUILDER,
        message: `Context builder "${builder.id}" is already registered`,
        builderId: builder.id,
      });
    }

    this.builderIds.add(builder.id);
    this.entries.push({
      builder,
      registrationOrder: this.registrationCounter++,
    });
  }

  /**
   * Remove a builder by id. Returns true if removed.
   * Idempotent.
   */
  unregister(builderId: string): boolean {
    const idx = this.entries.findIndex((e) => e.builder.id === builderId);
    if (idx === -1) return false;
    this.entries.splice(idx, 1);
    this.builderIds.delete(builderId);
    return true;
  }

  get(builderId: string): ContextBuilder | undefined {
    return this.entries.find((e) => e.builder.id === builderId)?.builder;
  }

  has(builderId: string): boolean {
    return this.builderIds.has(builderId);
  }

  /**
   * List builders in deterministic assembly order:
   * priority ascending, then registration order.
   */
  list(): readonly ContextBuilder[] {
    return this.resolve();
  }

  /**
   * Resolve the ordered builder pipeline for the future Context Assembler.
   * Does not execute builders.
   */
  resolve(): readonly ContextBuilder[] {
    return this.entries
      .slice()
      .sort((a, b) => {
        const pa = a.builder.priority ?? DEFAULT_PRIORITY;
        const pb = b.builder.priority ?? DEFAULT_PRIORITY;
        if (pa !== pb) return pa - pb;
        return a.registrationOrder - b.registrationOrder;
      })
      .map((e) => e.builder);
  }

  /**
   * Close the registry. No further registrations.
   * Idempotent.
   */
  close(): void {
    this._closed = true;
  }

  /**
   * Remove all builders and reset closed state is intentionally not reset.
   * Clear empties builders only.
   */
  clear(): void {
    this.entries.length = 0;
    this.builderIds.clear();
  }
}

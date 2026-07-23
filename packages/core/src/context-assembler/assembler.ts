/**
 * ContextAssembler — only Core component that builds a complete immutable Context.
 *
 * Flow:
 *   resolve builders → run pipeline → merge fragments → Context(state=assembled)
 *
 * Merge semantics (deterministic, owned solely by the Assembler):
 * - instructions / messages / toolDefinitions / attachments: append in order
 * - variables / metadata: last-write-wins by key in builder/fragment order
 * - seed options applied before builder fragments
 * - input.metadata (if present) seeds metadata before option metadata
 *
 * Source of truth: docs/CORE.md (Context Assembler), docs/CONTRACTS.md (Context)
 */

import { createContext, type Context } from "../context/context.js";
import type { ContextBuilder } from "../context-builder/builder.js";
import type { ContextBuilderContext } from "../context-builder/context.js";
import type { ContextBuilderRegistry } from "../context-builder/registry.js";
import type { ContextFragment } from "../context-builder/result.js";
import {
  ContextAssemblerError,
  ContextAssemblerErrorCode,
} from "./errors.js";
import type { AssembleOptions, ContextAssemblerOptions } from "./options.js";
import { AssemblyPipeline } from "./pipeline.js";
import type { AssemblyResult } from "./result.js";

export class ContextAssembler {
  private readonly registry: ContextBuilderRegistry | undefined;
  private readonly defaultVariables: Readonly<Record<string, unknown>>;
  private readonly defaultMetadata: Readonly<Record<string, unknown>>;
  private readonly pipeline: AssemblyPipeline;

  constructor(options: ContextAssemblerOptions = {}) {
    this.registry = options.registry;
    this.defaultVariables = Object.freeze({ ...(options.variables ?? {}) });
    this.defaultMetadata = Object.freeze({ ...(options.metadata ?? {}) });
    this.pipeline = new AssemblyPipeline();
  }

  /**
   * Assemble an immutable Context from ordered Context Builders.
   *
   * Does not translate to provider requests.
   * Does not execute AI.
   * Does not mutate builders or their fragment outputs.
   */
  async assemble(
    input: ContextBuilderContext,
    options: AssembleOptions = {},
  ): Promise<AssemblyResult> {
    const builders = this.resolveBuilders(options);

    let collection;
    try {
      collection = await this.pipeline.run(builders, input);
    } catch (error) {
      if (error instanceof ContextAssemblerError) {
        throw error;
      }
      throw new ContextAssemblerError({
        code: ContextAssemblerErrorCode.ASSEMBLY_FAILED,
        message:
          error instanceof Error ? error.message : "Context assembly failed",
        turnId: input.turnId,
        sessionId: input.sessionId,
        runtimeId: input.runtimeId,
        cause: error,
      });
    }

    try {
      const context = this.merge(input, collection.fragments, options);
      return {
        context,
        builders: collection.builders,
        fragments: collection.fragments,
        builderResults: collection.builderResults,
      };
    } catch (error) {
      if (error instanceof ContextAssemblerError) {
        throw error;
      }
      throw new ContextAssemblerError({
        code: ContextAssemblerErrorCode.ASSEMBLY_FAILED,
        message:
          error instanceof Error ? error.message : "Context merge failed",
        turnId: input.turnId,
        sessionId: input.sessionId,
        runtimeId: input.runtimeId,
        cause: error,
      });
    }
  }

  private resolveBuilders(options: AssembleOptions): readonly ContextBuilder[] {
    if (options.builders !== undefined) {
      return options.builders;
    }
    if (this.registry === undefined) {
      throw new ContextAssemblerError({
        code: ContextAssemblerErrorCode.INVALID_OPTIONS,
        message:
          "No builders available: provide AssembleOptions.builders or a registry",
      });
    }
    return this.registry.resolve();
  }

  /**
   * Deterministic merge of fragments into a new Context.
   * Never mutates input fragments.
   */
  private merge(
    input: ContextBuilderContext,
    fragments: readonly ContextFragment[],
    options: AssembleOptions,
  ): Context {
    const instructions: string[] = [];
    const messages: ContextFragment["messages"] extends
      | readonly (infer M)[]
      | undefined
      ? M[]
      : never = [];
    const toolDefinitions: NonNullable<ContextFragment["toolDefinitions"]>[number][] =
      [];
    const attachments: NonNullable<ContextFragment["attachments"]>[number][] =
      [];
    const variables: Record<string, unknown> = {
      ...this.defaultVariables,
      ...(options.variables ?? {}),
    };
    const metadata: Record<string, unknown> = {
      ...(input.metadata ?? {}),
      ...this.defaultMetadata,
      ...(options.metadata ?? {}),
    };

    for (const fragment of fragments) {
      if (fragment.instructions !== undefined) {
        instructions.push(...fragment.instructions);
      }
      if (fragment.messages !== undefined) {
        messages.push(...fragment.messages);
      }
      if (fragment.toolDefinitions !== undefined) {
        toolDefinitions.push(...fragment.toolDefinitions);
      }
      if (fragment.attachments !== undefined) {
        attachments.push(...fragment.attachments);
      }
      if (fragment.variables !== undefined) {
        // last-write-wins
        Object.assign(variables, fragment.variables);
      }
      if (fragment.metadata !== undefined) {
        // last-write-wins
        Object.assign(metadata, fragment.metadata);
      }
    }

    return createContext({
      turnId: input.turnId,
      sessionId: input.sessionId,
      runtimeId: input.runtimeId,
      state: "assembled",
      instructions,
      messages,
      toolDefinitions,
      attachments,
      variables,
      metadata,
      ...(options.contextId !== undefined ? { id: options.contextId } : {}),
    });
  }
}

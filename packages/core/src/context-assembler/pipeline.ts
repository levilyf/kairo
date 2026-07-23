/**
 * AssemblyPipeline — runs ordered Context Builders and collects fragments.
 *
 * Does not merge into a Context. ContextAssembler owns merge semantics.
 * Fail-closed: a builder throw or invalid result aborts the pipeline.
 */

import type { ContextBuilder } from "../context-builder/builder.js";
import type { ContextBuilderContext } from "../context-builder/context.js";
import {
  assertContextBuilderResult,
  type ContextBuilderResult,
  type ContextFragment,
} from "../context-builder/result.js";
import {
  ContextAssemblerError,
  ContextAssemblerErrorCode,
} from "./errors.js";
import type { BuilderAssemblyRecord } from "./result.js";

export interface PipelineCollection {
  readonly builders: readonly ContextBuilder[];
  readonly fragments: readonly ContextFragment[];
  readonly builderResults: readonly BuilderAssemblyRecord[];
}

export class AssemblyPipeline {
  /**
   * Execute builders in the provided order and collect fragments.
   * Does not mutate builder outputs or the input context.
   */
  async run(
    builders: readonly ContextBuilder[],
    input: ContextBuilderContext,
  ): Promise<PipelineCollection> {
    const fragments: ContextFragment[] = [];
    const builderResults: BuilderAssemblyRecord[] = [];
    const ran: ContextBuilder[] = [];

    for (const builder of builders) {
      let result: ContextBuilderResult;
      try {
        result = await builder.build(input);
      } catch (error) {
        throw new ContextAssemblerError({
          code: ContextAssemblerErrorCode.BUILDER_FAILED,
          message:
            error instanceof Error
              ? error.message
              : `Context builder "${builder.id}" failed`,
          builderId: builder.id,
          turnId: input.turnId,
          sessionId: input.sessionId,
          runtimeId: input.runtimeId,
          cause: error,
        });
      }

      try {
        assertContextBuilderResult(result);
      } catch (error) {
        throw new ContextAssemblerError({
          code: ContextAssemblerErrorCode.INVALID_FRAGMENT,
          message:
            error instanceof Error
              ? error.message
              : `Context builder "${builder.id}" returned an invalid result`,
          builderId: builder.id,
          turnId: input.turnId,
          sessionId: input.sessionId,
          runtimeId: input.runtimeId,
          cause: error,
        });
      }

      // Shallow-copy fragment references into the collection; freeze happens at merge.
      for (const fragment of result.fragments) {
        fragments.push(fragment);
      }

      ran.push(builder);
      builderResults.push({
        builderId: builder.id,
        fragmentCount: result.fragments.length,
        ...(result.metadata !== undefined
          ? { metadata: Object.freeze({ ...result.metadata }) }
          : {}),
      });
    }

    return {
      builders: ran,
      fragments,
      builderResults,
    };
  }
}

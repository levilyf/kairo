/**
 * Context Builder system public surface.
 *
 * Builders contribute provider-neutral fragments.
 * The Context Assembler will combine them later.
 */

export {
  assertContextBuilder,
  type ContextBuilder,
} from "./builder.js";
export {
  ContextBuilderRegistry,
} from "./registry.js";
export {
  assertContextBuilderResult,
  createContextFragment,
  type ContextBuilderResult,
  type ContextFragment,
  type CreateContextFragmentInput,
} from "./result.js";
export type { ContextBuilderContext } from "./context.js";
export {
  ContextBuilderError,
  ContextBuilderErrorCode,
  type ContextBuilderErrorOptions,
} from "./errors.js";

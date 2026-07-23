/**
 * Context Assembler public surface.
 *
 * Only the Assembler produces a complete immutable Context from builder fragments.
 */

export { ContextAssembler } from "./assembler.js";
export { AssemblyPipeline, type PipelineCollection } from "./pipeline.js";
export type {
  AssemblyResult,
  BuilderAssemblyRecord,
} from "./result.js";
export type {
  AssembleOptions,
  ContextAssemblerOptions,
} from "./options.js";
export {
  ContextAssemblerError,
  ContextAssemblerErrorCode,
  type ContextAssemblerErrorOptions,
} from "./errors.js";

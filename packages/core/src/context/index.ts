/**
 * Context system public surface.
 *
 * Context is the immutable, provider-neutral execution input object.
 * Assembler / Gateway / Agent Loop attach later.
 */

export {
  Context,
  createContext,
  type ContextAttachment,
  type ContextContentPart,
  type ContextData,
  type ContextMessage,
  type ContextToolDefinition,
  type CreateContextInput,
} from "./context.js";
export {
  ContextFactory,
  type ContextFactoryOptions,
  type CreateTurnContextInput,
} from "./builder.js";
export {
  createContextMetadata,
  type ContextMetadata,
  type ContextMetadataInput,
} from "./metadata.js";
export type { ContextState } from "./state.js";
export {
  ContextError,
  ContextErrorCode,
  type ContextErrorOptions,
} from "./errors.js";

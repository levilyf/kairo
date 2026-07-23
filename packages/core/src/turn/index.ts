/**
 * Turn system public surface.
 *
 * Turn is the execution boundary for one request inside a Session.
 * The future Agent Loop executes exactly one Turn per loop run.
 */

export { Turn, type CompleteTurnInput, type TurnCancellationScope, type TurnOptions } from "./turn.js";
export { TurnManager, type TurnManagerOptions } from "./manager.js";
export {
  TurnBuilder,
  type CreateTurnInput,
  type TurnBuilderOptions,
} from "./builder.js";
export {
  createTurnMetadata,
  updateTurnMetadata,
  type TurnMetadata,
  type TurnMetadataInput,
} from "./metadata.js";
export type { TurnState } from "./state.js";
export {
  TurnError,
  TurnErrorCode,
  type TurnErrorOptions,
} from "./errors.js";

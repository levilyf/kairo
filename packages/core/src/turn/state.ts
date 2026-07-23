/**
 * Turn lifecycle state.
 *
 * This milestone implements lifecycle boundaries only; running/failed are
 * reserved for the future Agent Loop execution path.
 */

export type TurnState =
  | "created"
  | "running"
  | "completed"
  | "cancelled"
  | "failed";

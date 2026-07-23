/**
 * Context lifecycle state.
 *
 * This milestone only uses "created". Later assembler/gateway milestones may
 * mark assembled/consumed without changing Context immutability rules.
 */

export type ContextState = "created" | "assembled" | "consumed";

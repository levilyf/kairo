/**
 * ContextFactory — constructs empty/platform Context shells for a Turn.
 *
 * This is NOT the module-facing Context Builder contribution contract.
 * That lives in `context-builder/`. Assembler pipeline is a later milestone.
 *
 * Source of truth: docs/CONTRACTS.md (Context)
 */

import {
  createContext,
  type Context,
  type ContextAttachment,
  type ContextMessage,
  type ContextToolDefinition,
  type CreateContextInput,
} from "./context.js";

/**
 * Input accepted when a Turn creates its Context shell.
 * Ownership ids are supplied by the Turn, not the caller.
 */
export interface CreateTurnContextInput {
  readonly id?: string;
  readonly metadata?: Record<string, unknown>;
  readonly instructions?: readonly string[];
  readonly messages?: readonly ContextMessage[];
  readonly toolDefinitions?: readonly ContextToolDefinition[];
  readonly attachments?: readonly ContextAttachment[];
  readonly variables?: Readonly<Record<string, unknown>>;
}

export interface ContextFactoryOptions {
  readonly turnId: string;
  readonly sessionId: string;
  readonly runtimeId: string;
}

/**
 * Thin construction helper. Does not assemble, retrieve, or translate.
 * Not the module-facing Context Builder contribution contract
 * (`packages/core/src/context-builder`).
 */
export class ContextFactory {
  private readonly turnId: string;
  private readonly sessionId: string;
  private readonly runtimeId: string;

  constructor(options: ContextFactoryOptions) {
    this.turnId = options.turnId;
    this.sessionId = options.sessionId;
    this.runtimeId = options.runtimeId;
  }

  build(input: CreateTurnContextInput = {}): Context {
    const createInput: CreateContextInput = {
      turnId: this.turnId,
      sessionId: this.sessionId,
      runtimeId: this.runtimeId,
      ...(input.id !== undefined ? { id: input.id } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      ...(input.instructions !== undefined
        ? { instructions: input.instructions }
        : {}),
      ...(input.messages !== undefined ? { messages: input.messages } : {}),
      ...(input.toolDefinitions !== undefined
        ? { toolDefinitions: input.toolDefinitions }
        : {}),
      ...(input.attachments !== undefined
        ? { attachments: input.attachments }
        : {}),
      ...(input.variables !== undefined ? { variables: input.variables } : {}),
    };
    return createContext(createInput);
  }
}

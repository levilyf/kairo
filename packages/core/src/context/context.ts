/**
 * Context — immutable platform object for provider-bound execution input.
 *
 * Context is not a vendor request. Future Context Assembler will populate it;
 * Provider Gateway will translate it. This milestone only defines the object.
 *
 * Source of truth: docs/CORE.md, docs/CONTRACTS.md (Context)
 */

import { ContextError, ContextErrorCode } from "./errors.js";
import {
  createContextMetadata,
  type ContextMetadata,
} from "./metadata.js";
import type { ContextState } from "./state.js";

/** Provider-neutral message content part. Not a vendor schema. */
export interface ContextContentPart {
  readonly type: string;
  readonly text?: string;
  readonly [key: string]: unknown;
}

/** Provider-neutral message entry. Not OpenAI/Anthropic specific. */
export interface ContextMessage {
  readonly role: string;
  readonly content: readonly ContextContentPart[];
  readonly name?: string;
  readonly [key: string]: unknown;
}

/** Opaque tool definition placeholder for later assembler population. */
export type ContextToolDefinition = Readonly<Record<string, unknown>>;

/** Opaque attachment placeholder for later assembler population. */
export type ContextAttachment = Readonly<Record<string, unknown>>;

export interface ContextData {
  readonly instructions: readonly string[];
  readonly messages: readonly ContextMessage[];
  readonly toolDefinitions: readonly ContextToolDefinition[];
  readonly attachments: readonly ContextAttachment[];
  readonly variables: Readonly<Record<string, unknown>>;
}

export interface CreateContextInput {
  /** Optional explicit id. Generated when omitted. */
  readonly id?: string;
  readonly turnId: string;
  readonly sessionId: string;
  readonly runtimeId: string;
  readonly metadata?: Record<string, unknown>;
  readonly instructions?: readonly string[];
  readonly messages?: readonly ContextMessage[];
  readonly toolDefinitions?: readonly ContextToolDefinition[];
  readonly attachments?: readonly ContextAttachment[];
  readonly variables?: Readonly<Record<string, unknown>>;
  readonly state?: ContextState;
}

/**
 * Immutable Context value object.
 *
 * Construction freezes the instance and nested collections. There is no
 * mutation API — reassembly produces a new Context in a later milestone.
 */
export class Context {
  readonly id: string;
  readonly turnId: string;
  readonly sessionId: string;
  readonly runtimeId: string;
  readonly state: ContextState;
  readonly metadata: ContextMetadata;
  readonly instructions: readonly string[];
  readonly messages: readonly ContextMessage[];
  readonly toolDefinitions: readonly ContextToolDefinition[];
  readonly attachments: readonly ContextAttachment[];
  readonly variables: Readonly<Record<string, unknown>>;

  constructor(input: CreateContextInput) {
    validateOwnership(input);

    const id = input.id ?? generateContextId();
    if (id.trim().length === 0) {
      throw new ContextError({
        code: ContextErrorCode.INVALID_CONTEXT,
        message: "Context id must be a non-empty string",
        turnId: input.turnId,
        sessionId: input.sessionId,
        runtimeId: input.runtimeId,
        field: "id",
      });
    }

    this.id = id;
    this.turnId = input.turnId;
    this.sessionId = input.sessionId;
    this.runtimeId = input.runtimeId;
    this.state = input.state ?? "created";
    this.metadata = createContextMetadata({
      id,
      turnId: input.turnId,
      sessionId: input.sessionId,
      runtimeId: input.runtimeId,
      ...(input.metadata !== undefined ? { data: { ...input.metadata } } : {}),
    });
    this.instructions = Object.freeze([...(input.instructions ?? [])]);
    this.messages = Object.freeze(
      (input.messages ?? []).map((message) => freezeMessage(message)),
    );
    this.toolDefinitions = Object.freeze(
      (input.toolDefinitions ?? []).map((tool) =>
        Object.freeze({ ...tool }),
      ),
    );
    this.attachments = Object.freeze(
      (input.attachments ?? []).map((attachment) =>
        Object.freeze({ ...attachment }),
      ),
    );
    this.variables = Object.freeze({ ...(input.variables ?? {}) });

    Object.freeze(this);
  }
}

/**
 * Factory for Context instances. Prefer this over `new Context` at call sites.
 */
export function createContext(input: CreateContextInput): Context {
  return new Context(input);
}

function validateOwnership(input: CreateContextInput): void {
  if (input.turnId.trim().length === 0) {
    throw new ContextError({
      code: ContextErrorCode.INVALID_CONTEXT,
      message: "Context turnId must be a non-empty string",
      sessionId: input.sessionId,
      runtimeId: input.runtimeId,
      field: "turnId",
    });
  }
  if (input.sessionId.trim().length === 0) {
    throw new ContextError({
      code: ContextErrorCode.INVALID_CONTEXT,
      message: "Context sessionId must be a non-empty string",
      turnId: input.turnId,
      runtimeId: input.runtimeId,
      field: "sessionId",
    });
  }
  if (input.runtimeId.trim().length === 0) {
    throw new ContextError({
      code: ContextErrorCode.INVALID_CONTEXT,
      message: "Context runtimeId must be a non-empty string",
      turnId: input.turnId,
      sessionId: input.sessionId,
      field: "runtimeId",
    });
  }
}

function freezeMessage(message: ContextMessage): ContextMessage {
  const content = Object.freeze(
    message.content.map((part) => Object.freeze({ ...part })),
  );
  const frozen: ContextMessage = Object.freeze({
    ...message,
    content,
  });
  return frozen;
}

function generateContextId(): string {
  const rand =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `context-${rand}`;
}

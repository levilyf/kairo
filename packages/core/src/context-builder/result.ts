/**
 * Context Builder results — provider-neutral contribution fragments.
 *
 * Fragments are pieces, not a final Context. The future Context Assembler
 * merges fragments into an immutable Context.
 *
 * Source of truth: docs/CONTRACTS.md (Context Builder / Context)
 */

import type {
  ContextAttachment,
  ContextMessage,
  ContextToolDefinition,
} from "../context/context.js";
import {
  ContextBuilderError,
  ContextBuilderErrorCode,
} from "./errors.js";

/**
 * One provider-neutral contribution piece.
 * All fields optional — builders contribute only what they own.
 */
export interface ContextFragment {
  readonly instructions?: readonly string[];
  readonly messages?: readonly ContextMessage[];
  readonly toolDefinitions?: readonly ContextToolDefinition[];
  readonly attachments?: readonly ContextAttachment[];
  readonly variables?: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Result returned by a Context Builder.
 */
export interface ContextBuilderResult {
  readonly fragments: readonly ContextFragment[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface CreateContextFragmentInput {
  readonly instructions?: readonly string[];
  readonly messages?: readonly ContextMessage[];
  readonly toolDefinitions?: readonly ContextToolDefinition[];
  readonly attachments?: readonly ContextAttachment[];
  readonly variables?: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Create a frozen ContextFragment. Does not assemble a Context.
 */
export function createContextFragment(
  input: CreateContextFragmentInput = {},
): ContextFragment {
  const fragment: ContextFragment = Object.freeze({
    ...(input.instructions !== undefined
      ? { instructions: Object.freeze([...input.instructions]) }
      : {}),
    ...(input.messages !== undefined
      ? {
          messages: Object.freeze(
            input.messages.map((message) =>
              Object.freeze({
                ...message,
                content: Object.freeze(
                  message.content.map((part) => Object.freeze({ ...part })),
                ),
              }),
            ),
          ),
        }
      : {}),
    ...(input.toolDefinitions !== undefined
      ? {
          toolDefinitions: Object.freeze(
            input.toolDefinitions.map((tool) => Object.freeze({ ...tool })),
          ),
        }
      : {}),
    ...(input.attachments !== undefined
      ? {
          attachments: Object.freeze(
            input.attachments.map((attachment) =>
              Object.freeze({ ...attachment }),
            ),
          ),
        }
      : {}),
    ...(input.variables !== undefined
      ? { variables: Object.freeze({ ...input.variables }) }
      : {}),
    ...(input.metadata !== undefined
      ? { metadata: Object.freeze({ ...input.metadata }) }
      : {}),
  });
  return fragment;
}

/**
 * Validate a builder result shape. Does not assemble or execute.
 */
export function assertContextBuilderResult(
  value: unknown,
): asserts value is ContextBuilderResult {
  if (!isPlainObject(value)) {
    throw new ContextBuilderError({
      code: ContextBuilderErrorCode.INVALID_RESULT,
      message: "ContextBuilderResult must be an object",
    });
  }

  if (!Array.isArray(value.fragments)) {
    throw new ContextBuilderError({
      code: ContextBuilderErrorCode.INVALID_RESULT,
      message: "fragments must be an array",
      field: "fragments",
    });
  }

  for (let i = 0; i < value.fragments.length; i++) {
    const fragment = value.fragments[i];
    if (!isPlainObject(fragment)) {
      throw new ContextBuilderError({
        code: ContextBuilderErrorCode.INVALID_RESULT,
        message: `fragments[${i}] must be an object`,
        field: `fragments[${i}]`,
      });
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

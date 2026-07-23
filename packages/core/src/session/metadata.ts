/**
 * Session metadata — platform-level identity and extension metadata.
 *
 * Core owns stable fields and carries opaque extension data without
 * interpreting domain meaning.
 */

export interface SessionMetadata {
  readonly id: string;
  readonly runtimeId: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface SessionMetadataInput {
  id: string;
  runtimeId: string;
  createdAt?: number;
  updatedAt?: number;
  data?: Record<string, unknown>;
}

export function createSessionMetadata(
  input: SessionMetadataInput,
): SessionMetadata {
  const createdAt = input.createdAt ?? Date.now();
  return Object.freeze({
    id: input.id,
    runtimeId: input.runtimeId,
    createdAt,
    updatedAt: input.updatedAt ?? createdAt,
    data: Object.freeze({ ...(input.data ?? {}) }),
  });
}

export function updateSessionMetadata(
  metadata: SessionMetadata,
  updates: {
    updatedAt?: number;
    data?: Record<string, unknown>;
  } = {},
): SessionMetadata {
  return Object.freeze({
    ...metadata,
    updatedAt: updates.updatedAt ?? Date.now(),
    data: Object.freeze({ ...(updates.data ?? metadata.data) }),
  });
}

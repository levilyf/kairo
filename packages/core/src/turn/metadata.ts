/**
 * Turn metadata — platform-level identity and opaque extension data.
 */

export interface TurnMetadata {
  readonly id: string;
  readonly sessionId: string;
  readonly runtimeId: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface TurnMetadataInput {
  id: string;
  sessionId: string;
  runtimeId: string;
  createdAt?: number;
  updatedAt?: number;
  data?: Record<string, unknown>;
}

export function createTurnMetadata(input: TurnMetadataInput): TurnMetadata {
  const createdAt = input.createdAt ?? Date.now();
  return Object.freeze({
    id: input.id,
    sessionId: input.sessionId,
    runtimeId: input.runtimeId,
    createdAt,
    updatedAt: input.updatedAt ?? createdAt,
    data: Object.freeze({ ...(input.data ?? {}) }),
  });
}

export function updateTurnMetadata(
  metadata: TurnMetadata,
  updates: {
    updatedAt?: number;
    data?: Record<string, unknown>;
  } = {},
): TurnMetadata {
  return Object.freeze({
    ...metadata,
    updatedAt: updates.updatedAt ?? Date.now(),
    data: Object.freeze({ ...(updates.data ?? metadata.data) }),
  });
}

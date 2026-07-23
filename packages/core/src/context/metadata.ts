/**
 * Context metadata — platform-level identity and opaque extension data.
 */

export interface ContextMetadata {
  readonly id: string;
  readonly turnId: string;
  readonly sessionId: string;
  readonly runtimeId: string;
  readonly createdAt: number;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface ContextMetadataInput {
  id: string;
  turnId: string;
  sessionId: string;
  runtimeId: string;
  createdAt?: number;
  data?: Record<string, unknown>;
}

export function createContextMetadata(
  input: ContextMetadataInput,
): ContextMetadata {
  return Object.freeze({
    id: input.id,
    turnId: input.turnId,
    sessionId: input.sessionId,
    runtimeId: input.runtimeId,
    createdAt: input.createdAt ?? Date.now(),
    data: Object.freeze({ ...(input.data ?? {}) }),
  });
}

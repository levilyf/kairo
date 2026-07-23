/**
 * Runtime metadata — identity of an execution host instance.
 *
 * Distinct from HarnessMetadata (product composition identity).
 */

export interface RuntimeMetadata {
  /** Stable id for this runtime instance. */
  readonly id: string;
  /** Harness product name the runtime is executing. */
  readonly harnessName: string;
  /** Harness product version. */
  readonly harnessVersion: string;
  /** Core contract version from the harness definition. */
  readonly coreVersion: string;
  /** Epoch milliseconds when the runtime became ready. */
  readonly createdAt: number;
}

export interface RuntimeMetadataInput {
  id: string;
  harnessName: string;
  harnessVersion: string;
  coreVersion: string;
  createdAt?: number;
}

export function createRuntimeMetadata(
  input: RuntimeMetadataInput,
): RuntimeMetadata {
  return Object.freeze({
    id: input.id,
    harnessName: input.harnessName,
    harnessVersion: input.harnessVersion,
    coreVersion: input.coreVersion,
    createdAt: input.createdAt ?? Date.now(),
  });
}

/**
 * Harness product metadata.
 *
 * Captures identity and intent — not runtime behavior.
 * docs/HARNESS.md: intent drives composition choices.
 */

export interface HarnessMetadata {
  /** Product / harness name. */
  readonly name: string;
  /** Harness version (not Core version). */
  readonly version: string;
  /** Short description of the product shape. */
  readonly description: string;
  /**
   * Intent statement: who it serves, what jobs it performs,
   * what it refuses to do. Documentation-first, composition-guiding.
   */
  readonly intent: string;
}

export interface HarnessMetadataInput {
  name: string;
  version?: string;
  description?: string;
  intent?: string;
}

export function createHarnessMetadata(
  input: HarnessMetadataInput,
): HarnessMetadata {
  return Object.freeze({
    name: input.name,
    version: input.version ?? "0.0.0",
    description: input.description ?? "",
    intent: input.intent ?? "",
  });
}

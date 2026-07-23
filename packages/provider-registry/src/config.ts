/**
 * Reading helpers for the opaque per-provider config block.
 *
 * @kairo/config types every provider entry as an opaque
 * `Readonly<Record<string, unknown>>`. The registry owns exactly two
 * reserved keys on that block:
 *
 *   - `models?: string[]`        — explicit list of models the provider serves.
 *   - `defaultModel?: string`    — the provider's own preferred model.
 *
 * Everything else in the block is forwarded untouched to the factory.
 * These helpers perform only the minimal narrowing the registry needs and
 * never mutate the input.
 */

import {
  ProviderRegistryError,
  ProviderRegistryErrorCode,
} from "./errors.js";

/**
 * Extracts the optional `models` array from a provider config block.
 * Returns an empty readonly array when absent. Throws a typed error
 * when the field is present but not a string array.
 */
export function readModels(
  block: Readonly<Record<string, unknown>>,
  providerId: string,
): readonly string[] {
  const raw = block["models"];
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new ProviderRegistryError({
      code: ProviderRegistryErrorCode.INVALID_CONFIG,
      message: `provider "${providerId}": "models" must be an array of strings`,
      providerId,
    });
  }
  const result: string[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const item = raw[i];
    if (typeof item !== "string") {
      throw new ProviderRegistryError({
        code: ProviderRegistryErrorCode.INVALID_CONFIG,
        message: `provider "${providerId}": "models[${i}]" must be a string`,
        providerId,
      });
    }
    const trimmed = item.trim();
    if (trimmed.length === 0) {
      throw new ProviderRegistryError({
        code: ProviderRegistryErrorCode.INVALID_CONFIG,
        message: `provider "${providerId}": "models[${i}]" must not be empty`,
        providerId,
      });
    }
    result.push(trimmed);
  }
  return result;
}

/**
 * Extracts the optional `defaultModel` string from a provider config
 * block. Returns `undefined` when absent. Throws a typed error when the
 * field is present but not a non-empty string.
 */
export function readDefaultModel(
  block: Readonly<Record<string, unknown>>,
  providerId: string,
): string | undefined {
  const raw = block["defaultModel"];
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string") {
    throw new ProviderRegistryError({
      code: ProviderRegistryErrorCode.INVALID_CONFIG,
      message: `provider "${providerId}": "defaultModel" must be a string`,
      providerId,
    });
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new ProviderRegistryError({
      code: ProviderRegistryErrorCode.INVALID_CONFIG,
      message: `provider "${providerId}": "defaultModel" must not be empty`,
      providerId,
    });
  }
  return trimmed;
}

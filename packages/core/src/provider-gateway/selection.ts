/**
 * Provider selection — resolve which Provider to invoke.
 *
 * Explicit providerId wins. If omitted and exactly one provider is registered,
 * that provider is selected. Otherwise selection fails closed.
 */

import type { Provider } from "../contracts/provider.js";
import type { ProviderRegistry } from "../registries/provider-registry.js";
import {
  ProviderGatewayError,
  ProviderGatewayErrorCode,
  type ProviderGatewayErrorOptions,
} from "./errors.js";

export interface ProviderSelectionInput {
  readonly providerId?: string;
  readonly providers: ProviderRegistry;
  readonly sessionId?: string;
  readonly turnId?: string;
  readonly runtimeId?: string;
}

export interface ProviderSelection {
  readonly provider: Provider;
  readonly providerId: string;
}

export function selectProvider(input: ProviderSelectionInput): ProviderSelection {
  const attribution = pickAttribution(input);

  if (input.providerId !== undefined) {
    if (input.providerId.trim().length === 0) {
      throw new ProviderGatewayError({
        code: ProviderGatewayErrorCode.INVALID_INVOCATION,
        message: "providerId must be a non-empty string when provided",
        field: "providerId",
        ...attribution,
      });
    }

    const provider = input.providers.get(input.providerId);
    if (provider === undefined) {
      throw new ProviderGatewayError({
        code: ProviderGatewayErrorCode.PROVIDER_NOT_FOUND,
        message: `Provider "${input.providerId}" was not found`,
        providerId: input.providerId,
        ...attribution,
      });
    }

    return { provider, providerId: provider.id };
  }

  const listed = input.providers.list();
  if (listed.length === 0) {
    throw new ProviderGatewayError({
      code: ProviderGatewayErrorCode.PROVIDER_NOT_FOUND,
      message: "No providers are registered",
      ...attribution,
    });
  }

  if (listed.length > 1) {
    throw new ProviderGatewayError({
      code: ProviderGatewayErrorCode.AMBIGUOUS_PROVIDER,
      message:
        "Multiple providers are registered; provide an explicit providerId",
      ...attribution,
      details: { providerIds: listed.map((p) => p.id) },
    });
  }

  const only = listed[0]!;
  return { provider: only, providerId: only.id };
}

function pickAttribution(
  input: ProviderSelectionInput,
): Pick<ProviderGatewayErrorOptions, "sessionId" | "turnId" | "runtimeId"> {
  return {
    ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
    ...(input.turnId !== undefined ? { turnId: input.turnId } : {}),
    ...(input.runtimeId !== undefined ? { runtimeId: input.runtimeId } : {}),
  };
}

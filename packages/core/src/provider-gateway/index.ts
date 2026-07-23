/**
 * Provider Gateway public surface.
 *
 * Sole Core path to Provider.complete() and Provider.stream().
 * Provider-neutral adapter boundary.
 */

export {
  ProviderGateway,
  type ProviderGatewayOptions,
  type ProviderInvokeInput,
} from "./gateway.js";
export {
  translateContextToProviderRequest,
  type TranslateOptions,
} from "./translator.js";
export {
  selectProvider,
  type ProviderSelection,
  type ProviderSelectionInput,
} from "./selection.js";
export {
  assertProviderResponse,
  type ProviderGatewayResult,
  type ProviderGatewayStreamEvent,
  type ProviderInvocation,
} from "./result.js";
export {
  ProviderGatewayError,
  ProviderGatewayErrorCode,
  type ProviderGatewayErrorOptions,
} from "./errors.js";

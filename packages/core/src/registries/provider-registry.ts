/**
 * Provider registry — lookup only.
 * Does not invoke providers.
 */

import { assertProvider, type Provider } from "../contracts/provider.js";
import { Registry } from "./registry.js";

export class ProviderRegistry extends Registry<Provider> {
  constructor() {
    super("provider", assertProvider);
  }
}

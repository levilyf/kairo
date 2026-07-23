/**
 * Static knowledge the CLI keeps about each built-in provider's
 * self-setup wizard.
 *
 * This catalog is the *only* layer permitted to know provider-specific
 * setup details (whether an api key is required, whether a base URL is
 * configurable). The actual provider construction still goes through
 * @kairo/app — this catalog simply drives which prompts to show.
 *
 * The catalog MUST match `BUILTIN_PROVIDERS` ids in @kairo/app. We
 * keep them in sync manually (the entries below directly mirror the
 * 9 built-in providers).
 */

export interface ProviderCatalogEntry {
  readonly id: string;
  readonly displayName: string;
  /** Whether an API key is required (local providers are keyless). */
  readonly apiKeyRequired: boolean;
  /** Base URL used for OpenAI-compatible model discovery. */
  readonly discoveryBaseUrl: string;
  /** Default base URL, if configurable (local providers ask this). */
  readonly defaultBaseUrl?: string;
}

export const PROVIDER_CATALOG: readonly ProviderCatalogEntry[] =
  Object.freeze([
    {
      id: "openai",
      displayName: "OpenAI",
      apiKeyRequired: true,
      discoveryBaseUrl: "https://api.openai.com/v1",
    },
    {
      id: "nvidia",
      displayName: "NVIDIA",
      apiKeyRequired: true,
      discoveryBaseUrl: "https://integrate.api.nvidia.com/v1",
    },
    {
      id: "openrouter",
      displayName: "OpenRouter",
      apiKeyRequired: true,
      discoveryBaseUrl: "https://openrouter.ai/api/v1",
    },
    {
      id: "groq",
      displayName: "Groq",
      apiKeyRequired: true,
      discoveryBaseUrl: "https://api.groq.com/openai/v1",
    },
    {
      id: "fireworks",
      displayName: "Fireworks",
      apiKeyRequired: true,
      discoveryBaseUrl: "https://api.fireworks.ai/inference/v1",
    },
    {
      id: "together",
      displayName: "Together",
      apiKeyRequired: true,
      discoveryBaseUrl: "https://api.together.xyz/v1",
    },
    {
      id: "deepinfra",
      displayName: "DeepInfra",
      apiKeyRequired: true,
      discoveryBaseUrl: "https://api.deepinfra.com/v1/openai",
    },
    {
      id: "ollama",
      displayName: "Ollama",
      apiKeyRequired: false,
      discoveryBaseUrl: "http://localhost:11434/v1",
      defaultBaseUrl: "http://localhost:11434/v1",
    },
    {
      id: "lmstudio",
      displayName: "LM Studio",
      apiKeyRequired: false,
      discoveryBaseUrl: "http://localhost:1234/v1",
      defaultBaseUrl: "http://localhost:1234/v1",
    },
  ]);

/** Lookup helpers used by `provider add` etc. */
export function getProviderCatalogEntry(id: string): ProviderCatalogEntry {
  const entry = PROVIDER_CATALOG.find((p) => p.id === id);
  if (entry === undefined) {
    throw new RangeError(`Unknown built-in provider "${id}"`);
  }
  return entry;
}

export function isKnownProvider(id: string): boolean {
  return PROVIDER_CATALOG.some((p) => p.id === id);
}

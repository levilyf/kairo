/**
 * OpenAI-compatible model discovery for first-time provider setup.
 *
 * This is intentionally small and isolated: provider packages do not expose
 * a model-catalog contract, and Core's Provider contract deliberately has no
 * `listModels()` method. The CLI needs discovery only to reduce setup
 * friction during `kairo provider add`, so the HTTP call lives here.
 *
 * No health checks, retries, streaming, chat/completions, or protocol
 * mapping. One GET request to `<baseURL>/models`, parse `{ data: [{ id }] }`,
 * return sorted ids. Callers fall back to manual entry on any failure.
 */

export interface DiscoverModelsOptions {
  readonly providerId: string;
  readonly baseURL: string;
  readonly apiKey?: string;
  readonly timeoutMs?: number;
}

export class ModelDiscoveryError extends Error {
  readonly providerId: string;
  declare readonly status?: number;
  declare readonly cause?: unknown;

  constructor(options: {
    readonly providerId: string;
    readonly message: string;
    readonly status?: number;
    readonly cause?: unknown;
  }) {
    super(options.message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "ModelDiscoveryError";
    this.providerId = options.providerId;
    if (options.status !== undefined) this.status = options.status;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

export async function discoverModels(
  options: DiscoverModelsOptions,
): Promise<readonly string[]> {
  const url = joinUrl(options.baseURL, "models");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
  try {
    const headers: Record<string, string> = { accept: "application/json" };
    if (options.apiKey !== undefined && options.apiKey.trim().length > 0) {
      headers.authorization = `Bearer ${options.apiKey}`;
    }
    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new ModelDiscoveryError({
        providerId: options.providerId,
        status: response.status,
        message: `Model discovery failed with HTTP ${response.status}`,
      });
    }
    const body: unknown = await response.json();
    const models = parseModelIds(body);
    if (models.length === 0) {
      throw new ModelDiscoveryError({
        providerId: options.providerId,
        message: "Model discovery returned no models",
      });
    }
    return Object.freeze(models);
  } catch (cause) {
    if (cause instanceof ModelDiscoveryError) throw cause;
    throw new ModelDiscoveryError({
      providerId: options.providerId,
      message: cause instanceof Error ? cause.message : "Model discovery failed",
      ...(cause instanceof Error ? { cause } : {}),
    });
  } finally {
    clearTimeout(timeout);
  }
}

function parseModelIds(body: unknown): string[] {
  if (body === null || typeof body !== "object") return [];
  const data = (body as { readonly data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  const ids: string[] = [];
  for (const item of data) {
    if (item === null || typeof item !== "object") continue;
    const id = (item as { readonly id?: unknown }).id;
    if (typeof id !== "string") continue;
    const trimmed = id.trim();
    if (trimmed.length > 0 && !ids.includes(trimmed)) ids.push(trimmed);
  }
  return ids.sort((a, b) => a.localeCompare(b));
}

function joinUrl(base: string, segment: string): string {
  const trimmed = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${trimmed}/${segment}`;
}

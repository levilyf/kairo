/**
 * Connected provider setup flow.
 *
 * Keeps `kairo provider add` short and visually connected. The flow asks
 * only for values it cannot determine automatically: API key (when
 * required), base URL for local providers, and default model. It attempts
 * OpenAI-compatible `/models` discovery and falls back to manual model
 * entry when discovery is unavailable.
 */

import type { CLIContext } from "../context.js";
import { ConnectedFlow } from "../ui/index.js";
import type { ProviderCatalogEntry } from "../provider-catalog.js";
import { discoverModels } from "../model-discovery.js";

/** Fields collected by the wizard. */
export interface ProviderAnswers {
  readonly apiKey?: string;
  readonly apiKeyStorage?: ApiKeyStorage;
  readonly baseUrl?: string;
  readonly models: readonly string[];
  readonly defaultModel: string;
  readonly discoveredModels: boolean;
}

/** Where the user wants to store an API key. */
export type ApiKeyStorage = "env" | "config" | "skip";

export async function collectProviderSetup(
  ctx: CLIContext,
  entry: ProviderCatalogEntry,
): Promise<ProviderAnswers> {
  const flow = new ConnectedFlow(ctx, `Configure ${entry.displayName}`);

  let apiKey: string | undefined;
  if (entry.apiKeyRequired) {
    apiKey = await flow.prompt("API Key", {
      description: `Paste your ${entry.displayName} API key.`,
      required: { message: "API Key is required for this provider." },
    });
  }

  let baseUrl: string | undefined;
  if (entry.defaultBaseUrl !== undefined) {
    baseUrl = await flow.prompt("Base URL", {
      description: `Default ${entry.defaultBaseUrl}`,
      default: entry.defaultBaseUrl,
    });
  }

  const discoveryBaseUrl = baseUrl ?? entry.discoveryBaseUrl;
  let models: readonly string[];
  let discoveredModels = false;
  try {
    models = await discoverModels({
      providerId: entry.id,
      baseURL: discoveryBaseUrl,
      ...(apiKey !== undefined ? { apiKey } : {}),
    });
    discoveredModels = true;
    if (apiKey !== undefined) flow.complete("API key validated");
    flow.complete(`Retrieved ${models.length} model${models.length === 1 ? "" : "s"}`);
  } catch {
    flow.info("Model discovery unavailable; continuing manually");
    models = await collectModelsManually(flow);
  }

  const defaultModel = await flow.select("Default model", models);
  flow.complete(`Default model: ${defaultModel}`);

  let apiKeyStorage: ApiKeyStorage | undefined;
  if (entry.apiKeyRequired && apiKey !== undefined) {
    apiKeyStorage = await collectApiKeyStorage(ctx, flow);
    flow.complete(apiKeyStorage === "env" ? "API key will be stored in .env" : apiKeyStorage === "config" ? "API key will be stored in config.json" : "API key storage skipped");
  }

  return {
    ...(apiKey !== undefined ? { apiKey } : {}),
    ...(apiKeyStorage !== undefined ? { apiKeyStorage } : {}),
    ...(baseUrl !== undefined ? { baseUrl } : {}),
    models,
    defaultModel,
    discoveredModels,
  };
}

/** Where to store an API key (env file / config / skip). */
export async function collectApiKeyStorage(
  _ctx: CLIContext,
  flow?: ConnectedFlow,
): Promise<ApiKeyStorage> {
  if (flow !== undefined) {
    const value = await flow.select("Store API key", [
      ".env file (recommended)",
      "config.json",
      "Skip",
    ]);
    if (value.startsWith(".env")) return "env";
    if (value.startsWith("config")) return "config";
    return "skip";
  }
  // Fallback for older callers/tests that invoke this helper directly.
  const fallback = new ConnectedFlow(_ctx, "Store API key");
  return collectApiKeyStorage(_ctx, fallback);
}

async function collectModelsManually(flow: ConnectedFlow): Promise<readonly string[]> {
  const value = await flow.prompt("Models", {
    description: "Enter model IDs, comma separated.",
    required: { message: "At least one model is required." },
  });
  const models = value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (models.length === 0) return collectModelsManually(flow);
  flow.complete(`Imported ${models.length} model${models.length === 1 ? "" : "s"}`);
  return Object.freeze(models);
}

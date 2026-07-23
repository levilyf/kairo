/**
 * `kairo provider` — list/add/configure/remove subcommands.
 *
 * List: print configured providers + their models + default model.
 *   Source: read directly from `app.config.providers[id]` (the per-
 *   provider config block). We use the brief's reserved keys
 *   ("models?: string[]" and "defaultModel?: string") plus the
 *   provider's listing on `app.providers`. This deliberately reads
 *   raw config rather than routing through `@kairo/provider-registry`
 *   helpers — the CLI is authorized to know its own project file.
 *
 * Add: re-run the interactive setup wizard if the provider is not
 *   already configured. Save the result into .kairo/config.json; if
 *   the user picked ".env", writes a `PROVIDER_API_KEY=...` line into
 *   `.env` and substitutes `${PROVIDER_API_KEY}` in the config block.
 *
 * Configure: re-run the wizard for an existing provider. No reinstall.
 *
 * Remove: drop the provider block; if the provider's defaultModel
 *   equals the project's top-level default `model`, ask the user
 *   whether to pick a new default from the remaining providers.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";

import type { CLIContext } from "../context.js";
import { CLIError, CLIErrorCode } from "../errors.js";
import {
  assertConfigPresent,
  readMutableConfig,
  writeMutableConfig,
} from "../config-file.js";
import {
  PROVIDER_CATALOG,
  getProviderCatalogEntry,
  isKnownProvider,
  type ProviderCatalogEntry,
} from "../provider-catalog.js";
import { collectProviderSetup } from "../prompts/index.js";
import { loadApplication } from "../bootstrap.js";
import {
  heading,
  text,
  muted,
  success,
  table,
  emptyState,
  withSpinner,
  prompt,
} from "../ui/index.js";
import type { Command, CommandMetadata } from "./types.js";
import type { MutableKairoConfig } from "../config-file.js";

export const providerMetadata: CommandMetadata = {
  name: "provider",
  summary: "Manage configured providers",
  usage: "kairo provider <list | add | configure | remove> [provider]",
  description:
    "Sub-commands: list configured providers, add a new provider via the interactive setup wizard, re-run setup for an existing provider, or remove a configured one.",
};

function isLocalEntry(entry: ProviderCatalogEntry): boolean {
  return !entry.apiKeyRequired;
}

function readProviderModels(
  block: Record<string, unknown> | undefined,
): readonly string[] {
  if (block === undefined) return [];
  const raw = block["models"];
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is string => typeof s === "string");
}

function readProviderDefault(
  block: Record<string, unknown> | undefined,
): string | undefined {
  if (block === undefined) return undefined;
  const raw = block["defaultModel"];
  return typeof raw === "string" ? raw : undefined;
}

export const providerCommand: Command = {
  metadata: providerMetadata,
  async run(ctx: CLIContext): Promise<number> {
    // Nested help: `kairo provider --help` / `-h` (any position among args).
    // Match chat/run: inspect-only, exit 0, never treat flags as subcommands.
    if (ctx.args.includes("--help") || ctx.args.includes("-h")) {
      printProviderHelp(ctx);
      return 0;
    }

    const subcommand = ctx.args[0] ?? "list";
    switch (subcommand) {
      case "list":
        return runProviderList(ctx);
      case "add":
        return runProviderAdd(ctx);
      case "configure":
        return runProviderConfigure(ctx);
      case "remove":
        return runProviderRemove(ctx);
      default:
        throw new CLIError({
          code: CLIErrorCode.UNKNOWN_COMMAND,
          message: `Unknown provider subcommand: ${subcommand}`,
          hint: "Run: kairo provider --help",
        });
    }
  },
};

function printProviderHelp(ctx: CLIContext): void {
  heading(ctx, "provider");
  text(ctx, providerMetadata.description ?? providerMetadata.summary);
  ctx.stdout("");
  muted(ctx, "Usage:");
  text(ctx, providerMetadata.usage ?? "kairo provider <subcommand>", {
    indent: 0,
  });
  ctx.stdout("");
  muted(ctx, "Subcommands:");
  muted(ctx, "  list                 List configured providers and defaults");
  muted(ctx, "  add <provider>       Add a provider via the interactive wizard");
  muted(
    ctx,
    "  configure <provider> Re-run setup for an existing provider",
  );
  muted(ctx, "  remove <provider>    Remove a configured provider");
  ctx.stdout("");
  muted(ctx, "Examples:");
  muted(ctx, "  kairo provider list");
  muted(ctx, "  kairo provider add openai");
  muted(ctx, "  kairo provider configure ollama");
  muted(ctx, "  kairo provider remove groq");
}

async function runProviderList(ctx: CLIContext): Promise<number> {
  // We use the application to verify the configured providers actually
  // boot; otherwise the table could list providers whose block fails
  // validation.
  const { app } = await withSpinner(
    ctx,
    "Loading configuration...",
    "Configuration loaded",
    () => loadApplication(ctx),
  );
  const providerIds: readonly string[] = app.providers.map((p) => p.id);
  if (providerIds.length === 0) {
    ctx.stdout("");
    emptyState(ctx, "providers", "kairo provider add <provider>");
    return 0;
  }
  const blocks = app.config.providers ?? {};
  heading(ctx, "Providers");
  const rows = providerIds.map((id) => {
    const block = blocks[id] as Record<string, unknown> | undefined;
    const models = readProviderModels(block);
    const defaultModel = readProviderDefault(block);
    const modelsCount = models.length === 0 ? "0" : String(models.length);
    const defaultCell = defaultModel ?? "-";
    const display = PROVIDER_CATALOG.find((p) => p.id === id)?.displayName ??
      id;
    return [display, modelsCount, defaultCell] as const;
  });
  table(ctx, {
    columns: ["Provider", "Models", "Default"],
    rows: rows.map((r) => [...r]),
  });
  return 0;
}

async function runProviderAdd(ctx: CLIContext): Promise<number> {
  const id = ctx.args[1];
  if (id === undefined || id.length === 0) {
    throw new CLIError({
      code: CLIErrorCode.UNKNOWN_COMMAND,
      message: "Provider id is required.",
      hint: "Run: kairo provider --help",
    });
  }
  if (!isKnownProvider(id)) {
    throw new CLIError({
      code: CLIErrorCode.PROVIDER_NOT_FOUND,
      message: `Unknown built-in provider: ${id}`,
      hint: "Run: kairo provider --help",
    });
  }
  const entry = getProviderCatalogEntry(id);

  const data = await readMutableConfig(ctx);
  assertConfigPresent(data, ctx);
  const { config, absPath } = data;

  if (
    config.providers !== undefined &&
    config.providers[id] !== undefined
  ) {
    throw new CLIError({
      code: CLIErrorCode.PROVIDER_ALREADY_EXISTS,
      message: `Provider "${id}" is already configured.`,
      hint: `Run: kairo provider configure ${id}`,
    });
  }

  const answers = await collectProviderSetup(ctx, entry);

  const block: Record<string, unknown> = {};
  if (entry.defaultBaseUrl !== undefined) {
    block.baseURL = answers.baseUrl;
  }
  block.models = [...answers.models];
  block.defaultModel = answers.defaultModel;

  let nextDefaultModel = config.model;
  let envLine: string | undefined;

  if (entry.apiKeyRequired && answers.apiKey !== undefined) {
    const storage = answers.apiKeyStorage ?? "env";
    const envVarName = `${id.toUpperCase().replace(/-/g, "_")}_API_KEY`;
    if (storage === "env") {
      envLine = `${envVarName}=${answers.apiKey}`;
      block.apiKey = `\${${envVarName}}`;
    } else if (storage === "config") {
      block.apiKey = answers.apiKey;
    } else {
      // skip
      block.apiKey = "";
    }
  }

  if (config.providers === undefined) {
    config.providers = {};
  }
  config.providers[id] = block;

  // Pick a default model if no project-level default exists.
  if (
    (config.model === undefined || config.model === null) &&
    answers.defaultModel.length > 0
  ) {
    config.model = answers.defaultModel;
    nextDefaultModel = answers.defaultModel;
  }

  await writeMutableConfig(ctx, absPath, config);

  if (envLine !== undefined) {
    const envPath = path.resolve(path.dirname(absPath), "..", ".env");
    await appendEnvLine(envPath, envLine);
  }

  renderProviderConfigured(ctx, entry.displayName, {
    apiKeyStored: entry.apiKeyRequired,
    modelsImported: answers.models.length,
    defaultModel: answers.defaultModel,
  });
  return 0;
}

async function runProviderConfigure(ctx: CLIContext): Promise<number> {
  const id = ctx.args[1];
  if (id === undefined || id.length === 0) {
    throw new CLIError({
      code: CLIErrorCode.UNKNOWN_COMMAND,
      message: "Provider id is required.",
      hint: "Run: kairo provider --help",
    });
  }
  if (!isKnownProvider(id)) {
    throw new CLIError({
      code: CLIErrorCode.PROVIDER_NOT_FOUND,
      message: `Unknown built-in provider: ${id}`,
      hint: "Run: kairo provider --help",
    });
  }
  const entry = getProviderCatalogEntry(id);

  const data = await readMutableConfig(ctx);
  assertConfigPresent(data, ctx);
  const { config, absPath } = data;

  if (config.providers === undefined || config.providers[id] === undefined) {
    throw new CLIError({
      code: CLIErrorCode.PROVIDER_NOT_FOUND,
      message: `Provider "${id}" is not configured yet.`,
      hint: `Run: kairo provider add ${id}`,
    });
  }

  const answers = await collectProviderSetup(ctx, entry);

  const block: Record<string, unknown> = {};
  if (entry.defaultBaseUrl !== undefined) {
    block.baseURL = answers.baseUrl;
  }
  block.models = [...answers.models];
  block.defaultModel = answers.defaultModel;

  if (entry.apiKeyRequired && answers.apiKey !== undefined) {
    const storage = answers.apiKeyStorage ?? "env";
    const envVarName = `${id.toUpperCase().replace(/-/g, "_")}_API_KEY`;
    let envLine: string | undefined;
    if (storage === "env") {
      envLine = `${envVarName}=${answers.apiKey}`;
      block.apiKey = `\${${envVarName}}`;
      if (envLine !== undefined) {
        const envPath = path.resolve(
          path.dirname(absPath),
          "..",
          ".env",
        );
        await appendEnvLine(envPath, envLine);
      }
    } else if (storage === "config") {
      block.apiKey = answers.apiKey;
    } else {
      // skip; preserve existing apiKey unless overwritten
      const old = config.providers[id];
      if (old !== undefined && typeof old["apiKey"] === "string") {
        block.apiKey = old["apiKey"];
      } else {
        block.apiKey = "";
      }
    }
  }

  config.providers[id] = block;
  await writeMutableConfig(ctx, absPath, config);

  renderProviderConfigured(ctx, entry.displayName, {
    apiKeyStored: entry.apiKeyRequired,
    modelsImported: answers.models.length,
    defaultModel: answers.defaultModel,
  });
  return 0;
}

async function runProviderRemove(ctx: CLIContext): Promise<number> {
  const id = ctx.args[1];
  if (id === undefined || id.length === 0) {
    throw new CLIError({
      code: CLIErrorCode.UNKNOWN_COMMAND,
      message: "Provider id is required.",
      hint: "Run: kairo provider --help",
    });
  }
  const data = await readMutableConfig(ctx);
  assertConfigPresent(data, ctx);
  const { config, absPath } = data;

  if (config.providers === undefined || config.providers[id] === undefined) {
    throw new CLIError({
      code: CLIErrorCode.PROVIDER_NOT_FOUND,
      message: `Provider "${id}" is not configured.`,
      hint: "Run: kairo provider list",
    });
  }

  const removed = config.providers[id];
  const removedDefault = readProviderDefault(removed);

  // Delete the provider block.
  delete config.providers[id];
  if (Object.keys(config.providers).length === 0) {
    delete config.providers;
  }

  // If the project default model was the removed provider's default,
  // ask whether to pick another.
  if (removedDefault !== undefined && config.model === removedDefault) {
    ctx.stdout("");
    heading(ctx, "Default model removed");
    text(
      ctx,
      `The default model "${removedDefault}" was set by "${id}".`,
      { indent: 0 },
    );
    const remaining = collectAllModels(config);
    if (remaining.length > 0) {
      const pick = await prompt(ctx, `Choose new default (blank to skip)`, {
        default: "",
      });
      if (pick.length > 0) {
        if (!remaining.includes(pick)) {
          throw new CLIError({
            code: CLIErrorCode.CONFIG_LOAD_FAILED,
            message: `Model "${pick}" is not declared by any remaining provider.`,
          });
        }
        config.model = pick;
      } else {
        delete config.model;
      }
    } else {
      delete config.model;
    }
  }

  await writeMutableConfig(ctx, absPath, config);

  ctx.stdout("");
  heading(ctx, `Removed provider: ${id}`);
  success(ctx, "Saved to .kairo/config.json");
  return 0;
}

function renderProviderConfigured(
  ctx: CLIContext,
  displayName: string,
  details: {
    readonly apiKeyStored: boolean;
    readonly modelsImported: number;
    readonly defaultModel: string;
  },
): void {
  ctx.stdout("");
  ctx.stdout(`${displayName} configured`);
  ctx.stdout("");
  const rows = [
    ...(details.apiKeyStored ? ["API key stored"] : []),
    `Models imported${details.modelsImported > 0 ? ` (${details.modelsImported})` : ""}`,
    `Default model: ${details.defaultModel}`,
    "Configuration saved",
  ];
  for (let i = 0; i < rows.length; i += 1) {
    const prefix = i === rows.length - 1 ? "└─" : "├─";
    ctx.stdout(`${prefix} ✓ ${rows[i]}`);
  }
  ctx.stdout("");
  ctx.stdout("Next");
  ctx.stdout("");
  ctx.stdout("└─ kairo doctor");
}

function collectAllModels(config: MutableKairoConfig): readonly string[] {
  const out: string[] = [];
  if (config.providers === undefined) return out;
  for (const id of Object.keys(config.providers)) {
    const block = config.providers[id];
    if (block === undefined) continue;
    for (const model of readProviderModels(block)) {
      if (!out.includes(model)) out.push(model);
    }
  }
  return out;
}

async function appendEnvLine(envPath: string, line: string): Promise<void> {
  let existing = "";
  try {
    existing = await fs.readFile(envPath, "utf8");
  } catch {
    existing = "";
  }
  const normalized = existing.endsWith("\n") || existing.length === 0
    ? existing
    : existing + "\n";
  await fs.writeFile(envPath, normalized + line + "\n", "utf8");
}

/**
 * `kairo models` — print configured models.
 *
 * Source: `app.registry.listModels()`. The CLI never asks providers
 * over HTTP for their catalog — the model index is whatever the
 * KairoConfig declares per-provider via the `models` reserved key.
 *
 * Renders a borderless table: Model / Provider(s) (comma-separated).
 */

import type { CLIContext } from "../context.js";
import { loadApplication } from "../bootstrap.js";
import { heading, table, emptyState, withSpinner } from "../ui/index.js";
import type { Command, CommandMetadata } from "./types.js";

export const modelsMetadata: CommandMetadata = {
  name: "models",
  summary: "List all configured models",
  usage: "kairo models",
  description:
    "Prints every model declared in .kairo/config.json alongside the owning provider(s). Does not query providers over HTTP.",
};

export const modelsCommand: Command = {
  metadata: modelsMetadata,
  async run(ctx: CLIContext): Promise<number> {
    const { app } = await withSpinner(
      ctx,
      "Loading configuration...",
      "Configuration loaded",
      () => loadApplication(ctx),
    );
    const models = [...app.registry.listModels()];
    if (models.length === 0) {
      ctx.stdout("");
      emptyState(ctx, "models", "kairo provider add <provider>");
      return 0;
    }
    heading(ctx, "Models");
    table(ctx, {
      columns: ["Model", "Provider"],
      rows: models.map((entry) => [
        entry.model,
        entry.providers.join(", "),
      ]),
    });
    return 0;
  },
};

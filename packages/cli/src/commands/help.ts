/**
 * `kairo --help`, `kairo help`, `kairo --version` rendering.
 *
 * Renders the logo, a short tagline, a list of all top-level commands
 * with one-line summaries, and finally a small "Run kairo <command>
 * --help" hint. Subcommand help is also reachable.
 *
 * The help command is intentionally an inspect-only view — it does not
 * touch @kairo/config or @kairo/app.
 */

import type { CLIContext } from "../context.js";
import { renderLogo, heading, text, muted } from "../ui/index.js";
import { CLI_VERSION } from "../version.js";
import type { Command, CommandMetadata } from "./types.js";

import { COMMANDS_BY_NAME } from "./registry.js";

export const helpMetadata: CommandMetadata = {
  name: "help",
  summary: "Show help for a command or the top-level overview",
  usage: "kairo help [command]",
};

export const helpCommand: Command = {
  metadata: helpMetadata,
  async run(ctx) {
    const target = ctx.args[0];
    if (target !== undefined && target.length > 0) {
      const cmd = COMMANDS_BY_NAME[target];
      if (cmd === undefined) {
        heading(ctx, `Unknown command: ${target}`);
        text(ctx, "Run", { indent: 0 });
        muted(ctx, "kairo --help");
        return 2;
      }
      heading(ctx, cmd.metadata.name);
      text(ctx, cmd.metadata.summary, { indent: 0 });
      if (cmd.metadata.usage !== undefined) {
        ctx.stdout("");
        muted(ctx, "Usage:");
        text(ctx, cmd.metadata.usage, { indent: 0 });
      }
      if (cmd.metadata.description !== undefined) {
        ctx.stdout("");
        text(ctx, cmd.metadata.description, { indent: 0 });
      }
      return 0;
    }
    renderHelpOverview(ctx);
    return 0;
  },
};

/** Renders the top-level help overview shown by `kairo --help`. */
export function renderHelpOverview(ctx: CLIContext): void {
  renderLogo(ctx, CLI_VERSION);
  heading(ctx, "Commands");
  for (const name of [
    "init",
    "chat",
    "run",
    "models",
    "provider",
    "doctor",
  ]) {
    const cmd = COMMANDS_BY_NAME[name];
    if (cmd === undefined) continue;
    const summary = cmd.metadata.summary;
    const padded = name.padEnd(12);
    ctx.stdout(`  ${padded}  ${summary}`);
  }
  ctx.stdout("");
  muted(ctx, "Run: kairo <command> --help");
  muted(ctx, "kairo --version");
}

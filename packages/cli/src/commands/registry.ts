/**
 * Command registry — the dispatch table consumed by the program runner.
 *
 * Adding a command means: implement it under `commands/<name>.ts`, then
 * add an entry here. The help command reads `COMMANDS_BY_NAME` so the
 * runtime registry stays the single source of truth for the command
 * tree.
 */

import type { Command } from "./types.js";
import { initCommand } from "./init.js";
import { chatCommand } from "./chat.js";
import { runCommand } from "./run.js";
import { modelsCommand } from "./models.js";
import { providerCommand } from "./provider.js";
import { doctorCommand } from "./doctor.js";
import { versionCommand } from "./version.js";
import { helpCommand } from "./help.js";

export const COMMANDS: readonly Command[] = Object.freeze([
  initCommand,
  chatCommand,
  runCommand,
  modelsCommand,
  providerCommand,
  doctorCommand,
  versionCommand,
  helpCommand,
]);

export const COMMANDS_BY_NAME: Readonly<Record<string, Command>> = Object.freeze(
  Object.fromEntries(COMMANDS.map((c) => [c.metadata.name, c])),
);

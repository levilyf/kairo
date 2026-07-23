/**
 * Command registry — lookup only.
 * Does not execute commands.
 */

import { assertCommand, type Command } from "../contracts/command.js";
import { Registry } from "./registry.js";

export class CommandRegistry extends Registry<Command> {
  constructor() {
    super("command", assertCommand);
  }
}

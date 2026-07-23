/**
 * `kairo --version` and `kairo -V` handler.
 *
 * Just the logo + version line — nothing else. The version line lives
 * under the tagline in `renderLogo`.
 */

import type { CLIContext } from "../context.js";
import { renderLogo } from "../ui/index.js";
import { CLI_VERSION } from "../version.js";
import type { Command, CommandMetadata } from "./types.js";

export const versionMetadata: CommandMetadata = {
  name: "version",
  summary: "Show the Kairo CLI version",
};

export const versionCommand: Command = {
  metadata: versionMetadata,
  async run(ctx: CLIContext): Promise<number> {
    renderLogo(ctx, CLI_VERSION);
    return 0;
  },
};

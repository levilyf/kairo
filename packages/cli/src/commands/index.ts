export {
  COMMANDS,
  COMMANDS_BY_NAME,
} from "./registry.js";
export type { Command, CommandMetadata, CommandExit } from "./types.js";
export { initCommand } from "./init.js";
export { chatCommand } from "./chat.js";
export { runCommand } from "./run.js";
export { modelsCommand } from "./models.js";
export { providerCommand } from "./provider.js";
export { doctorCommand } from "./doctor.js";
export { versionCommand } from "./version.js";
export { helpCommand, renderHelpOverview } from "./help.js";

// Re-export the obvious hot helper used by main().
export { renderLogo } from "../ui/index.js";

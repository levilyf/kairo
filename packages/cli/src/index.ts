/**
 * @kairo/cli public surface.
 *
 * Pure-functions entry points for the CLI: run() takes a fully-injectable
 * CLIContext and returns an exit code (never throws), and main() is the
 * production entrypoint wired to the real process.
 *
 * Programmatic consumers (tests, future TUI imports) should route through
 * this module rather than reaching into internal files.
 */

export {
  run,
  main,
} from "./program.js";

export {
  createCLIContext,
  readJsonFile,
  writeJsonFile,
  envLookup,
  type CLIContext,
  type LineReader,
  type LineWriter,
  type ReadJsonError,
} from "./context.js";

export {
  CLIError,
  CLIErrorCode,
  type CLIErrorCode as CLIErrorCodeValue,
  type CLIErrorOptions,
} from "./errors.js";

export {
  COMMANDS,
  COMMANDS_BY_NAME,
} from "./commands/registry.js";
export type {
  Command,
  CommandMetadata,
  CommandExit,
} from "./commands/types.js";

export {
  renderLogo,
  heading,
  text,
  muted,
  success,
  warning,
  errorLine,
  separator,
  kv,
  table,
  emptyState,
  prompt,
  select,
  makeRawPromptReader,
  ConnectedFlow,
  startSpinner,
  withSpinner,
  type ColorTheme,
  type TableSpec,
  type PromptOptions,
  type RawPromptOptions,
  type FlowPromptOptions,
  type Spinner,
} from "./ui/index.js";

export {
  loadApplication,
  type LoadedApplication,
} from "./bootstrap.js";

export {
  PROVIDER_CATALOG,
  getProviderCatalogEntry,
  isKnownProvider,
  type ProviderCatalogEntry,
} from "./provider-catalog.js";

export {
  discoverModels,
  ModelDiscoveryError,
  type DiscoverModelsOptions,
} from "./model-discovery.js";

export {
  collectProviderSetup,
  collectApiKeyStorage,
  type ProviderAnswers,
  type ApiKeyStorage,
} from "./prompts/index.js";

export { CLI_VERSION } from "./version.js";

export {
  resolveProjectRoot,
  readMutableConfig,
  writeMutableConfig,
  CONFIG_RELATIVE_PATH,
  type MutableKairoConfig,
} from "./config-file.js";

export {
  initCommand,
  chatCommand,
  runCommand,
  modelsCommand,
  providerCommand,
  doctorCommand,
  versionCommand,
  helpCommand,
} from "./commands/index.js";

export {
  parseChatArgs,
  type ChatCommandArgs,
} from "./commands/chat-args.js";

export { createChatIO } from "./chat-io.js";

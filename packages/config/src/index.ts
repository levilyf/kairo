export {
  findProjectRoot,
} from "./discover.js";

export {
  loadConfig,
  type LoadConfigOptions,
  type LoadedConfig,
} from "./load.js";

export {
  validateConfig,
  isPlainObject,
} from "./validate.js";

export {
  resolveConfigEnvironment,
  type EnvironmentMap,
} from "./resolve.js";

export {
  ConfigError,
  ConfigErrorCode,
  type ConfigErrorOptions,
} from "./errors.js";

export {
  CURRENT_CONFIG_VERSION,
  KNOWN_TOP_LEVEL_KEYS,
  type KnownTopLevelKey,
  type KairoConfig,
  type ProviderConfig,
  type ProvidersConfig,
  type AgentConfig,
  type PermissionsConfig,
  type WorkspaceConfig,
} from "./schema.js";

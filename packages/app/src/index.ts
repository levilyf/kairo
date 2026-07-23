/**
 * @kairo/app public surface.
 *
 * The composition root: bootstrap an already-loaded KairoConfig into a
 * ready Application (Registry + Harness + Runtime). Pure composition;
 * does not read config files, parse args, or render UI.
 */

export {
  ApplicationError,
  ApplicationErrorCode,
  BootstrapPhase,
  type ApplicationErrorOptions,
} from "./errors.js";

export {
  BUILTIN_PROVIDER_PROTOCOLS,
  registerBuiltinProviderProtocols,
  listBuiltinProviderProtocolIds,
} from "./builtin-providers.js";

export {
  wrapProviderAsModule,
  createProviderModuleManifest,
  type ProviderModuleOptions,
} from "./provider-module.js";

export {
  bootstrapProviderRegistry,
  type BootstrappedRegistry,
} from "./registry-bootstrap.js";

export {
  buildHarnessDefinition,
  buildHarness,
  buildRuntime,
  type HarnessBootstrapOptions,
} from "./harness-bootstrap.js";

export type {
  Application,
  ApplicationStatus,
  CreateApplicationOptions,
} from "./application.js";
export { createApplication } from "./application.js";

/**
 * @kairo/core
 *
 * Stable kernel surface.
 *
 * Current milestones:
 * - Module Host
 * - Harness composition
 * - Contract System (Provider, Tool, Command, UI, RuntimeEvent + registries)
 * - Contribution Binding (Modules → Contracts → Registries)
 * - Runtime host (execution host; not the agent loop)
 * - Runtime Event System (observation bus; not control-flow)
 * - Policy Hooks (enforcement points; not a policy engine)
 * - Session Manager (session lifecycle; owns TurnManager)
 * - Turn system (execution boundary; owns Context)
 * - Context model (immutable provider-neutral input; no assembler/gateway)
 * - Context Builder system (contribution contract + registry)
 * - Context Assembler (merge fragments → immutable Context)
 * - Provider Gateway (sole Provider.complete() / Provider.stream() boundary)
 * - Tool Router (sole Tool.execute() boundary)
 * - Agent Loop (abstract turn orchestration; no vendor adapters)
 *
 * Not yet: concrete adapters / product harnesses.
 *
 * Architecture source of truth: /docs
 */

export {
  ContributionRegistry,
  DependencyResolver,
  ModuleError,
  ModuleErrorCode,
  ModuleHost,
  ModuleLoader,
  ModuleRegistry,
  compareSemver,
  isVersionInRange,
  parseSemver,
} from "./module/index.js";

export type {
  BootResult,
  ContributionInput,
  ContributionRecord,
  CoreCompatibility,
  DependencyResolverOptions,
  FailedOptionalModule,
  MissingOptionalDependency,
  Module,
  ModuleContext,
  ModuleDependency,
  ModuleErrorOptions,
  ModuleHostEvent,
  ModuleHostEventListener,
  ModuleHostEventType,
  ModuleHostOptions,
  ModuleLifecyclePhase,
  ModuleManifest,
  ModuleRecord,
  ModuleRegistrationOptions,
  ModuleSource,
  ModuleState,
  ResolveResult,
  SemVer,
  VersionRange,
} from "./module/index.js";

export {
  DEFAULT_CORE_VERSION,
  Harness,
  HarnessBuilder,
  HarnessError,
  HarnessErrorCode,
  createHarness,
  createHarnessConfig,
  createHarnessMetadata,
  defineHarness,
} from "./harness/index.js";

export type {
  HarnessBootInfo,
  HarnessBuilderOptions,
  HarnessConfig,
  HarnessConfigInput,
  HarnessDefinition,
  HarnessDefinitionInput,
  HarnessErrorOptions,
  HarnessMetadata,
  HarnessMetadataInput,
  HarnessModuleEntry,
  HarnessModuleInput,
  HarnessOptions,
  HarnessStatus,
} from "./harness/index.js";

export {
  ContractError,
  ContractErrorCode,
  RUNTIME_EVENT_TYPES,
  assertCommand,
  assertProvider,
  assertTool,
  assertUI,
  isRuntimeEventType,
} from "./contracts/index.js";

export type {
  Command,
  CommandExecuteContext,
  CommandResult,
  ContractErrorOptions,
  ContractName,
  CoreRuntimeEvent,
  CoreRuntimeEventType,
  ExtensionRuntimeEvent,
  JsonSchema,
  JsonSchemaType,
  Provider,
  ProviderCapabilities,
  ProviderContentPart,
  ProviderMessage,
  ProviderMessageRole,
  ProviderModality,
  ProviderRequest,
  ProviderResponse,
  ProviderStopReason,
  ProviderStreamEvent,
  ProviderToolDefinition,
  RuntimeEvent,
  RuntimeEventBase,
  RuntimeEventListener,
  RuntimeEventType,
  Tool,
  ToolExecuteContext,
  ToolResult,
  UI,
  UIInput,
  UISubmitContext,
} from "./contracts/index.js";

export {
  CommandRegistry,
  ProviderRegistry,
  Registry,
  ToolRegistry,
  UIRegistry,
} from "./registries/index.js";

export type { Identifiable } from "./registries/index.js";

export {
  BINDABLE_CONTRIBUTION_TYPES,
  BindingError,
  BindingErrorCode,
  ContributionBinder,
  ContributionResolver,
  isBindableContributionType,
} from "./binding/index.js";

export type {
  BindableContributionType,
  BindingErrorOptions,
  BindingIssue,
  BindingResult,
  BindingValidationReport,
  BoundContribution,
  BoundContributionState,
  ContributionBinderOptions,
  ContractRegistries,
  DiscoveryResult,
  SkippedContribution,
} from "./binding/index.js";

export {
  CancellationRoot,
  Runtime,
  RuntimeBuilder,
  RuntimeError,
  RuntimeErrorCode,
  createRuntime,
  createRuntimeMetadata,
} from "./runtime/index.js";

export type {
  CreateRuntimeOptions,
  RuntimeErrorOptions,
  RuntimeMetadata,
  RuntimeMetadataInput,
  RuntimeOptions,
  RuntimeServices,
  RuntimeStatus,
} from "./runtime/index.js";

export {
  EventBus,
  EventError,
  EventErrorCode,
  EventPublisher,
  EventSubscription,
  dispatchEvent,
  matchesFilter,
} from "./events/index.js";

export type {
  CoreEventInput,
  DispatchErrorHandler,
  EventErrorOptions,
  EventFilter,
  EventPublisherOptions,
  ExtensionEventInput,
  PublishOptions,
  SubscribeOptions,
  SubscriptionOptions,
} from "./events/index.js";

export {
  assertPolicyHook,
  PolicyError,
  PolicyErrorCode,
  PolicyManager,
  PolicyRegistry,
} from "./policy/index.js";

export type {
  HookDecision,
  PolicyContext,
  PolicyDecision,
  PolicyErrorOptions,
  PolicyHook,
  PolicyResult,
  PolicyHookResult,
  PolicyManagerOptions,
  PolicyVerdict,
} from "./policy/index.js";

export {
  Session,
  SessionBuilder,
  SessionError,
  SessionErrorCode,
  SessionManager,
  createSessionMetadata,
  updateSessionMetadata,
} from "./session/index.js";

export type {
  CreateSessionInput,
  SessionBuilderOptions,
  SessionCancellationScope,
  SessionErrorOptions,
  SessionManagerOptions,
  SessionMetadata,
  SessionMetadataInput,
  SessionOptions,
  SessionState,
} from "./session/index.js";

export {
  Turn,
  TurnBuilder,
  TurnError,
  TurnErrorCode,
  TurnManager,
  createTurnMetadata,
  updateTurnMetadata,
} from "./turn/index.js";

export type {
  CompleteTurnInput,
  CreateTurnInput,
  TurnBuilderOptions,
  TurnCancellationScope,
  TurnErrorOptions,
  TurnManagerOptions,
  TurnMetadata,
  TurnMetadataInput,
  TurnOptions,
  TurnState,
} from "./turn/index.js";

export {
  Context,
  ContextFactory,
  ContextError,
  ContextErrorCode,
  createContext,
  createContextMetadata,
} from "./context/index.js";

export type {
  ContextAttachment,
  ContextContentPart,
  ContextData,
  ContextErrorOptions,
  ContextFactoryOptions,
  ContextMessage,
  ContextMetadata,
  ContextMetadataInput,
  ContextState,
  ContextToolDefinition,
  CreateContextInput,
  CreateTurnContextInput,
} from "./context/index.js";

export {
  ContextBuilderError,
  ContextBuilderErrorCode,
  ContextBuilderRegistry,
  assertContextBuilder,
  assertContextBuilderResult,
  createContextFragment,
} from "./context-builder/index.js";

export type {
  ContextBuilder,
  ContextBuilderContext,
  ContextBuilderErrorOptions,
  ContextBuilderResult,
  ContextFragment,
  CreateContextFragmentInput,
} from "./context-builder/index.js";

export {
  AssemblyPipeline,
  ContextAssembler,
  ContextAssemblerError,
  ContextAssemblerErrorCode,
} from "./context-assembler/index.js";

export type {
  AssembleOptions,
  AssemblyResult,
  BuilderAssemblyRecord,
  ContextAssemblerErrorOptions,
  ContextAssemblerOptions,
  PipelineCollection,
} from "./context-assembler/index.js";

export {
  ProviderGateway,
  ProviderGatewayError,
  ProviderGatewayErrorCode,
  assertProviderResponse,
  selectProvider,
  translateContextToProviderRequest,
} from "./provider-gateway/index.js";

export type {
  ProviderGatewayErrorOptions,
  ProviderGatewayOptions,
  ProviderGatewayResult,
  ProviderGatewayStreamEvent,
  ProviderInvocation,
  ProviderInvokeInput,
  ProviderSelection,
  ProviderSelectionInput,
  TranslateOptions,
} from "./provider-gateway/index.js";

export {
  ToolRouter,
  ToolRouterError,
  ToolRouterErrorCode,
  assertToolResult,
  selectTool,
  validateToolArguments,
} from "./tool-router/index.js";

export type {
  ToolInvocation,
  ToolInvokeInput,
  ToolRouterErrorOptions,
  ToolRouterOptions,
  ToolRouterResult,
  ToolSelection,
  ToolSelectionInput,
  ValidateToolArgumentsOptions,
} from "./tool-router/index.js";

export {
  AgentLoop,
  AgentLoopError,
  AgentLoopErrorCode,
  DEFAULT_MAX_ITERATIONS,
} from "./agent-loop/index.js";

export type {
  AgentLoopErrorOptions,
  AgentLoopOptions,
  LoopIteration,
  LoopOptions,
  LoopResult,
  LoopState,
  LoopStatus,
  LoopToolCall,
  LoopToolResult,
  LoopTurn,
} from "./agent-loop/index.js";

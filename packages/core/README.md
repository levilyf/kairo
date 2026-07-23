# `@kairo/core`

Kairo Core kernel.

## Implemented milestones

### Module Host

- module manifests and contracts
- module registry
- dependency resolution
- module loader
- lifecycle host (register → resolve → load → initialize → start → stop → unload)
- attributed module errors
- generic contribution registration during initialize

### Harness composition

- `defineHarness()` — immutable composition definition
- `createHarness()` / `HarnessBuilder` — validate, register modules, boot host
- `Harness` — ready composition instance (owns ModuleHost, config, metadata, permissions)

The Harness is **not** the Runtime. It does not own sessions, turns, context, or AI execution.

### Contract System

- Provider / Tool / Command / UI / RuntimeEvent contracts (interfaces only)
- `ProviderRegistry`, `ToolRegistry`, `CommandRegistry`, `UIRegistry` (lookup only)
- No vendor adapters, no execution

### Contribution Binding

- `ContributionResolver` — discover/classify module contributions
- `ContributionBinder` — validate + register into contract registries
- Harness boot binds automatically; `stop()` unbinds before module shutdown
- Runtime should consume `harness.providers|tools|commands|uis` only

### Runtime host

- `createRuntime(harness)` — execution host from a ready Harness
- lifecycle: ready → shutdown → stopped (no restart)
- cancellation root, metadata, service extension slots (placeholders)
- owns an `EventBus` per instance (`runtime.events`)
- owns a `PolicyManager` per instance (`runtime.policy`)
- owns a `SessionManager` per instance (`runtime.sessions`)
- does **not** implement Turns, Agent Loop, gateways, or AI execution

### Runtime Event System

- `EventBus` — synchronous publish/subscribe for `RuntimeEvent` contracts
- `EventPublisher` — convenience producer with auto id/timestamp and typed emitters
- `EventFilter` / `matchesFilter` — structural (types/sessionId/turnId/moduleId) + predicate filters
- `EventSubscription` — per-subscriber bookkeeping with cancellation
- Error isolation: one failing subscriber does not break others
- Ordering: subscribers called in registration order; nested publishes queued breadth-first
- No global singleton; each Runtime owns its own bus
- Bus closes on `runtime.shutdown()`

### Policy Hooks

- `PolicyManager` — coordinates hook evaluation; does not implement policy logic
- `PolicyRegistry` — deterministic hook registration, ordering, lookup, and removal
- `PolicyHook` — replaceable implementation interface for modules/harnesses
- `PolicyDecision` — aggregate `allow` / `deny` / `abstain` result with explanations and metadata
- Fail-closed hook errors: hook exceptions become attributed denials
- No global singleton; each Runtime owns its own policy manager
- Policy manager closes on `runtime.shutdown()`

### Session Manager

- `SessionManager` — owns session creation, lookup, lifecycle, and shutdown
- `Session` — root execution state for a conversation/work unit
- `SessionMetadata` — stable id/runtime/timestamp fields plus opaque extension metadata
- Session cancellation scopes are children of the Runtime cancellation root
- Session lifecycle events use existing contracts: `session.created` and `session.completed`
- No global singleton; each Runtime owns its own session manager
- Runtime shutdown closes sessions before closing events/cancellation

### Turn system

- `TurnManager` — owns turn creation, lookup, lifecycle, and cancelAll/close
- `Turn` — execution boundary for one request inside a Session
- `TurnMetadata` — stable id/session/runtime/timestamp fields plus opaque extension metadata
- Session owns one `TurnManager` via `session.turns`
- Turn cancellation scopes are children of the Session cancellation scope
- Turn lifecycle events use existing contracts: `turn.started` and `turn.completed`
- Turn owns at most one `Context` via `turn.createContext()`

### Context model

- `Context` — immutable, provider-neutral execution input object
- `ContextMetadata` — stable id/turn/session/runtime fields plus opaque extension data
- Placeholder collections: instructions, messages, toolDefinitions, attachments, variables
- Not a vendor request; no OpenAI/Anthropic fields; no assembly or provider translation
- `ContextFactory` constructs empty Context shells for Turns (not the contribution contract)

### Context Builder system

- `ContextBuilder` — module-facing contribution contract (`build(context) → fragments`)
- `ContextBuilderRegistry` — register/lookup/resolve ordered builders (priority then registration)
- `ContextFragment` / `ContextBuilderResult` — provider-neutral contribution pieces
- `ContextBuilderContext` — turn/session/runtime attribution input for builders
- No concrete system/memory/workspace builders shipped in Core

### Context Assembler

- `ContextAssembler` — only Core component that builds a complete immutable Context
- `AssemblyPipeline` — runs ordered builders and collects fragments (no merge)
- Merge: collections append; variables/metadata last-write-wins by key
- Output Context uses `state: "assembled"`
- Fail-closed on builder throw or invalid fragment results

### Provider Gateway

- `ProviderGateway` — sole Core path to `Provider.complete()`
- Resolves providers from `Harness.providers` / `ProviderRegistry`
- Translates assembled `Context` → provider-neutral `ProviderRequest`
- Policy gate on `provider.call` before invocation
- Emits `provider.called` / `provider.completed` / `provider.failed` / `policy.denied`
- Honors cancellation signals (runtime/session/turn)
- Exposed as `runtime.providers`
- No retries, tools, loop, or vendor SDKs

### Tool Router

- `ToolRouter` — sole Core path to `Tool.execute()`
- Resolves tools from `Harness.tools` / `ToolRegistry` by explicit `toolId`
- Validates args against declared parameter contracts (structural JsonSchema subset)
- Policy gate on `tool.invoke` before execution
- Emits `tool.invoked` / `tool.completed` / `tool.failed` / `policy.denied`
- Honors cancellation signals (runtime/session/turn)
- Exposed as `runtime.tools`
- Does not choose tools, retry, assemble context, or run the agent loop

### Agent Loop

- `AgentLoop` — abstract turn orchestration only
- Flow: assemble Context → Provider Gateway → optional Tool Router → reassemble → …
- Completes the Turn on final assistant response (no tool_call parts)
- Stops on cancellation, provider/tool boundary failure, or `maxIterations`
- Seed messages/instructions via `LoopOptions`; conversation accumulated across iterations
- Optional streaming mode: `LoopOptions.stream` + `onStreamEvent` via Provider Gateway `stream()`
- Fail-closed: streaming requested without provider support → `STREAMING_UNSUPPORTED` (no silent `complete()` fallback)
- Tool branch runs only after a full `ProviderResponse` (`message_end` for streams)
- Exposed as `runtime.agentLoop` (assembler as `runtime.context`)
- No vendor SDKs, no domain tools, no retries beyond documented loop iterations

### Provider streaming contract

- `ProviderStreamEvent` — provider-neutral stream events (`message_start`, `text_delta`, `tool_call_delta`, `usage`, `message_end`, `error`)
- `Provider.stream?` required when `capabilities.streaming === true`
- `ProviderGateway.stream()` — select → policy → translate → iterate; validates final `message_end`

## Product surface (not Core)

Streaming chat productization lives outside Core:

- `@kairo/chat` — JSONL sessions, progressive renderer, REPL
- `@kairo/cli` — `kairo chat` composition over `@kairo/app` + `@kairo/chat`
- Provider packages + `@kairo/protocol-openai` — OpenAI-compatible SSE mapping

Architecture source of truth: repository `/docs`.

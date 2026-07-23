# Kairo Architectural Contracts

This document defines the major contracts Core exposes to modules and harnesses.

These are **architectural contracts**, not implementation specifications. They define responsibilities, boundaries, ownership, and forbidden behaviors. Their purpose is to prevent architectural drift over a decade of evolution.

If code conflicts with these contracts, the code is wrong unless this document is deliberately revised.

---

## What a Contract Means in Kairo

A **contract** is a stable agreement about:

1. **Responsibility** — what a component must do
2. **Boundary** — what it must not do
3. **Ownership** — who controls definition vs implementation
4. **Interaction** — how other components may use it
5. **Failure behavior** — how errors and denials appear
6. **Extension rules** — how new implementations plug in

Contracts are provider-neutral and domain-neutral unless explicitly stated otherwise.

---

## Contract Map

| Contract | Defined by | Implemented by | Consumed by |
| --- | --- | --- | --- |
| Provider | Core | Provider modules | Agent Loop / Provider Gateway |
| Tool | Core | Tool modules / domain packs | Agent Loop / Tool Router |
| Command | Core | Modules / harnesses | Surfaces, automation, users |
| Module | Core | All modules | Module Host / harness composition |
| UI | Core (surface contract) | UI modules / external apps | Humans / operators |
| Runtime Events | Core | Core + modules (as producers/consumers) | UI, telemetry, control planes |
| Context Builder | Core | Modules / harnesses | Context Assembler |
| Agent Loop | Core | Core (abstract loop) | Harnesses configure; modules extend via hooks |
| Session | Core | Core + persistence adapters | Runtime, surfaces, modules |
| Context | Core | Assembler + builders | Provider invocations |

---

## Universal Rules (Apply to All Contracts)

1. **Core owns contract definitions.** Modules own implementations.
2. **No domain smuggling.** Coding, research, DevOps, browser, enterprise workflow details do not belong in Core contract *meanings*.
3. **No provider privilege.** Contracts must not require a specific model vendor.
4. **Explicit failure.** Errors are attributed and observable.
5. **Permissioned power.** Sensitive actions pass policy hooks.
6. **Introspectable registrations.** What is active can be listed.
7. **No private back doors.** If access is needed, the contract expands deliberately.
8. **Versioned evolution.** Breaking contract changes are major, deliberate events.
9. **Harness authority.** Composition and policy choices belong to the harness.
10. **Replaceability.** Any implementation can be swapped if it honors the contract.

---

## Provider

### Purpose

Abstract model inference backends so the runtime can request completions (and related capabilities) without coupling to a vendor SDK.

### Responsibilities

A Provider implementation must:

- accept invocation requests shaped by the Core provider contract
- return results or stream result parts as the contract allows
- surface cancellations and failures in platform terms
- declare capabilities it supports (e.g., streaming, tool calls, specific modalities) without forcing all providers to support everything
- avoid requiring Core to understand vendor-only payload details for the baseline path

### Streaming (additive)

- `complete(request)` is always required and returns a full `ProviderResponse`.
- `capabilities.streaming` declares whether partial results are available.
- When `capabilities.streaming` is `true`, the provider **must** implement `stream(request)` returning an `AsyncIterable<ProviderStreamEvent>`.
- When `stream()` is implemented, `capabilities.streaming` **must** be `true`.
- Stream events are provider-neutral. Core defines at least:
  - `message_start`
  - `text_delta` (`text`)
  - `tool_call_delta` (reserved; partial tool args may appear later)
  - `usage`
  - `message_end` (carries the final `ProviderResponse`)
  - `error`
- A successful stream ends with a validated `message_end` response. Callers that need a full response (Agent Loop tool branch, persistence) use that final response — not ad-hoc delta reconstruction in Core.
- Streaming is **not** a silent alternative to `complete()`: if a consumer requests a stream and the provider cannot stream, the Provider Gateway fails closed (`STREAMING_UNSUPPORTED`). There is no automatic fallback to `complete()`.

### Core owns

- the Provider contract shape and gateway semantics (including `stream`)
- capability negotiation principles
- mapping provider failures into platform error classes
- registration and resolution of providers

### Modules own

- SDK integration
- auth material handling patterns appropriate to deployment
- vendor-specific feature adapters exposed as optional capabilities
- rate-limit handling strategies where not generalized

### Harnesses own

- which providers are available
- defaults and fallbacks
- credential sourcing policies
- model selection policies

### Must never happen

- Core hard-depends on one vendor SDK
- provider-specific types leak as required Core public surface
- a provider silently bypasses policy hooks
- harnesses must edit Core to add a provider

### Boundary notes

Providers produce model outputs; they do not own tools, sessions, or UI. They may emit events related to invocation lifecycle through approved channels.

---

## Tool

### Purpose

Provide invocable capabilities the agent loop can call during a turn.

### Responsibilities

A Tool implementation must:

- declare identity, description, and parameter contract
- execute side effects only within granted permissions
- return structured results suitable for the runtime to continue
- fail in attributed, observable ways
- avoid hidden ambient authority

### Core owns

- Tool contract and registration
- routing/dispatch
- pre-invoke policy gates
- tool lifecycle events
- generic validation against declared parameter contracts

### Modules own

- tool behavior
- domain semantics
- external system integration
- tool-specific safety checks beyond platform gates

### Harnesses own

- which tools are enabled
- allow/deny lists
- approval requirements for dangerous tools
- environment scoping (e.g., prod vs dev resources) via config/policy

### Must never happen

- Core implements vertical domain tools as kernel features
- tools mutate Core private state
- tools register themselves outside module lifecycle without host knowledge
- tool execution skips policy hooks
- one tool silently overrides another by load order

### Boundary notes

Tools are not Commands. A Command may *invoke* a tool, and a tool may be exposed through a command, but the contracts remain distinct.

---

## Command

### Purpose

Provide discrete, addressable entrypoints for users, UIs, and automation.

### Responsibilities

A Command implementation must:

- declare identity, usage intent, and parameters
- perform a bounded action or dispatch into runtime flows
- produce user/operator-meaningful results or errors
- respect permissions and harness exposure rules

### Core owns

- Command contract and dispatch surface
- registration/introspection
- separation from Tool and Provider contracts

### Modules / harnesses own

- command behavior
- UX-facing naming and help text
- whether a command maps to tools, session actions, or configuration operations

### Surfaces own

- how commands are presented (slash commands, CLI subcommands, buttons)
- keybinding or menu placement (UI concern)

### Must never happen

- Core becomes a full CLI product with domain commands
- commands become a second agent loop that bypasses Session/Event contracts without reason
- command identity collides silently across modules

### Boundary notes

Commands are the “intentional invocation” contract. They are ideal for deterministic operations and operator control, including starting flows that then enter the agent loop.

---

## Module

### Purpose

Package and lifecycle-manage capability contributions.

### Responsibilities

A Module must:

- declare identity, version, compatibility, dependencies, and permissions
- register contributions only through approved extension points
- honor lifecycle phases
- clean up on stop/unload
- fail in attributed ways

### Core owns

- Module contract and host semantics
- discovery/registration/resolution/load/init/start/stop/unload model
- dependency and conflict rules at the architectural level
- isolation expectations and permission enforcement points

### Module authors own

- implementation quality
- honest metadata
- dependency minimization
- documentation for harness authors

### Harnesses own

- which modules are included
- pins and overrides
- required vs optional status in composition
- trust decisions

### Must never happen

- modules patch Core internals
- first-party modules get secret APIs unavailable to third parties without documented contract progression
- circular dependencies
- undeclared sensitive permissions
- discovery that executes untrusted code without a defined trust model

See [`MODULES.md`](./MODULES.md) for full lifecycle detail.

---

## UI

### Purpose

Allow humans (or human-operated systems) to observe and influence a running harness without embedding a specific interface into Core.

### Responsibilities

A UI implementation must:

- consume Runtime Events (and related introspection) rather than scraping private state
- submit inputs, commands, cancellations, and approvals through public contracts
- respect session boundaries
- avoid assuming a single product persona or domain

### Core owns

- the principle that UI is replaceable
- event and command/input contracts UI relies on
- no mandatory UI implementation in Core

### UI modules / external apps own

- rendering
- interaction design
- accessibility
- local client state that is truly local

### Harnesses own

- which surfaces ship by default
- branding and persona
- operator vs end-user UX differences

### Must never happen

- Core requires a particular web framework or TUI library
- UI reaches into Core private runtime structures
- UI becomes the only way to operate the system (headless operation must remain possible architecturally)
- domain UI concerns force Core API shapes that break non-UI harnesses

### Boundary notes

“UI” includes CLI interactive modes, web apps, IDE extensions, dashboards, and supervisory consoles. All are surfaces over contracts.

---

## Runtime Events

### Purpose

Make runtime activity observable and coordinatable without hard-wiring producers to consumers.

### Responsibilities

The Runtime Event system must:

- define core event kinds for lifecycle and turn activity
- allow modules to emit namespaced events where permitted
- deliver events to subscribers under documented ordering/reliability expectations
- attribute events to session/turn/module where relevant
- support UI, logging, audit, and automation equally as consumers

### Core owns

- core event taxonomy
- bus/subscription semantics at contract level
- guarantees that are actually promised (and not accidental)
- ensuring critical lifecycle events exist (module failed, turn started/completed, tool invoked, provider called, cancelled, policy denied, etc.)

### Modules own

- domain-specific event payloads in namespaced channels
- subscriber behavior for telemetry/audit features they provide

### Consumers own

- filtering, display, retention, export

### Must never happen

- event bus used as a hidden primary control-flow replacement for the agent loop without contracts
- mandatory vendor telemetry in Core
- unattributed critical failures
- UI-only events that are required for correctness of non-UI execution

### Boundary notes

Events are for observation and loose coordination. They are not a substitute for explicit policy hooks or tool return values.

---

## Context Builder

### Purpose

Contribute pieces of information to the Context that will be sent to a provider.

### Responsibilities

A Context Builder must:

- declare what it contributes and any ordering needs
- read allowed inputs (session, turn, config, external systems under permission)
- append/update context contributions through the assembler contract
- respect size/policy constraints enforced by platform/harness hooks
- fail without corrupting the entire context pipeline when possible

### Core owns

- Context Builder contract
- assembly pipeline coordination
- deterministic ordering rules
- platform-level contribution boundaries

### Modules / harnesses own

- retrieval strategies
- domain selection heuristics
- formatting of contributed material within contract limits
- caching strategies specific to their domain

### Must never happen

- Core hard-codes repository chunking, browser DOM extraction, or enterprise document ranking
- builders silently depend on undeclared permissions
- non-deterministic ordering without declaration
- builders bypass assembler and write directly into provider payloads

### Boundary notes

Context Builders shape model inputs. They do not execute tools (except indirectly if a harness design separates retrieval tools from builders — still, boundaries must stay clear). Prefer clarity: retrieval tools fetch; builders assemble; do not blur without reason.

---

## Agent Loop

### Purpose

Orchestrate a turn of work: accept input, assemble context, invoke providers, dispatch tools, emit events, and complete under harness-configured controls.

### Responsibilities

The Agent Loop must:

- remain domain-agnostic
- use Provider/Tool/Context/Session contracts rather than private shortcuts
- honor cancellation
- apply policy hooks at sensitive steps
- emit runtime events for key transitions
- stop according to defined completion/limit rules
- support optional streaming per turn via harness-visible loop controls (`stream`, `onStreamEvent`) using Provider Gateway `stream()`, without inventing vendor formats
- run tool dispatch only after a full `ProviderResponse` is available (including after stream `message_end`)
- fail closed when streaming is requested but the provider/gateway cannot stream (no silent `complete()` fallback)

### Core owns

- the abstract loop
- turn boundaries
- integration with registries and hooks
- generic loop controls exposed to harnesses

### Harnesses own

- limits and defaults
- approval interruption points
- whether multi-step continuation is enabled and under what constraints
- persona/instructions supplied into context

### Modules own

- capabilities the loop can call
- optional loop-adjacent helpers via documented hooks (not private monkey patches)

### Must never happen

- special-case coding workflows in the loop
- infinite continuation with no harness-visible controls
- provider/tool calls that skip events/policy
- loop logic that requires a UI to function

### Boundary notes

There may be advanced execution patterns in the future (multi-agent, graph-like planners). Architecturally, they must either:

1. sit above the abstract loop as harness/module patterns, or
2. extend Core only if they become true platform primitives

Do not grow a second unofficial runtime.

---

## Session

### Purpose

Represent a durable unit of interaction or work across turns.

### Responsibilities

A Session must:

- have stable identity
- bound turns and associated artifacts/metadata at the platform level
- support creation, resumption, completion/archival concepts as defined by contract
- integrate with persistence adapters without hard-coding storage technology
- carry extension metadata without Core interpreting domain meaning

### Core owns

- Session contract and manager semantics
- relationship between sessions and turns
- cancellation scopes tied to sessions/turns
- hooks for persistence and access control

### Persistence modules own

- storage engines
- serialization details
- retention mechanics under harness policy

### Harnesses own

- when sessions are created
- multi-user mapping
- retention policy
- what domain metadata is attached

### Must never happen

- Core equates “session” with “git repo workspace”
- session persistence requires a specific database product in Core
- modules freely rewrite other modules’ session-owned state without contracts
- UI-only session models incompatible with headless execution

---

## Context

### Purpose

Represent the structured material assembled for a provider invocation.

### Responsibilities

Context must:

- be producible by the Context Assembler from builder contributions
- be inspectable for debugging/observability within policy limits
- carry only what the contract defines as platform-meaningful structure
- allow harness/module contributions without Core understanding domain ontology

### Core owns

- Context contract
- assembly outcome semantics
- validation boundaries that are platform-level

### Builders / harnesses own

- content selection
- domain structuring within allowed contribution forms
- instructions and policy text supplied as contributions

### Providers own

- translating Context into vendor request forms at the adapter boundary

### Must never happen

- Context becomes a bag that legitimizes arbitrary Core domain types
- provider adapters requiring secret context fields undocumented in contracts
- silent truncation without observability/policy hooks when limits apply

---

## Additional Cross-Cutting Contracts

These are not always listed as primary nouns, but they are real architectural contracts.

### Policy Hooks

**Purpose:** Enforce allow/deny/modify decisions before sensitive actions.

**Core owns:** gate locations and denial semantics.  
**Implementations own:** policy logic.  
**Must never:** fail open by default for dangerous actions when policy is configured to enforce.

### Persistence Adapter

**Purpose:** Store and retrieve sessions/artifacts.

**Core owns:** boundary and minimal expectations.  
**Modules own:** engines.  
**Must never:** force a storage product into Core.

### Cancellation / Abort

**Purpose:** Stop in-flight work safely.

**Core owns:** propagation expectations across loop, provider, tool.  
**Implementations own:** honoring cancel in adapters.  
**Must never:** ignore cancellation without reporting inability to stop.

### Configuration Binding

**Purpose:** Deliver harness config to modules and runtime.

**Core owns:** composition validation principles.  
**Modules own:** their schema/semantics.  
**Must never:** require undocumented globals as the primary integration path.

---

## Ownership Summary

| Question | Answer |
| --- | --- |
| Who defines contracts? | Core |
| Who implements capabilities? | Modules |
| Who composes a product? | Harness |
| Who enforces policy? | Core hooks + harness/module policy implementations |
| Who owns UX persona? | Harness |
| Who owns provider SDKs? | Provider modules |
| Who owns domain tools? | Domain modules / harness packs |

---

## Forbidden Patterns (Drift Catalog)

The following patterns indicate contract violation even if tests pass:

1. Domain types in Core public contracts (“Repository”, “PullRequest”, “Pod”, “BrowserTab” as kernel concepts)
2. Vendor SDK types in Core public contracts
3. UI framework as a Core dependency
4. Silent registry overrides
5. Modules importing private Core paths
6. Agent loop special cases for one harness
7. Events required for correctness only available to one UI
8. Optional permissions treated as granted
9. Starter harness assumptions backported into Core “defaults” that cannot be disabled
10. New Core features justified only by one vertical’s roadmap

---

## Evolving Contracts

Contracts will evolve. Evolution rules:

1. **Document first** — update this file (and related architecture docs) with intent.
2. **Prefer additive capability flags** over breaking required fields.
3. **Provide migration paths** for modules and harnesses.
4. **Reject convenience breaks** — popularity of a shortcut is not justification.
5. **Validate neutrality** — ask whether research, ops, and custom harnesses still make sense.
6. **Keep Core small** — if only one module needs it, it may not be a Core contract.

---

## How to Use This Document in Review

For every significant change, ask:

1. Which contract is affected?
2. Does ownership still match this document?
3. Did a domain or vendor assumption enter Core?
4. Can a third-party module implement this equally?
5. Can a headless harness still function?
6. Are failures attributed and observable?
7. Did policy hooks remain unavoidable for sensitive actions?
8. Is this actually a module concern mislabeled as Core?

If answers are weak, the change is not ready.

---

## Related Documents

- [`VISION.md`](./VISION.md) — why neutrality and modularity matter
- [`CORE.md`](./CORE.md) — kernel scope
- [`MODULES.md`](./MODULES.md) — module lifecycle and packaging
- [`HARNESS.md`](./HARNESS.md) — product composition
- [`ROADMAP.md`](./ROADMAP.md) — phased delivery without contract abandonment

---

## Final Statement

**Contracts are the constitution of Kairo.**

They exist so Core can stay small, modules can compete fairly, and harnesses can be built for ten years without architectural amnesia.

When in doubt, protect the boundary.

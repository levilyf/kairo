# Kairo Core

**Contract document for `@kairo/core`.**

This document defines what Core is, what it owns, what it must never own, and how its major pieces fit together. Future development is valid only when it remains consistent with this contract.

Core is the kernel of Kairo. Everything else is a module or a harness.

---

## Purpose of Core

`@kairo/core` exists to provide a **small, stable, domain-agnostic runtime foundation** for AI harnesses.

Core’s job is to:

1. Define architectural contracts
2. Host the module system primitives
3. Run the abstract agent/runtime loop
4. Manage sessions, turns, and runtime events
5. Coordinate providers, tools, and context builders through interfaces
6. Remain boring, predictable, and slow-changing

Core’s job is **not** to be useful as a finished product by itself. A useful product is a harness.

---

## Design Intent: Small and Stable

Core must stay small for the same reason kernels stay small:

- **Stability** — Fewer responsibilities mean fewer reasons to break users.
- **Clarity** — Contributors can reason about the whole kernel.
- **Neutrality** — Domain and vendor opinions cannot hide inside “just one more Core feature.”
- **Ecosystem leverage** — Value accrues to modules and harnesses, which can move faster.
- **Longevity** — A ten-year platform needs a center that does not thrash.

### Stability rules

1. Core APIs are contracts. Breaking them requires deliberate major-version discipline.
2. Popularity of a feature is not sufficient reason to move it into Core.
3. If a capability is optional for some harnesses, it is almost certainly not Core.
4. Core may provide hooks and registries; modules provide behavior.
5. Defaults may exist only when they are domain-neutral and minimal.

**Rule of thumb:** When unsure whether something belongs in Core, put it in a module. Promote to Core only when multiple independent harnesses require the same primitive and the primitive has a stable meaning.

---

## What Core Owns

Core owns **platform primitives**, not **product features**.

### 1. Architectural contracts

Core defines the contracts described in [`CONTRACTS.md`](./CONTRACTS.md), including but not limited to:

- Provider
- Tool
- Command
- Module
- UI (as a consumer surface contract, not a concrete UI)
- Runtime Events
- Context Builder
- Agent Loop
- Session
- Context

Core owns the meaning of these contracts. Implementations may live elsewhere.

### 2. Module system kernel

Core owns the minimal machinery to:

- register modules
- discover modules (through defined discovery sources)
- load and initialize modules
- resolve module dependencies at the architectural level
- expose extension points modules can bind to
- manage module lifecycle states
- surface module failures through defined error channels

Details of packaging ecosystems may evolve, but the lifecycle model and registration semantics belong to Core.

### 3. Runtime orchestration primitives

Core owns the abstract execution model:

- creating and advancing sessions
- turn boundaries
- invoking the agent loop
- dispatching tool calls through registered tools
- emitting runtime events
- applying cancellation / abort semantics at the runtime level
- coordinating context assembly via registered context builders

Runtime is the execution host.

Runtime is NOT the implementation of every execution service.

Runtime coordinates services.

It does not absorb them.

Core does not own domain workflows that happen to use those primitives.

### 4. Session and context state model

Core owns the conceptual model of:

- **Session** — durable unit of interaction / work
- **Turn** — one step of user or system input through model/tool activity
- **Context** — structured material presented to a provider for a completion
- **Context Builder pipeline** — ordered contribution of context pieces

Core defines how these objects are represented at the contract level and how modules may contribute to them. Core does not decide repository indexing strategies, browser DOM strategies, or enterprise document policies.

### 5. Registry surfaces

Core owns registries (or equivalent extension catalogs) for:

- providers
- tools
- commands
- context builders
- event listeners / subscribers (as appropriate)
- modules themselves
- other extension points explicitly declared by Core

Registries are passive coordination points. They must not become dumping grounds for domain logic.

### 6. Configuration composition boundaries

Core owns the idea that a harness is a composed configuration of modules + bindings + policies. Core may define how configuration is validated against contracts. Core does not own every configuration key a module might introduce.

### 7. Error and event taxonomy (platform-level)

Core owns platform-level failure classes and runtime event kinds that all harnesses can rely on (for example: module load failure, provider failure, tool failure, cancellation, turn completed). Domain-specific event taxonomies belong in modules/harnesses, preferably namespaced.

### 8. Security boundary hooks

Core owns the *hooks and enforcement points* where policy can be applied:

- tool invocation gates
- provider call gates
- module permission declarations
- session/data access boundaries at the primitive level

Core does not own a complete enterprise policy product. It owns the places policy must be able to act.

---

## What Core Must Never Own

The following are **explicitly outside Core**. Adding them to Core is an architectural violation unless this document is deliberately revised.

### Domain systems

- coding / repository intelligence
- research / citation systems
- DevOps / cloud control planes
- browser automation engines
- enterprise SaaS workflow packs
- education, gaming, or other vertical logic

### Provider SDKs and vendor lock-in

- hard dependency on a single model vendor
- vendor-specific request shapes as Core’s public model
- billing, org management, or cloud consoles for a provider

### Concrete user interfaces

- a mandatory CLI UX
- a mandatory web app
- a mandatory IDE extension
- rich presentation frameworks as Core requirements

UI modules may exist. Core only exposes events and contracts they can consume.

### Data platform products

- vector database products
- document stores as required infrastructure
- proprietary memory products
- training data pipelines

Memory or retrieval may appear as modules implementing contracts; they are not Core.

### Opinionated agent personalities and prompts

- system prompts that assume a coding assistant identity
- “helpful assistant” product copy as platform identity
- domain prompt libraries

Core may allow harnesses/modules to supply instructions and policies. It must not ship a product persona as the kernel.

### Marketplace commerce

- payments, listings, rankings, and storefront UI

Marketplace is an ecosystem phase, not a Core concern.

### Everything “because users might want it”

Core is not a convenience bag. Desire for a feature is evidence for a module or harness default, not for kernel growth.

---

## Major Components Inside Core

The following components belong inside Core as conceptual parts of the kernel. Names are architectural, not a mandate for file layout.

### 1. Contract Layer

Defines the public contracts modules and harnesses rely on.

**Responsibilities**

- specify interfaces and guarantees
- version contract surfaces thoughtfully
- remain implementation-light

**Must not**

- embed domain behavior “for example completeness”

### 2. Module Host

The kernel side of the module system.

**Responsibilities**

- registration
- discovery coordination
- dependency awareness
- lifecycle transitions
- isolation expectations
- failure reporting

**Interacts with**

- registries
- harness composition
- runtime startup/shutdown

### 3. Registry

Catalogs of replaceable capabilities.

**Responsibilities**

- accept registrations from modules
- resolve capabilities by name/id
- expose introspection for harnesses and UIs
- enforce uniqueness / override rules defined by architecture

**Must not**

- execute domain logic beyond lookup and binding rules

### 4. Session Manager

Owns session identity and lifecycle at the primitive level.

**Responsibilities**

- create/load/persist-boundary hooks for sessions (persistence adapters may be external)
- track session metadata needed by the runtime
- bound turns to sessions
- support cancellation scopes tied to sessions/turns

**Must not**

- know what a “repo session” or “browser profile” means beyond generic extension metadata

### 5. Context Assembler

Coordinates context builders to produce a Context for a provider call.

**Responsibilities**

- run registered context builders in defined order
- apply size/policy hooks if declared at platform level
- present a coherent Context object to the loop/provider boundary

**Must not**

- hard-code retrieval strategies for specific domains

### 6. Agent Loop / Runtime Loop

The abstract cycle that turns inputs into model calls, tool calls, events, and outputs.

**Responsibilities**

- orchestrate a turn
- call providers through the Provider contract via Provider Gateway (`invoke` or, when `stream: true`, `stream`)
- forward provider-neutral stream events to an optional `onStreamEvent` observer (observation only)
- execute tools through the Tool contract only after a full `ProviderResponse` is available (`message_end` for streams)
- emit runtime events
- honor abort/cancel
- remain domain-agnostic

**Must not**

- special-case coding workflows, browser workflows, etc.
- own product-level “auto-continue forever” opinions beyond generic loop controls exposed to harnesses
- silently fall back from stream → complete when streaming is requested
- treat stream observers as control-flow or policy

### 7. Provider Gateway

Boundary between Core and model providers.

**Responsibilities**

- accept provider implementations via contract
- normalize invocation at the architectural level (`invoke` for `complete()`, `stream` for `stream()`)
- surface provider errors as platform errors
- support streaming as a contract capability where defined
- for streams: select provider, evaluate `provider.call` policy, translate Context → ProviderRequest, require `capabilities.streaming` + `stream()`, yield attributed `ProviderStreamEvent`s, validate final `message_end` response, emit lifecycle events (`provider.called` / `provider.completed` / `provider.failed`)
- fail closed with `STREAMING_UNSUPPORTED` when a stream is requested but the provider cannot stream — **never** silently fall back to `complete()`

**Must not**

- ship as a wrapper around one vendor SDK only
- leak vendor-only features into the required Core path without optional capability negotiation
- own Agent Loop, tools, UI, or session persistence

### 8. Tool Router

Boundary between Core and tools.

**Responsibilities**

- resolve tool calls
- validate against tool schemas/contracts
- enforce permission hooks
- return tool results to the loop
- emit tool lifecycle events

**Must not**

- implement domain tools itself

### 9. Command Surface

Optional-but-core abstraction for discrete invocations (CLI commands, slash commands, automation entrypoints) registered by modules.

**Responsibilities**

- register commands
- dispatch invocations
- keep command identity separate from tool identity (they may wrap each other in modules, but Core treats them as distinct contracts)

**Must not**

- define a full CLI product UX

### 10. Event Bus / Runtime Event System

The nervous system of the runtime.

**Responsibilities**

- define core event kinds
- allow modules/UIs/harnesses to subscribe
- preserve ordering guarantees that the contract promises
- enable observability without coupling producers to consumers

**Must not**

- require a specific telemetry vendor
- become a hidden control-flow maze that bypasses the loop contracts

### 11. Policy Hooks

Enforcement points for permissions and constraints.

**Responsibilities**

- provide gate locations before sensitive actions
- allow harness/module policies to approve, deny, or modify within contract limits
- make denials visible through errors/events

**Must not**

- implement a full GRC product in Core

### 12. Harness Composition Entry

Core defines how a harness is described and booted: which modules load, which bindings apply, which runtime options are set.

**Responsibilities**

- accept a harness definition
- initialize Core services
- load modules in valid order
- hand off to runtime readiness

**Must not**

- embed a specific product harness as “the” Core default identity

---

## How Core Components Interact

At a high level, interaction follows this shape:

1. **Harness definition** is accepted by Core’s composition entry.
2. **Module Host** loads modules according to lifecycle and dependency rules.
3. Modules **register** providers, tools, commands, context builders, listeners, and policies into **Registries** / hooks.
4. A **Session** is created or resumed via **Session Manager**.
5. Input begins a **Turn** in the **Agent Loop**.
6. **Context Assembler** gathers contributions into a **Context**.
7. **Provider Gateway** performs a model invocation.
8. If the model requests work, **Tool Router** executes registered tools under **Policy Hooks**.
9. **Runtime Events** stream outward for UI, logging, and control planes.
10. The loop continues until turn completion rules say stop, or cancellation occurs.
11. On shutdown, Module Host tears down modules in defined order.

This interaction model is the spine of Kairo. Modules may add richness at registration points; they should not invent a second private runtime that bypasses Core.

---

## Extension Points

Core is useful because it is incomplete in the right places.

### Primary extension points

| Extension point | Who implements | Core’s role |
| --- | --- | --- |
| Provider | provider modules | contract + gateway |
| Tool | tool modules / harness packs | contract + router + policy gates |
| Command | modules / harnesses | contract + dispatch |
| Context Builder | modules / harnesses | pipeline coordination |
| Module | all capability packs | host + lifecycle |
| UI / surface | UI modules or external apps | consume events + issue commands/inputs |
| Policy | policy modules / harness rules | hooks + enforcement API |
| Persistence adapter | storage modules | session durability boundary |
| Telemetry consumer | observability modules | subscribe to runtime events |
| Loop controls | harness configuration / modules | parameters and guards around the abstract loop |

### Rules for extension points

1. **Registration is explicit.** Side-effect magic is discouraged except where discovery requires it, and even then lifecycle must remain visible.
2. **Namespacing matters.** Third-party capabilities must not collide carelessly with first-party names.
3. **Capability negotiation is preferred to hard requirements.** Optional features should degrade cleanly.
4. **Extension points are versioned with Core.** Adding a new extension point is a Core change; using one is a module change.
5. **No back doors.** Modules should not reach into Core private state to “save time.” If a need is real, the contract expands deliberately.

---

## Ownership Boundaries Summary

| Concern | Owner |
| --- | --- |
| Contract definitions | Core |
| Module lifecycle semantics | Core |
| Session/turn primitives | Core |
| Abstract agent loop (including optional stream mode) | Core |
| Provider streaming capability + Gateway `stream()` | Core contracts + gateway |
| Provider implementation (including SSE adapters) | Modules / provider packages |
| Tool implementation | Modules |
| Prompt/persona/domain policy | Harness + modules |
| UI | Modules / external surfaces |
| Chat REPL, progressive render, JSONL session files | Product surface (`@kairo/chat`, CLI) — **not** Core |
| Marketplace | Ecosystem (not Core) |
| Vertical products | Harnesses |

---

## Compatibility and Change Policy (Architectural)

Without turning this into a release-engineering manual, Core must honor these change principles:

1. **Additive first.** Prefer new optional contracts over breaking old ones.
2. **Deprecation windows.** Behavior removal is a process, not a surprise.
3. **Harness neutrality preserved under change.** A Core change that only benefits one vertical is suspect.
4. **Module compatibility is a feature.** Core should enable modules built against documented contracts to survive across reasonable Core upgrades.
5. **Document before expand.** New Core responsibilities require updates to this document and [`CONTRACTS.md`](./CONTRACTS.md).

---

## What “Done” Looks Like for Core

Core is successful when:

- a new vertical harness can be built without modifying Core
- a provider can be added as a module without modifying Core
- a UI can be replaced without modifying Core
- Core releases are infrequent relative to module releases
- contributors can explain Core’s boundary in one sitting
- architectural debates resolve by checking this document

Core is failing when:

- every product idea becomes a Core PR
- domain types appear in kernel contracts
- harnesses must fork Core to be viable
- modules depend on undocumented private behavior

---

## Related Documents

- [`VISION.md`](./VISION.md) — why Core must stay neutral
- [`MODULES.md`](./MODULES.md) — module system detail
- [`HARNESS.md`](./HARNESS.md) — how products are composed on Core
- [`CONTRACTS.md`](./CONTRACTS.md) — contract-level responsibilities
- [`ROADMAP.md`](./ROADMAP.md) — when Core matures relative to ecosystem phases

---

## Final Contract Statement

**`@kairo/core` is the stable kernel of a harness platform.**

It defines contracts, hosts modules, runs an abstract runtime, and refuses domain ownership.

If a change makes Core more like a product and less like a kernel, it is the wrong change.

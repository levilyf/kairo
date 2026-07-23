# Kairo Module System

This document defines the module system for Kairo. It is intentionally detailed so modules can be implemented later without redesigning the architecture.

The module system is how Kairo grows without enlarging Core.

---

## Purpose

Modules are the unit of capability in Kairo.

Core provides contracts and lifecycle. Modules provide behavior: providers, tools, commands, context builders, policies, UIs, persistence adapters, and domain packs.

Without a strong module system, Kairo collapses into either:

- a monolith that absorbs every feature, or
- a kernel people fork because they cannot extend it cleanly

This document exists to prevent both failures.

---

## What Is a Module?

A **module** is a versioned, loadable unit that participates in the Kairo runtime by:

1. declaring metadata (identity, version, dependencies, capabilities)
2. registering one or more implementations against Core contracts
3. following the module lifecycle
4. optionally contributing configuration schema and permissions requirements

A module is **not**:

- a complete harness (a harness *composes* modules)
- a free-form plugin with undefined side effects
- a vendor SDK dropped into Core
- a substitute for Core contracts

### Mental model

- **Core** = kernel + contracts
- **Module** = packaged capability
- **Harness** = product composition of Core + selected modules + policies/config

---

## Design Goals

1. **Provider-neutral** — modules must not assume a privileged model vendor in the system design.
2. **Domain-neutral host** — the module system itself does not understand coding, research, etc.
3. **Equal contracts** — first-party and third-party modules use the same registration model.
4. **Explicit lifecycle** — load, start, run, stop, fail are visible states.
5. **Composable dependencies** — modules can depend on other modules without circular chaos.
6. **Safe failure** — one module’s failure should be containable.
7. **Replaceability** — alternate modules can implement the same capability space.
8. **Inspectability** — harnesses can list what is loaded and why.

---

## Module Identity

Every module has stable identity metadata:

| Field | Meaning |
| --- | --- |
| **id** | Stable unique identifier (namespaced) |
| **name** | Human-readable name |
| **version** | Module version |
| **description** | Short purpose statement |
| **capabilities** | What contract surfaces it contributes to |
| **dependencies** | Other modules or capability requirements |
| **permissions** | What sensitive powers it requests |
| **optional flag** | Whether the harness may boot without it |
| **compatibility** | Core contract range it targets |

### Namespacing

Module IDs should be namespaced to reduce collisions, for example:

- first-party style identities under a clear Kairo namespace
- third-party identities under publisher namespaces

Architecture requires **collision-conscious identity**, not a specific string format frozen forever in this document. The principle is stable uniqueness and clear ownership.

---

## What Modules May Contribute

A module may register any combination of:

- **Providers** — model backends
- **Tools** — invocable capabilities for the runtime loop
- **Commands** — discrete entrypoints for users or automation
- **Context builders** — contributors to context assembly
- **Policies** — gates and constraints
- **Event consumers / producers** — observability or coordination within event rules
- **UI surfaces** — interfaces that consume runtime events and submit inputs/commands
- **Persistence adapters** — session or artifact storage backends
- **Capability packs** — grouped registrations for a domain (still just registrations)

Modules may also contribute:

- configuration schema for harness authors
- documentation metadata
- health checks
- deprecation notices

Modules must not:

- redefine Core contracts unilaterally
- patch Core private internals
- assume they are the only module of their kind unless they declare a singleton capability and the harness accepts that

---

## Module Lifecycle

Modules move through explicit states.

```text
Discovered
    ↓
Registered (metadata known to host)
    ↓
Resolved (dependencies satisfied)
    ↓
Loaded (code/resources available)
    ↓
Initialized (registrations applied)
    ↓
Started (runtime-active)
    ↓
Stopped (no longer runtime-active)
    ↓
Unloaded (resources released)
```

Failure may transition a module to a **Failed** state from multiple points. Failed modules must be observable.

### Lifecycle phases explained

#### Discovery

The host finds module candidates from configured sources (see Discovery). Discovery yields metadata, not necessarily full activation.

#### Registration

The host records module identity and declared intents. Registration answers: “What modules exist for this harness?”

#### Resolution

The host checks dependencies, version compatibility, capability conflicts, and permission requirements. Resolution answers: “Can this set of modules form a valid runtime?”

#### Loading

Module implementation becomes available to the process/runtime according to the platform’s loading model. Loading answers: “Is the module code present and usable?”

#### Initialization

The module applies registrations: tools, providers, builders, listeners, etc. Initialization should be deterministic and order-aware with respect to dependencies.

#### Start

The module becomes runtime-active. Background workers allowed by contract may begin. Start happens only after Core runtime services needed by the module are ready, according to dependency rules.

#### Stop

The module ceases runtime activity. Open resources it owns should be released or handed off according to contract.

#### Unload

The module is detached. Registrations are removed or invalidated according to host rules.

### Lifecycle rules

1. **No registration after start without an explicit hot-reload design.** Initial architecture may defer hot reload; if absent, modules are composed at boot.
2. **Dependency order is respected** on init/start and reversed on stop/unload where practical.
3. **Idempotent cleanup is required.** Stop/unload must tolerate partial failure.
4. **Harness boot fails closed or degrades only by policy.** See Optional modules and Error handling.
5. **Lifecycle is observable via runtime events/platform diagnostics.**

---

## Registration

Registration is how modules attach behavior to Core.

### Principles

- Registration targets **contracts**, not Core private classes.
- Registration includes enough metadata for introspection (id, version, description, permissions).
- Registration may declare **priority / order** where ordering matters (especially context builders and policy chains).
- Registration may declare **replacement** or **override** intent, but overrides are harness-controlled, not silent.

### What gets registered

Examples of registrable units:

| Unit | Registry / surface |
| --- | --- |
| Provider adapter | Provider registry |
| Tool | Tool registry |
| Command | Command registry |
| Context builder | Context pipeline |
| Policy gate | Policy hook chain |
| Event subscriber | Event bus |
| UI adapter | UI surface catalog (if present) |
| Persistence adapter | Persistence boundary |

### Registration conflicts

Conflicts occur when:

- two modules claim the same absolute ID for a tool/provider/command
- two modules claim exclusive ownership of a singleton capability
- ordering requirements form a cycle
- permissions are incompatible with harness policy

Conflict resolution is **harness-policy-driven** with Core enforcement:

- deny boot
- prefer explicit harness pin/override
- allow namespaced coexistence where IDs differ

Silent last-writer-wins is not an acceptable default architecture.

---

## Discovery

Discovery answers where modules come from.

### Discovery sources (architectural categories)

1. **Explicit harness manifest** — the primary, intentional source
2. **Configured module paths / packages** — local or installed packages declared by the harness
3. **Environment / deployment overlays** — enterprise distributions adding modules
4. **Dev/test fixtures** — non-production discovery for development

### Discovery principles

- **Intentional over magical.** Auto-scanning the universe is not required and often harmful.
- **Harness-defined.** A harness should be able to explain every loaded module.
- **Provider-neutral.** Discovery does not favor a cloud marketplace by default.
- **Auditable.** Discovery results should be listable before activation.

### Non-requirements for v1 architecture

This architecture does not require:

- remote code execution from arbitrary URLs at runtime
- automatic installation of dependencies without harness consent
- a single global module search path that cannot be disabled

Those may appear in later ecosystem phases only with explicit security model updates.

---

## Loading

Loading is the transition from metadata to executable module contribution.

### Loading principles

1. **Deterministic composition** — same harness definition yields same module set (modulo explicit dynamic overlays).
2. **Lazy vs eager** — architecture allows eager boot loading as the default mental model; selective lazy loading may exist for heavy optional modules if lifecycle remains correct.
3. **Isolation-aware** — loading should not require modules to mutate global process state casually.
4. **Failure-aware** — load errors become module failures with reasons.

### Loading must not require

- Core recompilation
- editing Core source
- privileged provider keys baked into Core

---

## Dependencies

Modules may depend on:

1. **Core contract versions** — minimum/maximum compatibility range
2. **Other modules** — hard dependency on a module ID/range
3. **Capabilities** — dependency on an abstract capability rather than a specific module (preferred when multiple implementations can satisfy a need)
4. **Permissions granted by harness** — not a package dependency, but a runtime requirement

### Dependency rules

- **Prefer capability dependencies over concrete module IDs** when interchangeability matters.
- **No circular dependencies.** Resolution must detect and reject cycles.
- **Optional dependencies** are allowed and must be declared as optional.
- **Version ranges** must be explicit enough to prevent “works on my machine” ecosystems.
- **Harness pins win.** When conflicts arise, harness composition choices resolve them or fail boot.

### Dependency resolution outcomes

| Outcome | Meaning |
| --- | --- |
| Satisfied | Module may proceed |
| Missing required dependency | Resolution failure |
| Version mismatch | Resolution failure unless harness override policy exists and is explicit |
| Optional missing | Module may run in degraded mode if it supports that, else skip optional feature |

---

## Versioning

Versioning applies at three layers:

1. **Core contract version**
2. **Module version**
3. **Harness composition lock** (pinned set of modules)

### Principles

- Modules declare which Core contract range they support.
- Harnesses should pin module versions for reproducibility.
- Breaking contract changes in Core require major-version discipline.
- Modules should use semantic versioning principles: breaking registration/behavior changes bump major.
- Deprecations are communicated through metadata and documentation, not surprise removal.

### Compatibility expectations

- A module built for a Core contract should not need source changes for compatible Core patch/minor releases.
- Harness authors should be able to upgrade one module without rewriting all modules, subject to dependency graphs.
- “Works with whatever Core is on main” is not a compatibility strategy.

---

## Isolation

Isolation is a spectrum. Architecture requires **clear expectations**, not a fantasy of perfect sandboxing on day one.

### Isolation goals

1. **Fault isolation** — module failure should not corrupt Core invariants.
2. **Namespace isolation** — IDs and events should not collide carelessly.
3. **Permission isolation** — modules only get powers the harness grants.
4. **State isolation** — modules should not privately mutate other modules’ state.
5. **Failure containment** — tool/provider errors stay attributed to their source.

### Isolation levels (conceptual)

| Level | Description | When |
| --- | --- | --- |
| Logical isolation | Separate registries, ownership metadata, permission checks | Minimum required always |
| Lifecycle isolation | Independent fail/stop without tearing down entire process if policy allows | Required for optional modules |
| Process/host isolation | Stronger boundaries for untrusted modules | Future/enterprise hardening option |
| Network/data isolation | Restrict external access by policy | Harness/policy concern with Core hooks |

### Rules

- Core must assume modules can be buggy.
- Untrusted third-party modules eventually need stronger isolation options; architecture should not prevent that evolution.
- Isolation never excuses missing contracts. Sandboxing is not a replacement for clean APIs.

---

## Error Handling

Module errors are first-class.

### Error categories

1. **Discovery errors** — module declared but not found / unreadable metadata
2. **Resolution errors** — dependency/permission/conflict failures
3. **Load errors** — implementation cannot be loaded
4. **Initialization errors** — registration fails
5. **Runtime errors** — tool/provider/command failures during operation
6. **Stop/unload errors** — cleanup failures

### Error handling principles

- **Attribute errors** to module ID and phase.
- **Emit platform events** for observability.
- **Distinguish optional vs required** module failure.
- **Do not swallow errors** into generic “something failed.”
- **Preserve Core integrity** after module failure.
- **Allow harness policy** to choose fail-fast vs degrade where architecture permits.

### Required vs optional failure behavior

| Module type | Failure at boot | Failure at runtime |
| --- | --- | --- |
| Required | Harness boot fails | Error surfaces; may fail turn/session according to severity |
| Optional | Boot continues with module disabled if safe | Feature degrades; harness remains usable if possible |

Runtime errors in tools/providers should generally fail the invocation, emit events, and let the loop/harness decide recovery — not crash Core.

---

## Optional Modules

Optional modules let harnesses degrade gracefully.

### Characteristics

- declared optional in harness composition and/or module metadata
- may be absent, disabled, or failed without killing the harness (when safe)
- must not be the sole provider of a non-optional capability unless the harness accepts that risk

### Use cases

- experimental tools
- platform-specific integrations
- expensive optional UI surfaces
- enterprise-only connectors in mixed distributions

### Rules

1. Optional is a **composition property**, not an excuse for broken dependencies.
2. If other required modules hard-depend on an optional module, resolution must treat that chain as required.
3. Users/operators should be able to see which optional modules are inactive and why.

---

## First-Party Modules

**First-party modules** are maintained by the Kairo project (or designated official stewards).

### Purpose

- prove the module system
- provide reliable baselines (e.g., reference providers, common utilities)
- avoid putting useful-but-non-kernel features into Core

### Rules

1. First-party modules use the **same contracts** as third-party modules.
2. First-party status does not grant backdoor access to Core internals.
3. First-party modules may be recommended by starter harnesses, but must remain removable.
4. Promotion of a first-party module into Core is exceptional and requires architectural justification under [`CORE.md`](./CORE.md).

### Examples of likely first-party module categories (non-prescriptive)

- reference provider adapters
- baseline telemetry consumer
- filesystem tool packs (still domain-ish; may live near starter harnesses)
- session persistence adapters
- policy utilities

Exact catalogs belong to roadmap execution, not this contract’s frozen product list.

---

## Third-Party Modules

**Third-party modules** are published and maintained outside Core stewardship.

### Purpose

- scale ecosystem faster than Core maintainers can
- support specialized domains and enterprises
- allow competition among implementations of the same capability

### Rules

1. Third-party modules are first-class citizens of the contract model.
2. They must declare permissions and dependencies honestly.
3. Harnesses decide trust — Core does not silently trust remote code.
4. Naming/branding must not impersonate first-party modules.
5. Security review expectations may differ by distribution channel, but the runtime contracts remain the same.

### Ecosystem expectations

As the ecosystem matures (see [`ROADMAP.md`](./ROADMAP.md)), third-party modules should be installable and composable without forking Kairo. Marketplace phases come later; the module architecture must not assume marketplace existence.

---

## Module Configuration

Modules may define configuration consumed by harness composition.

### Principles

- configuration schema is declared, not tribal knowledge
- secrets are never required to be hard-coded in module source
- Core validates only what it must; modules validate their own config shapes
- harnesses provide values; modules receive them at init/start according to lifecycle

### Anti-patterns

- hidden global env var requirements with no declaration
- modules that only work if Core is patched with config keys
- cross-module config mutation at runtime without contracts

---

## Permissions Model (Architectural)

Modules should declare the sensitive powers they need, such as:

- network access categories
- filesystem scopes
- tool execution privileges
- session data access
- ability to register providers/tools/commands
- ability to install policy gates

Core/harness policy grants or denies these powers.

### Principles

- **Least privilege** by default
- **Explicit grants** in harness composition for sensitive capabilities
- **User-visible denials** when policy blocks an action
- **No ambient authority** merely because a module loaded

Detailed permission vocabularies may evolve; the requirement for declaration and enforcement points does not.

---

## Ordering and Priority

Some contributions are order-sensitive:

- context builders
- policy chains
- event observers (for observability guarantees, where claimed)
- shutdown hooks

### Rules

- ordering is explicit in harness config and/or declared priorities
- deterministic order is mandatory
- cycles in order constraints are resolution errors
- “whatever loaded last” is not an architecture

---

## Testing and Observability Expectations

While this is not a test plan, architecture implies:

- modules can be tested against Core contracts without a full product harness
- harnesses can boot with fixture modules
- runtime events expose module load/start/fail
- introspection can answer “what tools/providers are active?”

---

## Anti-Patterns (Rejected)

The module system rejects these patterns:

1. **Core special-cases a favorite module**
2. **Modules import Core private internals**
3. **Hidden global singleton mutation as integration**
4. **Domain logic in registration host**
5. **Undeclared mandatory network calls at import time**
6. **Silent override of existing tools/providers**
7. **Circular interdependent module graphs**
8. **Treating first-party modules as kernel**
9. **Marketplace coupling inside load semantics**
10. **Failing open on permission checks**

---

## Relationship to Harnesses

A harness selects, configures, and pins modules.

Modules should be reusable across harnesses when their capability is reusable. Domain packs may be less reusable; that is acceptable if boundaries remain clean.

If a “module” can only ever work inside one private fork of Core, it is not a module — it is a fork.

---

## Relationship to Contracts

Modules implement contracts; they do not replace them.

If multiple modules need the same new integration surface, that is evidence for:

1. a new Core contract / extension point, or
2. a shared library module — not Core growth by default

Choose (1) only when the need is platform-shaped. Choose (2) when the need is ecosystem-shaped.

---

## Minimal Module Definition Checklist

A well-formed module definition includes:

- [ ] stable namespaced ID
- [ ] version
- [ ] Core compatibility range
- [ ] human description
- [ ] declared capabilities contributed
- [ ] dependencies (module and/or capability)
- [ ] permission requirements
- [ ] optional/required intent relative to expected harness use
- [ ] registration plan (what contracts it binds)
- [ ] failure behavior expectations
- [ ] config schema (if any)
- [ ] stop/unload cleanup responsibilities

---

## Future Evolution (Non-Binding Direction)

The architecture anticipates, but does not require immediately:

- stronger sandbox profiles for untrusted modules
- signed module distributions
- capability marketplaces
- hot reload for development harnesses
- capability-based dependency resolution UX tools

None of these may break the core principles: explicit lifecycle, equal contracts, provider neutrality, and harness-owned composition.

---

## Related Documents

- [`VISION.md`](./VISION.md) — why modules exist
- [`CORE.md`](./CORE.md) — kernel boundary
- [`HARNESS.md`](./HARNESS.md) — composition of modules into products
- [`CONTRACTS.md`](./CONTRACTS.md) — what modules implement
- [`ROADMAP.md`](./ROADMAP.md) — ecosystem phases

---

## Final Statement

**A Kairo module is a versioned capability package that binds to Core contracts through an explicit lifecycle.**

The module system is successful when new capabilities ship without Core changes, and when third parties can compete on equal footing with first-party modules.

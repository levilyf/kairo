# Kairo Roadmap

This roadmap describes how Kairo should grow from a kernel idea into a durable platform for building AI harnesses.

It is a **strategic sequence**, not a sprint board. Dates are intentionally absent. Phases advance when success criteria are met, not when enthusiasm peaks.

Guiding rule for every phase:

> Protect Core neutrality. Grow capability through modules and harnesses.

---

## Roadmap Overview

| Phase | Name | Primary outcome |
| --- | --- | --- |
| 1 | Core Kernel | Stable, small, documented `@kairo/core` |
| 2 | Official Modules | First-party modules proving contracts |
| 3 | Starter Harness | One or more reference compositions users can run and fork |
| 4 | Module Ecosystem | Third parties can build and share modules confidently |
| 5 | Marketplace | Discovery/distribution layer for modules and templates |
| 6 | Community Harnesses | Diverse public harnesses become the center of gravity |

Phases may overlap slightly in preparation work, but **public claims** should not skip the maturity of earlier phases.

---

## Phase 1 — Core Kernel

### Goal

Establish `@kairo/core` as a trustworthy kernel: contracts, module host primitives, session/turn runtime, abstract agent loop, registries, events, and policy hooks.

### Scope

**In scope**

- architectural documents (this set) as binding guidance
- Core contract surfaces defined and kept domain-neutral
- module lifecycle host (even if initially minimal)
- provider/tool/command/context/session/event foundations
- harness composition entry at the architectural level
- explicit non-goals enforced in review culture

**Out of scope**

- coding-agent product identity
- marketplace
- large first-party domain packs
- polished multi-surface UX as a Core deliverable
- vendor lock-in convenience features

### Work themes

1. **Boundary lock** — Core vs module vs harness is unambiguous
2. **Contract completeness** — enough to build real modules without private APIs
3. **Runtime spine** — sessions, turns, loop, events
4. **Failure model** — attributed errors, cancellation, policy denial
5. **Documentation** — contracts readable by module authors

### Success criteria

Phase 1 is complete when:

1. A contributor can explain what Core owns in minutes using [`CORE.md`](./CORE.md).
2. A second domain could be imagined on Core without Core changes.
3. Provider and tool capabilities can be registered without modifying kernel internals.
4. Core contains no coding-specific product identity.
5. Architectural review rejects domain leakage consistently.
6. The abstract loop can run a turn with mocked/reference adapters.
7. Module lifecycle states are real, not aspirational comments.

### Exit risks to avoid

- shipping “just one coding default” into Core
- incomplete contracts that force modules into private hacks
- event systems with no consumers and no guarantees
- infinite design freeze with no runnable kernel spine

---

## Phase 2 — Official Modules

### Goal

Prove that Core is useful by shipping a small set of **first-party modules** that implement real capabilities through public contracts.

### Scope

**In scope**

- reference provider module(s)
- baseline utility modules (persistence adapter, telemetry consumer, etc.)
- one or more thin domain-agnostic tool modules if needed for demos
- documentation for module authors based on real experience
- contract adjustments discovered while implementing modules (additive preferred)

**Out of scope**

- treating official modules as mandatory kernel pieces
- building a full vertical product before starter harness phase
- exclusive APIs for first-party modules

### Work themes

1. **Contract validation by use** — modules must exercise Provider, Tool, Command, Context Builder, Events
2. **Equal access** — first-party modules use only public contracts
3. **Quality bar** — metadata, permissions, cleanup, versioning done properly
4. **Replaceability** — at least one capability should have a plausible alternate implementation path

### Success criteria

Phase 2 is complete when:

1. Official modules boot through the Module Host lifecycle.
2. A provider can be swapped without Core changes.
3. Tools register, dispatch, emit events, and honor policy hooks.
4. Module docs are written from working examples, not theory alone.
5. No first-party module requires Core private internals.
6. Failures in an optional module can be contained according to architecture.

### Exit risks to avoid

- “temporary” private Core APIs that become permanent
- official modules secretly becoming Core
- only happy-path demos with no failure attribution
- provider-specific assumptions leaking upward

---

## Phase 3 — Starter Harness

### Goal

Ship a **starter harness** (or a very small set) that shows how to compose Core + modules into something usable — while making it obvious that the harness is not Kairo itself.

### Scope

**In scope**

- harness packaging and composition example
- sensible defaults that remain configurable/removable
- end-to-end path: install/run → session → provider → tool → events → surface
- documentation: “how to build your own harness from this”
- clear separation of starter opinions vs platform contracts

**Out of scope**

- declaring the starter the only supported product
- absorbing starter domain logic into Core
- marketplace distribution requirements
- enterprise completeness

### Recommended posture for the first starter

The first starter may be a **Coding Harness** because it is a common demand — **or** a deliberately smaller generic harness if coding would distort platform identity too early.

Either choice is acceptable only if:

- Core remains coding-ignorant
- docs present the starter as one harness among many
- at least one non-coding harness sketch exists in documentation ([`HARNESS.md`](./HARNESS.md) already provides this)

### Work themes

1. **Composition excellence** — pins, config, policy, surfaces
2. **Teaching** — users learn harness thinking, not only feature clicking
3. **Forkability** — teams can copy and reshape without fighting the starter
4. **Identity hygiene** — repository messaging stays platform-first

### Success criteria

Phase 3 is complete when:

1. A new user can run a starter harness and understand it is a composition.
2. A user can remove/replace a module and still reason about the system.
3. Docs show how to create a different harness without modifying Core.
4. Starter defaults are documented as opinions, not platform laws.
5. Headless or scripted operation is possible at least in minimal form.
6. Public language (“Kairo is a platform…”) does not collapse into “Kairo is this starter agent.”

### Exit risks to avoid

- starter success redefining the project identity
- harness bugs fixed by Core special cases
- unreproducible module graphs
- policy-free demos that teach unsafe composition habits

---

## Phase 4 — Module Ecosystem

### Goal

Enable third parties to build, distribute, and compose modules with confidence comparable to first-party authors.

### Scope

**In scope**

- robust module author documentation
- versioning/compatibility expectations that hold in practice
- examples of third-party-style modules (even if still published by core team initially)
- discovery via explicit manifests/packages (not necessarily marketplace)
- stronger permission and trust guidance
- testing guidance against contracts

**Out of scope**

- full commercial marketplace UX
- guaranteeing every community module’s quality
- Core growth to satisfy one external vendor’s SDK shape

### Work themes

1. **Contract stability** — third parties can target something durable
2. **Packaging norms** — identity, metadata, permissions, config schema
3. **Compatibility communication** — Core ranges, deprecations
4. **Trust model** — what harness owners must decide
5. **Interchangeability** — multiple modules implementing similar capabilities

### Success criteria

Phase 4 is complete when:

1. An external author can implement a useful module using public docs/contracts.
2. A harness can include third-party modules beside first-party ones without special casing.
3. Version compatibility expectations are documented and generally honored.
4. Conflicts/overrides are explicit and harness-controlled.
5. At least a few independent modules exist and compose in real harnesses.
6. Core changes are reviewed for third-party breakage, not only internal convenience.

### Exit risks to avoid

- unstable contracts that punish early adopters
- undocumented “real” integration paths
- ecosystem dependence on one starter harness internals
- security naivety (ambient authority, auto-loading untrusted code)

---

## Phase 5 — Marketplace

### Goal

Create a **discovery and distribution layer** for modules and harness templates without coupling Core runtime to commerce or a single store.

### Scope

**In scope**

- catalog/discovery experiences
- publishing norms and metadata standards
- signing/verification possibilities
- search by capability, not only by brand
- clear separation: marketplace is ecosystem infrastructure, not kernel

**Out of scope**

- making marketplace availability required for Core to function
- forcing all modules through one paid gate
- turning Core into a store client with hard dependency

### Work themes

1. **Decoupling** — offline/private registries remain valid
2. **Trust & safety** — provenance, permissions visibility, review signals
3. **Capability-oriented discovery** — providers, tools, UIs, packs
4. **Harness templates** — starter compositions as first-class browseable artifacts
5. **Neutrality** — first-party listings do not break equal contracts

### Success criteria

Phase 5 is complete when:

1. Users can discover modules/templates without reading source repos only by word of mouth.
2. Publishing a module does not require Core maintainers to merge it.
3. Harness authors can pin modules obtained via marketplace/registry flows reproducibly.
4. Private/enterprise catalogs can exist with the same metadata ideas.
5. Core runtime still works fully without marketplace connectivity.
6. Permission and identity metadata are visible before adoption.

### Exit risks to avoid

- runtime hard-dependency on a hosted store
- race-to-the-bottom untrusted auto-install defaults
- marketplace incentives pressuring Core to privilege certain vendors
- template spam with no provenance

---

## Phase 6 — Community Harnesses

### Goal

Shift center of gravity from “the official starter” to a **living ecosystem of community and organizational harnesses**.

### Scope

**In scope**

- public harnesses across domains (coding, research, DevOps, browser, enterprise templates, education, etc.)
- shared composition patterns and review culture
- interop expectations across harnesses that share modules
- governance norms for what “official” means versus community
- evidence that Kairo is used as platform infrastructure

**Out of scope**

- central planning of every harness’s product roadmap
- forcing one UX orthodoxy
- absorbing successful community harnesses into Core

### Work themes

1. **Diversity of domains** — prove platform breadth in public
2. **Pattern libraries** — composition patterns, policy patterns, surface patterns
3. **Portable modules** — reuse across harnesses as the default expectation
4. **Organizational adoption** — internal enterprise harnesses as first-class success stories
5. **Cultural defense of neutrality** — resist collapse into one celebrity harness

### Success criteria

Phase 6 is healthy when:

1. Multiple serious harnesses exist outside the original starter lineage.
2. At least some modules are reused across different domain harnesses.
3. New teams choose Kairo to build a harness, not merely to use one official agent.
4. Core release notes remain boring relative to harness/module innovation.
5. Architecture docs still match reality (or are deliberately updated).
6. The phrase “build your own AI harness” is descriptive, not aspirational marketing.

### Exit risks to avoid

- crowning a single community harness as “real Kairo”
- Core maintainers becoming bottleneck feature-implementers for popular harnesses
- fragmentation so extreme that contracts mean nothing
- abandoning architecture docs once ecosystem hype starts

---

## Cross-Phase Principles

These apply from day one to year ten.

### 1. Neutrality is enforced continuously

Every phase re-checks:

- no domain capture of Core
- no provider capture of Core
- no UI capture of Core

### 2. Promotion into Core is rare

A feature moves into Core only when:

- multiple independent harnesses need the same primitive
- the primitive has a stable, domain-neutral meaning
- modules cannot solve it without harmful duplication or private hacks

### 3. Documentation is infrastructure

Architecture docs are not onboarding fluff. They are the compatibility layer between present and future contributors.

### 4. Security maturity increases with ecosystem openness

As third parties and marketplace distribution expand, trust/permission/isolation expectations must harden. Openness without a trust model is negligence.

### 5. Measure the right success

| Bad metric | Better metric |
| --- | --- |
| Number of features in Core | Number of harnesses built without Core changes |
| Stars on one starter agent | Modules reused across domains |
| Vendor SDK count in kernel | Provider modules swappable by contract |
| Hype velocity | Contract stability over time |

---

## Suggested Dependency Graph Between Phases

```text
Phase 1 Core Kernel
    ↓
Phase 2 Official Modules
    ↓
Phase 3 Starter Harness
    ↓
Phase 4 Module Ecosystem
    ↓
Phase 5 Marketplace
    ↓
Phase 6 Community Harnesses
```

Notes:

- Phase 4 can begin experimental outreach during late Phase 3, but should not be declared done early.
- Phase 5 requires Phase 4 norms; a store without stable module contracts becomes a junkyard.
- Phase 6 is not a finish line. It is the steady state of a successful platform.

---

## What This Roadmap Deliberately Does Not Include

- model training plans
- a promise to win coding-agent benchmarks as platform identity
- hard dates that force boundary violations
- a commitment that Core will absorb popular modules
- a single company product roadmap masquerading as platform strategy

Those may exist for specific harness products. They are not Kairo’s kernel roadmap.

---

## Checkpoint Questions for Maintainers

Before advancing a phase claim, answer:

1. Did we enlarge Core for convenience or for true primitives?
2. Can a non-coding harness still take us seriously?
3. Can a third party implement what we just shipped?
4. Are contracts documented and stable enough to depend on?
5. Is the starter still a harness, or has it become a shadow kernel?
6. Are failures observable and attributed?
7. Would this decision still make sense in five years?

If these answers are uncomfortable, stay in the current phase and repair foundations.

---

## Related Documents

- [`VISION.md`](./VISION.md) — long-term philosophy
- [`CORE.md`](./CORE.md) — kernel contract
- [`MODULES.md`](./MODULES.md) — module system
- [`HARNESS.md`](./HARNESS.md) — product composition model
- [`CONTRACTS.md`](./CONTRACTS.md) — boundaries that roadmap work must not violate

---

## Final Statement

Kairo’s future is not a bigger kernel.

Kairo’s future is:

1. a small Core that stays true,
2. modules that multiply capability,
3. harnesses that multiply products,
4. an ecosystem that multiplies ownership.

**Build your own AI harness — and build the platform so others can too.**

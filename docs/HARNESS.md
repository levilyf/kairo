# Kairo Harness

This document defines what a **Harness** is in Kairo, how harnesses are composed, and why the harness — not Core — is the product users build and ship.

---

## What Is a Harness?

A **Harness** is a deliberate composition of:

- **Kairo Core** (the kernel)
- **selected modules** (capabilities)
- **configuration and bindings** (how capabilities are wired)
- **policies** (what is allowed, required, audited)
- **surface(s)** (CLI, UI, headless API, IDE, service, etc.)
- **domain intent** (what the system is *for*)

A harness turns a neutral platform into a purposeful AI system.

If Core is infrastructure, the harness is the product shape.

---

## Why the Harness Is the Product

Users do not “want a kernel.” They want a system that performs work in a domain with acceptable behavior, risk, and UX.

That product shape includes opinions:

- which tools exist
- which models are used
- how context is built
- when humans must approve
- what success means
- what the interface feels like

Those opinions belong in a harness (and its modules), **not** in `@kairo/core`.

### Consequences

1. **Many harnesses can share one Core.**
2. **Harnesses can compete without forking the kernel.**
3. **Organizations can own harness policy without waiting on upstream product taste.**
4. **Core remains stable while products proliferate.**

Kairo’s philosophy — *Build your own AI harness* — means the primary creative act is harness composition.

---

## The Composition Stack

```text
┌─────────────────────────────────────────┐
│                 Harness                 │
│  (product intent, policy, UX, wiring)   │
├─────────────────────────────────────────┤
│                 Modules                 │
│  (providers, tools, UI, adapters, ...)  │
├─────────────────────────────────────────┤
│               Kairo Core                │
│     (contracts, runtime, lifecycle)     │
└─────────────────────────────────────────┘
```

### Core

Provides:

- contracts
- module host
- session/turn runtime
- abstract agent loop
- registries and events
- policy enforcement points

Core does **not** provide product identity.

### Modules

Provide:

- replaceable capabilities
- domain tools
- provider adapters
- interfaces
- persistence and telemetry adapters

Modules are reusable building blocks. They are not, by themselves, a complete product story.

### Harness

Provides:

- selection of modules
- version pins
- configuration values
- policy profile
- defaults (prompts, loop controls, UX flows)
- packaging and distribution as a usable system

The harness answers: **“What is this AI system, and under what rules does it run?”**

---

## How a Harness Is Composed

Architecturally, composing a harness means specifying the following layers.

### 1. Intent

A clear statement of purpose:

- who it serves
- what jobs it performs
- what it refuses to do
- what “good” looks like

Intent is documentation and design, but it drives every later choice.

### 2. Module selection

Choose modules for:

- model providers
- tools
- context builders
- commands
- UI/surfaces
- persistence
- policy/audit
- domain packs

Selection should be intentional. A harness is not “every module available.”

### 3. Binding and configuration

Wire modules together:

- which provider is default
- which tools are enabled
- context builder order
- command exposure
- storage locations
- feature flags that remain harness-level

### 4. Policy profile

Define constraints:

- tool allow/deny lists
- approval requirements
- data handling rules
- network/filesystem scopes
- retention and audit expectations
- multi-user or multi-tenant boundaries if relevant

### 5. Runtime profile

Define loop and session behavior:

- turn limits
- cancellation behavior
- concurrency expectations
- retry posture (if any) at harness level
- human-in-the-loop points

### 6. Surface packaging

Decide how humans or systems interact:

- interactive CLI
- web app
- IDE extension
- headless worker
- API service
- mixed surfaces sharing one harness core composition

### 7. Distribution

Ship the harness as:

- an internal standard
- a product
- a template others fork
- a reference implementation

Distribution is harness concern, not Core concern.

---

## How Users Create Their Own Harness

Creating a harness is a design act first and a packaging act second.

### Recommended conceptual workflow

1. **Write the intent** — one page on purpose, users, non-goals.
2. **List capabilities** — tools, providers, surfaces needed.
3. **Map capabilities to modules** — reuse existing modules where possible.
4. **Identify gaps** — build new modules only for missing capabilities.
5. **Define policy** — especially for side effects and data.
6. **Compose** — declare modules, config, bindings, pins.
7. **Validate** — boot resolution, permission review, failure behavior.
8. **Dogfood** — run real tasks; adjust composition, not Core.
9. **Pin and release** — reproducible module set and docs for operators.

### What users should almost never do

- fork Core to add a tool
- embed domain logic into Core contracts
- hard-code a single provider SDK into the kernel
- treat a starter harness as an immutable religion

If the harness needs a new capability, add or configure a module.

---

## Relationship Details: Core → Modules → Harness

### Core without modules

A theoretical runtime with contracts but little capability. Useful as a foundation, not as a product.

### Modules without a harness

A parts bin. Powerful, but not yet an intentional system.

### Harness without discipline

A pile of modules with conflicting policies and unclear ownership. This is how platforms rot.

A healthy harness is **curated composition**, not accumulation.

---

## Examples of Harnesses

The following examples are architectural illustrations. They are not implementation plans.

---

### Coding Harness

**Intent:** Help humans modify software systems safely and efficiently.

**Typical modules**

- one or more model providers
- repository/filesystem tools
- test execution tools
- diff/patch tools
- language-aware context builders
- CLI and/or IDE UI surfaces
- policy module for destructive command approval

**Harness opinions**

- how code context is selected
- when tests must run
- whether network install tools are allowed
- commit/PR workflows (if any)

**Why not Core?**  
Because coding is a domain. Many Kairo users will never want repository tools.

---

### Research Harness

**Intent:** Gather, compare, and synthesize information with citation discipline.

**Typical modules**

- web retrieval tools (as allowed by policy)
- library/document connectors
- note-taking / knowledge persistence adapters
- claim-tracking context builders
- export commands
- read-heavy UI

**Harness opinions**

- citation requirements
- source quality heuristics (module/harness level)
- limits on speculative claims
- retention of research trails

**Why distinct from Coding?**  
Success metrics, tools, and risk profiles differ completely.

---

### DevOps Harness

**Intent:** Operate infrastructure with strong guardrails.

**Typical modules**

- cloud/provider CLIs wrapped as tools
- Kubernetes/log/metric connectors
- runbook context builders
- approval/policy gates
- audit event sinks
- incident timeline UI

**Harness opinions**

- what production actions require dual control
- environment separation (dev/stage/prod)
- secrets handling
- blast-radius limits

**Critical property:** policy is part of product identity, not an optional plugin afterthought.

---

### Browser Harness

**Intent:** Perform browser-based tasks with explicit action control.

**Typical modules**

- browser automation tool pack
- session/profile isolation adapters
- screenshot/ sensemaking context builders
- confirmation policies for purchases, messages, irreversible actions
- operator UI for live supervision

**Harness opinions**

- allowed domains
- credential handling
- human confirmation thresholds
- artifact retention (screenshots, traces)

---

### Enterprise Harness

**Intent:** Provide organization-standard AI capabilities under compliance constraints.

**Typical modules**

- SSO-aware identity adapters
- approved provider set only
- internal knowledge connectors
- DLP/policy modules
- audit logging sinks
- departmental tool packs
- admin surfaces

**Harness opinions**

- central allowlists
- data residency rules
- retention and eDiscovery posture
- who may enable third-party modules

**Note:** “Enterprise” is not one module. It is a composition and governance style.

---

### Custom Harness

**Intent:** Anything a team needs that does not fit a standard template.

Examples:

- education tutor with curriculum constraints
- game master with world-state tools
- data labeling copilot
- creative production pipeline
- multi-agent operations center
- offline-first field assistant

**Typical pattern**

- minimal provider module(s)
- a few custom domain tools
- strict policy for side effects
- the thinnest UI that works
- heavy investment in context builders unique to the domain

Custom harnesses are not second-class. They are the reason Kairo is a platform.

---

## Starter Harnesses vs Final Products

A **starter harness** is a teaching and acceleration artifact:

- demonstrates composition
- includes sensible defaults
- remains removable/forkable
- must not become a hidden second Core

A **product harness** is owned by a team:

- pinned
- policy-complete
- supported for real users
- free to delete starter opinions

Architecture rule: **starter convenience must never force Core coupling.**

---

## Multi-Surface Harnesses

A single harness composition may expose multiple surfaces:

- headless API for automation
- CLI for operators
- web UI for reviewers

Surfaces should consume the same runtime events and command/input contracts where possible. The harness owns consistency across surfaces; Core owns the event/command primitives that make consistency possible.

---

## Harness Ownership Model

| Concern | Typical owner |
| --- | --- |
| Kernel contracts | Core maintainers |
| Reusable capabilities | Module authors |
| Product behavior | Harness owners |
| Org policy | Harness owners / platform admins |
| End-user UX copy and persona | Harness owners |
| Provider credentials | Operators / harness deployment |

This separation allows a company to standardize on Kairo Core while letting teams ship different harnesses.

---

## Quality Properties of a Good Harness

A good harness is:

1. **Purposeful** — intent is explicit
2. **Minimal** — no unnecessary modules
3. **Policy-complete** — dangerous capabilities have rules
4. **Reproducible** — versions pinned
5. **Observable** — operators can see what loaded and what happened
6. **Replaceable in parts** — modules can be swapped against contracts
7. **Honest about limits** — non-goals documented
8. **Upgradeable** — can move module versions without rewriting identity

A bad harness is a junk drawer of tools with no policy and no story.

---

## Anti-Patterns

### Harness logic pushed into Core

If every harness needs a one-off Core patch, composition has failed.

### Infinite module pile-up

Adding modules without removing or scoping them destroys clarity.

### Fake neutrality

Calling something a “generic harness” while baking one domain’s assumptions into defaults that cannot be disabled.

### UI equals harness

A skin over an inflexible agent is not a harness platform composition.

### Policy as documentation only

If constraints are not enforced at Core policy hooks, they are wishes.

### Treating the Coding Harness as Kairo

This is the most dangerous anti-pattern. It rewrites the platform identity by social gravity.

---

## How Harnesses Should Evolve

Harnesses may evolve quickly:

- swap providers as models change
- add domain tools
- tighten policy after incidents
- redesign UI
- split one harness into specialized harnesses

Core should rarely need to move for these changes.

When many harnesses need the same new primitive, that may justify a Core contract extension. When only one harness needs it, build a module.

---

## Evaluation: Is This a Harness or Something Else?

Use this test:

| Question | If yes |
| --- | --- |
| Does it select and configure modules for a purpose? | Harness |
| Does it only implement one tool/provider? | Module |
| Does it redefine runtime contracts for all users? | Core proposal (rare) |
| Does it only change colors/branding? | Surface skin, not a full harness |
| Does it encode org policy and domain workflow? | Harness (possibly enterprise) |

---

## Examples of Composition Statements (Conceptual)

These are illustrative statements of composition, not manifests or code.

**Coding Harness**  
Core + provider module(s) + repo tools + test tools + code context builders + CLI/IDE UI + safe-exec policy.

**Research Harness**  
Core + provider module(s) + retrieval tools + citation context builders + notes persistence + export commands + read-oriented UI + source-handling policy.

**DevOps Harness**  
Core + provider module(s) + infra tools + audit sink + approval policy + incident context builders + operator UI.

The pattern is always the same: **Core is constant; composition is the product.**

---

## Success Criteria for the Harness Model

The harness model is working when:

- teams can ship a new product category without Core changes
- starter harnesses are helpful but not mandatory
- modules are reused across harnesses
- policy differences are expressible without forks
- newcomers understand they are building a harness, not “customizing the coding agent a little”

The model is failing when:

- all roads lead to one official product identity
- harness authors must understand Core internals to do ordinary composition
- modules are not portable
- Core releases are driven by one harness’s roadmap

---

## Related Documents

- [`VISION.md`](./VISION.md) — platform philosophy
- [`CORE.md`](./CORE.md) — kernel boundary
- [`MODULES.md`](./MODULES.md) — capability packaging
- [`CONTRACTS.md`](./CONTRACTS.md) — integration surfaces harnesses rely on
- [`ROADMAP.md`](./ROADMAP.md) — when starter harnesses and community harnesses appear

---

## Final Statement

**In Kairo, the harness is the product.**

Core makes harnesses possible.  
Modules make harnesses capable.  
Harnesses make Kairo useful in the real world.

Build your own AI harness.

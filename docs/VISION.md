# Kairo Vision

**Build your own AI harness.**

Kairo is a platform for building AI harnesses — a small, stable kernel and a modular ecosystem around it. It is not a single product that decides how AI should behave. It is infrastructure that lets people and organizations compose the behavior they need.

This document defines what Kairo is, what it is not, and the principles that should guide every decision for the next decade.

---

## What Kairo Is

Kairo is a **platform for building AI harnesses**.

A *harness* is the complete, intentional assembly of runtime behavior around a model: tools, context, sessions, UI, policies, loops, and domain logic. Different problems need different harnesses. Kairo exists so those harnesses can be built deliberately, composed from modules, and kept maintainable over time.

At the center of the platform sits **Kairo Core** (`@kairo/core`): a minimal, stable kernel. Core provides contracts, lifecycle, module loading, session and runtime primitives, and extension points. Everything domain-specific lives outside Core as modules or as harnesses composed from modules.

Kairo aims to occupy the same conceptual role for AI harnesses that a kernel occupies for an operating system: a thin, reliable foundation that does not try to be the entire user experience. Applications, tools, and environments are built *on top*.

---

## What Kairo Is NOT

Kairo is **not**:

- **A coding agent.** Coding is one possible harness among many. Core does not know about repositories, pull requests, linters, or language servers.
- **A chatbot product.** Conversation is a pattern some harnesses use; it is not the platform identity.
- **A model provider.** Kairo does not train, host, or sell models. It integrates providers through contracts.
- **A framework that forces one architecture.** Harnesses choose structure; Core only enforces boundaries and contracts.
- **An opinionated vertical app.** Vertical products (coding, research, DevOps, browser automation, enterprise agents) are built *with* Kairo, not *as* Kairo.
- **A dump of features.** Features that can live in modules must not accumulate in Core.
- **A replacement for every AI toolkit.** Kairo competes on composition, stability, and longevity — not on shipping the longest feature list.

If a capability can be expressed as a module or a harness policy, it does not belong in Core.

---

## Philosophy: “Build Your Own AI Harness”

Most AI software today ships as a finished agent: a fixed loop, a fixed tool set, a fixed product identity. Users adapt to the agent.

Kairo inverts that relationship.

**Users and teams should own the harness.** They decide:

- which models and providers to use
- which tools exist
- how context is assembled
- what the session model is
- what policies constrain behavior
- what the UI or headless surface looks like
- what “done” means for a task

The platform’s job is to make that ownership practical: stable contracts, clear module boundaries, predictable lifecycle, and a Core that does not constantly rewrite the rules.

“Build your own AI harness” is not a slogan about DIY for its own sake. It is a claim about **fit and longevity**:

1. **Fit** — Domains differ. A research harness, a production DevOps harness, and an enterprise compliance harness should not share accidental opinions.
2. **Longevity** — Models, tools, and UIs change quickly. The kernel must change slowly. Modules absorb churn.
3. **Ownership** — Organizations should be able to control behavior without forking the platform or waiting for upstream product decisions.

Kairo succeeds when someone can describe a harness in domain language, assemble it from Core + modules, and keep evolving it without fighting the platform.

---

## Why Modularity Is a First-Class Design Goal

Modularity is not an implementation detail. It is the product strategy.

AI systems fail architecturally when:

- domain logic leaks into the runtime
- provider SDKs become hard dependencies of the kernel
- every new capability requires a Core release
- experiments force forks of the entire stack
- teams cannot swap one concern without rewriting another

Kairo treats modules as the unit of capability and evolution.

**Modularity enables:**

| Concern | Without modules | With modules |
| --- | --- | --- |
| Provider support | Core depends on every SDK | Provider modules implement a contract |
| Domain tools | Core grows forever | Tool modules register capabilities |
| UI surfaces | One UI dictates runtime | UI modules consume events |
| Policy / safety | Hard-coded in loop | Policy modules and harness rules |
| Experimentation | Fork the monorepo | Ship or disable a module |
| Third parties | PR into Core or nothing | Publish modules against contracts |

A modular platform can stay small at the center while growing large at the edges. That is the only way Kairo can remain stable for years while the AI ecosystem moves weekly.

---

## Why Kairo Core Intentionally Knows Nothing About Coding

Coding agents are popular, visible, and easy to overfit to. That is exactly why Core must not be a coding agent.

If Core understands repositories, file patches, test runners, or IDE workflows:

- every non-coding harness pays a conceptual tax
- “agent” becomes synonymous with “software engineer assistant”
- Core changes whenever coding fashion changes
- the platform identity collapses into one vertical

Kairo Core is **domain-agnostic infrastructure**:

- sessions and turns
- providers and completions (as contracts)
- tools as abstract capabilities
- modules, registration, and lifecycle
- events, context building hooks, and loop primitives
- configuration and composition boundaries

Coding belongs in a **Coding Harness** (and coding-related modules). Research belongs in a Research Harness. DevOps, browser automation, enterprise orchestration — same pattern.

Core’s ignorance is a feature. It is how Kairo stays a platform instead of becoming a product that ages with one use case.

---

## Long-Term Vision

Over ten years, Kairo should become the default way serious teams assemble AI systems that must outlive model generations.

### Near term

- A trustworthy Core with explicit contracts
- A small set of official modules proving the model
- One or more starter harnesses that demonstrate composition without becoming “the product”

### Medium term

- A healthy first-party and third-party module ecosystem
- Multiple public harnesses for different domains
- Stable versioning and compatibility expectations between Core and modules

### Long term

- Harnesses as the primary unit of product and community
- A marketplace for modules and harness templates
- Organizational standards built on Kairo contracts rather than vendor lock-in
- Core releases that are rare, boring, and backward-compatible

The destination is not “the best coding agent.” The destination is **infrastructure people trust to build many agents, many workflows, and many products** — some of which will not look like chat at all.

Think of the Linux analogy carefully: Linux is not “a desktop.” Desktop environments, servers, phones, containers, and appliances are built *on* Linux. Likewise, Kairo is not “an agent.” Coding agents, research agents, ops copilots, and custom enterprise systems are built *on* Kairo. The analogy is about layering and modularity, not about cloning Unix culture or claiming equivalence of maturity on day one.

---

## Design Principles

1. **Core stays small.** If it can be a module, it is a module.
2. **Contracts over implementations.** Core defines interfaces and guarantees; modules provide behavior.
3. **Provider neutrality.** No provider, model family, or cloud is privileged inside Core.
4. **Domain neutrality.** No vertical (coding, research, ops, etc.) is privileged inside Core.
5. **Composition over configuration sprawl.** Harnesses assemble modules intentionally; they do not rely on infinite global flags as architecture.
6. **Explicit lifecycle.** Loading, starting, running, failing, and unloading must be understandable.
7. **Isolation by default.** Module failures should not silently corrupt Core or unrelated modules.
8. **Stable kernel, fast edges.** Core changes slowly; modules and harnesses may move quickly.
9. **Replaceability.** Any module should be swappable if it honors the contract.
10. **Observability without coupling.** Runtime events make systems inspectable without hard-wiring UIs or log vendors into Core.
11. **Security and policy as architecture.** Permissions, tool access, and data boundaries are design concerns, not afterthoughts.
12. **Documented boundaries.** Architecture documents are the source of truth; code that violates them is wrong even if it “works.”

---

## Core Values

- **Ownership** — Builders control their harness.
- **Clarity** — Responsibilities are obvious; magic is minimized.
- **Stability** — Core is a promise, not an experiment playground.
- **Composability** — Small pieces combine into systems larger than any single module.
- **Openness** — First-party and third-party modules compete on equal contracts.
- **Honesty** — Non-goals are stated; hype is not architecture.
- **Longevity** — Prefer decisions that still make sense in ten years.
- **Respect for domains** — Domain experts should express domain logic without rewriting the kernel.

---

## Non-Goals

Kairo does not aim to:

- be the most feature-rich coding assistant out of the box
- hide all complexity behind one “magic agent” preset as the only supported mode
- bake model-specific prompt tricks into Core
- own user data platforms, vector DB products, or model hosting as Core concerns
- prescribe a single UI, CLI, IDE, or web shell
- force every harness to be multi-agent, single-agent, or chat-shaped
- guarantee identical behavior across all providers (providers differ; contracts abstract, they do not lie)
- grow Core to absorb popular modules “for convenience”
- optimize for demo velocity at the cost of boundary integrity

Convenience features are welcome **as modules or harness defaults**, not as Core identity.

---

## Examples of Harnesses Users Can Build

These examples illustrate breadth. None of them redefine Core.

### Coding Harness

Repository-aware tools, test execution, patch workflows, language-aware context, review policies. Built from coding modules + Core. Core still does not “know coding.”

### Research Harness

Source gathering, citation discipline, long-context synthesis, literature tracking, claim verification tools. Optimized for evidence, not for committing code.

### DevOps Harness

Infrastructure introspection, runbooks, deployment gates, incident timelines, approval workflows. Strong policy and audit requirements.

### Browser Harness

Navigation, form interaction, extraction, session isolation, human-in-the-loop confirmation for irreversible actions.

### Enterprise Harness

SSO-aware operation, data residency constraints, tool allowlists, audit logs, human approval, departmental module packs.

### Custom Harness

Any assembly a team needs: game-master agents, education tutors, data-labeling copilots, internal ops bots, creative pipelines, multi-surface systems with headless workers and thin UIs.

The point of the platform is that these harnesses share **Core contracts**, not **product opinions**.

---

## The Linux Analogy (Used Carefully)

People understand Linux as a kernel plus ecosystems of distributions, packages, and userlands. That mental model is useful for Kairo **in limited ways**:

**Useful parallels**

- A small kernel with strict responsibilities
- Modules / packages that extend capability without rewriting the kernel
- Different “distributions” (harnesses) for different users and domains
- Long-term interfaces that allow independent evolution

**Limits of the analogy**

- Kairo is not claiming OS-level maturity or scope on day one
- AI harnesses are not processes and drivers; the abstraction mapping is conceptual
- “Distributions” here are harnesses and module sets, not full OS userlands
- Community and governance will be their own problem; analogy is not a governance plan

Use the analogy to explain **layering and modularity**. Do not use it as a substitute for precise contracts, and do not stretch it into mythology.

---

## How to Read the Rest of the Architecture Docs

| Document | Role |
| --- | --- |
| [`CORE.md`](./CORE.md) | What belongs in `@kairo/core`, and what must never enter it |
| [`MODULES.md`](./MODULES.md) | Module system design: lifecycle, discovery, isolation, versioning |
| [`HARNESS.md`](./HARNESS.md) | What a harness is and how users compose products on Core |
| [`CONTRACTS.md`](./CONTRACTS.md) | Architectural contracts that prevent drift |
| [`ROADMAP.md`](./ROADMAP.md) | Phased path from kernel to ecosystem |

If a future proposal conflicts with these documents, the proposal must either change — or these documents must be deliberately revised. Silent drift is failure.

---

## Closing

Kairo’s bet is simple:

**AI capability will keep changing. The need for a stable way to harness that capability will not.**

By refusing to become “the coding agent,” Kairo can become something more durable: a platform where people build the harnesses they actually need — for a decade, not a release cycle.

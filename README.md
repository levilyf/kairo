# Kairo

**Build your own AI harness.**

Kairo is a small, stable platform for composing AI systems—not a single agent product.  
**Core** provides domain-agnostic runtime mechanisms. **Modules** contribute capabilities.  
A **harness** turns those pieces into a product with clear opinions.

**Kairo Code** (`@kairo/harness-code`) is the flagship harness: a coding-oriented composition with a system prompt, workspace tools, and a one-shot `run` surface. The official CLI (`kairo`) is the primary way to try it.

[![Status](https://img.shields.io/badge/status-v0.1.0--alpha.1-blue)](#current-alpha)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](#installation)

> **Public alpha.** This release is intentionally minimal. Features listed below are what works today—nothing more.

**Versioning:** the product release / git tag is `v0.1.0-alpha.1` (also shown by `kairo --version`). Workspace `package.json` versions remain `0.1.0` until packages are published to npm.

---

## Why Kairo?

Most AI “agent” projects grow into monoliths: tools, prompts, providers, and UI all share one codebase and one opinion of how AI should behave. That works for a demo. It ages poorly when you need a different product shape—or when Core starts knowing about git, IDEs, and file patches.

Kairo takes a different cut:

| Layer | Owns | Must not own |
| --- | --- | --- |
| **Core** | Mechanisms — runtime, agent loop, sessions, contracts, module host | Domain knowledge, coding workflows, vendor SDKs as product identity |
| **Modules** | Capabilities — tools, context builders, providers as plugins | Global product opinions |
| **Harness** | Opinions — which modules, which defaults, which surface | Kernel internals |

**Why that matters**

- **Composable** — swap modules and harnesses without forking the kernel  
- **Protocol-first** — model *protocols* (e.g. OpenAI-compatible), not one package per vendor  
- **Fail closed** — missing config, ambiguous models, and unsafe paths error loudly  
- **Long-lived Core** — domain features grow at the edges so the center stays boring and stable  

If Core is a kernel, a harness is a distribution: purposeful, replaceable, and yours to fork.

---

## Vision (short)

Kairo is infrastructure for people who want to **design** how an AI system behaves—not only run a prebuilt chat loop.

- Different problems need different harnesses.  
- Coding is one harness among many; Core does not know about repositories or pull requests.  
- Conversation is a surface some harnesses use; it is not the platform identity.  
- Growth should come from modules and community harnesses, not an ever-larger Core.

Full doctrine: [`docs/VISION.md`](docs/VISION.md).

---

## Architecture (brief)

```text
Core          domain-agnostic mechanisms (runtime, agent loop, tools, providers, …)
  ↓
Modules       capabilities (workspace tools, system prompt builder, …)
  ↓
Harness       product opinions (Kairo Code composes app + modules + defaults)
  ↓
CLI / app     thin entry points (`kairo`, `@kairo/app`)
```

**Core owns mechanisms. Modules own capabilities. Harness owns opinions.**

Deep dives (architecture source of truth):

| Document | Topic |
| --- | --- |
| [`docs/VISION.md`](docs/VISION.md) | Product vision and doctrine |
| [`docs/CORE.md`](docs/CORE.md) | Core kernel |
| [`docs/MODULES.md`](docs/MODULES.md) | Module system |
| [`docs/HARNESS.md`](docs/HARNESS.md) | Harness composition |
| [`docs/CONTRACTS.md`](docs/CONTRACTS.md) | Shared contracts |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Strategic phases |

### Workspace packages

| Package | Role |
| --- | --- |
| `@kairo/core` | Kernel: runtime, agent loop, registries, contracts |
| `@kairo/config` | Project discovery + `.kairo/config.json` |
| `@kairo/protocol-openai` | OpenAI Chat Completions protocol mapping |
| `@kairo/provider-openai-compatible` | Thin OpenAI-compatible provider adapter |
| `@kairo/provider-registry` | Protocol-keyed factories + model index |
| `@kairo/app` | Application composition root |
| `@kairo/harness-code` | Kairo Code flagship harness |
| `@kairo/module-workspace-tools` | `read_file` workspace tool module |
| `@kairo/chat` | Streaming chat REPL / sessions / renderer |
| `@kairo/cli` | Official `kairo` CLI |

---

## Current alpha

This alpha proves the stack end-to-end: config → provider → harness → agent loop → tool call → answer.

| Capability | What you get |
| --- | --- |
| **One-shot run** | `kairo run <prompt> [--model] [--provider]` through Kairo Code |
| **Interactive chat** | `kairo chat` — streaming REPL; Ctrl+C cancels a turn; JSONL under `.kairo/sessions/` |
| **OpenAI-compatible providers** | One protocol adapter; catalog presets (openai, ollama, groq, …) are config data, not packages |
| **Provider management** | `kairo provider list \| add \| configure \| remove` |
| **Workspace tool** | `read_file` only — path-confined reads via `@kairo/module-workspace-tools` |
| **Project config** | `.kairo/config.json` — `kairo init`, `kairo doctor` |

### Intentionally out of scope (for now)

These are **not** unfinished stubs; they are omitted on purpose for alpha:

- Write / edit / multi-file tools  
- Shell and git tools  
- Full-screen TUI  
- Plugin marketplace / third-party module registry  
- Cloud control plane  
- npm-published packages (clone and build the monorepo)

If a demo needs something on this list, wait for a later phase—or build it as a module on top of Core.

---

## Installation

Requires **Node.js 20+**.

```bash
git clone https://github.com/levilyf/kairo.git
cd kairo
npm install
npm run build
```

Run the CLI:

```bash
npm --workspace @kairo/cli exec -- kairo --help
# or:
node packages/cli/dist/bin.js --help
```

Optional PATH link:

```bash
npm --workspace @kairo/cli link
```

---

## Quick start

```bash
# 1. Scaffold a project (writes .kairo/config.json)
kairo init

# 2. Configure a provider (interactive wizard)
kairo provider add openai
# catalog ids also include: nvidia, openrouter, groq, fireworks,
# together, deepinfra, ollama, lmstudio

# 3. One-shot run through Kairo Code
kairo run "Summarize README.md"
```

Useful follow-ups:

```bash
kairo doctor    # validate project + bootstrap
kairo models    # list configured models
kairo chat      # interactive streaming chat
```

Local providers (e.g. Ollama) work the same way once `baseURL` and models are set—no separate vendor package.

---

## Documentation & roadmap

- Architecture: [`docs/`](docs/) (start with Vision + Core)  
- Roadmap: [`docs/ROADMAP.md`](docs/ROADMAP.md) — phased path from kernel → modules → starter harness → ecosystem  
- This alpha sits early on that path: Core, first modules, and a runnable starter harness (Kairo Code)

---

## Contributing

Architecture docs in `docs/` are the **source of truth**. If code and docs disagree, fix the code or deliberately revise the docs—do not paper over drift.

For alpha:

1. `npm install && npm run build && npm test`  
2. Prefer small, focused changes  
3. Keep Core domain-agnostic; put product opinions in modules or harnesses  

A fuller `CONTRIBUTING.md` may arrive after alpha; until then, issues and PRs that respect the architecture are welcome.

---

## Feedback

This is a first public alpha. Reports that help most:

- Failures on the documented quick start  
- Misleading docs or help text  
- Boundary bugs (Core absorbing domain logic, broken fail-closed paths)

Use [GitHub Issues](https://github.com/levilyf/kairo/issues). Be specific: command, config shape (redact keys), and expected vs actual behavior.

---

## Built in India 🇮🇳

Kairo is built in **India** by **Rudra (Levi)**, 18.

It was developed almost entirely on an old **32-bit Android phone** using **Termux**—not a workstation lab. Constraints forced discipline: small packages, clear boundaries, and tests that catch real breakage. Persistence mattered more than hardware.

The project stands on its architecture and code first; this note is only context for how it was made.

---

## Support

If Kairo is useful, the best support is careful feedback and respectful architecture-preserving contributions.


| Channel | Link |
| --- | --- |
| GitHub | `https://github.com/levilyf/kairo` |
| Website | `soon` |
| Buy Me a Coffee | `https://animiso.lemonsqueezy.com/checkout` |
| GitHub Sponsors | `https://github.com/sponsors/levilyf` |

---

## License

[MIT](./LICENSE) — free to use, modify, and distribute with attribution.

# `@kairo/cli`

Official command-line interface for Kairo.

## Scope

Thin composition over `@kairo/config`, `@kairo/app`, `@kairo/chat`, and
`@kairo/harness-code`:

- parse args and dispatch commands
- load `.kairo/config.json` via the bootstrap bridge (`loadApplication` /
  `loadKairoCodeApplication`)
- bootstrap a generic `Application` (chat, models, provider, doctor)
- bootstrap **Kairo Code** for one-shot `run`
- run streaming chat via `@kairo/chat`

## Non-goals

- No Provider / Runtime / Harness construction outside the bootstrap bridge
- No provider protocol logic
- No full-screen TUI (`@kairo/tui` deferred)

## Commands

| Command | Purpose |
| --- | --- |
| `kairo init` | Scaffold `.kairo/config.json` |
| `kairo chat` | Streaming interactive chat REPL |
| `kairo run` | One-shot prompt through Kairo Code (tools available) |
| `kairo models` | List configured models |
| `kairo provider …` | Add / configure / remove / list providers |
| `kairo doctor` | Project health checks |
| `kairo help` / `--version` | Help and version |

## `kairo run`

```text
kairo run <prompt> [--model <id>] [--provider <id>]
```

| Flag | Meaning |
| --- | --- |
| `--model`, `-m` | Model id (default: config / registry default) |
| `--provider`, `-p` | Force provider id |
| `--help`, `-h` | Usage (does not boot the application) |

Positional prompt words are joined (e.g. `kairo run summarize the readme`).
Uses the real Kairo Code harness: Agent Loop, ToolRouter, and workspace
`read_file` when the model requests it.

## `kairo chat`

```text
kairo chat [--model <id>] [--provider <id>] [--resume [id|last]]
```

| Flag | Meaning |
| --- | --- |
| `--model`, `-m` | Model id (default: registry / config default) |
| `--provider`, `-p` | Force provider id |
| `--resume`, `-r` | Resume a JSONL session (`last` if bare) |

**Keys**

- **Ctrl+C** — cancel in-flight stream (re-prompt); does not exit
- **Ctrl+D** / `/exit` / `/quit` — end session

Sessions persist as JSONL under `.kairo/sessions/<id>.jsonl`.

Streaming is fail-closed: if the selected provider cannot stream, the turn errors (no silent `complete()` fallback).

## Architecture boundary

```text
CLI → bootstrap → @kairo/config (load) → @kairo/app / @kairo/harness-code
CLI → @kairo/chat (REPL / JSONL / progressive render)   # chat only
CLI → @kairo/harness-code run()                         # run only
```

Architecture source of truth: repository `/docs`.

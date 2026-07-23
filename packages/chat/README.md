# `@kairo/chat`

Streaming chat engine for Kairo.

## Scope

- JSONL session persistence under `.kairo/sessions/`
- `ChatEngine` turns via Core Agent Loop only (`stream: true`, `onStreamEvent`)
- Progressive plain terminal renderer
- Interactive REPL (Ctrl+C cancel stream, Ctrl+D exit)

## Non-goals

- No config file loading
- No CLI argument parsing
- No provider construction / registry ownership
- No full-screen TUI (`@kairo/tui` is deferred)
- Never calls Provider Gateway directly — only Agent Loop

## Usage

```ts
import { createApplication } from "@kairo/app";
import { runChatRepl, type ChatIO } from "@kairo/chat";

const app = await createApplication({ config });
await app.start();

const io: ChatIO = {
  isTTY: process.stdout.isTTY === true,
  write: (t) => process.stdout.write(t),
  writeLine: (l = "") => process.stdout.write(`${l}\n`),
  readLine: async (prompt) => {
    // return string, or null on EOF
    // throw ChatError(CANCELLED) on Ctrl+C at prompt
  },
};

await runChatRepl({
  app,
  rootDir: process.cwd(),
  model: "gpt-4o-mini",
  io,
  // resume: "last",
});

await app.stop();
```

## Session format (v1)

JSONL lines under `.kairo/sessions/<sessionId>.jsonl`:

- `session.start` — id, model, optional providerId, metadata
- `message` — role + content parts
- `session.end` — reason

Corrupt or missing files fail closed (`SESSION_CORRUPT` / `SESSION_NOT_FOUND`).

## Streaming contract

1. Engine sets `LoopOptions.stream: true` and `onStreamEvent`.
2. Agent Loop → Provider Gateway `stream()` — **no** silent `complete()` fallback.
3. Tool calls run only after `message_end` produces a full `ProviderResponse`.
4. Progressive renderer shows `text_delta` only (suppresses tool/usage noise).

## Public surface

- `runChatRepl` / `ChatEngine` / `SessionStore` / `ProgressiveRenderer`
- `ChatError` / `ChatErrorCode` / `ChatIO`

Architecture source of truth: repository `/docs`.

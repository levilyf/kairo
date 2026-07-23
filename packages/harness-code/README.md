# @kairo/harness-code

The **Kairo Code** flagship harness — the official composition root for
Kairo Code.

It composes the generic `@kairo/app` Application and layers Code-specific
opinions on top:

- **Code identity + system prompt** — contributed as a `context.builder`
  module, so it reaches the model through Core's normal composition path.
- **Workspace tools** — composes `@kairo/module-workspace-tools`
  (`read_file`), which self-advertises tool definitions via
  `context.builder` and registers the tool for invocation.
- **Permissions** — grants `workspace.read` for the workspace tools.
- **Runtime/loop defaults** — e.g. the default max Agent Loop iterations.
- **Workspace root** — propagated to modules via harness config.
- **Lifecycle** — a small, stable `create → run → stop` surface.

The harness **owns composition and opinions**, not tool implementations.
Coding capabilities arrive as modules composed here. Core stays
completely coding-agnostic; the harness only *composes* it.

## Usage

```ts
import { createKairoCodeApplication } from "@kairo/harness-code";
import { loadConfig } from "@kairo/config";

const { config } = await loadConfig({ cwd: process.cwd() });

const app = await createKairoCodeApplication({
  config,
  workspaceRoot: process.cwd(),
});

const result = await app.run({ prompt: "Summarize README.md" });
console.log(result.text);

await app.stop();
```

A typical run may:

1. Send the prompt (plus system prompt + tool definitions) to the model.
2. Execute tool calls (e.g. `read_file`) through the real ToolRouter.
3. Continue the Agent Loop until a final assistant answer.
4. Return `{ text, loopResult, iterationCount }`.

## Public API

- `createKairoCodeApplication(options)` → `KairoCodeApplication`
- `KairoCodeApplication`: `{ app, workspaceRoot, systemPrompt, status, start(), run(), stop() }`
- `KAIRO_CODE_SYSTEM_PROMPT` — the default Code system prompt
- `KAIRO_CODE_DEFAULT_MAX_ITERATIONS` — the default per-turn loop budget
- `createSystemPromptModule(prompt)` / `createSystemPromptBuilder(prompt)`
- `HarnessCodeError` / `HarnessCodeErrorCode`

A run reuses existing runtime primitives directly:

`runtime.sessions.create → session.turns.create → runtime.agentLoop.execute`.

## Composition (what is wired today)

```text
createKairoCodeApplication
  → @kairo/app createApplication
  → extraModules:
       system-prompt module (context.builder)
       workspace-tools module (tool + context.builder)
  → permissions: ["workspace.read"]
  → harness config: { workspaceRoot }
```

Further tools (shell, git, multi-file edit, …) are **not** included in
this package; add them as modules later without changing Core.

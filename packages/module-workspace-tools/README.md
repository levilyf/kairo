# @kairo/module-workspace-tools

Minimal, secure filesystem capabilities for Kairo, delivered as a
composable **module**. Today it contributes exactly one tool:
`read_file`.

It plugs into Core's contribution-binding path (capability `"tool"`).
It owns no provider, Agent Loop, ToolRouter, CLI, or harness lifecycle
logic — a harness simply composes it.

## Usage

```ts
import { createWorkspaceToolsModule } from "@kairo/module-workspace-tools";

// Compose into a harness alongside other modules.
const workspaceTools = createWorkspaceToolsModule({
  root: process.cwd(),
  maxBytes: 1024 * 1024, // optional; defaults to 1 MiB
});
```

## Tool: `read_file`

- **id**: `workspace.read_file`
- **name**: `read_file`
- **parameters**: `{ path: string }` (workspace-relative)

### Success

```json
{
  "ok": true,
  "data": { "path": "README.md", "content": "…", "bytes": 123, "truncated": false }
}
```

### Failure

Fails closed with `{ ok: false, errorCode, message }`. Codes:

| code                | meaning                                    |
| ------------------- | ------------------------------------------ |
| `INVALID_PATH`      | missing / empty / non-string `path`        |
| `OUTSIDE_WORKSPACE` | traversal, absolute escape, symlink escape |
| `NOT_FOUND`         | no file at the resolved path               |
| `NOT_A_FILE`        | path is a directory or non-regular file    |
| `UNREADABLE`        | permission / I/O error                     |

## Security

- Lexical confinement: the path is resolved against `root`; `..` escapes
  and absolute paths outside `root` are rejected before any filesystem
  access.
- Realpath confinement: symlinks are resolved and the **real target**
  must still reside inside the realpath'd `root`, so symlinks escaping
  the workspace are rejected. In-workspace symlinks are allowed.
- Only regular files are read; directories are rejected.
- Content is decoded as UTF-8 and capped at `maxBytes` (`truncated: true`
  when the file was larger).

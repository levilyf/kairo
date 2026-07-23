/**
 * read_file — a minimal, workspace-confined file reader.
 *
 * Security posture (fail closed):
 *   - the `path` argument must be a non-empty string
 *   - the path is resolved against the workspace root; any lexical escape
 *     (`..`, or an absolute path outside the root) is rejected before any
 *     filesystem access
 *   - symlinks are resolved with realpath and the *resolved target* must
 *     still reside inside the (realpath'd) workspace root, so a symlink
 *     pointing outside the workspace is rejected
 *   - directories and non-regular files are rejected
 *   - content is decoded as UTF-8 and capped at `maxBytes`
 *
 * The tool never throws for expected failures; it returns a structured
 * `ToolResult` with `ok: false` and an attributed `errorCode`.
 */

import { realpath, readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import type { JsonSchema, Tool, ToolExecuteContext, ToolResult } from "@kairo/core";

import { ReadFileErrorCode } from "./errors.js";

/** Stable, namespaced tool id. */
export const READ_FILE_TOOL_ID = "workspace.read_file";
/** Model-facing tool name. */
export const READ_FILE_TOOL_NAME = "read_file";

/** 1 MiB: a conservative default cap for a single read. */
export const DEFAULT_MAX_BYTES = 1024 * 1024;

export interface ReadFileToolOptions {
  /** Absolute path to the workspace root the tool is confined to. */
  readonly root: string;
  /** Maximum number of bytes to return. Defaults to {@link DEFAULT_MAX_BYTES}. */
  readonly maxBytes?: number;
}

export interface ReadFileData {
  /** Workspace-relative path that was read (forward-slash normalized). */
  readonly path: string;
  /** UTF-8 decoded file contents (possibly truncated). */
  readonly content: string;
  /** Number of bytes returned in `content`. */
  readonly bytes: number;
  /** Whether the file was larger than `maxBytes` and content was truncated. */
  readonly truncated: boolean;
}

const PARAMETERS: JsonSchema = {
  type: "object",
  description: "Read a UTF-8 text file from within the workspace.",
  properties: {
    path: {
      type: "string",
      description:
        "Workspace-relative path to the file to read. Must resolve inside the workspace.",
    },
  },
  required: ["path"],
  additionalProperties: false,
};

/**
 * Create the read_file {@link Tool}, confined to `options.root`.
 */
export function createReadFileTool(options: ReadFileToolOptions): Tool {
  const root = options.root;
  const maxBytes =
    typeof options.maxBytes === "number" &&
    Number.isFinite(options.maxBytes) &&
    options.maxBytes > 0
      ? Math.floor(options.maxBytes)
      : DEFAULT_MAX_BYTES;

  return {
    id: READ_FILE_TOOL_ID,
    name: READ_FILE_TOOL_NAME,
    description:
      "Read the UTF-8 contents of a file inside the workspace. Rejects paths " +
      "outside the workspace, directories, and files larger than the limit.",
    parameters: PARAMETERS,
    permissions: ["workspace.read"],
    async execute(
      args: Readonly<Record<string, unknown>>,
      _context?: ToolExecuteContext,
    ): Promise<ToolResult> {
      const rawPath = args["path"];
      if (typeof rawPath !== "string" || rawPath.trim().length === 0) {
        return failure(
          ReadFileErrorCode.INVALID_PATH,
          "read_file requires a non-empty string 'path' argument",
        );
      }

      // 1. Lexical confinement: resolve against root and reject escapes
      //    before touching the filesystem.
      const lexical = resolve(root, rawPath);
      const relPath = relative(root, lexical);
      if (isEscaping(relPath)) {
        return failure(
          ReadFileErrorCode.OUTSIDE_WORKSPACE,
          `Path escapes the workspace: ${rawPath}`,
        );
      }

      // 2. Realpath confinement: resolve symlinks and re-check that the
      //    real target still lives inside the real workspace root.
      let realTarget: string;
      let realRoot: string;
      try {
        realRoot = await realpath(root);
      } catch (cause) {
        return failure(
          ReadFileErrorCode.UNREADABLE,
          "Workspace root could not be resolved",
          cause,
        );
      }
      try {
        realTarget = await realpath(lexical);
      } catch (cause) {
        if (isErrno(cause, "ENOENT")) {
          return failure(
            ReadFileErrorCode.NOT_FOUND,
            `File not found: ${normalizeRel(relPath)}`,
          );
        }
        return failure(
          ReadFileErrorCode.UNREADABLE,
          `File could not be read: ${normalizeRel(relPath)}`,
          cause,
        );
      }
      if (!isInside(realRoot, realTarget)) {
        return failure(
          ReadFileErrorCode.OUTSIDE_WORKSPACE,
          `Path resolves outside the workspace: ${normalizeRel(relPath)}`,
        );
      }

      // 3. Must be a regular file.
      let stats;
      try {
        stats = await stat(realTarget);
      } catch (cause) {
        if (isErrno(cause, "ENOENT")) {
          return failure(
            ReadFileErrorCode.NOT_FOUND,
            `File not found: ${normalizeRel(relPath)}`,
          );
        }
        return failure(
          ReadFileErrorCode.UNREADABLE,
          `File could not be read: ${normalizeRel(relPath)}`,
          cause,
        );
      }
      if (!stats.isFile()) {
        return failure(
          ReadFileErrorCode.NOT_A_FILE,
          `Not a regular file: ${normalizeRel(relPath)}`,
        );
      }

      // 4. Read + cap + UTF-8 decode.
      let buffer: Buffer;
      try {
        buffer = await readFile(realTarget);
      } catch (cause) {
        return failure(
          ReadFileErrorCode.UNREADABLE,
          `File could not be read: ${normalizeRel(relPath)}`,
          cause,
        );
      }

      const truncated = buffer.length > maxBytes;
      const slice = truncated ? buffer.subarray(0, maxBytes) : buffer;
      const content = slice.toString("utf8");
      const data: ReadFileData = {
        path: normalizeRel(relPath),
        content,
        bytes: slice.length,
        truncated,
      };

      return {
        ok: true,
        data,
        metadata: { toolId: READ_FILE_TOOL_ID },
      };
    },
  };
}

function failure(
  code: ReadFileErrorCode,
  message: string,
  cause?: unknown,
): ToolResult {
  return {
    ok: false,
    errorCode: code,
    message,
    metadata: {
      toolId: READ_FILE_TOOL_ID,
      ...(cause instanceof Error ? { cause: cause.message } : {}),
    },
  };
}

/** A relative path escapes when it climbs above root or is absolute. */
function isEscaping(relPath: string): boolean {
  if (relPath === "") return false; // path === root itself (rejected later as dir)
  if (isAbsolute(relPath)) return true;
  return relPath === ".." || relPath.startsWith(".." + sep);
}

/** True when `target` is `root` or nested beneath it. */
function isInside(root: string, target: string): boolean {
  if (target === root) return true;
  const rel = relative(root, target);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/** Normalize a relative path to forward slashes for stable reporting. */
function normalizeRel(relPath: string): string {
  return relPath.split(sep).join("/");
}

function isErrno(value: unknown, code: string): boolean {
  return (
    value instanceof Error &&
    (value as NodeJS.ErrnoException).code === code
  );
}

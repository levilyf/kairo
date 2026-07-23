/**
 * Structured error codes for the read_file tool.
 *
 * These are returned as `ToolResult.errorCode` (the tool fails *closed*
 * with `ok: false` rather than throwing) so the Agent Loop and callers
 * can react to attributed failures without string matching.
 */
export const ReadFileErrorCode = {
  /** The `path` argument was missing, empty, non-string, or malformed. */
  INVALID_PATH: "INVALID_PATH",
  /** The resolved path escapes the workspace root. */
  OUTSIDE_WORKSPACE: "OUTSIDE_WORKSPACE",
  /** No file exists at the resolved path. */
  NOT_FOUND: "NOT_FOUND",
  /** The resolved path exists but is not a regular file (e.g. a directory). */
  NOT_A_FILE: "NOT_A_FILE",
  /** The file could not be read (permissions or I/O error). */
  UNREADABLE: "UNREADABLE",
} as const;

export type ReadFileErrorCode =
  (typeof ReadFileErrorCode)[keyof typeof ReadFileErrorCode];

/**
 * CLIContext — the single object threaded through every command.
 *
 * The CLI is a thin function of (args, environment, IO) → exit code.
 * Routing every side-effect through this context keeps commands
 * deterministic in tests: tests inject in-memory `stdout`/`stderr`
 * writers, a fake `stdin` reader, a fake `env`, and an arbitrary `cwd`
 * without spawning a child process or touching the real filesystem
 * beyond what each command explicitly opens via @kairo/config.
 *
 * Conventions:
 *   - stdout/stderr are sync line writers (signature `(line: string) => void`)
 *     rather than Node streams so tests can capture output directly.
 *   - stdin is an async readline-style function returning a Promise<string>
 *     or rejecting with USER_CANCELLED on Ctrl-C. Commands that need
 *     interactivity accept a `prompt` derived from this reader.
 *   - `cwd` is the resolved working directory; commands must not mutate it.
 *   - `env` is a frozen Record<string,string>. The CLI must not mutate the
 *     real process.env; it reads from this map only.
 *   - `isTTY` mirrors process.stdout.isTTY semantics; commands may degrade
 *     (disable colors / spinners) when false.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";

export type LineWriter = (line: string) => void;

/**
 * Read one line of user input.
 * - string: submitted line (may be empty)
 * - null: EOF (Ctrl+D) — chat REPL exits
 */
export type LineReader = (promptText: string) => Promise<string | null>;

export interface CLIContext {
  readonly cwd: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  readonly stdout: LineWriter;
  readonly stderr: LineWriter;
  readonly stdin: LineReader;
  readonly isTTY: boolean;
}

/** Convenience: read the supplied `env` value, or undefined. */
export function envLookup(ctx: CLIContext, name: string): string | undefined {
  const value = ctx.env[name];
  return value && value.length > 0 ? value : undefined;
}

/** Thrown by readJsonFile when the file exists but cannot be parsed. */
export class ReadJsonError extends Error {
  readonly absPath: string;
  declare readonly cause?: unknown;
  constructor(message: string, absPath: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "ReadJsonError";
    this.absPath = absPath;
    if (cause !== undefined) this.cause = cause;
  }
}

/**
 * Reads a JSON file from a path relative to `ctx.cwd` and returns both the
 * parsed value and the absolute path. CLI commands use this for `init`,
 * `provider add`, etc. Centralizing here keeps the file-format concerns in
 * one place rather than scattered across commands.
 *
 * Returns `null` when the file does not exist. Throws a `ReadJsonError`
 * when it exists but is unreadable or not valid JSON.
 */
export async function readJsonFile(
  ctx: CLIContext,
  relativePath: string,
): Promise<{ value: unknown; absPath: string } | null> {
  const absPath = path.resolve(ctx.cwd, relativePath);
  let exists = false;
  try {
    const stat = await fs.stat(absPath);
    exists = stat.isFile();
  } catch {
    exists = false;
  }
  if (!exists) return null;
  let content: string;
  try {
    content = await fs.readFile(absPath, "utf8");
  } catch (cause) {
    throw new ReadJsonError(`Cannot read "${relativePath}"`, absPath, cause);
  }
  try {
    return { value: JSON.parse(content), absPath };
  } catch (cause) {
    throw new ReadJsonError(
      `"${relativePath}" is not valid JSON`,
      absPath,
      cause,
    );
  }
}

/**
 * Writes a JSON file (pretty-printed with 2-space indent, trailing
 * newline) at `relativePath`. Creates parent directories.
 */
export async function writeJsonFile(
  ctx: CLIContext,
  relativePath: string,
  value: unknown,
): Promise<string> {
  const absPath = path.resolve(ctx.cwd, relativePath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, JSON.stringify(value, null, 2) + "\n", "utf8");
  return absPath;
}

/** Builds a fresh `CLIContext` for production use. */
export function createCLIContext(
  argv: readonly string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    stdout?: LineWriter;
    stderr?: LineWriter;
    stdin?: LineReader;
    isTTY?: boolean;
  } = {},
): CLIContext {
  return {
    cwd: options.cwd ?? process.cwd(),
    args: Object.freeze([...argv]),
    env: Object.freeze({
      ...(options.env ?? process.env),
    }) as Record<string, string>,
    stdout:
      options.stdout ??
      ((line: string) => process.stdout.write(line + "\n")),
    stderr:
      options.stderr ??
      ((line: string) => process.stderr.write(line + "\n")),
    stdin:
      options.stdin ??
      (() => Promise.reject(new Error("stdin not configured"))),
    isTTY: options.isTTY ?? Boolean(process.stdout.isTTY),
  };
}

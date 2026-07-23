/**
 * Test helpers: in-memory CLIContext factory + captured stdout/stderr.
 *
 * Tests never spawn a child process. Every command runs in-process with
 * an injected `CLIContext` whose stdout/stderr accumulate into arrays we
 * can assert against, and whose stdin reads from a scripted queue.
 */

import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";

import type { CLIContext, LineReader } from "../src/context.js";

export interface CapturedOut {
  readonly stdout: readonly string[];
  readonly stderr: readonly string[];
  readonly fullStdout: string;
}

export function captureOut(): {
  lines: string[];
  full: string;
  writer: (line: string) => void;
} {
  const lines: string[] = [];
  let full = "";
  return {
    lines,
    full,
    writer: (line: string) => {
      lines.push(line);
      full += line + "\n";
    },
  };
}

export interface ScriptedResponses {
  /** Queue of answers for sequential prompt calls. */
  readonly queue: readonly string[];
}

/**
 * Build a stdin reader from a queue of answers.
 * Use `null` for EOF (Ctrl+D). Exhausted queue returns null by default
 * so chat REPL can exit without hanging tests.
 */
export function makeQueuedStdin(
  q: Array<string | null>,
  options: { readonly exhausted?: string | null } = {},
): LineReader {
  let i = 0;
  const exhausted =
    options.exhausted !== undefined ? options.exhausted : null;
  return async (_label: string) => {
    if (i < q.length) {
      const value = q[i] ?? null;
      i += 1;
      return value;
    }
    return exhausted;
  };
}

export interface FakeContextOptions {
  readonly cwd: string;
  readonly args?: readonly string[];
  readonly env?: Record<string, string>;
  readonly stdinQueue?: ReadonlyArray<string | null>;
  readonly stdin?: (label: string) => Promise<string | null>;
  readonly isTTY?: boolean;
  /** When stdinQueue is exhausted: null (EOF, default) or "" for legacy prompts. */
  readonly stdinExhausted?: string | null;
}

export function makeContext(opts: FakeContextOptions): {
  ctx: CLIContext;
  out: { stdout: string[]; stderr: string[]; stdoutText: string };
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  // Accumulator string the writer appends to — exposed via a getter on
  // `out.stdoutText` so tests always read the live value, not a stale
  // reference snapshot.
  let stdoutTextAccumulator = "";
  const ctx: CLIContext = {
    cwd: opts.cwd,
    args: Object.freeze([...(opts.args ?? [])]),
    env: Object.freeze({ ...(opts.env ?? {}) }) as Record<string, string>,
    stdout: (line: string) => {
      stdout.push(line);
      stdoutTextAccumulator += line + "\n";
    },
    stderr: (line: string) => {
      stderr.push(line);
    },
    stdin:
      opts.stdin ??
      makeQueuedStdin([...(opts.stdinQueue ?? [])], {
        // Interactive prompts historically expected "" when the queue is
        // empty; chat needs null (EOF). Prefer explicit stdinExhausted,
        // else "" when a queue was provided (prompt tests), else null.
        exhausted:
          opts.stdinExhausted !== undefined
            ? opts.stdinExhausted
            : opts.stdinQueue !== undefined
              ? ""
              : null,
      }),
    isTTY: opts.isTTY ?? false,
  };
  return {
    ctx,
    out: {
      stdout,
      stderr,
      get stdoutText() {
        return stdoutTextAccumulator;
      },
    },
  };
}

/** Creates a temp directory as the project root for `init`-style tests. */
export async function makeTempProject(parent: string): Promise<string> {
  const dir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "kairo-cli-"),
  );
  // parent is purely informational — ignored.
  void parent;
  return dir;
}

/** Reads a file relative to a temp project root, returning parsed JSON or null. */
export async function readJson(projectRoot: string, p: string): Promise<unknown> {
  const abs = path.join(projectRoot, p);
  try {
    const content = await fs.promises.readFile(abs, "utf8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/** Writes a JSON file under the project root (for setting up pre-existing projects). */
export async function writeJsonFile(
  projectRoot: string,
  rel: string,
  value: unknown,
): Promise<void> {
  const abs = path.join(projectRoot, rel);
  await fs.promises.mkdir(path.dirname(abs), { recursive: true });
  await fs.promises.writeFile(abs, JSON.stringify(value, null, 2) + "\n", "utf8");
}

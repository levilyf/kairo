/**
 * Test doubles for @kairo/chat.
 */

import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Application } from "@kairo/app";
import type {
  LoopResult,
  ProviderResponse,
  ProviderStreamEvent,
  Session,
  Turn,
} from "@kairo/core";
import type { ChatIO } from "../src/types.js";

export async function makeTempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "kairo-chat-"));
}

export async function rmTempRoot(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

export function makeMemoryIO(
  lines: Array<string | null> = [],
): ChatIO & {
  readonly written: string[];
  readonly lines: string[];
  pushInput(...more: Array<string | null>): void;
} {
  const input: Array<string | null> = [...lines];
  const written: string[] = [];
  const outLines: string[] = [];
  let buffer = "";

  return {
    isTTY: false,
    written,
    get lines() {
      return outLines;
    },
    pushInput(...more: Array<string | null>) {
      input.push(...more);
    },
    write(text: string) {
      written.push(text);
      buffer += text;
    },
    writeLine(line = "") {
      written.push(line + "\n");
      outLines.push(buffer + line);
      buffer = "";
    },
    async readLine(_prompt: string) {
      if (input.length === 0) return null;
      return input.shift()!;
    },
  };
}

export interface FakeLoopOptions {
  /** Map of user text → stream events (message_end required). */
  streamFor?: (
    messages: readonly { role: string; content: readonly unknown[] }[],
  ) => AsyncIterable<ProviderStreamEvent> | ProviderStreamEvent[];
  /** Or simple fixed response text. */
  text?: string;
  /** Throw on execute. */
  fail?: Error | (() => Error);
}

function textResponse(text: string): ProviderResponse {
  return {
    id: "resp-1",
    output: Object.freeze([{ type: "text" as const, text }]),
    stopReason: "end",
  };
}

async function* defaultStream(text: string): AsyncIterable<ProviderStreamEvent> {
  yield { type: "message_start" };
  // stream character by character for progressive tests
  for (const ch of text) {
    yield { type: "text_delta", text: ch };
  }
  yield { type: "message_end", response: textResponse(text) };
}

export function makeFakeApplication(
  loopOptions: FakeLoopOptions = {},
): Application & {
  readonly executes: Array<{ model: string; messages: unknown }>;
  readonly sessionsCreated: string[];
} {
  const executes: Array<{ model: string; messages: unknown }> = [];
  const sessionsCreated: string[] = [];
  const sessions = new Map<string, Session>();

  const agentLoop = {
    async execute(
      turn: Turn,
      options: {
        model: string;
        messages?: readonly unknown[];
        stream?: boolean;
        signal?: AbortSignal;
        onStreamEvent?: (e: ProviderStreamEvent) => void | Promise<void>;
        providerId?: string;
      },
    ): Promise<LoopResult> {
      executes.push({
        model: options.model,
        messages: options.messages !== undefined ? [...options.messages] : undefined,
      });

      if (loopOptions.fail !== undefined) {
        throw typeof loopOptions.fail === "function"
          ? loopOptions.fail()
          : loopOptions.fail;
      }

      const throwIfAborted = (): void => {
        if (options.signal?.aborted) {
          const err = new Error("cancelled");
          (err as { code?: string }).code = "CANCELLED";
          throw err;
        }
      };
      throwIfAborted();

      const text = loopOptions.text ?? "hello";
      let events: AsyncIterable<ProviderStreamEvent> | ProviderStreamEvent[];
      if (loopOptions.streamFor !== undefined) {
        events = loopOptions.streamFor(
          (options.messages ?? []) as {
            role: string;
            content: readonly unknown[];
          }[],
        );
      } else {
        events = defaultStream(text);
      }

      let finalResponse: ProviderResponse | undefined;
      const stream = asAsync(events);
      const iterator = stream[Symbol.asyncIterator]();
      // Race each next() against abort so a mid-stream cancel cannot hang.
      while (true) {
        throwIfAborted();
        const nextResult = await raceWithAbort(iterator.next(), options.signal);
        throwIfAborted();
        if (nextResult.done) break;
        const event = nextResult.value;
        if (options.onStreamEvent !== undefined) {
          await options.onStreamEvent(event);
        }
        if (event.type === "message_end") {
          finalResponse = event.response;
        }
        throwIfAborted();
      }

      if (finalResponse === undefined) {
        finalResponse = textResponse(text);
      }

      // mark turn complete if possible
      if (typeof (turn as { complete?: unknown }).complete === "function") {
        await (turn as Turn).complete({ result: finalResponse });
      }

      return {
        status: "completed",
        turnId: turn.id,
        sessionId: turn.sessionId,
        runtimeId: turn.runtimeId,
        iterations: Object.freeze([]),
        finalResponse,
        iterationCount: 1,
      };
    },
  };

  const app = {
    config: { version: 1 } as Application["config"],
    registry: {} as Application["registry"],
    harness: {} as Application["harness"],
    providers: Object.freeze([]),
    status: "started" as const,
    executes,
    sessionsCreated,
    async start() {
      return;
    },
    async stop() {
      return;
    },
    runtime: {
      sessions: {
        async create(input: { id?: string } = {}) {
          const id = input.id ?? `sess-${sessionsCreated.length + 1}`;
          sessionsCreated.push(id);
          const turns: Turn[] = [];
          const session = {
            id,
            runtimeId: "rt-1",
            state: "ready",
            metadata: { id, runtimeId: "rt-1" },
            cancellation: {
              signal: new AbortController().signal,
              abort() {
                /* no-op */
              },
            },
            turns: {
              async create() {
                const turn = {
                  id: `turn-${turns.length + 1}`,
                  sessionId: id,
                  runtimeId: "rt-1",
                  state: "running",
                  cancellation: {
                    signal: new AbortController().signal,
                    abort() {
                      /* no-op */
                    },
                  },
                  async complete() {
                    (turn as { state: string }).state = "completed";
                  },
                  async cancel() {
                    (turn as { state: string }).state = "cancelled";
                  },
                  async fail() {
                    (turn as { state: string }).state = "failed";
                  },
                } as unknown as Turn;
                turns.push(turn);
                return turn;
              },
              get size() {
                return turns.length;
              },
            },
            async close() {
              (session as { state: string }).state = "closed";
            },
          } as unknown as Session;
          sessions.set(id, session);
          return session;
        },
      },
      agentLoop,
    } as unknown as Application["runtime"],
  };

  return app as Application & {
    readonly executes: Array<{ model: string; messages: unknown }>;
    readonly sessionsCreated: string[];
  };
}

async function* asAsync<T>(
  value: AsyncIterable<T> | Iterable<T>,
): AsyncIterable<T> {
  if (
    value !== null &&
    typeof value === "object" &&
    Symbol.asyncIterator in value
  ) {
    yield* value as AsyncIterable<T>;
    return;
  }
  for (const item of value as Iterable<T>) {
    yield item;
  }
}

function raceWithAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> {
  if (signal === undefined) return promise;
  if (signal.aborted) {
    const err = new Error("cancelled");
    (err as { code?: string }).code = "CANCELLED";
    return Promise.reject(err);
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      const err = new Error("cancelled");
      (err as { code?: string }).code = "CANCELLED";
      reject(err);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

/**
 * Chat-owned types. History is provider-neutral and Core-compatible.
 */

import type { ContextMessage } from "@kairo/core";

/** One chat message stored in JSONL + in-memory history. */
export type ChatMessage = ContextMessage;

/** Roles we persist in chat sessions. */
export type ChatRole = "user" | "assistant" | "system" | "tool";

/** Raw write IO surface for progressive rendering (no auto-newline). */
export interface ChatIO {
  /** Write text as-is (no trailing newline). */
  write(text: string): void;
  /** Write a full line with trailing newline. */
  writeLine(line?: string): void;
  /**
   * Read one line of user input.
   * Resolves to null on EOF (Ctrl+D).
   * Rejects with ChatError(CANCELLED) on interrupt when configured by host.
   */
  readLine(prompt: string): Promise<string | null>;
  readonly isTTY: boolean;
}

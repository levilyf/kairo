/**
 * Progressive stream renderer — plain markdown/code first.
 *
 * Rendering is separate from business logic. Receives ProviderStreamEvents
 * and writes progressive terminal output. No full-screen TUI.
 */

import type { ProviderStreamEvent } from "@kairo/core";
import type { ChatIO } from "../types.js";

export interface ProgressiveRendererOptions {
  readonly io: ChatIO;
  /** Prefix printed once before the first text delta (default: empty). */
  readonly assistantPrefix?: string;
}

/**
 * Stateful progressive renderer for one assistant stream.
 */
export class ProgressiveRenderer {
  private readonly io: ChatIO;
  private readonly assistantPrefix: string;
  private started = false;
  private text = "";
  private closed = false;

  constructor(options: ProgressiveRendererOptions) {
    this.io = options.io;
    this.assistantPrefix = options.assistantPrefix ?? "";
  }

  /** Handle one Core stream event. */
  onEvent(event: ProviderStreamEvent): void {
    if (this.closed) return;

    switch (event.type) {
      case "message_start":
        if (!this.started) {
          this.started = true;
          if (this.assistantPrefix.length > 0) {
            this.io.write(this.assistantPrefix);
          }
        }
        break;
      case "text_delta":
        if (!this.started) {
          this.started = true;
          if (this.assistantPrefix.length > 0) {
            this.io.write(this.assistantPrefix);
          }
        }
        this.text += event.text;
        this.io.write(event.text);
        break;
      case "tool_call_delta":
        // Progressive plain mode: suppress tool-call noise during stream.
        // Final tool activity is reflected after message_end if needed.
        break;
      case "usage":
        // Observation only; not rendered in plain mode.
        break;
      case "message_end":
        this.finish();
        break;
      case "error":
        this.io.writeLine();
        this.io.writeLine(
          `error: ${typeof event.message === "string" ? event.message : "stream error"}`,
        );
        this.closed = true;
        break;
      default:
        break;
    }
  }

  /** Accumulated assistant text so far. */
  get accumulatedText(): string {
    return this.text;
  }

  /**
   * Ensure stream output ends with a newline when any text was written.
   * Safe to call multiple times.
   */
  finish(): void {
    if (this.closed) return;
    if (this.started && this.text.length > 0) {
      // Ensure trailing newline after progressive tokens.
      if (!this.text.endsWith("\n")) {
        this.io.writeLine();
      }
    } else if (this.started) {
      this.io.writeLine();
    }
    this.closed = true;
  }
}

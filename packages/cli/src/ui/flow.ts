/**
 * Connected flow layout.
 *
 * Used by `kairo provider add` to make first-time setup feel like one
 * lightweight workflow instead of separate prompts. It stays line-oriented:
 * no screen clearing, no full-screen TUI, no cursor gymnastics. Completed
 * steps are printed as tree rows and the active step ends with a single
 * `└─ >` prompt marker.
 */

import type { CLIContext } from "../context.js";
import { selectTheme } from "./color.js";
import { makeRawPromptReader, type RawPromptOptions } from "./raw-prompt.js";

export interface FlowPromptOptions extends RawPromptOptions {
  readonly description?: string;
}

export class ConnectedFlow {
  private readonly completed: string[] = [];
  private readonly read: (label: string, opts?: RawPromptOptions) => Promise<string>;

  constructor(
    private readonly ctx: CLIContext,
    private readonly title: string,
  ) {
    this.read = makeRawPromptReader(ctx);
    ctx.stdout("");
    ctx.stdout(title);
    ctx.stdout("");
  }

  /** Append a completed success line to the flow. */
  complete(message: string): void {
    this.completed.push(message);
    this.renderCompleted();
  }

  /** Append an informational line to the flow. */
  info(message: string): void {
    const theme = selectTheme(this.ctx.isTTY);
    this.ctx.stdout(`├─ ${theme.muted(message)}`);
  }

  /** Ask one connected prompt row and return the trimmed answer. */
  async prompt(label: string, options: FlowPromptOptions = {}): Promise<string> {
    this.renderPrompt(label, options.description);
    return this.read(label, options);
  }

  /** Select from a compact numbered list, defaulting to index 0 on empty. */
  async select(label: string, options: readonly string[]): Promise<string> {
    if (options.length === 0) return "";
    this.renderPrompt(label);
    const visible = options.slice(0, 12);
    for (let i = 0; i < visible.length; i += 1) {
      this.ctx.stdout(`│  ${i + 1}  ${visible[i]}`);
    }
    if (options.length > visible.length) {
      this.ctx.stdout(`│  … ${options.length - visible.length} more`);
    }
    this.ctx.stdout("└─ >");
    const raw = await this.read(label, { default: "1" });
    const asNumber = Number(raw);
    if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= options.length) {
      return options[asNumber - 1]!;
    }
    const exact = options.find((m) => m === raw);
    if (exact !== undefined) return exact;
    const fuzzy = options.find((m) => m.toLowerCase().includes(raw.toLowerCase()));
    if (fuzzy !== undefined) return fuzzy;
    this.ctx.stdout(`Choose 1-${options.length}, or type a model id from the list.`);
    return this.select(label, options);
  }

  /** Render final completion rows. */
  summary(title: string, rows: readonly string[], next?: string): void {
    this.ctx.stdout("");
    this.ctx.stdout(title);
    this.ctx.stdout("");
    for (let i = 0; i < rows.length; i += 1) {
      const prefix = i === rows.length - 1 ? "└─" : "├─";
      this.ctx.stdout(`${prefix} ✓ ${rows[i]}`);
    }
    if (next !== undefined) {
      this.ctx.stdout("");
      this.ctx.stdout("Next");
      this.ctx.stdout("");
      this.ctx.stdout(`└─ ${next}`);
    }
  }

  private renderCompleted(): void {
    const latest = this.completed[this.completed.length - 1];
    if (latest !== undefined) this.ctx.stdout(`├─ ✓ ${latest}`);
  }

  private renderPrompt(label: string, description?: string): void {
    this.ctx.stdout("│");
    this.ctx.stdout(`├─ ${label}`);
    if (description !== undefined && description.length > 0) {
      this.ctx.stdout(`│  ${description}`);
    }
    this.ctx.stdout("└─ >");
  }
}

import { describe, expect, it } from "vitest";

import {
  renderLogo,
  heading,
  table,
  emptyState,
  prompt,
  select,
  LOGO_LINES,
  LOGO_TAGLINE,
} from "../src/ui/index.js";
import { makeContext } from "./helpers.js";

describe("UI components", () => {
  it("renderLogo emits the verbatim logo lines + tagline + version", () => {
    const { ctx, out } = makeContext({ cwd: "/tmp" });
    renderLogo(ctx, "v0.1.0");
    for (const line of LOGO_LINES) {
      expect(out.stdout).toContain(line);
    }
    expect(out.stdout).toContain(LOGO_TAGLINE);
    expect(out.stdout).toContain("v0.1.0");
  });

  it("heading renders as a single accent line with blank-line whitespace around it", () => {
    const { ctx, out } = makeContext({ cwd: "/tmp" });
    heading(ctx, "Providers");
    const lines = out.stdout;
    expect(lines[0]).toBe("");
    expect(lines[1]).toBe("Providers"); // no escape codes in non-TTY
    expect(lines[2]).toBe("");
  });

  it("table renders a borderless, column-aligned layout", () => {
    const { ctx, out } = makeContext({ cwd: "/tmp" });
    table(ctx, {
      columns: ["Name", "Count"],
      rows: [
        ["NVIDIA", "4"],
        ["OpenRouter", "8"],
      ],
    });
    expect(out.stdoutText).toContain("Name");
    expect(out.stdoutText).toContain("OpenRouter");
    // Both data rows should have equal width (alignment).
    const lines = out.stdout.filter((l) => l.startsWith("  "));
    expect(lines.length).toBe(3);
    // Header column "Name" padded so "Count" position aligns.
    const header = lines[0] ?? "";
    const firstRow = lines[1] ?? "";
    expect(header.length).toBe(firstRow.length);
  });

  it("emptyState renders the noun + hint with no decorative boxes", () => {
    const { ctx, out } = makeContext({ cwd: "/tmp" });
    emptyState(ctx, "providers", "kairo provider add <provider>");
    expect(out.stdoutText).toContain("No providers have been configured.");
    expect(out.stdoutText).toContain("kairo provider add <provider>");
  });

  it("prompt forwards label to stdin and trims whitespace", async () => {
    const { ctx, out } = makeContext({
      cwd: "/tmp",
      stdinQueue: ["  hello  "],
    });
    const value = await prompt(ctx, "API Key");
    expect(value).toBe("hello");
    expect(out.stdout).toContain("API Key");
  });

  it("prompt returns default when submitted empty and a default is provided", async () => {
    const { ctx } = makeContext({ cwd: "/tmp", stdinQueue: [""] });
    const value = await prompt(ctx, "Base URL", { default: "http://localhost" });
    expect(value).toBe("http://localhost");
  });

  it("prompt re-asks when required + empty submission", async () => {
    const { ctx } = makeContext({
      cwd: "/tmp",
      stdinQueue: ["", "real-value"],
    });
    const value = await prompt(ctx, "API Key", {
      required: { message: "Required" },
    });
    expect(value).toBe("real-value");
  });

  it("select returns the zero-based choice index", async () => {
    const { ctx } = makeContext({ cwd: "/tmp", stdinQueue: ["2"] });
    const idx = await select(ctx, "Pick", ["A", "B", "C"]);
    expect(idx).toBe(1);
  });

  it("select rejects empty input with USER_CANCELLED", async () => {
    const { ctx } = makeContext({ cwd: "/tmp", stdinQueue: [""] });
    await expect(select(ctx, "Pick", ["A", "B"])).rejects.toMatchObject({
      code: "USER_CANCELLED",
    });
  });
});

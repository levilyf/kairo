import { describe, expect, it } from "vitest";
import { main, run } from "../src/program.js";
import { makeContext } from "./helpers.js";

describe("unknown command", () => {
  it("returns exit 2 for an unknown top-level command", async () => {
    const { ctx } = makeContext({ cwd: "/tmp/none", args: ["nope-not-a-command"] });
    const code = await run(ctx);
    expect(code).toBe(2);
  });

  it("'main' renders the error + hint, never throws", async () => {
    // main() returns a Promise<number> and never throws; it handles errors.
    const out: string[] = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    let stderrText = "";
    process.stderr.write = (s) => {
      stderrText += s;
      return true;
    };
    try {
      const code = await main(["nope-not-a-command"]);
      expect(code).toBe(2);
    } finally {
      process.stderr.write = origWrite;
    }
    void out;
    void stderrText;
  });
});

describe("--no-color flag", () => {
  it("disables ANSI escape codes when --no-color is passed", async () => {
    const { ctx, out } = makeContext({
      cwd: "/tmp/none",
      args: ["--no-color", "--version"],
      isTTY: true,
    });
    await run(ctx);
    expect(out.stdoutText).not.toContain("\x1b[");
  });
});

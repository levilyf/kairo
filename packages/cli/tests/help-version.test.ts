import { describe, expect, it } from "vitest";
import { run } from "../src/program.js";
import { makeContext } from "./helpers.js";

describe("--help / help", () => {
  it("empty args render the help overview", async () => {
    const { ctx, out } = makeContext({ cwd: "/tmp/none" });
    const code = await run(ctx);
    expect(code).toBe(0);
    expect(out.stdoutText).toContain("Make your own AI harness");
    expect(out.stdoutText).toContain("v0.1.0-alpha.1");
    expect(out.stdoutText).toContain("Commands");
    expect(out.stdoutText).toContain("init");
    expect(out.stdoutText).toContain("models");
    expect(out.stdoutText).toContain("Run: kairo <command> --help");
  });

  it("--help flag renders the overview too", async () => {
    const { ctx, out } = makeContext({ cwd: "/tmp/none", args: ["--help"] });
    const code = await run(ctx);
    expect(code).toBe(0);
    expect(out.stdoutText).toContain("Make your own AI harness");
  });

  it("-h flag renders the overview too", async () => {
    const { ctx, out } = makeContext({ cwd: "/tmp/none", args: ["-h"] });
    const code = await run(ctx);
    expect(code).toBe(0);
    expect(out.stdoutText).toContain("Make your own AI harness");
  });

  it("'help <command>' renders per-command help", async () => {
    const { ctx, out } = makeContext({ cwd: "/tmp/none", args: ["help", "models"] });
    const code = await run(ctx);
    expect(code).toBe(0);
    expect(out.stdoutText).toContain("models");
    expect(out.stdoutText).toContain("kairo models");
  });

  it("'help <unknown>' exits 2", async () => {
    const { ctx } = makeContext({ cwd: "/tmp/none", args: ["help", "zzz"] });
    const code = await run(ctx);
    expect(code).toBe(2);
  });
});

describe("--version / -V", () => {
  it("--version prints logo + v0.1.0-alpha.1", async () => {
    const { ctx, out } = makeContext({ cwd: "/tmp/none", args: ["--version"] });
    const code = await run(ctx);
    expect(code).toBe(0);
    expect(out.stdoutText).toContain("v0.1.0-alpha.1");
    expect(out.stdoutText).toContain("Make your own AI harness");
  });

  it("-V prints logo + v0.1.0-alpha.1", async () => {
    const { ctx, out } = makeContext({ cwd: "/tmp/none", args: ["-V"] });
    const code = await run(ctx);
    expect(code).toBe(0);
    expect(out.stdoutText).toContain("v0.1.0-alpha.1");
  });
});

import { describe, expect, it } from "vitest";
import { run } from "../src/program.js";
import { makeContext } from "./helpers.js";

describe("kairo provider --help", () => {
  it("prints provider help and exits 0 for --help", async () => {
    const { ctx, out } = makeContext({
      cwd: "/tmp/none",
      args: ["provider", "--help"],
    });
    const code = await run(ctx);
    expect(code).toBe(0);
    expect(out.stdoutText).toContain("provider");
    expect(out.stdoutText).toMatch(/Usage:/i);
    expect(out.stdoutText).toContain("list");
    expect(out.stdoutText).toContain("add");
    expect(out.stdoutText).toContain("configure");
    expect(out.stdoutText).toContain("remove");
    expect(out.stdoutText).not.toContain("Unknown provider subcommand");
  });

  it("prints provider help and exits 0 for -h", async () => {
    const { ctx, out } = makeContext({
      cwd: "/tmp/none",
      args: ["provider", "-h"],
    });
    const code = await run(ctx);
    expect(code).toBe(0);
    expect(out.stdoutText).toMatch(/Usage:/i);
    expect(out.stdoutText).toContain("list");
    expect(out.stdoutText).not.toContain("Unknown provider subcommand");
  });

  it("still rejects unknown provider subcommands with exit 2", async () => {
    const { ctx, out } = makeContext({
      cwd: "/tmp/none",
      args: ["provider", "nope"],
    });
    const code = await run(ctx);
    expect(code).toBe(2);
    expect(out.stdoutText).toContain("Unknown provider subcommand: nope");
    expect(out.stdoutText).toContain("kairo provider --help");
  });
});

describe("top-level help remains unchanged", () => {
  it("kairo --help still lists provider among commands", async () => {
    const { ctx, out } = makeContext({ cwd: "/tmp/none", args: ["--help"] });
    const code = await run(ctx);
    expect(code).toBe(0);
    expect(out.stdoutText).toContain("Commands");
    expect(out.stdoutText).toContain("provider");
    expect(out.stdoutText).toContain("Manage configured providers");
  });

  it("kairo help provider still renders metadata help", async () => {
    const { ctx, out } = makeContext({
      cwd: "/tmp/none",
      args: ["help", "provider"],
    });
    const code = await run(ctx);
    expect(code).toBe(0);
    expect(out.stdoutText).toContain("provider");
    expect(out.stdoutText).toContain("Manage configured providers");
    expect(out.stdoutText).toMatch(/Usage:/i);
  });
});

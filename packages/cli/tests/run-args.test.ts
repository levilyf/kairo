import { describe, expect, it } from "vitest";

import { parseRunArgs } from "../src/commands/run-args.js";
import { CLIError } from "../src/errors.js";

describe("parseRunArgs — prompt parsing", () => {
  it("joins positional words into a single prompt", () => {
    const args = parseRunArgs(["summarize", "the", "readme"]);
    expect(args.prompt).toBe("summarize the readme");
    expect(args.help).toBe(false);
    expect(args.model).toBeUndefined();
    expect(args.providerId).toBeUndefined();
  });

  it("treats a single quoted argument as the whole prompt", () => {
    const args = parseRunArgs(["Summarize README.md"]);
    expect(args.prompt).toBe("Summarize README.md");
  });

  it("returns an empty prompt when no positional args are given", () => {
    const args = parseRunArgs([]);
    expect(args.prompt).toBe("");
    expect(args.help).toBe(false);
  });

  it("parses --model and --provider flags around the prompt", () => {
    const args = parseRunArgs([
      "--model",
      "echo-1",
      "read",
      "it",
      "--provider",
      "echo",
    ]);
    expect(args.prompt).toBe("read it");
    expect(args.model).toBe("echo-1");
    expect(args.providerId).toBe("echo");
  });

  it("supports -m and -p short flags", () => {
    const args = parseRunArgs(["-m", "m1", "-p", "p1", "hello"]);
    expect(args.model).toBe("m1");
    expect(args.providerId).toBe("p1");
    expect(args.prompt).toBe("hello");
  });

  it("detects --help", () => {
    expect(parseRunArgs(["--help"]).help).toBe(true);
    expect(parseRunArgs(["-h"]).help).toBe(true);
  });

  it("treats tokens after -- as verbatim prompt words", () => {
    const args = parseRunArgs(["--", "--model", "is", "part", "of", "prompt"]);
    expect(args.prompt).toBe("--model is part of prompt");
    expect(args.model).toBeUndefined();
  });

  it("throws on a missing --model value", () => {
    expect(() => parseRunArgs(["--model"])).toThrow(CLIError);
    expect(() => parseRunArgs(["--model", "--provider", "x"])).toThrow(CLIError);
  });

  it("throws on an unknown flag", () => {
    expect(() => parseRunArgs(["--nope", "hi"])).toThrow(CLIError);
  });
});

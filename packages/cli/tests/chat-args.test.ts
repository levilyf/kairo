import { describe, expect, it } from "vitest";
import { parseChatArgs } from "../src/commands/chat-args.js";
import { CLIError, CLIErrorCode } from "../src/errors.js";

describe("parseChatArgs", () => {
  it("parses empty args", () => {
    expect(parseChatArgs([])).toEqual({});
  });

  it("parses --model and --provider", () => {
    expect(
      parseChatArgs(["--model", "gpt-4o-mini", "--provider", "openai"]),
    ).toEqual({
      model: "gpt-4o-mini",
      providerId: "openai",
    });
  });

  it("parses short flags", () => {
    expect(parseChatArgs(["-m", "m1", "-p", "ollama"])).toEqual({
      model: "m1",
      providerId: "ollama",
    });
  });

  it("bare --resume means last", () => {
    expect(parseChatArgs(["--resume"])).toEqual({ resume: "last" });
  });

  it("--resume with id", () => {
    expect(parseChatArgs(["--resume", "abc-123"])).toEqual({
      resume: "abc-123",
    });
  });

  it("--resume last then other flags", () => {
    expect(parseChatArgs(["-r", "last", "--model", "m"])).toEqual({
      resume: "last",
      model: "m",
    });
  });

  it("rejects unknown flags", () => {
    try {
      parseChatArgs(["--nope"]);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(CLIError);
      expect((error as CLIError).code).toBe(CLIErrorCode.UNKNOWN_COMMAND);
    }
  });

  it("rejects --model without value", () => {
    expect(() => parseChatArgs(["--model"])).toThrow(CLIError);
  });

  it("rejects positional args", () => {
    expect(() => parseChatArgs(["hello"])).toThrow(CLIError);
  });
});

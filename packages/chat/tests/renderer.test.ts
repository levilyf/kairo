import { describe, expect, it } from "vitest";
import { ProgressiveRenderer } from "../src/renderer/progressive.js";
import { makeMemoryIO } from "./helpers.js";

describe("ProgressiveRenderer", () => {
  it("writes text deltas progressively", () => {
    const io = makeMemoryIO();
    const renderer = new ProgressiveRenderer({ io });
    renderer.onEvent({ type: "message_start" });
    renderer.onEvent({ type: "text_delta", text: "Hel" });
    renderer.onEvent({ type: "text_delta", text: "lo" });
    renderer.onEvent({
      type: "message_end",
      response: {
        id: "r",
        output: [{ type: "text", text: "Hello" }],
        stopReason: "end",
      },
    });
    expect(io.written.join("")).toBe("Hello\n");
    expect(renderer.accumulatedText).toBe("Hello");
  });

  it("prints assistantPrefix once", () => {
    const io = makeMemoryIO();
    const renderer = new ProgressiveRenderer({
      io,
      assistantPrefix: "assistant: ",
    });
    renderer.onEvent({ type: "text_delta", text: "x" });
    renderer.finish();
    expect(io.written.join("")).toBe("assistant: x\n");
  });

  it("ignores tool_call_delta and usage in plain mode", () => {
    const io = makeMemoryIO();
    const renderer = new ProgressiveRenderer({ io });
    renderer.onEvent({ type: "message_start" });
    renderer.onEvent({
      type: "tool_call_delta",
      id: "c1",
      name: "search",
      argumentsDelta: "{}",
    });
    renderer.onEvent({ type: "usage", usage: { total_tokens: 1 } });
    renderer.onEvent({ type: "text_delta", text: "ok" });
    renderer.finish();
    expect(io.written.join("")).toBe("ok\n");
  });

  it("renders error events", () => {
    const io = makeMemoryIO();
    const renderer = new ProgressiveRenderer({ io });
    renderer.onEvent({ type: "error", message: "boom" });
    expect(io.lines.some((l) => l.includes("error: boom"))).toBe(true);
  });
});

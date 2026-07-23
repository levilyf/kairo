import { describe, expect, it, afterEach } from "vitest";
import { runChatRepl } from "../src/repl.js";
import { ChatError, ChatErrorCode } from "../src/errors.js";
import {
  makeFakeApplication,
  makeMemoryIO,
  makeTempRoot,
  rmTempRoot,
} from "./helpers.js";

describe("runChatRepl", () => {
  const roots: string[] = [];
  afterEach(async () => {
    for (const r of roots.splice(0)) await rmTempRoot(r);
  });

  it("runs turns until EOF and returns session id", async () => {
    const rootDir = await makeTempRoot();
    roots.push(rootDir);
    const io = makeMemoryIO(["hello", "world", null]);
    const app = makeFakeApplication({ text: "ok" });

    const result = await runChatRepl({
      app,
      io,
      rootDir,
      model: "gpt-4o-mini",
      providerId: "openai",
    });

    expect(result.exitReason).toBe("eof");
    expect(result.turns).toBe(2);
    expect(result.sessionId).toBeTruthy();
    expect(io.written.join("")).toContain("ok");
  });

  it("exits on /exit without calling the model", async () => {
    const rootDir = await makeTempRoot();
    roots.push(rootDir);
    const io = makeMemoryIO(["/exit"]);
    const app = makeFakeApplication({ text: "nope" });
    const result = await runChatRepl({
      app,
      io,
      rootDir,
      model: "m",
    });
    expect(result.turns).toBe(0);
    expect(result.exitReason).toBe("eof");
    expect(app.executes).toHaveLength(0);
  });

  it("skips blank lines", async () => {
    const rootDir = await makeTempRoot();
    roots.push(rootDir);
    const io = makeMemoryIO(["", "  ", "hi", null]);
    const app = makeFakeApplication({ text: "a" });
    const result = await runChatRepl({
      app,
      io,
      rootDir,
      model: "m",
    });
    expect(result.turns).toBe(1);
  });

  it("treats CANCELLED at prompt as re-prompt, not exit", async () => {
    const rootDir = await makeTempRoot();
    roots.push(rootDir);
    let reads = 0;
    const io = makeMemoryIO();
    io.readLine = async () => {
      reads += 1;
      if (reads === 1) {
        throw new ChatError({
          code: ChatErrorCode.CANCELLED,
          message: "interrupted",
        });
      }
      if (reads === 2) return "hi";
      return null;
    };
    const app = makeFakeApplication({ text: "ok" });
    const result = await runChatRepl({
      app,
      io,
      rootDir,
      model: "m",
    });
    expect(result.turns).toBe(1);
    expect(result.exitReason).toBe("eof");
  });

  it("prints cancelled and continues after turn cancel", async () => {
    const rootDir = await makeTempRoot();
    roots.push(rootDir);
    let n = 0;
    const app = makeFakeApplication({
      streamFor: async function* () {
        n += 1;
        if (n === 1) {
          const err = new Error("cancelled");
          (err as { code?: string }).code = "CANCELLED";
          throw err;
        }
        yield { type: "message_start" };
        yield { type: "text_delta", text: "done" };
        yield {
          type: "message_end",
          response: {
            id: "r",
            output: [{ type: "text", text: "done" }],
            stopReason: "end",
          },
        };
      },
    });
    const io = makeMemoryIO(["first", "second", null]);
    const result = await runChatRepl({
      app,
      io,
      rootDir,
      model: "m",
    });
    expect(result.turns).toBe(1);
    expect(io.lines.some((l) => l.includes("cancelled"))).toBe(true);
  });

  it("prints banner lines once", async () => {
    const rootDir = await makeTempRoot();
    roots.push(rootDir);
    const io = makeMemoryIO([null]);
    await runChatRepl({
      app: makeFakeApplication(),
      io,
      rootDir,
      model: "m",
      banner: ["Welcome", "to chat"],
    });
    expect(io.lines).toEqual(expect.arrayContaining(["Welcome", "to chat"]));
  });

  it("registers and removes process SIGINT listener around the REPL", async () => {
    const rootDir = await makeTempRoot();
    roots.push(rootDir);
    const before = process.listenerCount("SIGINT");
    const io = makeMemoryIO([null]);
    await runChatRepl({
      app: makeFakeApplication(),
      io,
      rootDir,
      model: "m",
    });
    expect(process.listenerCount("SIGINT")).toBe(before);
  });
});

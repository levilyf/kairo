import { describe, expect, it, afterEach } from "vitest";
import { ChatEngine } from "../src/engine.js";
import { SessionStore } from "../src/session/store.js";
import { ProgressiveRenderer } from "../src/renderer/progressive.js";
import { ChatErrorCode } from "../src/errors.js";
import {
  makeFakeApplication,
  makeMemoryIO,
  makeTempRoot,
  rmTempRoot,
} from "./helpers.js";

describe("ChatEngine", () => {
  const roots: string[] = [];
  afterEach(async () => {
    for (const r of roots.splice(0)) await rmTempRoot(r);
  });

  async function setup(text = "pong") {
    const rootDir = await makeTempRoot();
    roots.push(rootDir);
    const app = makeFakeApplication({ text });
    const store = new SessionStore({
      rootDir,
      createId: () => "chat-1",
    });
    const engine = new ChatEngine({
      app,
      store,
      model: "gpt-4o-mini",
      providerId: "openai",
    });
    return { app, store, engine, rootDir };
  }

  it("starts a new session and runs a streaming turn", async () => {
    const { app, engine, store } = await setup("pong");
    await engine.start();
    expect(engine.id).toBe("chat-1");
    expect(app.sessionsCreated).toEqual(["chat-1"]);

    const io = makeMemoryIO();
    const renderer = new ProgressiveRenderer({ io });
    const result = await engine.turn("hi", { renderer });

    expect(result.assistantText).toBe("pong");
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toMatchObject({
      role: "user",
      content: [{ type: "text", text: "hi" }],
    });
    expect(result.messages[1]).toMatchObject({
      role: "assistant",
      content: [{ type: "text", text: "pong" }],
    });
    expect(app.executes).toHaveLength(1);
    expect(app.executes[0]!.model).toBe("gpt-4o-mini");
    // progressive output
    expect(io.written.join("")).toContain("pong");

    const loaded = await store.load("chat-1");
    expect(loaded.messages).toHaveLength(2);
  });

  it("passes full history on subsequent turns", async () => {
    const { app, engine } = await setup("ok");
    await engine.start();
    await engine.turn("one");
    await engine.turn("two");
    expect(app.executes).toHaveLength(2);
    const second = app.executes[1]!.messages as Array<{ role: string }>;
    expect(second.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
    ]);
  });

  it("resumes from JSONL and continues history", async () => {
    const { engine, store } = await setup("first");
    await engine.start();
    await engine.turn("hello");
    await engine.end();

    const app2 = makeFakeApplication({ text: "second" });
    const engine2 = new ChatEngine({
      app: app2,
      store,
      model: "gpt-4o-mini",
    });
    await engine2.start({ resume: "chat-1" });
    expect(engine2.messages).toHaveLength(2);
    await engine2.turn("again");
    expect(engine2.messages).toHaveLength(4);
    expect(engine2.messages[3]).toMatchObject({
      role: "assistant",
      content: [{ type: "text", text: "second" }],
    });
  });

  it("resumes last session via store.resolveLast", async () => {
    const rootDir = await makeTempRoot();
    roots.push(rootDir);
    const store = new SessionStore({ rootDir, createId: () => "only" });
    const app = makeFakeApplication({ text: "x" });
    const engine = new ChatEngine({ app, store, model: "m" });
    await engine.start();
    await engine.turn("q");
    await engine.end();

    const engine2 = new ChatEngine({
      app: makeFakeApplication({ text: "y" }),
      store,
      model: "m",
    });
    await engine2.start({ resume: "last" });
    expect(engine2.id).toBe("only");
    expect(engine2.messages).toHaveLength(2);
  });

  it("cancel aborts in-flight turn", async () => {
    const rootDir = await makeTempRoot();
    roots.push(rootDir);
    let resolveGate: (() => void) | undefined;
    const gate = new Promise<void>((r) => {
      resolveGate = r;
    });
    let sawPartial = false;

    const app = makeFakeApplication({
      streamFor: async function* () {
        yield { type: "message_start" };
        yield { type: "text_delta", text: "partial" };
        sawPartial = true;
        await gate; // wait until test cancels
        yield {
          type: "message_end",
          response: {
            id: "r",
            output: [{ type: "text", text: "partial" }],
            stopReason: "end",
          },
        };
      },
    });
    const store = new SessionStore({ rootDir, createId: () => "c1" });
    const engine = new ChatEngine({ app, store, model: "m" });
    await engine.start();

    const turnPromise = engine.turn("go");
    // wait until first deltas land so abort races a pending next()
    for (let i = 0; i < 50 && !sawPartial; i++) {
      await new Promise((r) => setTimeout(r, 5));
    }
    engine.cancel("ctrl-c");
    // do not resolve gate — cancel must win via abort race

    await expect(turnPromise).rejects.toMatchObject({
      code: ChatErrorCode.CANCELLED,
    });
    resolveGate?.(); // cleanup hanging generator if any
  });

  it("rejects empty user text", async () => {
    const { engine } = await setup();
    await engine.start();
    await expect(engine.turn("   ")).rejects.toMatchObject({
      code: ChatErrorCode.INVALID_OPTIONS,
    });
  });

  it("requires start before turn", async () => {
    const { engine } = await setup();
    await expect(engine.turn("hi")).rejects.toMatchObject({
      code: ChatErrorCode.INVALID_OPTIONS,
    });
  });
});

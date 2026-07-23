import { describe, expect, it, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { SessionStore } from "../src/session/store.js";
import { ChatError, ChatErrorCode } from "../src/errors.js";
import { makeTempRoot, rmTempRoot } from "./helpers.js";

describe("SessionStore", () => {
  const roots: string[] = [];
  afterEach(async () => {
    for (const r of roots.splice(0)) {
      await rmTempRoot(r);
    }
  });

  async function root(): Promise<string> {
    const dir = await makeTempRoot();
    roots.push(dir);
    return dir;
  }

  it("creates a session with session.start and empty messages", async () => {
    const store = new SessionStore({
      rootDir: await root(),
      createId: () => "sess-1",
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    });
    const loaded = await store.create({
      model: "gpt-4o-mini",
      providerId: "openai",
    });
    expect(loaded.sessionId).toBe("sess-1");
    expect(loaded.model).toBe("gpt-4o-mini");
    expect(loaded.providerId).toBe("openai");
    expect(loaded.messages).toEqual([]);
    expect(loaded.ended).toBe(false);

    const file = store.sessionPath("sess-1");
    const raw = await fs.readFile(file, "utf8");
    const line = JSON.parse(raw.trim());
    expect(line).toMatchObject({
      v: 1,
      type: "session.start",
      sessionId: "sess-1",
      model: "gpt-4o-mini",
      providerId: "openai",
    });
  });

  it("appends messages and reloads them in order", async () => {
    const store = new SessionStore({
      rootDir: await root(),
      createId: () => "sess-2",
    });
    await store.create({ model: "m" });
    await store.appendMessage("sess-2", {
      role: "user",
      content: [{ type: "text", text: "hi" }],
    });
    await store.appendMessage("sess-2", {
      role: "assistant",
      content: [{ type: "text", text: "hello" }],
    });

    const loaded = await store.load("sess-2");
    expect(loaded.messages).toEqual([
      { role: "user", content: [{ type: "text", text: "hi" }] },
      { role: "assistant", content: [{ type: "text", text: "hello" }] },
    ]);
  });

  it("marks ended after session.end", async () => {
    const store = new SessionStore({
      rootDir: await root(),
      createId: () => "sess-3",
    });
    await store.create({ model: "m" });
    await store.end("sess-3", "user-exit");
    const loaded = await store.load("sess-3");
    expect(loaded.ended).toBe(true);
  });

  it("fails closed on missing session", async () => {
    const store = new SessionStore({ rootDir: await root() });
    await expect(store.load("nope")).rejects.toMatchObject({
      code: ChatErrorCode.SESSION_NOT_FOUND,
    });
  });

  it("fails closed on corrupt JSONL", async () => {
    const dir = await root();
    const store = new SessionStore({ rootDir: dir });
    await store.ensureDir();
    await fs.writeFile(
      path.join(store.directory, "bad.jsonl"),
      "not-json\n",
      "utf8",
    );
    await expect(store.load("bad")).rejects.toMatchObject({
      code: ChatErrorCode.SESSION_CORRUPT,
    });
  });

  it("resolveLast returns most recently modified session", async () => {
    const store = new SessionStore({
      rootDir: await root(),
      createId: () => "a",
    });
    await store.create({ model: "m", sessionId: "older" });
    // ensure different mtime
    await new Promise((r) => setTimeout(r, 20));
    await store.create({ model: "m", sessionId: "newer" });
    const last = await store.resolveLast();
    expect(last).toBe("newer");
  });

  it("requires model on create", async () => {
    const store = new SessionStore({ rootDir: await root() });
    await expect(store.create({ model: "" })).rejects.toBeInstanceOf(ChatError);
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createReadFileTool,
  READ_FILE_TOOL_ID,
  READ_FILE_TOOL_NAME,
  ReadFileErrorCode,
} from "../src/index.js";

let root: string;
let outside: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "kairo-ws-"));
  outside = mkdtempSync(join(tmpdir(), "kairo-out-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

function tool(maxBytes?: number) {
  return createReadFileTool(maxBytes !== undefined ? { root, maxBytes } : { root });
}

describe("read_file — identity + schema", () => {
  it("has the required id, name, and object schema", () => {
    const t = tool();
    expect(t.id).toBe(READ_FILE_TOOL_ID);
    expect(t.id).toBe("workspace.read_file");
    expect(t.name).toBe(READ_FILE_TOOL_NAME);
    expect(t.name).toBe("read_file");
    expect(t.parameters.type).toBe("object");
    expect(t.parameters.properties?.path?.type).toBe("string");
    expect(t.parameters.required).toContain("path");
    expect(t.description.length).toBeGreaterThan(0);
  });
});

describe("read_file — success", () => {
  it("reads a top-level file with the documented shape", async () => {
    writeFileSync(join(root, "README.md"), "hello world");
    const result = await tool().execute({ path: "README.md" });
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({
      path: "README.md",
      content: "hello world",
      bytes: 11,
      truncated: false,
    });
  });

  it("reads a nested file", async () => {
    mkdirSync(join(root, "src", "deep"), { recursive: true });
    writeFileSync(join(root, "src", "deep", "a.ts"), "export const a = 1;\n");
    const result = await tool().execute({ path: "src/deep/a.ts" });
    expect(result.ok).toBe(true);
    const data = result.data as { content: string; path: string };
    expect(data.content).toBe("export const a = 1;\n");
    expect(data.path).toBe("src/deep/a.ts");
  });

  it("decodes UTF-8 content correctly", async () => {
    const text = "café — 日本語 — 🌱";
    writeFileSync(join(root, "u.txt"), text, "utf8");
    const result = await tool().execute({ path: "u.txt" });
    expect(result.ok).toBe(true);
    const data = result.data as { content: string; bytes: number };
    expect(data.content).toBe(text);
    expect(data.bytes).toBe(Buffer.byteLength(text, "utf8"));
  });

  it("normalizes a leading ./ in the path", async () => {
    writeFileSync(join(root, "x.txt"), "x");
    const result = await tool().execute({ path: "./x.txt" });
    expect(result.ok).toBe(true);
  });
});

describe("read_file — maxBytes", () => {
  it("truncates content exceeding maxBytes and flags truncated", async () => {
    writeFileSync(join(root, "big.txt"), "abcdefghij"); // 10 bytes
    const result = await tool(4).execute({ path: "big.txt" });
    expect(result.ok).toBe(true);
    const data = result.data as { content: string; bytes: number; truncated: boolean };
    expect(data.truncated).toBe(true);
    expect(Buffer.byteLength(data.content, "utf8")).toBeLessThanOrEqual(4);
  });

  it("does not flag truncated when file fits", async () => {
    writeFileSync(join(root, "small.txt"), "abc");
    const result = await tool(1024).execute({ path: "small.txt" });
    const data = result.data as { truncated: boolean };
    expect(data.truncated).toBe(false);
  });
});

describe("read_file — failures (fail closed)", () => {
  it("rejects a missing file", async () => {
    const result = await tool().execute({ path: "nope.txt" });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe(ReadFileErrorCode.NOT_FOUND);
  });

  it("rejects a directory", async () => {
    mkdirSync(join(root, "adir"));
    const result = await tool().execute({ path: "adir" });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe(ReadFileErrorCode.NOT_A_FILE);
  });

  it("rejects a missing path argument", async () => {
    const result = await tool().execute({} as Record<string, unknown>);
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe(ReadFileErrorCode.INVALID_PATH);
  });

  it("rejects a non-string path argument", async () => {
    const result = await tool().execute({ path: 42 } as unknown as Record<string, unknown>);
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe(ReadFileErrorCode.INVALID_PATH);
  });

  it("rejects an empty path argument", async () => {
    const result = await tool().execute({ path: "   " });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe(ReadFileErrorCode.INVALID_PATH);
  });
});

describe("read_file — path confinement", () => {
  it("rejects a traversal attack (../ escape)", async () => {
    writeFileSync(join(outside, "secret.txt"), "top secret");
    const result = await tool().execute({ path: "../" + join(outside, "secret.txt").split("/").pop()! });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe(ReadFileErrorCode.OUTSIDE_WORKSPACE);
  });

  it("rejects a deep traversal attack", async () => {
    const result = await tool().execute({ path: "../../../../../../etc/passwd" });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe(ReadFileErrorCode.OUTSIDE_WORKSPACE);
  });

  it("rejects an absolute path outside the workspace", async () => {
    writeFileSync(join(outside, "abs.txt"), "nope");
    const result = await tool().execute({ path: join(outside, "abs.txt") });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe(ReadFileErrorCode.OUTSIDE_WORKSPACE);
  });

  it("rejects a symlink that escapes the workspace", async () => {
    writeFileSync(join(outside, "target.txt"), "leaked");
    symlinkSync(join(outside, "target.txt"), join(root, "link.txt"));
    const result = await tool().execute({ path: "link.txt" });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe(ReadFileErrorCode.OUTSIDE_WORKSPACE);
  });

  it("allows a symlink that stays inside the workspace", async () => {
    writeFileSync(join(root, "real.txt"), "inside");
    symlinkSync(join(root, "real.txt"), join(root, "alias.txt"));
    const result = await tool().execute({ path: "alias.txt" });
    expect(result.ok).toBe(true);
    const data = result.data as { content: string };
    expect(data.content).toBe("inside");
  });
});

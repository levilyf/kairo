import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createHarness,
  createRuntime,
  defineHarness,
  ToolRouter,
} from "@kairo/core";
import {
  createWorkspaceToolsModule,
  READ_FILE_TOOL_ID,
  WORKSPACE_TOOLS_MODULE_ID,
} from "../src/index.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "kairo-ws-mod-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

async function readyRuntime(maxBytes?: number) {
  const source = createWorkspaceToolsModule(
    maxBytes !== undefined ? { root, maxBytes } : { root },
  );
  const harness = await createHarness(
    defineHarness({
      name: "WorkspaceToolsRT",
      modules: [source],
    }),
  );
  return { harness, runtime: await createRuntime(harness) };
}

describe("createWorkspaceToolsModule — module + tool registration", () => {
  it("produces a ModuleSource with the documented manifest", () => {
    const source = createWorkspaceToolsModule({ root });
    expect(source.manifest.id).toBe(WORKSPACE_TOOLS_MODULE_ID);
    expect(source.manifest.capabilities).toContain("tool");
    expect(source.manifest.capabilities).toContain("context.builder");
  });

  it("registers the read_file tool into the harness tool registry", async () => {
    const { harness } = await readyRuntime();
    expect(harness.tools.has(READ_FILE_TOOL_ID)).toBe(true);
    expect(harness.tools.get(READ_FILE_TOOL_ID)?.name).toBe("read_file");
  });

  it("exposes the tool through runtime.tools (ToolRouter)", async () => {
    const { runtime } = await readyRuntime();
    expect(runtime.tools).toBeInstanceOf(ToolRouter);
  });
});

describe("createWorkspaceToolsModule — ToolRouter integration", () => {
  it("invokes read_file through the router and returns file content", async () => {
    writeFileSync(join(root, "hello.txt"), "hi from router");
    const { runtime } = await readyRuntime();
    const invocation = await runtime.tools.invoke({
      toolId: READ_FILE_TOOL_ID,
      args: { path: "hello.txt" },
    });
    expect(invocation.result.ok).toBe(true);
    const data = invocation.result.data as { content: string; path: string };
    expect(data.content).toBe("hi from router");
    expect(data.path).toBe("hello.txt");
  });

  it("surfaces a structured failure through the router for a missing file", async () => {
    const { runtime } = await readyRuntime();
    const invocation = await runtime.tools.invoke({
      toolId: READ_FILE_TOOL_ID,
      args: { path: "missing.txt" },
    });
    expect(invocation.result.ok).toBe(false);
    expect(typeof invocation.result.errorCode).toBe("string");
  });

  it("rejects invalid arguments at the router boundary (schema validation)", async () => {
    const { runtime } = await readyRuntime();
    await expect(
      runtime.tools.invoke({
        toolId: READ_FILE_TOOL_ID,
        args: {} as Record<string, unknown>,
      }),
    ).rejects.toThrow();
  });
});

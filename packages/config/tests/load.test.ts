import { afterEach, describe, expect, it } from "vitest";
import * as path from "node:path";

import {
  loadConfig,
  ConfigError,
  ConfigErrorCode,
  type KairoConfig,
} from "../src/index.js";
import { makeKairoProject, makeTempProject, type TempProject } from "./fixtures.js";

describe("loadConfig", () => {
  const projects: TempProject[] = [];
  afterEach(async () => {
    await Promise.all(projects.splice(0).map((p) => p.cleanup()));
  });

  async function keep<T extends TempProject>(p: T): Promise<T> {
    projects.push(p);
    return p;
  }

  it("loads and validates a valid minimal config", async () => {
    const proj = await keep(
      await makeKairoProject(JSON.stringify({ version: 1 })),
    );
    const result = await loadConfig({ cwd: proj.root });

    expect(result.root).toBe(proj.root);
    expect(result.path).toBe(path.join(proj.root, ".kairo", "config.json"));
    expect((result.config as KairoConfig).version).toBe(1);
  });

  it("preserves nested config values", async () => {
    const proj = await keep(
      await makeKairoProject(
        JSON.stringify({
          version: 1,
          model: "gpt-4o",
          providers: {
            openai: { apiKey: "sk-test" },
          },
          agent: { maxIterations: 5 },
          permissions: { allow: ["read"] },
          workspace: { root: "." },
        }),
      ),
    );
    const result = await loadConfig({ cwd: proj.root });

    expect(result.config.model).toBe("gpt-4o");
    expect(result.config.providers?.openai).toEqual({ apiKey: "sk-test" });
    expect(result.config.agent?.maxIterations).toBe(5);
    expect(result.config.permissions?.allow).toEqual(["read"]);
    expect(result.config.workspace?.root).toBe(".");
  });

  it("throws CONFIG_NOT_FOUND when .kairo/ exists but config.json is missing", async () => {
    const proj = await keep(await makeTempProject({ ".kairo/.gitkeep": "" }));
    try {
      await loadConfig({ cwd: proj.root });
      expect.unreachable("should throw");
    } catch (error) {
      expect((error as ConfigError).code).toBe(
        ConfigErrorCode.CONFIG_NOT_FOUND,
      );
      expect((error as ConfigError).path).toContain("config.json");
    }
  });

  it("throws PROJECT_NOT_FOUND when no .kairo/ exists at all", async () => {
    const proj = await keep(await makeTempProject({ "src/file.txt": "x" }));
    try {
      await loadConfig({ cwd: proj.root });
      expect.unreachable("should throw");
    } catch (error) {
      expect((error as ConfigError).code).toBe(
        ConfigErrorCode.PROJECT_NOT_FOUND,
      );
    }
  });

  it("throws CONFIG_PARSE_FAILED on invalid JSON", async () => {
    const proj = await keep(
      await makeKairoProject("{ not valid json "),
    );
    try {
      await loadConfig({ cwd: proj.root });
      expect.unreachable("should throw");
    } catch (error) {
      expect((error as ConfigError).code).toBe(
        ConfigErrorCode.CONFIG_PARSE_FAILED,
      );
    }
  });

  it("throws INVALID_SCHEMA on bad schema after successful parse", async () => {
    const proj = await keep(
      await makeKairoProject(JSON.stringify({ version: 2 })),
    );
    try {
      await loadConfig({ cwd: proj.root });
      expect.unreachable("should throw");
    } catch (error) {
      expect((error as ConfigError).code).toBe(
        ConfigErrorCode.INVALID_SCHEMA,
      );
    }
  });

  it("returns an immutable (frozen) config object", async () => {
    const proj = await keep(await makeKairoProject(JSON.stringify({ version: 1 })));
    const result = await loadConfig({ cwd: proj.root });
    expect(Object.isFrozen(result.config)).toBe(true);
  });

  it("uses process.cwd() when no cwd option is provided (integration)", async () => {
    // Drive this test from an explicit cwd by temporarily overriding process.cwd.
    const proj = await keep(await makeKairoProject(JSON.stringify({ version: 1 })));
    const originalCwd = process.cwd;
    process.cwd = () => proj.root;
    try {
      const result = await loadConfig();
      expect(result.root).toBe(proj.root);
    } finally {
      process.cwd = originalCwd;
    }
  });
});

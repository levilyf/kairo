import { afterEach, describe, expect, it } from "vitest";
import * as path from "node:path";

import { findProjectRoot, ConfigError, ConfigErrorCode } from "../src/index.js";
import { makeTempProject, type TempProject } from "./fixtures.js";

describe("findProjectRoot", () => {
  const projects: TempProject[] = [];
  afterEach(async () => {
    await Promise.all(projects.splice(0).map((p) => p.cleanup()));
  });

  it("returns the directory that contains .kairo/", async () => {
    const proj = await makeTempProject({ ".kairo/config.json": "{}" });
    projects.push(proj);
    const root = await findProjectRoot(proj.root);
    expect(root).toBe(proj.root);
  });

  it("finds root from a deep nested directory", async () => {
    const proj = await makeTempProject({
      ".kairo/config.json": "{}",
      "src/a/b/c/d/file.txt": "x",
    });
    projects.push(proj);
    const nested = path.join(proj.root, "src/a/b/c/d");
    const root = await findProjectRoot(nested);
    expect(root).toBe(proj.root);
  });

  it("ascends multiple levels until .kairo/ is found", async () => {
    const proj = await makeTempProject({
      ".kairo/config.json": "{}",
      "apps/cli/src/file.txt": "x",
    });
    projects.push(proj);
    const nested = path.join(proj.root, "apps/cli/src");
    const root = await findProjectRoot(nested);
    expect(root).toBe(proj.root);
  });

  it("throws PROJECT_NOT_FOUND when no marker is present", async () => {
    const proj = await makeTempProject({ "src/file.txt": "x" });
    projects.push(proj);
    try {
      await findProjectRoot(proj.root);
      expect.unreachable("should throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).code).toBe(
        ConfigErrorCode.PROJECT_NOT_FOUND,
      );
    }
  });

  it("throws PROJECT_NOT_FOUND when start path is not a directory", async () => {
    const proj = await makeTempProject({ "file.txt": "x" });
    projects.push(proj);
    try {
      await findProjectRoot(path.join(proj.root, "file.txt"));
      expect.unreachable("should throw");
    } catch (error) {
      expect((error as ConfigError).code).toBe(
        ConfigErrorCode.PROJECT_NOT_FOUND,
      );
    }
  });

  it("throws PROJECT_NOT_FOUND when start does not exist", async () => {
    try {
      await findProjectRoot("/nonexistent/path/that/does/not/exist");
      expect.unreachable("should throw");
    } catch (error) {
      expect((error as ConfigError).code).toBe(
        ConfigErrorCode.PROJECT_NOT_FOUND,
      );
    }
  });
});

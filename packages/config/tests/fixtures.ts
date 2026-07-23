import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import * as path from "node:path";
import { tmpdir } from "node:os";

export interface TempProject {
  readonly root: string;
  cleanup(): Promise<void>;
}

/**
 * Create a temporary directory tree. `files` maps a relative path under
 * the project root (relative to root, not necessarily `.kairo/`) to the
 * file content. The `.kairo/` directory is created automatically when
 * any file path begins with `.kairo/`.
 */
export async function makeTempProject(
  files: Record<string, string> = {},
): Promise<TempProject> {
  const root = await mkdtemp(path.join(tmpdir(), "kairo-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    const dir = path.dirname(abs);
    await mkdir(dir, { recursive: true });
    await writeFile(abs, content, "utf8");
  }
  return {
    root,
    async cleanup() {
      await rm(root, { recursive: true, force: true });
    },
  };
}

export async function makeKairoProject(
  configJson: string,
): Promise<TempProject> {
  return makeTempProject({ ".kairo/config.json": configJson });
}

/** Create a temp directory WITHOUT any .kairo marker, but with files. */
export async function makeTempDir(
  files: Record<string, string> = {},
): Promise<TempProject> {
  return makeTempProject(files);
}

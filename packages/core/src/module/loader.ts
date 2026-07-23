/**
 * Module loader — transitions a ModuleSource to an executable Module instance.
 *
 * Loading answers: "Is the module code present and usable?"
 * It does not initialize or start the module.
 */

import { ModuleError, ModuleErrorCode } from "./errors.js";
import type { Module, ModuleSource } from "./types.js";

export class ModuleLoader {
  async load(source: ModuleSource): Promise<Module> {
    try {
      const instance = await source.load();
      if (!instance || typeof instance !== "object") {
        throw new ModuleError({
          code: ModuleErrorCode.LOAD_FAILED,
          message: "Module source returned an invalid module instance",
          phase: "load",
          moduleId: source.manifest.id,
        });
      }
      if (instance.manifest.id !== source.manifest.id) {
        throw new ModuleError({
          code: ModuleErrorCode.LOAD_FAILED,
          message: `Loaded module id "${instance.manifest.id}" does not match source "${source.manifest.id}"`,
          phase: "load",
          moduleId: source.manifest.id,
        });
      }
      return instance;
    } catch (error) {
      if (error instanceof ModuleError) {
        throw error;
      }
      throw new ModuleError({
        code: ModuleErrorCode.LOAD_FAILED,
        message: error instanceof Error ? error.message : "Module load failed",
        phase: "load",
        moduleId: source.manifest.id,
        cause: error,
      });
    }
  }
}

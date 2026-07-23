import { describe, expect, it } from "vitest";
import { ModuleError, ModuleErrorCode } from "../src/index.js";

describe("ModuleError", () => {
  it("attributes errors to module id and phase", () => {
    const error = new ModuleError({
      code: ModuleErrorCode.LOAD_FAILED,
      message: "cannot load",
      moduleId: "acme/logger",
      phase: "load",
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ModuleError");
    expect(error.code).toBe(ModuleErrorCode.LOAD_FAILED);
    expect(error.moduleId).toBe("acme/logger");
    expect(error.phase).toBe("load");
    expect(error.message).toContain("cannot load");
  });

  it("preserves cause", () => {
    const cause = new Error("disk missing");
    const error = new ModuleError({
      code: ModuleErrorCode.DISCOVERY_FAILED,
      message: "not found",
      phase: "discovery",
      cause,
    });

    expect(error.cause).toBe(cause);
  });
});

import { describe, expect, it } from "vitest";
import {
  CancellationRoot,
  RuntimeError,
  RuntimeErrorCode,
} from "../../src/index.js";

describe("CancellationRoot", () => {
  it("starts not aborted", () => {
    const root = new CancellationRoot();
    expect(root.aborted).toBe(false);
    expect(root.signal.aborted).toBe(false);
  });

  it("aborts once and is idempotent", () => {
    const root = new CancellationRoot();
    root.abort("shutdown");
    expect(root.aborted).toBe(true);
    expect(root.signal.aborted).toBe(true);
    expect(root.reason).toBe("shutdown");

    // Second abort does not throw; reason remains first.
    root.abort("again");
    expect(root.reason).toBe("shutdown");
  });

  it("creates child scopes linked to the root", () => {
    const root = new CancellationRoot();
    const child = root.child();
    expect(child.signal.aborted).toBe(false);

    root.abort("parent");
    expect(child.signal.aborted).toBe(true);
  });

  it("throws when creating a child after abort", () => {
    const root = new CancellationRoot();
    root.abort("done");
    expect(() => root.child()).toThrow(RuntimeError);
    try {
      root.child();
    } catch (error) {
      expect(error).toMatchObject({
        code: RuntimeErrorCode.CANCELLED,
      });
    }
  });
});

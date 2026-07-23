import { describe, expect, it } from "vitest";
import {
  compareSemver,
  isVersionInRange,
  parseSemver,
} from "../src/index.js";

describe("semver utilities", () => {
  it("parses major.minor.patch", () => {
    expect(parseSemver("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it("rejects invalid versions", () => {
    expect(() => parseSemver("1.2")).toThrow();
    expect(() => parseSemver("nope")).toThrow();
  });

  it("compares versions", () => {
    expect(compareSemver("1.0.0", "1.0.1")).toBeLessThan(0);
    expect(compareSemver("2.0.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareSemver("1.2.3", "1.2.3")).toBe(0);
  });

  it("checks inclusive version ranges", () => {
    expect(isVersionInRange("1.2.0", { min: "1.0.0" })).toBe(true);
    expect(isVersionInRange("0.9.0", { min: "1.0.0" })).toBe(false);
    expect(isVersionInRange("1.5.0", { min: "1.0.0", max: "2.0.0" })).toBe(
      true,
    );
    expect(isVersionInRange("2.0.0", { min: "1.0.0", max: "2.0.0" })).toBe(
      true,
    );
    expect(isVersionInRange("2.0.1", { min: "1.0.0", max: "2.0.0" })).toBe(
      false,
    );
  });
});

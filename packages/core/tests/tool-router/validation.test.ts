import { describe, expect, it } from "vitest";
import {
  ToolRouterError,
  ToolRouterErrorCode,
  validateToolArguments,
} from "../../src/index.js";
import type { JsonSchema } from "../../src/index.js";

describe("ToolArgumentValidation", () => {
  it("accepts empty object when schema has no required fields", () => {
    const schema: JsonSchema = { type: "object", properties: {} };
    expect(() => validateToolArguments({}, schema)).not.toThrow();
  });

  it("requires declared required properties", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: {
        q: { type: "string" },
        limit: { type: "integer" },
      },
      required: ["q"],
    };

    expect(() => validateToolArguments({}, schema)).toThrow(ToolRouterError);
    try {
      validateToolArguments({}, schema);
    } catch (error) {
      expect(error).toMatchObject({
        code: ToolRouterErrorCode.INVALID_ARGUMENTS,
        field: "q",
      });
    }
  });

  it("validates primitive property types", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
        count: { type: "number" },
        flag: { type: "boolean" },
        tags: { type: "array", items: { type: "string" } },
      },
    };

    expect(() =>
      validateToolArguments(
        { name: "a", count: 1.5, flag: true, tags: ["x"] },
        schema,
      ),
    ).not.toThrow();

    expect(() =>
      validateToolArguments({ name: 1 }, schema),
    ).toThrowError(/name/);

    expect(() =>
      validateToolArguments({ count: "1" }, schema),
    ).toThrowError(/count/);

    expect(() =>
      validateToolArguments({ flag: "yes" }, schema),
    ).toThrowError(/flag/);

    expect(() =>
      validateToolArguments({ tags: "x" }, schema),
    ).toThrowError(/tags/);
  });

  it("validates integer vs number", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: { n: { type: "integer" } },
    };
    expect(() => validateToolArguments({ n: 2 }, schema)).not.toThrow();
    expect(() => validateToolArguments({ n: 2.5 }, schema)).toThrow(
      ToolRouterError,
    );
  });

  it("validates enum values", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["a", "b"] },
      },
    };
    expect(() => validateToolArguments({ mode: "a" }, schema)).not.toThrow();
    expect(() => validateToolArguments({ mode: "c" }, schema)).toThrow(
      ToolRouterError,
    );
  });

  it("rejects non-object root args when schema type is object", () => {
    const schema: JsonSchema = { type: "object" };
    expect(() =>
      validateToolArguments("nope" as unknown as Record<string, unknown>, schema),
    ).toThrow(ToolRouterError);
  });

  it("allows additional properties by default", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: { q: { type: "string" } },
    };
    expect(() =>
      validateToolArguments({ q: "x", extra: true }, schema),
    ).not.toThrow();
  });

  it("rejects additional properties when additionalProperties is false", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: { q: { type: "string" } },
      additionalProperties: false,
    };
    expect(() =>
      validateToolArguments({ q: "x", extra: true }, schema),
    ).toThrow(ToolRouterError);
  });
});

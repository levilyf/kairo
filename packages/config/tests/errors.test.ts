import { describe, expect, it } from "vitest";

import { ConfigError, ConfigErrorCode } from "../src/index.js";

describe("ConfigError", () => {
  it("exposes the code, message, and optional fields", () => {
    const err = new ConfigError({
      code: ConfigErrorCode.INVALID_SCHEMA,
      message: "boom",
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ConfigError);
    expect(err.code).toBe(ConfigErrorCode.INVALID_SCHEMA);
    expect(err.message).toBe("boom");
    expect(err.name).toBe("ConfigError");
  });

  it("preserves optional fields", () => {
    const cause = new Error("root cause");
    const err = new ConfigError({
      code: ConfigErrorCode.ENVIRONMENT_VARIABLE_MISSING,
      message: "need FOO",
      variable: "FOO",
      path: "/etc/config.json",
      field: "model",
      cause,
    });
    expect(err.variable).toBe("FOO");
    expect(err.path).toBe("/etc/config.json");
    expect(err.field).toBe("model");
    expect(err.cause).toBe(cause);
  });

  it("does not assign explicit undefined when optional fields are unset", () => {
    const err = new ConfigError({
      code: ConfigErrorCode.INVALID_CONFIG,
      message: "oops",
    });
    expect(err.variable).toBeUndefined();
    expect(err.path).toBeUndefined();
    expect(err.field).toBeUndefined();
    expect(err.cause).toBeUndefined();
  });
});

describe("ConfigErrorCode", () => {
  it("exposes all documented codes", () => {
    expect(ConfigErrorCode.PROJECT_NOT_FOUND).toBe("PROJECT_NOT_FOUND");
    expect(ConfigErrorCode.CONFIG_NOT_FOUND).toBe("CONFIG_NOT_FOUND");
    expect(ConfigErrorCode.INVALID_CONFIG).toBe("INVALID_CONFIG");
    expect(ConfigErrorCode.INVALID_SCHEMA).toBe("INVALID_SCHEMA");
    expect(ConfigErrorCode.ENVIRONMENT_VARIABLE_MISSING).toBe(
      "ENVIRONMENT_VARIABLE_MISSING",
    );
    expect(ConfigErrorCode.CONFIG_PARSE_FAILED).toBe("CONFIG_PARSE_FAILED");
  });
});

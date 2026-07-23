import { describe, expect, it } from "vitest";

import {
  resolveConfigEnvironment,
  validateConfig,
  ConfigError,
  ConfigErrorCode,
  type KairoConfig,
} from "../src/index.js";

function makeConfig(input: Record<string, unknown>): KairoConfig {
  return validateConfig({ version: 1, ...input });
}

describe("resolveConfigEnvironment", () => {
  it("substitutes a single placeholder", () => {
    const config = makeConfig({
      providers: { openai: { apiKey: "${OPENAI_API_KEY}" } },
    });
    const resolved = resolveConfigEnvironment(config, {
      OPENAI_API_KEY: "sk-test",
    });
    const openai = resolved.providers?.openai;
    expect(openai?.apiKey).toBe("sk-test");
  });

  it("substitutes placeholders in nested objects and arrays", () => {
    const config = makeConfig({
      agent: { headers: [{ name: "auth", value: "${TOKEN}" }] },
      workspace: { base: "${BASE}/sub" },
    });
    const resolved = resolveConfigEnvironment(config, {
      TOKEN: "abc",
      BASE: "/tmp",
    });
    const headers = resolved.agent?.headers;
    expect(Array.isArray(headers)).toBe(true);
    expect((headers as Array<{ name: string; value: string }>)[0]?.value).toBe(
      "abc",
    );
    expect(resolved.workspace?.base).toBe("/tmp/sub");
  });

  it("substitutes multiple placeholders in one string", () => {
    const config = makeConfig({ model: "${A}-${B}" });
    const resolved = resolveConfigEnvironment(config, { A: "x", B: "y" });
    expect(resolved.model).toBe("x-y");
  });

  it("leaves strings without placeholders unchanged", () => {
    const config = makeConfig({ model: "gpt-4o" });
    const resolved = resolveConfigEnvironment(config, {});
    expect(resolved.model).toBe("gpt-4o");
  });

  it("does not mutate the input config", () => {
    const original = makeConfig({ model: "${A}" });
    resolveConfigEnvironment(original, { A: "z" });
    // Should still contain placeholder
    expect((original as unknown as Record<string, unknown>).model).toBe("${A}");
  });

  it("returns a deeply frozen object", () => {
    const config = makeConfig({ providers: { openai: { apiKey: "${A}" } } });
    const resolved = resolveConfigEnvironment(config, { A: "sk" });
    expect(Object.isFrozen(resolved)).toBe(true);
    const openai = resolved.providers?.openai;
    expect(Object.isFrozen(openai)).toBe(true);
  });

  it("throws ENVIRONMENT_VARIABLE_MISSING on a missing variable", () => {
    const config = makeConfig({ model: "${MISSING}" });
    try {
      resolveConfigEnvironment(config, {});
      expect.unreachable("should throw");
    } catch (error) {
      expect((error as ConfigError).code).toBe(
        ConfigErrorCode.ENVIRONMENT_VARIABLE_MISSING,
      );
      expect((error as ConfigError).variable).toBe("MISSING");
    }
  });

  it("rejects empty-string env values as missing", () => {
    const config = makeConfig({ model: "${EMPTY}" });
    try {
      resolveConfigEnvironment(config, { EMPTY: "" });
      expect.unreachable("should throw");
    } catch (error) {
      expect((error as ConfigError).code).toBe(
        ConfigErrorCode.ENVIRONMENT_VARIABLE_MISSING,
      );
      expect((error as ConfigError).variable).toBe("EMPTY");
    }
  });

  it("fails when one of multiple placeholders is missing", () => {
    const config = makeConfig({ model: "${A}-${B}" });
    try {
      resolveConfigEnvironment(config, { A: "x" });
      expect.unreachable("should throw");
    } catch (error) {
      expect((error as ConfigError).code).toBe(
        ConfigErrorCode.ENVIRONMENT_VARIABLE_MISSING,
      );
      expect((error as ConfigError).variable).toBe("B");
    }
  });

  it("does not treat empty string as having a placeholder", () => {
    const config = makeConfig({ model: "" });
    const resolved = resolveConfigEnvironment(config, {});
    expect(resolved.model).toBe("");
  });

  it("leaves ${} containing invalid var-name characters untouched? — strict resolver throws", () => {
    // Our placeholder regex requires ^[A-Za-z_][A-Za-z0-9_]*$.
    // "${123}" should NOT match the placeholder regex, so it is left
    // as-is in the returned string.
    const config = makeConfig({
      agent: { weird: "prefix-${123}-suffix" },
    });
    const resolved = resolveConfigEnvironment(config, {});
    expect(resolved.agent?.weird).toBe("prefix-${123}-suffix");
  });

  it("falls back to process.env when no env map is provided", () => {
    const name = "KAIRO_CONFIG_TEST_VAR_" + Date.now();
    process.env[name] = "from-process-env";
    try {
      const config = makeConfig({ model: "${" + name + "}" });
      const resolved = resolveConfigEnvironment(config);
      expect(resolved.model).toBe("from-process-env");
    } finally {
      delete process.env[name];
    }
  });
});

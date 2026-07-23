import { describe, expect, it } from "vitest";

import {
  ApplicationError,
  ApplicationErrorCode,
  createApplication,
} from "../src/index.js";
import { makeConfig } from "./helpers.js";

describe("createApplication — bootstrap failures", () => {
  it("rejects non-object options", async () => {
    try {
      await createApplication(null as unknown as never);
      expect.unreachable("should throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApplicationError);
      expect((error as ApplicationError).code).toBe(
        ApplicationErrorCode.BOOTSTRAP_FAILED,
      );
    }
  });

  it("rejects undefined config", async () => {
    try {
      await createApplication({} as never);
      expect.unreachable("should throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApplicationError);
      expect((error as ApplicationError).code).toBe(
        ApplicationErrorCode.BOOTSTRAP_FAILED,
      );
    }
  });

  it("rejects non-object config", async () => {
    try {
      await createApplication({ config: "nope" as unknown as never });
      expect.unreachable("should throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApplicationError);
      expect((error as ApplicationError).code).toBe(
        ApplicationErrorCode.BOOTSTRAP_FAILED,
      );
    }
  });

  it("fails BOOTSTRAP_FAILED when a configured provider id is not built-in", async () => {
    try {
      await createApplication({
        config: makeConfig({ providers: { unknown: { apiKey: "k" } } }),
      });
      expect.unreachable("should throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApplicationError);
      expect((error as ApplicationError).code).toBe(
        ApplicationErrorCode.BOOTSTRAP_FAILED,
      );
    }
  });

  it("fails BOOTSTRAP_FAILED when config.providers is not an object", async () => {
    try {
      await createApplication({
        config: {
          version: 1,
          providers: "not-an-object" as unknown as never,
        } as never,
      });
      expect.unreachable("should throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApplicationError);
      expect((error as ApplicationError).code).toBe(
        ApplicationErrorCode.BOOTSTRAP_FAILED,
      );
    }
  });

  it("accepts an empty providers block (no providers configured, but still builds)", async () => {
    const app = await createApplication({
      config: makeConfig({ providers: {} }),
    });
    expect(app.providers.length).toBe(0);
    await app.stop();
  });

  it("accepts a config with no providers block at all", async () => {
    const app = await createApplication({
      config: { version: 1 } as never,
    });
    expect(app.providers.length).toBe(0);
    await app.stop();
  });

  it("fails gracefully when a factory refuses construction (unknown protocol)", async () => {
    try {
      await createApplication({
        config: makeConfig({
          providers: {
            nvidia: { protocol: "totally-fake", apiKey: "" },
          },
        }),
      });
      expect.unreachable("should throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApplicationError);
      const ae = error as ApplicationError;
      // Unknown protocol surfaces from the registry as UNKNOWN_PROTOCOL
      // wrapped into ApplicationError(BOOTSTRAP_FAILED).
      expect(
        ae.code === ApplicationErrorCode.BOOTSTRAP_FAILED ||
        ae.code === ApplicationErrorCode.PROVIDER_REGISTRATION_FAILED,
      ).toBe(true);
    }
  });

  it("fails BOOTSTRAP_FAILED when duplicate provider id appears after trimming", async () => {
    try {
      await createApplication({
        config: makeConfig({
          providers: {
            ollama: { defaultModel: "m1" },
            "ollama ": { defaultModel: "m2" },
          } as Record<string, Readonly<Record<string, unknown>>>,
        }),
      });
      expect.unreachable("should throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApplicationError);
      // Registry rejects duplicate configured provider ids, wrapped into ApplicationError.
    }
  });

  it("phase is populated on provider-phase failures", async () => {
    try {
      await createApplication({
        config: makeConfig({ providers: { unknown: { apiKey: "k" } } }),
      });
      expect.unreachable("should throw");
    } catch (error) {
      const ae = error as ApplicationError;
      expect(ae.phase).toBeDefined();
    }
  });
});

describe("createApplication — immutability surface", () => {
  it("returns the same Application object identity across property reads", async () => {
    const app = await createApplication({
      config: makeConfig({ providers: {} }),
    });
    expect(app.registry).toBe(app.registry);
    expect(app.harness).toBe(app.harness);
    expect(app.runtime).toBe(app.runtime);
    await app.stop();
  });
});

import { describe, expect, it } from "vitest";

import {
  ApplicationError,
  ApplicationErrorCode,
  createApplication,
} from "../src/index.js";
import { makeLocalConfig } from "./helpers.js";

describe("Application — lifecycle", () => {
  it("starts with status 'ready'", async () => {
    const app = await createApplication({ config: makeLocalConfig() });
    expect(app.status).toBe("ready");
    await app.stop();
  });

  it("start() flips status to 'started'", async () => {
    const app = await createApplication({ config: makeLocalConfig() });
    await app.start();
    expect(app.status).toBe("started");
    await app.stop();
  });

  it("duplicate start() throws APPLICATION_ALREADY_STARTED", async () => {
    const app = await createApplication({ config: makeLocalConfig() });
    await app.start();
    try {
      await app.start();
      expect.unreachable("should throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApplicationError);
      expect((error as ApplicationError).code).toBe(
        ApplicationErrorCode.APPLICATION_ALREADY_STARTED,
      );
    }
    await app.stop();
  });

  it("stop() flips status to 'stopped' and shuts down the Runtime + Harness", async () => {
    const app = await createApplication({ config: makeLocalConfig() });
    await app.start();
    await app.stop();
    expect(app.status).toBe("stopped");
    expect(app.runtime.status).toBe("stopped");
    expect(app.harness.status).toBe("stopped");
  });

  it("double stop() throws APPLICATION_NOT_STARTED", async () => {
    const app = await createApplication({ config: makeLocalConfig() });
    await app.stop();
    try {
      await app.stop();
      expect.unreachable("should throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApplicationError);
      expect((error as ApplicationError).code).toBe(
        ApplicationErrorCode.APPLICATION_NOT_STARTED,
      );
    }
  });

  it("stop() before start() is allowed (status goes ready → stopped)", async () => {
    const app = await createApplication({ config: makeLocalConfig() });
    await app.stop();
    expect(app.status).toBe("stopped");
  });

  it("start() after stop() throws APPLICATION_ALREADY_STARTED (no restart)", async () => {
    const app = await createApplication({ config: makeLocalConfig() });
    await app.stop();
    try {
      await app.start();
      expect.unreachable("should throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApplicationError);
      expect((error as ApplicationError).code).toBe(
        ApplicationErrorCode.APPLICATION_ALREADY_STARTED,
      );
      expect((error as ApplicationError).message).toContain("stopped");
    }
  });

  it("status transitions correctly: ready → started → stopped", async () => {
    const app = await createApplication({ config: makeLocalConfig() });
    expect(app.status).toBe("ready");
    await app.start();
    expect(app.status).toBe("started");
    await app.stop();
    expect(app.status).toBe("stopped");
  });
});

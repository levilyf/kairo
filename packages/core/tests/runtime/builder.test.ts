import { describe, expect, it } from "vitest";
import {
  createHarness,
  createRuntime,
  defineHarness,
  RuntimeBuilder,
  RuntimeErrorCode,
} from "../../src/index.js";
import {
  createManifest,
  createSource,
} from "../helpers/fixtures.js";

describe("RuntimeBuilder", () => {
  it("builds a runtime through the builder class", async () => {
    const harness = await createHarness(
      defineHarness({
        name: "Builder",
        modules: [createSource(createManifest({ id: "acme/a" }))],
      }),
    );

    const runtime = await new RuntimeBuilder().build(harness);
    expect(runtime.status).toBe("ready");
    expect(runtime.harness).toBe(harness);
  });

  it("createRuntime is the public entry over RuntimeBuilder", async () => {
    const harness = await createHarness(
      defineHarness({
        name: "Entry",
        modules: [],
      }),
    );

    const runtime = await createRuntime(harness, { id: "entry-1" });
    expect(runtime.metadata.id).toBe("entry-1");
    expect(runtime.metadata.harnessName).toBe("Entry");
  });

  it("fails closed when harness is stopping", async () => {
    const harness = await createHarness(
      defineHarness({
        name: "Stopping",
        modules: [],
      }),
    );

    // Force non-ready status via stop.
    await harness.stop();
    await expect(new RuntimeBuilder().build(harness)).rejects.toMatchObject({
      code: RuntimeErrorCode.INVALID_HARNESS,
    });
  });
});

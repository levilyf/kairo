import { describe, expect, it } from "vitest";
import {
  AssemblyPipeline,
  ContextAssemblerError,
  ContextAssemblerErrorCode,
  type ContextBuilder,
  type ContextBuilderContext,
} from "../../src/index.js";

const input: ContextBuilderContext = {
  turnId: "t1",
  sessionId: "s1",
  runtimeId: "r1",
};

function builder(
  id: string,
  build: ContextBuilder["build"],
  priority = 100,
): ContextBuilder {
  return { id, name: id, priority, build };
}

describe("AssemblyPipeline", () => {
  it("collects fragments from builders without merging into Context", async () => {
    const pipeline = new AssemblyPipeline();
    const builders = [
      builder("a", async () => ({
        fragments: [{ instructions: ["a"] }],
      })),
      builder("b", async () => ({
        fragments: [{ instructions: ["b1"] }, { instructions: ["b2"] }],
      })),
    ];

    const collected = await pipeline.run(builders, input);

    expect(collected.builders.map((b) => b.id)).toEqual(["a", "b"]);
    expect(collected.fragments.map((f) => f.instructions?.[0])).toEqual([
      "a",
      "b1",
      "b2",
    ]);
    expect(collected.builderResults.map((r) => r.builderId)).toEqual([
      "a",
      "b",
    ]);
  });

  it("attributes builder failures", async () => {
    const pipeline = new AssemblyPipeline();
    const builders = [
      builder("ok", async () => ({ fragments: [] })),
      builder("bad", async () => {
        throw new Error("nope");
      }),
    ];

    await expect(pipeline.run(builders, input)).rejects.toMatchObject({
      code: ContextAssemblerErrorCode.BUILDER_FAILED,
      builderId: "bad",
    });
    await expect(pipeline.run(builders, input)).rejects.toBeInstanceOf(
      ContextAssemblerError,
    );
  });
});

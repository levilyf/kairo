import { describe, expect, it } from "vitest";
import {
  ContextBuilderError,
  ContextBuilderErrorCode,
  assertContextBuilderResult,
  createContextFragment,
  type ContextBuilderResult,
} from "../../src/index.js";

describe("ContextBuilderResult", () => {
  it("accepts empty fragment lists", () => {
    const result: ContextBuilderResult = { fragments: [] };
    expect(() => assertContextBuilderResult(result)).not.toThrow();
  });

  it("accepts provider-neutral fragments", () => {
    const result: ContextBuilderResult = {
      fragments: [
        createContextFragment({
          instructions: ["be careful"],
          messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
          toolDefinitions: [{ name: "search" }],
          attachments: [{ id: "a1" }],
          variables: { locale: "en" },
          metadata: { source: "test" },
        }),
      ],
      metadata: { builder: "core/test" },
    };

    expect(() => assertContextBuilderResult(result)).not.toThrow();
    expect(result.fragments[0]!.instructions).toEqual(["be careful"]);
    expect(Object.isFrozen(result.fragments[0])).toBe(true);
  });

  it("rejects non-array fragments", () => {
    expect(() =>
      assertContextBuilderResult({ fragments: null } as unknown as ContextBuilderResult),
    ).toThrow(ContextBuilderError);

    try {
      assertContextBuilderResult({ fragments: "x" } as unknown as ContextBuilderResult);
    } catch (error) {
      expect(error).toMatchObject({
        code: ContextBuilderErrorCode.INVALID_RESULT,
      });
    }
  });

  it("rejects non-object fragment entries", () => {
    expect(() =>
      assertContextBuilderResult({
        fragments: [null as unknown as object],
      } as ContextBuilderResult),
    ).toThrow(ContextBuilderError);
  });

  it("createContextFragment freezes nested collections", () => {
    const fragment = createContextFragment({
      instructions: ["a"],
      messages: [{ role: "user", content: [{ type: "text", text: "x" }] }],
      variables: { k: 1 },
    });

    expect(Object.isFrozen(fragment)).toBe(true);
    expect(Object.isFrozen(fragment.instructions)).toBe(true);
    expect(Object.isFrozen(fragment.messages)).toBe(true);
    expect(Object.isFrozen(fragment.messages![0])).toBe(true);
    expect(Object.isFrozen(fragment.variables)).toBe(true);
  });
});

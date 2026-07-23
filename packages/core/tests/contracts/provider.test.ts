import { describe, expect, it } from "vitest";
import {
  assertProvider,
  type Provider,
  type ProviderRequest,
} from "../../src/index.js";
import { ContractError, ContractErrorCode } from "../../src/index.js";

function makeProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: "test/provider",
    name: "Test Provider",
    description: "A test provider",
    capabilities: {
      streaming: false,
      tools: false,
      modalities: ["text"],
    },
    async complete() {
      return {
        id: "resp-1",
        output: [{ type: "text", text: "ok" }],
        stopReason: "end",
      };
    },
    ...overrides,
  };
}

describe("Provider contract", () => {
  it("accepts a valid provider", () => {
    const provider = makeProvider();
    expect(() => assertProvider(provider)).not.toThrow();
    expect(provider.id).toBe("test/provider");
    expect(provider.capabilities.modalities).toContain("text");
  });

  it("rejects missing id", () => {
    expect(() =>
      assertProvider(makeProvider({ id: "" })),
    ).toThrow(ContractError);

    try {
      assertProvider(makeProvider({ id: "  " }));
    } catch (error) {
      expect(error).toMatchObject({
        code: ContractErrorCode.INVALID_CONTRACT,
        contract: "provider",
        field: "id",
      });
    }
  });

  it("rejects missing complete function", () => {
    const invalid = makeProvider();
    // @ts-expect-error intentional
    delete invalid.complete;
    expect(() => assertProvider(invalid)).toThrow(ContractError);
  });

  it("describes a provider-neutral request shape", () => {
    const request: ProviderRequest = {
      model: "any-model",
      input: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      tools: [],
    };
    expect(request.model).toBe("any-model");
    expect(request.input[0]?.role).toBe("user");
  });

  it("accepts a streaming provider with stream()", () => {
    const provider = makeProvider({
      capabilities: {
        streaming: true,
        tools: false,
        modalities: ["text"],
      },
      async *stream() {
        yield { type: "text_delta", text: "hi" };
        yield {
          type: "message_end",
          response: {
            id: "resp-stream",
            output: [{ type: "text", text: "hi" }],
            stopReason: "end",
          },
        };
      },
    });
    expect(() => assertProvider(provider)).not.toThrow();
    expect(provider.capabilities.streaming).toBe(true);
    expect(typeof provider.stream).toBe("function");
  });

  it("rejects streaming capability without stream()", () => {
    const invalid = makeProvider({
      capabilities: {
        streaming: true,
        tools: false,
        modalities: ["text"],
      },
    });
    expect(() => assertProvider(invalid)).toThrow(ContractError);
    try {
      assertProvider(invalid);
    } catch (error) {
      expect(error).toMatchObject({
        code: ContractErrorCode.INVALID_CONTRACT,
        contract: "provider",
        field: "stream",
      });
    }
  });

  it("rejects stream() without streaming capability", () => {
    const invalid = makeProvider({
      capabilities: {
        streaming: false,
        tools: false,
        modalities: ["text"],
      },
      async *stream() {
        yield { type: "text_delta", text: "x" };
      },
    });
    expect(() => assertProvider(invalid)).toThrow(ContractError);
    try {
      assertProvider(invalid);
    } catch (error) {
      expect(error).toMatchObject({
        code: ContractErrorCode.INVALID_CONTRACT,
        contract: "provider",
        field: "capabilities.streaming",
      });
    }
  });
});

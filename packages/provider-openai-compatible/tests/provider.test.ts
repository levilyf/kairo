import { describe, expect, it } from "vitest";

import { createOpenAICompatibleProvider } from "../src/index.js";

function mockClient() {
  return {
    chat: {
      completions: {
        async create(body: Record<string, unknown>) {
          return {
            id: "chatcmpl-test",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: `model:${body["model"]}`,
                },
                finish_reason: "stop",
              },
            ],
            model: body["model"],
          };
        },
      },
    },
  };
}

describe("createOpenAICompatibleProvider", () => {
  it("creates a provider instance from protocol factory input", async () => {
    const provider = createOpenAICompatibleProvider({
      id: "work",
      protocol: "openai-compatible",
      config: {
        name: "Work Models",
        defaultModel: "gpt-4o-mini",
        client: mockClient(),
      },
    });

    expect(provider.id).toBe("work");
    expect(provider.name).toBe("Work Models");
    expect(provider.capabilities.streaming).toBe(true);
    expect(provider.capabilities.tools).toBe(true);

    const response = await provider.complete({
      model: "gpt-4o",
      input: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
    });
    expect(response.output).toEqual([{ type: "text", text: "model:gpt-4o" }]);
  });
});
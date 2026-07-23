/** Synthetic Provider test double (avoids needing real provider packages for unit tests). */
import type { Provider } from "@kairo/core";

export function makeProvider(id: string): Provider {
  const provider: Provider = {
    id,
    name: id.toUpperCase(),
    capabilities: {
      streaming: true,
      tools: true,
      modalities: Object.freeze(["text"] as const),
    },
    async complete() {
      return {
        id: "fake",
        output: Object.freeze([{ type: "text", text: "ok" }]),
        stopReason: "end",
      };
    },
    async *stream() {
      yield { type: "message_start" as const };
      yield {
        type: "message_end" as const,
        response: {
          id: "fake-stream",
          output: Object.freeze([{ type: "text" as const, text: "ok" }]),
          stopReason: "end" as const,
        },
      };
    },
  };
  Object.freeze(provider.capabilities);
  Object.freeze(provider);
  return provider;
}

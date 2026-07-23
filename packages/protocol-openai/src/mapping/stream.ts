/**
 * Map OpenAI Chat Completions stream chunks → Core ProviderStreamEvent.
 *
 * Accumulates text and tool-call deltas; emits message_end with a full
 * ProviderResponse suitable for Agent Loop tool extraction.
 */

import type {
  ProviderContentPart,
  ProviderResponse,
  ProviderStopReason,
  ProviderStreamEvent,
} from "@kairo/core";
import {
  errorOptions,
  ProtocolOpenAIError,
  ProtocolOpenAIErrorCode,
} from "../errors.js";

export interface MapStreamOptions {
  readonly providerId?: string;
  readonly model?: string;
}

interface ToolCallAcc {
  id: string;
  name: string;
  arguments: string;
}

/**
 * Stateful mapper for one streaming completion.
 */
export class OpenAIStreamMapper {
  private readonly providerId: string | undefined;
  private readonly fallbackModel: string | undefined;
  private responseId = "";
  private model: string | undefined;
  private text = "";
  private readonly toolCalls = new Map<number, ToolCallAcc>();
  private finishReason: string | undefined;
  private usage: Readonly<Record<string, unknown>> | undefined;
  private started = false;
  private ended = false;

  constructor(options: MapStreamOptions = {}) {
    this.providerId = options.providerId;
    this.fallbackModel = options.model;
    this.model = options.model;
  }

  /**
   * Consume one vendor chunk; yield zero or more Core stream events.
   */
  push(chunk: unknown): ProviderStreamEvent[] {
    if (this.ended) {
      return [];
    }

    if (chunk === null || typeof chunk !== "object" || Array.isArray(chunk)) {
      throw new ProtocolOpenAIError(
        errorOptions({
          code: ProtocolOpenAIErrorCode.UNEXPECTED_RESPONSE,
          message: "OpenAI stream chunk must be an object",
          providerId: this.providerId,
          model: this.model ?? this.fallbackModel,
        }),
      );
    }

    const raw = chunk as Record<string, unknown>;
    const events: ProviderStreamEvent[] = [];

    if (!this.started) {
      this.started = true;
      events.push({ type: "message_start" });
    }

    if (typeof raw.id === "string" && raw.id.trim().length > 0) {
      this.responseId = raw.id;
    }
    if (typeof raw.model === "string" && raw.model.trim().length > 0) {
      this.model = raw.model;
    }

    if (
      raw.usage !== null &&
      typeof raw.usage === "object" &&
      !Array.isArray(raw.usage)
    ) {
      this.usage = Object.freeze({
        ...(raw.usage as Record<string, unknown>),
      });
      events.push({ type: "usage", usage: this.usage });
    }

    const choices = Array.isArray(raw.choices) ? raw.choices : [];
    const first = choices[0];
    if (first !== null && typeof first === "object" && !Array.isArray(first)) {
      const choice = first as Record<string, unknown>;
      if (
        typeof choice.finish_reason === "string" &&
        choice.finish_reason.length > 0
      ) {
        this.finishReason = choice.finish_reason;
      }

      const delta =
        choice.delta !== null &&
        typeof choice.delta === "object" &&
        !Array.isArray(choice.delta)
          ? (choice.delta as Record<string, unknown>)
          : undefined;

      if (delta !== undefined) {
        if (typeof delta.content === "string" && delta.content.length > 0) {
          this.text += delta.content;
          events.push({ type: "text_delta", text: delta.content });
        }

        if (Array.isArray(delta.tool_calls)) {
          for (const rawCall of delta.tool_calls) {
            const mapped = this.accumulateToolCallDelta(rawCall);
            if (mapped !== undefined) {
              events.push(mapped);
            }
          }
        }
      }
    }

    return events;
  }

  /**
   * Finalize the stream into a message_end event (and optional trailing events).
   */
  end(): ProviderStreamEvent[] {
    if (this.ended) {
      return [];
    }
    this.ended = true;

    const events: ProviderStreamEvent[] = [];
    if (!this.started) {
      events.push({ type: "message_start" });
    }

    const response = this.buildResponse();
    events.push({ type: "message_end", response });
    return events;
  }

  private accumulateToolCallDelta(
    rawCall: unknown,
  ): ProviderStreamEvent | undefined {
    if (rawCall === null || typeof rawCall !== "object") {
      return undefined;
    }
    const entry = rawCall as Record<string, unknown>;
    const index =
      typeof entry.index === "number" && Number.isInteger(entry.index)
        ? entry.index
        : 0;

    let acc = this.toolCalls.get(index);
    if (acc === undefined) {
      acc = { id: "", name: "", arguments: "" };
      this.toolCalls.set(index, acc);
    }

    if (typeof entry.id === "string" && entry.id.trim().length > 0) {
      acc.id = entry.id;
    }

    const fn =
      entry.function !== null &&
      typeof entry.function === "object" &&
      !Array.isArray(entry.function)
        ? (entry.function as Record<string, unknown>)
        : undefined;

    let nameDelta: string | undefined;
    let argsDelta: string | undefined;
    if (fn !== undefined) {
      if (typeof fn.name === "string" && fn.name.length > 0) {
        acc.name += fn.name;
        nameDelta = fn.name;
      }
      if (typeof fn.arguments === "string" && fn.arguments.length > 0) {
        acc.arguments += fn.arguments;
        argsDelta = fn.arguments;
      }
    }

    if (
      nameDelta === undefined &&
      argsDelta === undefined &&
      typeof entry.id !== "string"
    ) {
      return undefined;
    }

    return {
      type: "tool_call_delta",
      ...(acc.id.length > 0 ? { id: acc.id } : {}),
      ...(nameDelta !== undefined ? { name: nameDelta } : {}),
      ...(argsDelta !== undefined ? { argumentsDelta: argsDelta } : {}),
    };
  }

  private buildResponse(): ProviderResponse {
    const output: ProviderContentPart[] = [];
    if (this.text.length > 0) {
      output.push({ type: "text", text: this.text });
    }

    const sortedIndexes = [...this.toolCalls.keys()].sort((a, b) => a - b);
    for (const index of sortedIndexes) {
      const call = this.toolCalls.get(index)!;
      const id =
        call.id.trim().length > 0 ? call.id : `tool_call_${index}`;
      const name =
        call.name.trim().length > 0 ? call.name : "unknown";
      let args: unknown = call.arguments;
      if (typeof call.arguments === "string" && call.arguments.length > 0) {
        try {
          args = JSON.parse(call.arguments) as unknown;
        } catch {
          args = call.arguments;
        }
      } else if (call.arguments.length === 0) {
        args = {};
      }
      output.push({
        type: "tool_call",
        id,
        name,
        arguments: args,
      });
    }

    const id =
      this.responseId.trim().length > 0
        ? this.responseId
        : `openai-stream-${Date.now()}`;

    const stopReason = mapFinishReason(this.finishReason, output);
    const model = this.model ?? this.fallbackModel;

    const metadata: Record<string, unknown> = {
      vendor: "openai",
      ...(this.finishReason !== undefined
        ? { finish_reason: this.finishReason }
        : {}),
    };

    return {
      id,
      output: Object.freeze([...output]),
      stopReason,
      ...(model !== undefined ? { model } : {}),
      ...(this.usage !== undefined ? { usage: this.usage } : {}),
      metadata: Object.freeze(metadata),
    };
  }
}

function mapFinishReason(
  finishReason: string | undefined,
  output: readonly ProviderContentPart[],
): ProviderStopReason {
  if (finishReason === "stop") {
    return "end";
  }
  if (finishReason === "tool_calls" || finishReason === "function_call") {
    return "tool_calls";
  }
  if (finishReason === "length") {
    return "length";
  }
  if (finishReason === "content_filter") {
    return "error";
  }
  if (finishReason === "cancelled") {
    return "cancelled";
  }
  if (output.some((p) => p.type === "tool_call")) {
    return "tool_calls";
  }
  if (finishReason !== undefined && finishReason.length > 0) {
    return finishReason;
  }
  return "end";
}

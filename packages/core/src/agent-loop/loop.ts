/**
 * AgentLoop — abstract turn orchestration algorithm.
 *
 * Coordinates existing Core services only:
 * - ContextAssembler (assemble)
 * - ProviderGateway (provider.complete / provider.stream boundary)
 * - ToolRouter (tool.execute boundary)
 * - Turn lifecycle (complete)
 * - Runtime events (via gateway/router/turn — observation only)
 *
 * Owns no providers, tools, builders, or policies.
 * Does not invent vendor formats. Does not retry beyond loop iterations.
 * Streaming is optional per execute(); tool work still runs only after a
 * full ProviderResponse is available from message_end / invoke().
 *
 * Source of truth: docs/CORE.md, docs/CONTRACTS.md (Agent Loop)
 */

import type { ContextAssembler } from "../context-assembler/assembler.js";
import type {
  ContextContentPart,
  ContextMessage,
} from "../context/context.js";
import type { Context } from "../context/context.js";
import type { ContextBuilder } from "../context-builder/builder.js";
import type { ContextBuilderRegistry } from "../context-builder/registry.js";
import type {
  ProviderContentPart,
  ProviderResponse,
  ProviderStreamEvent,
} from "../contracts/provider.js";
import type { EventBus } from "../events/event-bus.js";
import { EventPublisher } from "../events/publisher.js";
import type { ProviderGateway } from "../provider-gateway/gateway.js";
import type { ProviderRequest } from "../contracts/provider.js";
import type { ToolRegistry } from "../registries/tool-registry.js";
import type { ToolRouter } from "../tool-router/router.js";
import type { Turn } from "../turn/turn.js";
import {
  AgentLoopError,
  AgentLoopErrorCode,
} from "./errors.js";
import type {
  LoopIteration,
  LoopToolCall,
  LoopToolResult,
} from "./iteration.js";
import {
  DEFAULT_MAX_ITERATIONS,
  type LoopOptions,
} from "./options.js";
import type { LoopResult } from "./result.js";

export interface AgentLoopOptions {
  readonly providers: ProviderGateway;
  readonly tools: ToolRouter;
  readonly assembler: ContextAssembler;
  /**
   * Optional builder registry. When present, registered builders run after
   * loop seed/conversation builders on every assembly.
   */
  readonly builders?: ContextBuilderRegistry;
  /**
   * Tool registry for resolving provider tool names → tool ids.
   * Lookup only; execution always goes through ToolRouter.
   */
  readonly toolRegistry: ToolRegistry;
  readonly events: EventBus;
  readonly publisher?: EventPublisher;
  /** Optional default cancellation (e.g. runtime root). */
  readonly signal?: AbortSignal;
  /** Optional permissions forwarded into assembly context. */
  readonly grantedPermissions?: ReadonlySet<string>;
}

/**
 * Minimal Turn surface required by the loop.
 * Accepts the real Turn class and test doubles.
 */
export interface LoopTurn {
  readonly id: string;
  readonly sessionId: string;
  readonly runtimeId: string;
  readonly state: string;
  readonly cancellation: { readonly signal: AbortSignal };
  complete(input?: { result?: unknown }): Promise<void>;
}

export class AgentLoop {
  private readonly providers: ProviderGateway;
  private readonly tools: ToolRouter;
  private readonly assembler: ContextAssembler;
  private readonly builders: ContextBuilderRegistry | undefined;
  private readonly toolRegistry: ToolRegistry;
  private readonly publisher: EventPublisher;
  private readonly defaultSignal: AbortSignal | undefined;
  private readonly grantedPermissions: ReadonlySet<string> | undefined;

  constructor(options: AgentLoopOptions) {
    this.providers = options.providers;
    this.tools = options.tools;
    this.assembler = options.assembler;
    this.builders = options.builders;
    this.toolRegistry = options.toolRegistry;
    this.publisher = options.publisher ?? new EventPublisher(options.events);
    this.defaultSignal = options.signal;
    this.grantedPermissions = options.grantedPermissions;
  }

  /**
   * Execute exactly one Turn through the abstract loop.
   */
  async execute(
    turn: LoopTurn | Turn,
    options: LoopOptions,
  ): Promise<LoopResult> {
    this.assertValidTurn(turn);
    this.assertValidOptions(options, turn);

    const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    if (
      typeof maxIterations !== "number" ||
      !Number.isInteger(maxIterations) ||
      maxIterations < 1
    ) {
      throw new AgentLoopError({
        code: AgentLoopErrorCode.INVALID_OPTIONS,
        message: "maxIterations must be a positive integer",
        field: "maxIterations",
        turnId: turn.id,
        sessionId: turn.sessionId,
        runtimeId: turn.runtimeId,
      });
    }

    const signal =
      options.signal ?? turn.cancellation.signal ?? this.defaultSignal;

    const conversation: ContextMessage[] = [];
    const iterations: LoopIteration[] = [];

    try {
      this.assertNotCancelled(signal, turn);

      for (let index = 0; index < maxIterations; index++) {
        this.assertNotCancelled(signal, turn, index);

        const context = (
          await this.assemble(turn, options, conversation, signal)
        ).context;

        let response: ProviderResponse;
        try {
          if (options.stream === true) {
            response = await this.invokeProviderStream(
              turn,
              options,
              context,
              signal,
              index,
            );
          } else {
            const gatewayResult = await this.providers.invoke({
              model: options.model,
              context,
              ...(options.providerId !== undefined
                ? { providerId: options.providerId }
                : {}),
              ...(options.providerOptions !== undefined
                ? { options: options.providerOptions }
                : {}),
              ...(signal !== undefined ? { signal } : {}),
            });
            response = gatewayResult.response;
          }
        } catch (error) {
          throw this.wrapProviderError(error, turn, index);
        }

        const toolCalls = this.extractToolCalls(response, turn, index);

        if (toolCalls.length === 0) {
          const iteration: LoopIteration = {
            index,
            context,
            response,
            toolCalls: [],
            toolResults: [],
            assistantOutput: response.output,
          };
          iterations.push(iteration);

          await turn.complete({
            result: {
              response,
              iterations: [...iterations],
            },
          });

          return {
            status: "completed",
            turnId: turn.id,
            sessionId: turn.sessionId,
            runtimeId: turn.runtimeId,
            iterations: Object.freeze([...iterations]),
            finalResponse: response,
            iterationCount: iterations.length,
          };
        }

        // Append assistant tool-call message before tools run.
        conversation.push({
          role: "assistant",
          content: response.output.map((part) => mapContentPart(part)),
        });

        const toolResults: LoopToolResult[] = [];
        for (const call of toolCalls) {
          this.assertNotCancelled(signal, turn, index);
          try {
            const toolResult = await this.tools.invoke({
              toolId: call.toolId,
              args: call.arguments,
              sessionId: turn.sessionId,
              turnId: turn.id,
              runtimeId: turn.runtimeId,
              ...(signal !== undefined ? { signal } : {}),
              metadata: {
                callId: call.id,
                toolName: call.name,
                ...(options.metadata ?? {}),
              },
            });
            toolResults.push({
              callId: call.id,
              toolId: call.toolId,
              name: call.name,
              result: toolResult.result,
            });
          } catch (error) {
            throw this.wrapToolError(error, turn, index, call);
          }
        }

        // Append tool results for the next assembly.
        conversation.push({
          role: "tool",
          content: toolResults.map((tr) => ({
            type: "tool_result",
            id: tr.callId,
            name: tr.name,
            result: {
              ok: tr.result.ok,
              ...(tr.result.data !== undefined ? { data: tr.result.data } : {}),
              ...(tr.result.message !== undefined
                ? { message: tr.result.message }
                : {}),
              ...(tr.result.errorCode !== undefined
                ? { errorCode: tr.result.errorCode }
                : {}),
            },
          })),
        });

        iterations.push({
          index,
          context,
          response,
          toolCalls,
          toolResults,
          assistantOutput: response.output,
        });

        // Last iteration still requested tools → fail closed.
        if (index === maxIterations - 1) {
          throw new AgentLoopError({
            code: AgentLoopErrorCode.MAX_ITERATIONS,
            message: `Agent loop reached maxIterations (${maxIterations}) with pending tool work`,
            turnId: turn.id,
            sessionId: turn.sessionId,
            runtimeId: turn.runtimeId,
            iteration: index,
            details: { maxIterations, toolCallCount: toolCalls.length },
          });
        }
      }

      throw new AgentLoopError({
        code: AgentLoopErrorCode.MAX_ITERATIONS,
        message: `Agent loop reached maxIterations (${maxIterations})`,
        turnId: turn.id,
        sessionId: turn.sessionId,
        runtimeId: turn.runtimeId,
        details: { maxIterations },
      });
    } catch (error) {
      if (error instanceof AgentLoopError) {
        throw error;
      }
      throw new AgentLoopError({
        code: AgentLoopErrorCode.EXECUTION_FAILED,
        message:
          error instanceof Error ? error.message : "Agent loop execution failed",
        turnId: turn.id,
        sessionId: turn.sessionId,
        runtimeId: turn.runtimeId,
        cause: error,
      });
    }
  }

  private async assemble(
    turn: LoopTurn,
    options: LoopOptions,
    conversation: readonly ContextMessage[],
    signal: AbortSignal | undefined,
  ) {
    const seedBuilders = this.createSeedBuilders(options, conversation);
    const registered = this.builders?.resolve() ?? [];
    const builders: readonly ContextBuilder[] = [
      ...seedBuilders,
      ...registered,
    ];

    try {
      // Always pass explicit builders so seeds + registry run together.
      // When both empty, assembler still requires builders or a registry —
      // empty list is invalid for assembler, so fall back to assembler registry.
      if (builders.length === 0) {
        return await this.assembler.assemble({
          turnId: turn.id,
          sessionId: turn.sessionId,
          runtimeId: turn.runtimeId,
          ...(options.metadata !== undefined
            ? { metadata: options.metadata }
            : {}),
          ...(signal !== undefined ? { signal } : {}),
          ...(this.grantedPermissions !== undefined
            ? { grantedPermissions: this.grantedPermissions }
            : {}),
          data: {
            conversation,
            model: options.model,
          },
        });
      }

      return await this.assembler.assemble(
        {
          turnId: turn.id,
          sessionId: turn.sessionId,
          runtimeId: turn.runtimeId,
          ...(options.metadata !== undefined
            ? { metadata: options.metadata }
            : {}),
          ...(signal !== undefined ? { signal } : {}),
          ...(this.grantedPermissions !== undefined
            ? { grantedPermissions: this.grantedPermissions }
            : {}),
          data: {
            conversation,
            model: options.model,
          },
        },
        { builders },
      );
    } catch (error) {
      if (error instanceof AgentLoopError) {
        throw error;
      }
      throw new AgentLoopError({
        code: AgentLoopErrorCode.ASSEMBLY_FAILED,
        message:
          error instanceof Error ? error.message : "Context assembly failed",
        turnId: turn.id,
        sessionId: turn.sessionId,
        runtimeId: turn.runtimeId,
        cause: error,
      });
    }
  }

  private createSeedBuilders(
    options: LoopOptions,
    conversation: readonly ContextMessage[],
  ): ContextBuilder[] {
    const builders: ContextBuilder[] = [];

    const seedInstructions = options.instructions ?? [];
    const seedMessages = options.messages ?? [];

    if (seedInstructions.length > 0 || seedMessages.length > 0) {
      builders.push({
        id: "core/agent-loop/seed",
        name: "Agent Loop Seed",
        priority: 0,
        build: () => ({
          fragments: [
            {
              ...(seedInstructions.length > 0
                ? { instructions: seedInstructions }
                : {}),
              ...(seedMessages.length > 0 ? { messages: seedMessages } : {}),
            },
          ],
        }),
      });
    }

    if (conversation.length > 0) {
      builders.push({
        id: "core/agent-loop/conversation",
        name: "Agent Loop Conversation",
        priority: 50,
        build: () => ({
          fragments: [
            {
              messages: conversation,
            },
          ],
        }),
      });
    }

    return builders;
  }

  /**
   * Stream one provider iteration via Gateway.stream; return final response.
   * Forwards ProviderStreamEvents to options.onStreamEvent (observation only).
   */
  private async invokeProviderStream(
    turn: LoopTurn,
    options: LoopOptions,
    context: Context,
    signal: AbortSignal | undefined,
    iteration: number,
  ): Promise<ProviderResponse> {
    let finalResponse: ProviderResponse | undefined;
    let lastRequest: ProviderRequest | undefined;

    for await (const item of this.providers.stream({
      model: options.model,
      context,
      ...(options.providerId !== undefined
        ? { providerId: options.providerId }
        : {}),
      ...(options.providerOptions !== undefined
        ? { options: options.providerOptions }
        : {}),
      ...(signal !== undefined ? { signal } : {}),
    })) {
      this.assertNotCancelled(signal, turn, iteration);
      lastRequest = item.request;

      const event: ProviderStreamEvent = item.event;
      if (options.onStreamEvent !== undefined) {
        await options.onStreamEvent(event);
      }

      if (event.type === "message_end") {
        finalResponse = event.response;
      }

      this.assertNotCancelled(signal, turn, iteration);
    }

    this.assertNotCancelled(signal, turn, iteration);

    if (finalResponse === undefined) {
      throw new AgentLoopError({
        code: AgentLoopErrorCode.PROVIDER_FAILED,
        message: "Provider stream ended without a message_end response",
        turnId: turn.id,
        sessionId: turn.sessionId,
        runtimeId: turn.runtimeId,
        iteration,
        details: {
          ...(lastRequest !== undefined ? { model: lastRequest.model } : {}),
        },
      });
    }

    return finalResponse;
  }

  private extractToolCalls(
    response: ProviderResponse,
    turn: LoopTurn,
    iteration: number,
  ): LoopToolCall[] {
    const calls: LoopToolCall[] = [];

    for (const part of response.output) {
      if (part.type !== "tool_call") {
        continue;
      }
      const name = part.name;
      const id = part.id;
      if (typeof name !== "string" || name.trim().length === 0) {
        throw new AgentLoopError({
          code: AgentLoopErrorCode.PROVIDER_FAILED,
          message: "Provider tool_call is missing a name",
          turnId: turn.id,
          sessionId: turn.sessionId,
          runtimeId: turn.runtimeId,
          iteration,
        });
      }
      if (typeof id !== "string" || id.trim().length === 0) {
        throw new AgentLoopError({
          code: AgentLoopErrorCode.PROVIDER_FAILED,
          message: "Provider tool_call is missing an id",
          turnId: turn.id,
          sessionId: turn.sessionId,
          runtimeId: turn.runtimeId,
          iteration,
        });
      }

      const toolId = this.resolveToolId(name);
      if (toolId === undefined) {
        throw new AgentLoopError({
          code: AgentLoopErrorCode.TOOL_FAILED,
          message: `No registered tool matches name or id "${name}"`,
          turnId: turn.id,
          sessionId: turn.sessionId,
          runtimeId: turn.runtimeId,
          iteration,
          details: { toolName: name, callId: id },
        });
      }

      calls.push({
        id,
        name,
        toolId,
        arguments: normalizeArgs(part.arguments),
      });
    }

    return calls;
  }

  private resolveToolId(nameOrId: string): string | undefined {
    if (this.toolRegistry.has(nameOrId)) {
      return nameOrId;
    }
    const byName = this.toolRegistry
      .list()
      .find((tool) => tool.name === nameOrId);
    return byName?.id;
  }

  private wrapProviderError(
    error: unknown,
    turn: LoopTurn,
    iteration: number,
  ): AgentLoopError {
    if (error instanceof AgentLoopError) {
      return error;
    }
    const code = isCancelledError(error)
      ? AgentLoopErrorCode.CANCELLED
      : AgentLoopErrorCode.PROVIDER_FAILED;
    return new AgentLoopError({
      code,
      message:
        error instanceof Error ? error.message : "Provider invocation failed",
      turnId: turn.id,
      sessionId: turn.sessionId,
      runtimeId: turn.runtimeId,
      iteration,
      cause: error,
    });
  }

  private wrapToolError(
    error: unknown,
    turn: LoopTurn,
    iteration: number,
    call: LoopToolCall,
  ): AgentLoopError {
    if (error instanceof AgentLoopError) {
      return error;
    }
    const code = isCancelledError(error)
      ? AgentLoopErrorCode.CANCELLED
      : AgentLoopErrorCode.TOOL_FAILED;
    return new AgentLoopError({
      code,
      message:
        error instanceof Error
          ? error.message
          : `Tool invocation failed for "${call.toolId}"`,
      turnId: turn.id,
      sessionId: turn.sessionId,
      runtimeId: turn.runtimeId,
      iteration,
      details: { toolId: call.toolId, callId: call.id, name: call.name },
      cause: error,
    });
  }

  private assertValidTurn(turn: LoopTurn): void {
    if (turn === null || typeof turn !== "object") {
      throw new AgentLoopError({
        code: AgentLoopErrorCode.INVALID_TURN,
        message: "execute requires a Turn",
        field: "turn",
      });
    }
    if (typeof turn.id !== "string" || turn.id.trim().length === 0) {
      throw new AgentLoopError({
        code: AgentLoopErrorCode.INVALID_TURN,
        message: "Turn id is required",
        field: "turn.id",
      });
    }
    if (
      turn.state === "completed" ||
      turn.state === "cancelled" ||
      turn.state === "failed"
    ) {
      throw new AgentLoopError({
        code: AgentLoopErrorCode.INVALID_TURN,
        message: `Cannot execute turn in state "${turn.state}"`,
        turnId: turn.id,
        sessionId: turn.sessionId,
        runtimeId: turn.runtimeId,
      });
    }
  }

  private assertValidOptions(options: LoopOptions, turn: LoopTurn): void {
    if (options === null || typeof options !== "object") {
      throw new AgentLoopError({
        code: AgentLoopErrorCode.INVALID_OPTIONS,
        message: "LoopOptions are required",
        turnId: turn.id,
        sessionId: turn.sessionId,
        runtimeId: turn.runtimeId,
      });
    }
    if (typeof options.model !== "string" || options.model.trim().length === 0) {
      throw new AgentLoopError({
        code: AgentLoopErrorCode.INVALID_OPTIONS,
        message: "model must be a non-empty string",
        field: "model",
        turnId: turn.id,
        sessionId: turn.sessionId,
        runtimeId: turn.runtimeId,
      });
    }
  }

  private assertNotCancelled(
    signal: AbortSignal | undefined,
    turn: LoopTurn,
    iteration?: number,
  ): void {
    if (signal?.aborted) {
      throw new AgentLoopError({
        code: AgentLoopErrorCode.CANCELLED,
        message: "Agent loop cancelled",
        turnId: turn.id,
        sessionId: turn.sessionId,
        runtimeId: turn.runtimeId,
        ...(iteration !== undefined ? { iteration } : {}),
        details: { reason: signal.reason },
      });
    }
  }
}

function mapContentPart(part: ProviderContentPart): ContextContentPart {
  if (part.type === "text") {
    return { type: "text", text: part.text };
  }
  if (part.type === "tool_call") {
    return {
      type: "tool_call",
      id: part.id,
      name: part.name,
      arguments: part.arguments,
    };
  }
  if (part.type === "tool_result") {
    return {
      type: "tool_result",
      id: part.id,
      ...(part.name !== undefined ? { name: part.name } : {}),
      result: part.result,
    };
  }
  if (part.type === "image") {
    return {
      type: "image",
      ...(part.mimeType !== undefined ? { mimeType: part.mimeType } : {}),
      ...(part.data !== undefined ? { data: part.data } : {}),
      ...(part.uri !== undefined ? { uri: part.uri } : {}),
    };
  }
  return {
    type: part.type,
    ...(part.mimeType !== undefined ? { mimeType: part.mimeType } : {}),
    value: part.value,
  };
}

function normalizeArgs(value: unknown): Readonly<Record<string, unknown>> {
  if (value === null || value === undefined) {
    return {};
  }
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        !Array.isArray(parsed)
      ) {
        return parsed as Record<string, unknown>;
      }
      return { value: parsed };
    } catch {
      return { value };
    }
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { value };
}

function isCancelledError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "CANCELLED"
  );
}

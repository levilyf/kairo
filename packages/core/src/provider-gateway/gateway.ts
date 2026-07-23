/**
 * ProviderGateway — sole Core boundary for Provider.complete() / Provider.stream().
 *
 * Responsibilities:
 * - select provider from ProviderRegistry
 * - evaluate Policy Hooks (provider.call)
 * - translate Context → ProviderRequest
 * - invoke Provider.complete() or Provider.stream()
 * - validate ProviderResponse (complete and stream message_end)
 * - emit provider lifecycle events
 * - honor cancellation
 *
 * Must not: tools, loop, retry, assemble context, vendor SDKs.
 * Must not: silently fall back from stream → complete.
 *
 * Source of truth: docs/CORE.md (Provider Gateway), docs/CONTRACTS.md (Provider)
 */

import type { Context } from "../context/context.js";
import type {
  Provider,
  ProviderRequest,
  ProviderResponse,
} from "../contracts/provider.js";
import type { EventBus } from "../events/event-bus.js";
import { EventPublisher } from "../events/publisher.js";
import type { PolicyManager } from "../policy/policy-manager.js";
import type { ProviderRegistry } from "../registries/provider-registry.js";
import {
  ProviderGatewayError,
  ProviderGatewayErrorCode,
} from "./errors.js";
import {
  assertProviderResponse,
  type ProviderGatewayResult,
  type ProviderGatewayStreamEvent,
} from "./result.js";
import { selectProvider } from "./selection.js";
import { translateContextToProviderRequest } from "./translator.js";

export interface ProviderGatewayOptions {
  readonly providers: ProviderRegistry;
  readonly events: EventBus;
  readonly policy: PolicyManager;
  /** Optional shared publisher; created from events when omitted. */
  readonly publisher?: EventPublisher;
  /** Optional default cancellation signal (e.g. runtime root). */
  readonly signal?: AbortSignal;
}

export interface ProviderInvokeInput {
  /** Explicit provider id. Optional when exactly one provider is registered. */
  readonly providerId?: string;
  /** Model identifier for the provider request. */
  readonly model: string;
  /** Assembled Context. */
  readonly context: Context;
  /** Opaque provider options (temperature, etc.). */
  readonly options?: Readonly<Record<string, unknown>>;
  /** Cancellation signal (session/turn/runtime). Defaults to gateway signal. */
  readonly signal?: AbortSignal;
}

interface PreparedInvocation {
  readonly provider: Provider;
  readonly providerId: string;
  readonly request: ProviderRequest;
  readonly signal: AbortSignal | undefined;
}

export class ProviderGateway {
  private readonly providers: ProviderRegistry;
  private readonly policy: PolicyManager;
  private readonly publisher: EventPublisher;
  private readonly defaultSignal: AbortSignal | undefined;

  constructor(options: ProviderGatewayOptions) {
    this.providers = options.providers;
    this.policy = options.policy;
    this.publisher = options.publisher ?? new EventPublisher(options.events);
    this.defaultSignal = options.signal;
  }

  /**
   * Invoke a provider through the gateway boundary (non-streaming).
   */
  async invoke(input: ProviderInvokeInput): Promise<ProviderGatewayResult> {
    const prepared = await this.prepare(input, { requireStreaming: false });

    this.publisher.emitCore("provider.called", {
      sessionId: input.context.sessionId,
      turnId: input.context.turnId,
      data: {
        providerId: prepared.providerId,
        model: input.model,
        contextId: input.context.id,
        runtimeId: input.context.runtimeId,
      },
    });

    try {
      this.assertNotCancelled(prepared.signal, input, prepared.providerId);
      const response = await prepared.provider.complete(prepared.request);
      assertProviderResponse(response, {
        providerId: prepared.providerId,
        sessionId: input.context.sessionId,
        turnId: input.context.turnId,
        runtimeId: input.context.runtimeId,
      });

      this.publisher.emitCore("provider.completed", {
        sessionId: input.context.sessionId,
        turnId: input.context.turnId,
        data: {
          providerId: prepared.providerId,
          model: input.model,
          responseId: response.id,
          stopReason: response.stopReason,
          runtimeId: input.context.runtimeId,
        },
      });

      return {
        providerId: prepared.providerId,
        model: input.model,
        request: prepared.request,
        response,
        sessionId: input.context.sessionId,
        turnId: input.context.turnId,
        runtimeId: input.context.runtimeId,
        contextId: input.context.id,
      };
    } catch (error) {
      this.rethrowInvocationError(error, input, prepared.providerId);
    }
  }

  /**
   * Stream a provider through the gateway boundary.
   *
   * Fails closed when the selected provider does not declare streaming or
   * does not implement stream(). Never falls back to complete().
   */
  async *stream(
    input: ProviderInvokeInput,
  ): AsyncGenerator<ProviderGatewayStreamEvent, void, unknown> {
    const prepared = await this.prepare(input, { requireStreaming: true });

    this.publisher.emitCore("provider.called", {
      sessionId: input.context.sessionId,
      turnId: input.context.turnId,
      data: {
        providerId: prepared.providerId,
        model: input.model,
        contextId: input.context.id,
        runtimeId: input.context.runtimeId,
        streaming: true,
      },
    });

    let finalResponse: ProviderResponse | undefined;

    try {
      this.assertNotCancelled(prepared.signal, input, prepared.providerId);

      const streamFn = prepared.provider.stream;
      if (typeof streamFn !== "function") {
        // Defensive: prepare() already checks; keep fail-closed.
        throw new ProviderGatewayError({
          code: ProviderGatewayErrorCode.STREAMING_UNSUPPORTED,
          message: `Provider "${prepared.providerId}" does not implement stream()`,
          providerId: prepared.providerId,
          model: input.model,
          sessionId: input.context.sessionId,
          turnId: input.context.turnId,
          runtimeId: input.context.runtimeId,
        });
      }

      for await (const event of streamFn.call(
        prepared.provider,
        prepared.request,
      )) {
        this.assertNotCancelled(prepared.signal, input, prepared.providerId);

        if (event.type === "message_end") {
          assertProviderResponse(event.response, {
            providerId: prepared.providerId,
            sessionId: input.context.sessionId,
            turnId: input.context.turnId,
            runtimeId: input.context.runtimeId,
          });
          finalResponse = event.response;
        }

        yield {
          event,
          providerId: prepared.providerId,
          model: input.model,
          sessionId: input.context.sessionId,
          turnId: input.context.turnId,
          runtimeId: input.context.runtimeId,
          contextId: input.context.id,
          request: prepared.request,
        };

        this.assertNotCancelled(prepared.signal, input, prepared.providerId);
      }

      this.assertNotCancelled(prepared.signal, input, prepared.providerId);

      if (finalResponse === undefined) {
        throw new ProviderGatewayError({
          code: ProviderGatewayErrorCode.INVALID_RESPONSE,
          message: "Provider stream ended without a message_end event",
          providerId: prepared.providerId,
          model: input.model,
          sessionId: input.context.sessionId,
          turnId: input.context.turnId,
          runtimeId: input.context.runtimeId,
          field: "message_end",
        });
      }

      this.publisher.emitCore("provider.completed", {
        sessionId: input.context.sessionId,
        turnId: input.context.turnId,
        data: {
          providerId: prepared.providerId,
          model: input.model,
          responseId: finalResponse.id,
          stopReason: finalResponse.stopReason,
          runtimeId: input.context.runtimeId,
          streaming: true,
        },
      });
    } catch (error) {
      this.rethrowInvocationError(error, input, prepared.providerId);
    }
  }

  /**
   * Shared selection, policy, translation, and optional streaming gate.
   */
  private async prepare(
    input: ProviderInvokeInput,
    options: { requireStreaming: boolean },
  ): Promise<PreparedInvocation> {
    this.assertValidInput(input);

    const signal = input.signal ?? this.defaultSignal;
    this.assertNotCancelled(signal, input);

    const selection = selectProvider({
      providers: this.providers,
      ...(input.providerId !== undefined ? { providerId: input.providerId } : {}),
      sessionId: input.context.sessionId,
      turnId: input.context.turnId,
      runtimeId: input.context.runtimeId,
    });

    const policyResult = await this.policy.evaluate({
      action: "provider.call",
      subject: selection.providerId,
      sessionId: input.context.sessionId,
      turnId: input.context.turnId,
      data: {
        model: input.model,
        contextId: input.context.id,
        runtimeId: input.context.runtimeId,
        ...(options.requireStreaming ? { streaming: true } : {}),
      },
    });

    if (policyResult.denied) {
      this.publisher.emitCore("policy.denied", {
        sessionId: input.context.sessionId,
        turnId: input.context.turnId,
        data: {
          action: "provider.call",
          providerId: selection.providerId,
          model: input.model,
          reasons: policyResult.denyReasons,
          runtimeId: input.context.runtimeId,
        },
      });
      throw new ProviderGatewayError({
        code: ProviderGatewayErrorCode.POLICY_DENIED,
        message:
          policyResult.denyReasons.join("; ") ||
          `Policy denied provider.call for "${selection.providerId}"`,
        providerId: selection.providerId,
        model: input.model,
        sessionId: input.context.sessionId,
        turnId: input.context.turnId,
        runtimeId: input.context.runtimeId,
        details: { denyReasons: policyResult.denyReasons },
      });
    }

    this.assertNotCancelled(signal, input, selection.providerId);

    if (options.requireStreaming) {
      const streaming = selection.provider.capabilities.streaming === true;
      const hasStream = typeof selection.provider.stream === "function";
      if (!streaming || !hasStream) {
        throw new ProviderGatewayError({
          code: ProviderGatewayErrorCode.STREAMING_UNSUPPORTED,
          message: streaming
            ? `Provider "${selection.providerId}" declares streaming but does not implement stream()`
            : `Provider "${selection.providerId}" does not support streaming`,
          providerId: selection.providerId,
          model: input.model,
          sessionId: input.context.sessionId,
          turnId: input.context.turnId,
          runtimeId: input.context.runtimeId,
          details: {
            capabilitiesStreaming: selection.provider.capabilities.streaming,
            hasStreamMethod: hasStream,
          },
        });
      }
    }

    let request: ProviderRequest;
    try {
      request = translateContextToProviderRequest(input.context, {
        model: input.model,
        ...(input.options !== undefined ? { options: input.options } : {}),
        ...(signal !== undefined ? { signal } : {}),
      });
    } catch (error) {
      if (error instanceof ProviderGatewayError) {
        throw error;
      }
      throw new ProviderGatewayError({
        code: ProviderGatewayErrorCode.TRANSLATION_FAILED,
        message:
          error instanceof Error
            ? error.message
            : "Context → ProviderRequest translation failed",
        providerId: selection.providerId,
        model: input.model,
        sessionId: input.context.sessionId,
        turnId: input.context.turnId,
        runtimeId: input.context.runtimeId,
        cause: error,
      });
    }

    return {
      provider: selection.provider,
      providerId: selection.providerId,
      request,
      signal,
    };
  }

  private rethrowInvocationError(
    error: unknown,
    input: ProviderInvokeInput,
    providerId: string,
  ): never {
    if (error instanceof ProviderGatewayError) {
      if (error.code !== ProviderGatewayErrorCode.CANCELLED) {
        this.publisher.emitCore("provider.failed", {
          sessionId: input.context.sessionId,
          turnId: input.context.turnId,
          data: {
            providerId,
            model: input.model,
            message: error.message,
            code: error.code,
            runtimeId: input.context.runtimeId,
          },
        });
      }
      throw error;
    }

    this.publisher.emitCore("provider.failed", {
      sessionId: input.context.sessionId,
      turnId: input.context.turnId,
      data: {
        providerId,
        model: input.model,
        message:
          error instanceof Error ? error.message : "Provider invocation failed",
        runtimeId: input.context.runtimeId,
      },
    });

    throw new ProviderGatewayError({
      code: ProviderGatewayErrorCode.INVOCATION_FAILED,
      message:
        error instanceof Error ? error.message : "Provider invocation failed",
      providerId,
      model: input.model,
      sessionId: input.context.sessionId,
      turnId: input.context.turnId,
      runtimeId: input.context.runtimeId,
      cause: error,
    });
  }

  private assertValidInput(input: ProviderInvokeInput): void {
    if (input.context === null || typeof input.context !== "object") {
      throw new ProviderGatewayError({
        code: ProviderGatewayErrorCode.INVALID_INVOCATION,
        message: "context is required",
        field: "context",
      });
    }
    if (typeof input.model !== "string" || input.model.trim().length === 0) {
      throw new ProviderGatewayError({
        code: ProviderGatewayErrorCode.INVALID_INVOCATION,
        message: "model must be a non-empty string",
        field: "model",
        sessionId: input.context.sessionId,
        turnId: input.context.turnId,
        runtimeId: input.context.runtimeId,
      });
    }
  }

  private assertNotCancelled(
    signal: AbortSignal | undefined,
    input: ProviderInvokeInput,
    providerId?: string,
  ): void {
    if (signal?.aborted) {
      throw new ProviderGatewayError({
        code: ProviderGatewayErrorCode.CANCELLED,
        message: "Provider invocation cancelled",
        ...(providerId !== undefined ? { providerId } : {}),
        model: input.model,
        sessionId: input.context.sessionId,
        turnId: input.context.turnId,
        runtimeId: input.context.runtimeId,
        details: { reason: signal.reason },
      });
    }
  }
}

/**
 * ToolRouter — sole Core boundary for Tool.execute() invocations.
 *
 * Responsibilities:
 * - resolve tools from ToolRegistry
 * - evaluate Policy Hooks (tool.invoke)
 * - validate arguments against declared parameter contracts
 * - invoke Tool.execute()
 * - validate ToolResult
 * - emit tool lifecycle events
 * - honor cancellation
 *
 * Must not: choose tools, retry, assemble context, invoke providers,
 * run the agent loop, or know vendor APIs.
 *
 * Source of truth: docs/CORE.md (Tool Router), docs/CONTRACTS.md (Tool)
 */

import type { EventBus } from "../events/event-bus.js";
import { EventPublisher } from "../events/publisher.js";
import type { PolicyManager } from "../policy/policy-manager.js";
import type { ToolRegistry } from "../registries/tool-registry.js";
import {
  ToolRouterError,
  ToolRouterErrorCode,
} from "./errors.js";
import {
  assertToolResult,
  type ToolRouterResult,
} from "./result.js";
import { selectTool } from "./selection.js";
import { validateToolArguments } from "./validation.js";

export interface ToolRouterOptions {
  readonly tools: ToolRegistry;
  readonly events: EventBus;
  readonly policy: PolicyManager;
  /** Optional shared publisher; created from events when omitted. */
  readonly publisher?: EventPublisher;
  /** Optional default cancellation signal (e.g. runtime root). */
  readonly signal?: AbortSignal;
  /** Optional permissions granted by the harness composition. */
  readonly grantedPermissions?: ReadonlySet<string>;
}

export interface ToolInvokeInput {
  /** Explicit tool id. Required — the router never chooses tools. */
  readonly toolId: string;
  /** Arguments matching the tool's parameter contract. */
  readonly args: Readonly<Record<string, unknown>>;
  readonly sessionId?: string;
  readonly turnId?: string;
  readonly runtimeId?: string;
  /** Cancellation signal (session/turn/runtime). Defaults to router signal. */
  readonly signal?: AbortSignal;
  /** Opaque invocation metadata forwarded to ToolExecuteContext. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export class ToolRouter {
  private readonly tools: ToolRegistry;
  private readonly policy: PolicyManager;
  private readonly publisher: EventPublisher;
  private readonly defaultSignal: AbortSignal | undefined;
  private readonly grantedPermissions: ReadonlySet<string> | undefined;

  constructor(options: ToolRouterOptions) {
    this.tools = options.tools;
    this.policy = options.policy;
    this.publisher = options.publisher ?? new EventPublisher(options.events);
    this.defaultSignal = options.signal;
    this.grantedPermissions = options.grantedPermissions;
  }

  /**
   * Invoke a tool through the router boundary.
   */
  async invoke(input: ToolInvokeInput): Promise<ToolRouterResult> {
    this.assertValidInput(input);

    const signal = input.signal ?? this.defaultSignal;
    this.assertNotCancelled(signal, input);

    const selection = selectTool({
      tools: this.tools,
      toolId: input.toolId,
      ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
      ...(input.turnId !== undefined ? { turnId: input.turnId } : {}),
      ...(input.runtimeId !== undefined ? { runtimeId: input.runtimeId } : {}),
    });

    const policyResult = await this.policy.evaluate({
      action: "tool.invoke",
      subject: selection.toolId,
      ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
      ...(input.turnId !== undefined ? { turnId: input.turnId } : {}),
      data: {
        args: input.args,
        ...(input.runtimeId !== undefined ? { runtimeId: input.runtimeId } : {}),
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      },
    });

    if (policyResult.denied) {
      this.publisher.emitCore("policy.denied", {
        ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
        ...(input.turnId !== undefined ? { turnId: input.turnId } : {}),
        data: {
          action: "tool.invoke",
          toolId: selection.toolId,
          reasons: policyResult.denyReasons,
          ...(input.runtimeId !== undefined
            ? { runtimeId: input.runtimeId }
            : {}),
        },
      });
      throw new ToolRouterError({
        code: ToolRouterErrorCode.POLICY_DENIED,
        message:
          policyResult.denyReasons.join("; ") ||
          `Policy denied tool.invoke for "${selection.toolId}"`,
        toolId: selection.toolId,
        ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
        ...(input.turnId !== undefined ? { turnId: input.turnId } : {}),
        ...(input.runtimeId !== undefined ? { runtimeId: input.runtimeId } : {}),
        details: { denyReasons: policyResult.denyReasons },
      });
    }

    this.assertNotCancelled(signal, input, selection.toolId);

    try {
      validateToolArguments(input.args, selection.tool.parameters, {
        toolId: selection.toolId,
        ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
        ...(input.turnId !== undefined ? { turnId: input.turnId } : {}),
        ...(input.runtimeId !== undefined ? { runtimeId: input.runtimeId } : {}),
      });
    } catch (error) {
      if (error instanceof ToolRouterError) {
        throw error;
      }
      throw new ToolRouterError({
        code: ToolRouterErrorCode.INVALID_ARGUMENTS,
        message:
          error instanceof Error
            ? error.message
            : "Tool argument validation failed",
        toolId: selection.toolId,
        ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
        ...(input.turnId !== undefined ? { turnId: input.turnId } : {}),
        ...(input.runtimeId !== undefined ? { runtimeId: input.runtimeId } : {}),
        cause: error,
      });
    }

    this.publisher.emitCore("tool.invoked", {
      ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
      ...(input.turnId !== undefined ? { turnId: input.turnId } : {}),
      data: {
        toolId: selection.toolId,
        ...(input.runtimeId !== undefined ? { runtimeId: input.runtimeId } : {}),
      },
    });

    try {
      this.assertNotCancelled(signal, input, selection.toolId);

      const executeContext = {
        ...(signal !== undefined ? { signal } : {}),
        ...(this.grantedPermissions !== undefined
          ? { grantedPermissions: this.grantedPermissions }
          : {}),
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      };

      const result = await selection.tool.execute(
        input.args,
        Object.keys(executeContext).length > 0 ? executeContext : undefined,
      );

      assertToolResult(result, {
        toolId: selection.toolId,
        ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
        ...(input.turnId !== undefined ? { turnId: input.turnId } : {}),
        ...(input.runtimeId !== undefined ? { runtimeId: input.runtimeId } : {}),
      });

      this.publisher.emitCore("tool.completed", {
        ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
        ...(input.turnId !== undefined ? { turnId: input.turnId } : {}),
        data: {
          toolId: selection.toolId,
          ok: result.ok,
          ...(result.errorCode !== undefined
            ? { errorCode: result.errorCode }
            : {}),
          ...(input.runtimeId !== undefined
            ? { runtimeId: input.runtimeId }
            : {}),
        },
      });

      return {
        toolId: selection.toolId,
        args: input.args,
        result,
        ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
        ...(input.turnId !== undefined ? { turnId: input.turnId } : {}),
        ...(input.runtimeId !== undefined ? { runtimeId: input.runtimeId } : {}),
      };
    } catch (error) {
      if (error instanceof ToolRouterError) {
        if (error.code !== ToolRouterErrorCode.CANCELLED) {
          this.publisher.emitCore("tool.failed", {
            ...(input.sessionId !== undefined
              ? { sessionId: input.sessionId }
              : {}),
            ...(input.turnId !== undefined ? { turnId: input.turnId } : {}),
            data: {
              toolId: selection.toolId,
              message: error.message,
              code: error.code,
              ...(input.runtimeId !== undefined
                ? { runtimeId: input.runtimeId }
                : {}),
            },
          });
        }
        throw error;
      }

      this.publisher.emitCore("tool.failed", {
        ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
        ...(input.turnId !== undefined ? { turnId: input.turnId } : {}),
        data: {
          toolId: selection.toolId,
          message:
            error instanceof Error ? error.message : "Tool invocation failed",
          ...(input.runtimeId !== undefined
            ? { runtimeId: input.runtimeId }
            : {}),
        },
      });

      throw new ToolRouterError({
        code: ToolRouterErrorCode.INVOCATION_FAILED,
        message:
          error instanceof Error ? error.message : "Tool invocation failed",
        toolId: selection.toolId,
        ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
        ...(input.turnId !== undefined ? { turnId: input.turnId } : {}),
        ...(input.runtimeId !== undefined ? { runtimeId: input.runtimeId } : {}),
        cause: error,
      });
    }
  }

  private assertValidInput(input: ToolInvokeInput): void {
    if (input === null || typeof input !== "object") {
      throw new ToolRouterError({
        code: ToolRouterErrorCode.INVALID_INVOCATION,
        message: "invocation input is required",
      });
    }
    if (typeof input.toolId !== "string" || input.toolId.trim().length === 0) {
      throw new ToolRouterError({
        code: ToolRouterErrorCode.INVALID_INVOCATION,
        message: "toolId must be a non-empty string",
        field: "toolId",
        ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
        ...(input.turnId !== undefined ? { turnId: input.turnId } : {}),
        ...(input.runtimeId !== undefined ? { runtimeId: input.runtimeId } : {}),
      });
    }
    if (
      input.args === null ||
      typeof input.args !== "object" ||
      Array.isArray(input.args)
    ) {
      throw new ToolRouterError({
        code: ToolRouterErrorCode.INVALID_INVOCATION,
        message: "args must be an object",
        field: "args",
        toolId: input.toolId,
        ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
        ...(input.turnId !== undefined ? { turnId: input.turnId } : {}),
        ...(input.runtimeId !== undefined ? { runtimeId: input.runtimeId } : {}),
      });
    }
  }

  private assertNotCancelled(
    signal: AbortSignal | undefined,
    input: ToolInvokeInput,
    toolId?: string,
  ): void {
    if (signal?.aborted) {
      throw new ToolRouterError({
        code: ToolRouterErrorCode.CANCELLED,
        message: "Tool invocation cancelled",
        ...(toolId !== undefined ? { toolId } : { toolId: input.toolId }),
        ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
        ...(input.turnId !== undefined ? { turnId: input.turnId } : {}),
        ...(input.runtimeId !== undefined ? { runtimeId: input.runtimeId } : {}),
        details: { reason: signal.reason },
      });
    }
  }
}

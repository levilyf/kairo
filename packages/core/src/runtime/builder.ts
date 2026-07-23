/**
 * RuntimeBuilder — constructs a Runtime from a ready Harness.
 *
 * Flow:
 *   ready Harness
 *     → validate
 *     → create cancellation root
 *     → create metadata
 *     → construct Runtime
 *     → ready
 *
 * Does not boot modules. Does not bind contributions.
 * Does not start sessions or the agent loop.
 */

import { AgentLoop } from "../agent-loop/loop.js";
import { ContextAssembler } from "../context-assembler/assembler.js";
import { ContextBuilderRegistry } from "../context-builder/registry.js";
import type { Harness } from "../harness/harness.js";
import { EventBus } from "../events/event-bus.js";
import { EventPublisher } from "../events/publisher.js";
import { PolicyManager } from "../policy/policy-manager.js";
import { ProviderGateway } from "../provider-gateway/gateway.js";
import { SessionManager } from "../session/manager.js";
import { ToolRouter } from "../tool-router/router.js";
import { CancellationRoot } from "./cancellation.js";
import { RuntimeError, RuntimeErrorCode } from "./errors.js";
import { createRuntimeMetadata } from "./metadata.js";
import { Runtime } from "./runtime.js";
import type { RuntimeServices } from "./state.js";

export interface CreateRuntimeOptions {
  /** Optional stable runtime instance id. Generated when omitted. */
  id?: string;
  /**
   * Optional pre-attached service slots (tests / future DI).
   * All services remain unimplemented by Core in this milestone.
   */
  services?: RuntimeServices;
}

export class RuntimeBuilder {
  /**
   * Build a ready Runtime bound to the given harness.
   */
  async build(
    harness: Harness,
    options: CreateRuntimeOptions = {},
  ): Promise<Runtime> {
    this.assertReadyHarness(harness);

    const id = options.id ?? generateRuntimeId();
    const cancellation = new CancellationRoot();
    const events = new EventBus();
    const policy = new PolicyManager();
    // Snapshot harness-bound policy hooks into the runtime-owned manager so
    // Runtime evaluation is independent of harness stop / binder unbind.
    for (const hook of harness.policyHooks.list()) {
      policy.registry.register(hook);
    }
    const sessions = new SessionManager({ runtimeId: id, events, cancellation });
    const publisher = new EventPublisher(events);
    const providers = new ProviderGateway({
      providers: harness.providers,
      events,
      policy,
      publisher,
      signal: cancellation.signal,
    });
    const tools = new ToolRouter({
      tools: harness.tools,
      events,
      policy,
      publisher,
      signal: cancellation.signal,
      grantedPermissions: harness.permissions,
    });
    // Prefer harness-bound ContextBuilderRegistry (module contributions).
    // Fall back to an empty registry only when the harness surface is missing
    // (defensive for partial test doubles).
    const builderRegistry =
      harness.contextBuilders ?? new ContextBuilderRegistry();
    const context = new ContextAssembler({ registry: builderRegistry });
    const agentLoop = new AgentLoop({
      providers,
      tools,
      assembler: context,
      builders: builderRegistry,
      toolRegistry: harness.tools,
      events,
      publisher,
      signal: cancellation.signal,
      grantedPermissions: harness.permissions,
    });
    const metadata = createRuntimeMetadata({
      id,
      harnessName: harness.metadata.name,
      harnessVersion: harness.metadata.version,
      coreVersion: harness.definition.coreVersion,
    });

    try {
      return new Runtime({
        harness,
        metadata,
        cancellation,
        events,
        policy,
        sessions,
        providers,
        tools,
        context,
        agentLoop,
        ...(options.services !== undefined
          ? { services: options.services }
          : {}),
      });
    } catch (error) {
      await sessions.close();
      policy.close();
      events.close();
      cancellation.abort("runtime.initialization_failed");
      throw new RuntimeError({
        code: RuntimeErrorCode.INITIALIZATION_FAILED,
        message:
          error instanceof Error
            ? error.message
            : "Runtime initialization failed",
        runtimeId: id,
        harnessName: harness.metadata.name,
        cause: error,
      });
    }
  }

  private assertReadyHarness(harness: unknown): asserts harness is Harness {
    if (harness === null || typeof harness !== "object") {
      throw new RuntimeError({
        code: RuntimeErrorCode.INVALID_HARNESS,
        message: "createRuntime requires a Harness instance",
        field: "harness",
      });
    }

    const candidate = harness as Partial<Harness>;

    if (typeof candidate.status !== "string") {
      throw new RuntimeError({
        code: RuntimeErrorCode.INVALID_HARNESS,
        message: "Value is not a Harness (missing status)",
        field: "harness",
      });
    }

    if (candidate.status !== "ready") {
      const harnessName =
        candidate.metadata && typeof candidate.metadata.name === "string"
          ? candidate.metadata.name
          : undefined;
      throw new RuntimeError({
        code: RuntimeErrorCode.INVALID_HARNESS,
        message: `Harness must be ready to create a Runtime (status="${candidate.status}")`,
        field: "status",
        ...(harnessName !== undefined ? { harnessName } : {}),
        details: { harnessStatus: candidate.status },
      });
    }

    if (
      !candidate.metadata ||
      typeof candidate.metadata.name !== "string" ||
      typeof candidate.metadata.version !== "string"
    ) {
      throw new RuntimeError({
        code: RuntimeErrorCode.INVALID_HARNESS,
        message: "Harness metadata is missing or invalid",
        field: "metadata",
      });
    }

    if (
      !candidate.definition ||
      typeof candidate.definition.coreVersion !== "string"
    ) {
      throw new RuntimeError({
        code: RuntimeErrorCode.INVALID_HARNESS,
        message: "Harness definition is missing or invalid",
        field: "definition",
        harnessName: candidate.metadata.name,
      });
    }
  }
}

/**
 * Public entry: create a Runtime from a ready Harness.
 */
export async function createRuntime(
  harness: Harness,
  options: CreateRuntimeOptions = {},
): Promise<Runtime> {
  return new RuntimeBuilder().build(harness, options);
}

function generateRuntimeId(): string {
  const rand =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `runtime-${rand}`;
}

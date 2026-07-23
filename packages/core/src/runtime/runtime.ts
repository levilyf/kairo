/**
 * Runtime — lightweight execution host.
 *
 * Consumes a ready Harness. Does not compose modules.
 * Coordinates future execution services; does not implement them.
 *
 * Owns:
 * - execution lifecycle / state
 * - runtime metadata
 * - cancellation root
 * - harness handle
 * - service extension slots (placeholders)
 *
 * Does NOT own:
 * ModuleHost composition, Session, Turn, Context, Assembler,
 * AI product features / vendor adapters.
 *
 * Source of truth: docs/CORE.md, docs/CONTRACTS.md, docs/HARNESS.md
 */

import type { AgentLoop } from "../agent-loop/loop.js";
import type { ContextAssembler } from "../context-assembler/assembler.js";
import type { EventBus } from "../events/event-bus.js";
import type { Harness } from "../harness/harness.js";
import type { PolicyManager } from "../policy/policy-manager.js";
import type { ProviderGateway } from "../provider-gateway/gateway.js";
import type { SessionManager } from "../session/manager.js";
import type { ToolRouter } from "../tool-router/router.js";
import type { CancellationRoot } from "./cancellation.js";
import { RuntimeError, RuntimeErrorCode } from "./errors.js";
import type { RuntimeMetadata } from "./metadata.js";
import type { RuntimeServices, RuntimeStatus } from "./state.js";

export interface RuntimeOptions {
  harness: Harness;
  metadata: RuntimeMetadata;
  cancellation: CancellationRoot;
  events: EventBus;
  policy: PolicyManager;
  sessions: SessionManager;
  providers: ProviderGateway;
  tools: ToolRouter;
  context: ContextAssembler;
  agentLoop: AgentLoop;
  services?: RuntimeServices;
}

/**
 * A ready (or stopped) execution host bound to one Harness.
 *
 * Constructed only by RuntimeBuilder after validation.
 */
export class Runtime {
  readonly harness: Harness;
  readonly metadata: RuntimeMetadata;
  readonly cancellation: CancellationRoot;

  /** Runtime event bus — the nervous system of the runtime. */
  readonly events: EventBus;

  /** Policy hook coordinator. Core owns enforcement points, not policy logic. */
  readonly policy: PolicyManager;

  /** Session lifecycle manager. Runtime owns it; SessionManager owns sessions. */
  readonly sessions: SessionManager;

  /** Provider Gateway — sole Core path to Provider.complete() / Provider.stream(). */
  readonly providers: ProviderGateway;

  /** Tool Router — sole Core path to Tool.execute(). */
  readonly tools: ToolRouter;

  /** Context Assembler used by the Agent Loop (and available for direct use). */
  readonly context: ContextAssembler;

  /** Agent Loop — abstract turn orchestration algorithm. */
  readonly agentLoop: AgentLoop;

  /**
   * Extension slots for future execution services.
   * Remaining slots attach later without redesigning Runtime.
   */
  readonly services: RuntimeServices;

  private _status: RuntimeStatus = "ready";

  constructor(options: RuntimeOptions) {
    this.harness = options.harness;
    this.metadata = options.metadata;
    this.cancellation = options.cancellation;
    this.events = options.events;
    this.policy = options.policy;
    this.sessions = options.sessions;
    this.providers = options.providers;
    this.tools = options.tools;
    this.context = options.context;
    this.agentLoop = options.agentLoop;
    this.services = Object.freeze({ ...(options.services ?? {}) });
  }

  get status(): RuntimeStatus {
    return this._status;
  }

  /**
   * Shut down the execution host.
   *
   * - aborts the cancellation root
   * - transitions to stopped
   * - does NOT stop the Harness (composition ownership stays with the caller)
   * - does NOT restart
   *
   * Double shutdown is rejected.
   */
  async shutdown(): Promise<void> {
    if (this._status === "stopped") {
      throw new RuntimeError({
        code: RuntimeErrorCode.INVALID_STATE,
        message: "Runtime is already stopped",
        runtimeId: this.metadata.id,
        harnessName: this.metadata.harnessName,
      });
    }
    if (this._status === "shutting_down") {
      throw new RuntimeError({
        code: RuntimeErrorCode.INVALID_STATE,
        message: "Runtime is already shutting down",
        runtimeId: this.metadata.id,
        harnessName: this.metadata.harnessName,
      });
    }

    this._status = "shutting_down";
    try {
      await this.sessions.close();
      this.policy.close();
      this.events.close();
      this.cancellation.abort("runtime.shutdown");
      // Future: dispose attached services in reverse order.
    } catch (error) {
      throw new RuntimeError({
        code: RuntimeErrorCode.SHUTDOWN_FAILED,
        message:
          error instanceof Error ? error.message : "Runtime shutdown failed",
        runtimeId: this.metadata.id,
        harnessName: this.metadata.harnessName,
        cause: error,
      });
    } finally {
      this._status = "stopped";
    }
  }
}

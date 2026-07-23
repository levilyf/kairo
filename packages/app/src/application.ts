/**
 * Application — the immutable composition root exposed by @kairo/app.
 *
 * `createApplication({ config })` runs the full bootstrap pipeline:
 *   KairoConfig
 *     → ProviderRegistry (built-in factories registered + configured)
 *     → providers (one per config.providers[id])
 *     → each provider wrapped as a ModuleSource contributing "provider"
 *     → defineHarness(...)
 *     → createHarness(...)  (boots ModuleHost + ContributionBinder)
 *     → createRuntime(harness)
 *     → immutable Application frozen and returned
 *
 * The Application object owns the resulting handles and a small
 * lifecycle flag (`started`). `start()` and `stop()` are app-owned
 * markers; Core's Runtime itself is created in `ready` state and does
 * not have a "start" hook (it does have `shutdown()`). The application
 * layer therefore models "in use" itself so the CLI/TUI have a single
 * place to ask "is the app running?" without coupling to Core internals.
 */

import type { KairoConfig } from "@kairo/config";
import type { Harness, Provider, Runtime } from "@kairo/core";
import type { ProviderRegistry } from "@kairo/provider-registry";

import {
  ApplicationError,
  ApplicationErrorCode,
} from "./errors.js";
import {
  bootstrapProviderRegistry,
  type BootstrappedRegistry,
} from "./registry-bootstrap.js";
import {
  buildHarness,
  buildRuntime,
  type HarnessBootstrapOptions,
} from "./harness-bootstrap.js";

export interface CreateApplicationOptions {
  /** The already-loaded KairoConfig to bootstrap from. */
  readonly config: KairoConfig;
  /** Overrides for the synthesized Harness. Optional. */
  readonly harness?: HarnessBootstrapOptions;
}

/**
 * The immutable composition root returned by `createApplication()`.
 *
 * Surfaces the bootstrapped Registry, Harness, Runtime, and the list of
 * constructed providers. The object is frozen at construction; state
 * transitions (`start`, `stop`) operate on an internal flag, not on
 * the surfaced properties.
 */
export interface Application {
  /** The KairoConfig this Application was bootstrapped from. */
  readonly config: KairoConfig;
  /** The provider registry, populated with configured providers. */
  readonly registry: ProviderRegistry;
  /** The ready Harness. */
  readonly harness: Harness;
  /** The ready Runtime bound to the Harness. */
  readonly runtime: Runtime;
  /** Constructed provider instances, in configuration order. */
  readonly providers: readonly Provider[];
  /** Current lifecycle status owned by the application layer. */
  readonly status: ApplicationStatus;
  /** Mark the application as started. Idempotent-rejects on second call. */
  start(): Promise<void>;
  /** Mark the application as stopped and shut down the Runtime. */
  stop(): Promise<void>;
}

export type ApplicationStatus = "ready" | "started" | "stopped";

/**
 * Bootstrap a Kairo application from an already-loaded KairoConfig.
 *
 * Performs all wiring (registry + harness + runtime) inside this
 * package so the CLI and TUI never have to assemble Core pieces.
 */
export async function createApplication(
  options: CreateApplicationOptions,
): Promise<Application> {
  if (options === null || typeof options !== "object") {
    throw new ApplicationError({
      code: ApplicationErrorCode.BOOTSTRAP_FAILED,
      message: "createApplication() requires an options object",
    });
  }
  const config = options.config;
  if (config === null || typeof config !== "object") {
    throw new ApplicationError({
      code: ApplicationErrorCode.BOOTSTRAP_FAILED,
      message: "createApplication() requires a KairoConfig object",
    });
  }

  // 1. Provider registry + provider construction.
  let bootstrapped: BootstrappedRegistry;
  try {
    bootstrapped = bootstrapProviderRegistry(config);
  } catch (cause) {
    // bootstrapProviderRegistry wraps with ApplicationError already; rethrow.
    if (cause instanceof ApplicationError) throw cause;
    throw new ApplicationError({
      code: ApplicationErrorCode.BOOTSTRAP_FAILED,
      message:
        cause instanceof Error
          ? `provider bootstrap failed: ${cause.message}`
          : "provider bootstrap failed",
      ...(cause instanceof Error ? { cause } : {}),
    });
  }

  // 2. Harness definition + build (ModuleHost + ContributionBinder).
  let harness: Harness;
  try {
    harness = await buildHarness(bootstrapped.providers, options.harness ?? {});
  } catch (cause) {
    if (cause instanceof ApplicationError) throw cause;
    throw new ApplicationError({
      code: ApplicationErrorCode.BOOTSTRAP_FAILED,
      message:
        cause instanceof Error
          ? `harness bootstrap failed: ${cause.message}`
          : "harness bootstrap failed",
      ...(cause instanceof Error ? { cause } : {}),
    });
  }

  // 3. Runtime build.
  let runtime: Runtime;
  try {
    runtime = await buildRuntime(harness);
  } catch (cause) {
    // Best-effort cleanup: stop the harness we built, then surface the
    // wrapped failure.
    try {
      await harness.stop();
    } catch {
      // Preserve the original runtime-build failure as the primary error.
    }
    if (cause instanceof ApplicationError) throw cause;
    throw new ApplicationError({
      code: ApplicationErrorCode.BOOTSTRAP_FAILED,
      message:
        cause instanceof Error
          ? `runtime bootstrap failed: ${cause.message}`
          : "runtime bootstrap failed",
      ...(cause instanceof Error ? { cause } : {}),
    });
  }

  // 4. Assemble the immutable Application.
  return freezeApplication({
    config,
    registry: bootstrapped.registry,
    harness,
    runtime,
    providers: bootstrapped.providers,
  });
}

interface MutableApplication {
  config: KairoConfig;
  registry: ProviderRegistry;
  harness: Harness;
  runtime: Runtime;
  providers: readonly Provider[];
}

function freezeApplication(
  handles: MutableApplication,
): Application {
  const lifecycle = { status: "ready" as ApplicationStatus };

  // Frozen object literal with getters referencing the lifecycle object.
  const app: Application = Object.freeze({
    config: handles.config,
    registry: handles.registry,
    harness: handles.harness,
    runtime: handles.runtime,
    providers: handles.providers,
    get status(): ApplicationStatus {
      return lifecycle.status;
    },
    async start(): Promise<void> {
      if (lifecycle.status === "started") {
        throw new ApplicationError({
          code: ApplicationErrorCode.APPLICATION_ALREADY_STARTED,
          message: "Application has already been started",
        });
      }
      if (lifecycle.status === "stopped") {
        throw new ApplicationError({
          code: ApplicationErrorCode.APPLICATION_ALREADY_STARTED,
          message: "Application has already been stopped and cannot start again",
        });
      }
      // Core Runtime is already `ready`; nothing to do but flip the marker.
      lifecycle.status = "started";
    },
    async stop(): Promise<void> {
      if (lifecycle.status === "stopped") {
        throw new ApplicationError({
          code: ApplicationErrorCode.APPLICATION_NOT_STARTED,
          message: "Application has already been stopped",
        });
      }
      // Best-effort Runtime shutdown. Core's Runtime.shutdown() is idempotent
      // per `INVALID_STATE` on double call, but we catch for cleanliness.
      try {
        await handles.runtime.shutdown();
      } catch {
        // Continue: harness still needs to be stopped so ModuleHost unmounts.
      }
      // Harness unbind + ModuleHost shutdown.
      try {
        await handles.harness.stop();
      } catch {
        // Preserve forward progress: mark stopped regardless of harness error.
      }
      lifecycle.status = "stopped";
    },
  });

  return app;
}

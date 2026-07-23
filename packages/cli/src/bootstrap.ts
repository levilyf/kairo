/**
 * Bootstrap helper.
 *
 * The single place in the CLI that knows how to bridge `@kairo/config`
 * with an application factory. Two bridges share one config-loading and
 * one error-translation path:
 *
 *   - `loadApplication(ctx)`         → a generic `@kairo/app` Application
 *                                       (chat, models, provider, doctor).
 *   - `loadKairoCodeApplication(...)` → a `@kairo/harness-code`
 *                                       KairoCodeApplication (run).
 *
 * Both call `loadConfig`, translate `ConfigError` via `wrapConfigError`,
 * and translate creation failures via `wrapAppError`. The CLI never
 * imports @kairo/app, @kairo/config, or @kairo/harness-code for config
 * loading or application creation outside this file (plus `init`, which
 * writes a default config). Commands keep only their own concerns —
 * e.g. `run` still classifies harness *run* failures itself.
 */

import { loadConfig, ConfigError, ConfigErrorCode } from "@kairo/config";
import type { KairoConfig } from "@kairo/config";
import {
  createApplication,
  ApplicationError,
  ApplicationErrorCode,
  type Application,
} from "@kairo/app";
import {
  createKairoCodeApplication,
  type KairoCodeApplication,
  type CreateKairoCodeApplicationOptions,
} from "@kairo/harness-code";

import type { CLIContext } from "./context.js";
import { CLIError, CLIErrorCode } from "./errors.js";
import { withSpinner } from "./ui/index.js";

export interface LoadedApplication {
  readonly app: Application;
  readonly root: string;
  readonly configPath: string;
}

/**
 * Loads project config from `ctx.cwd` and bootstraps an Application.
 * Throws `CLIError(PROJECT_NOT_FOUND | CONFIG_LOAD_FAILED |
 * APPLICATION_BOOT_FAILED)` on any upstream failure.
 */
export async function loadApplication(
  ctx: CLIContext,
): Promise<LoadedApplication> {
  let loaded;
  try {
    loaded = await loadConfig({ cwd: ctx.cwd });
  } catch (cause) {
    throw wrapConfigError(cause);
  }
  let app: Application;
  try {
    app = await createApplication({ config: loaded.config });
  } catch (cause) {
    throw wrapAppError(cause);
  }
  return {
    app,
    root: loaded.root,
    configPath: loaded.path,
  };
}

/**
 * Injectable dependencies for the Kairo Code bridge. Production uses the
 * real config loader and harness factory; tests substitute a config that
 * carries a mock OpenAI-compatible `client` so the genuine
 * harness/runtime/protocol path runs with no network.
 */
export interface KairoCodeBridgeDeps {
  readonly loadConfig: (cwd: string) => Promise<{
    config: KairoConfig;
    root: string;
  }>;
  readonly createApplication: (
    options: CreateKairoCodeApplicationOptions,
  ) => Promise<KairoCodeApplication>;
}

/** The real config loader + harness factory. */
export const defaultKairoCodeBridgeDeps: KairoCodeBridgeDeps = {
  loadConfig: async (cwd: string) => {
    const loaded = await loadConfig({ cwd });
    return { config: loaded.config, root: loaded.root };
  },
  createApplication: (options) => createKairoCodeApplication(options),
};

export interface LoadKairoCodeOptions {
  readonly model?: string;
  readonly providerId?: string;
}

export interface LoadedKairoCodeApplication {
  readonly app: KairoCodeApplication;
  readonly config: KairoConfig;
  readonly root: string;
}

/**
 * Loads project config from `ctx.cwd` and bootstraps a Kairo Code
 * application, sharing `wrapConfigError` / `wrapAppError` with
 * `loadApplication`. Throws `CLIError(PROJECT_NOT_FOUND |
 * CONFIG_LOAD_FAILED | APPLICATION_BOOT_FAILED)` on any upstream failure.
 * The config loader and harness factory are injectable for tests.
 */
export async function loadKairoCodeApplication(
  ctx: CLIContext,
  options: LoadKairoCodeOptions = {},
  deps: KairoCodeBridgeDeps = defaultKairoCodeBridgeDeps,
): Promise<LoadedKairoCodeApplication> {
  const { config, root } = await withSpinner(
    ctx,
    "Loading configuration...",
    "Configuration loaded",
    async () => {
      try {
        return await deps.loadConfig(ctx.cwd);
      } catch (cause) {
        throw wrapConfigError(cause);
      }
    },
  );

  const app = await withSpinner(
    ctx,
    "Starting Kairo Code...",
    "Kairo Code ready",
    async () => {
      try {
        return await deps.createApplication({
          config,
          workspaceRoot: root,
          ...(options.model !== undefined ? { model: options.model } : {}),
          ...(options.providerId !== undefined
            ? { providerId: options.providerId }
            : {}),
        });
      } catch (cause) {
        throw wrapAppError(cause);
      }
    },
  );

  return { app, config, root };
}

function wrapConfigError(cause: unknown): CLIError {
  if (cause instanceof CLIError) return cause;
  if (cause instanceof ConfigError) {
    if (cause.code === ConfigErrorCode.PROJECT_NOT_FOUND) {
      return new CLIError({
        code: CLIErrorCode.PROJECT_NOT_FOUND,
        message: cause.message,
        hint: "Run: kairo init",
        ...(cause.path !== undefined ? {} : {}),
        ...(cause instanceof Error ? { cause } : {}),
      });
    }
    return new CLIError({
      code: CLIErrorCode.CONFIG_LOAD_FAILED,
      message: cause.message,
      hint: "Run: kairo doctor",
      ...(cause instanceof Error ? { cause } : {}),
    });
  }
  return new CLIError({
    code: CLIErrorCode.CONFIG_LOAD_FAILED,
    message: cause instanceof Error ? cause.message : "configuration loading failed",
    ...(cause instanceof Error ? { cause } : {}),
  });
}

function wrapAppError(cause: unknown): CLIError {
  if (cause instanceof CLIError) return cause;
  if (cause instanceof ApplicationError) {
    // Treat both BOOTSTRAP_FAILED and PROVIDER_REGISTRATION_FAILED as boot failures.
    const code =
      cause.code === ApplicationErrorCode.APPLICATION_ALREADY_STARTED ||
      cause.code === ApplicationErrorCode.APPLICATION_NOT_STARTED
        ? CLIErrorCode.APPLICATION_BOOT_FAILED
        : CLIErrorCode.APPLICATION_BOOT_FAILED;
    return new CLIError({
      code,
      message: cause.message,
      hint: "Run: kairo doctor",
      ...(cause instanceof Error ? { cause } : {}),
    });
  }
  return new CLIError({
    code: CLIErrorCode.APPLICATION_BOOT_FAILED,
    message:
      cause instanceof Error ? cause.message : "application bootstrap failed",
    ...(cause instanceof Error ? { cause } : {}),
  });
}

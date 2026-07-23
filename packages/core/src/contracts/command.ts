/**
 * Command contract.
 *
 * Discrete, addressable entrypoints for users, UIs, and automation.
 * Distinct from Tool: intentional operator/user invocation, not model tool-calls.
 *
 * Source of truth: docs/CONTRACTS.md (Command)
 */

import { ContractError, ContractErrorCode } from "./errors.js";
import type { JsonSchema } from "./json-schema.js";

export interface CommandResult {
  ok: boolean;
  message?: string;
  data?: unknown;
  errorCode?: string;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface CommandExecuteContext {
  signal?: AbortSignal;
  grantedPermissions?: ReadonlySet<string>;
  metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Command contract.
 *
 * Implementations must:
 * - declare identity, usage intent, and parameters
 * - perform a bounded action or dispatch into runtime flows
 * - produce user/operator-meaningful results or errors
 * - respect permissions and harness exposure rules
 */
export interface Command {
  /** Stable unique identifier (namespaced). */
  readonly id: string;
  /** Invocation name (slash command / CLI subcommand style label). */
  readonly name: string;
  /** What the command does. */
  readonly description: string;
  /** Parameter contract (JSON-Schema-like). */
  readonly parameters: JsonSchema;
  /** Optional permission names this command requires. */
  readonly permissions?: readonly string[];
  execute(
    args?: Readonly<Record<string, unknown>>,
    context?: CommandExecuteContext,
  ): Promise<CommandResult>;
}

export function assertCommand(value: unknown): asserts value is Command {
  if (!isPlainObject(value)) {
    throw invalid("command", "Command must be an object");
  }
  assertNonEmptyString(value.id, "id");
  assertNonEmptyString(value.name, "name", value.id);
  assertNonEmptyString(value.description, "description", value.id);
  if (!isPlainObject(value.parameters)) {
    throw invalid(
      "command",
      "parameters must be an object",
      "parameters",
      value.id,
    );
  }
  if (typeof value.execute !== "function") {
    throw invalid("command", "execute must be a function", "execute", value.id);
  }
}

function invalid(
  contract: "command",
  message: string,
  field?: string,
  id?: string,
): ContractError {
  return new ContractError({
    code: ContractErrorCode.INVALID_CONTRACT,
    message,
    contract,
    ...(field !== undefined ? { field } : {}),
    ...(id !== undefined ? { id } : {}),
  });
}

function assertNonEmptyString(
  value: unknown,
  field: string,
  id?: string,
): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw invalid("command", `${field} must be a non-empty string`, field, id);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

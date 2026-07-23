/**
 * Tool contract.
 *
 * Invocable capabilities for the future agent loop.
 * Domain-neutral: no bash, files, browser, or coding assumptions.
 *
 * Source of truth: docs/CONTRACTS.md (Tool)
 *
 * Tools are not Commands. Contracts remain distinct.
 */

import { ContractError, ContractErrorCode } from "./errors.js";
import type { JsonSchema } from "./json-schema.js";

export interface ToolResult {
  /** Whether the tool considers the invocation successful. */
  ok: boolean;
  /** Structured payload for the runtime to continue. */
  data?: unknown;
  /** Human/operator-meaningful error or status text. */
  message?: string;
  /** Optional error code for attributed failures. */
  errorCode?: string;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface ToolExecuteContext {
  /** Abort signal for cancellation. */
  signal?: AbortSignal;
  /** Permissions granted to the invoking composition (informational). */
  grantedPermissions?: ReadonlySet<string>;
  /** Opaque invocation metadata from the runtime. */
  metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Tool contract.
 *
 * Implementations must:
 * - declare identity, description, and parameter contract
 * - execute only within granted permissions
 * - return structured results
 * - fail in attributed, observable ways
 * - avoid hidden ambient authority
 */
export interface Tool {
  /** Stable unique identifier (namespaced). */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** What the tool does. */
  readonly description: string;
  /** Parameter contract (JSON-Schema-like). */
  readonly parameters: JsonSchema;
  /** Optional permission names this tool requires. */
  readonly permissions?: readonly string[];
  execute(
    args: Readonly<Record<string, unknown>>,
    context?: ToolExecuteContext,
  ): Promise<ToolResult>;
}

export function assertTool(value: unknown): asserts value is Tool {
  if (!isPlainObject(value)) {
    throw invalid("tool", "Tool must be an object");
  }
  assertNonEmptyString(value.id, "id");
  assertNonEmptyString(value.name, "name", value.id);
  assertNonEmptyString(value.description, "description", value.id);
  if (!isPlainObject(value.parameters)) {
    throw invalid("tool", "parameters must be an object", "parameters", value.id);
  }
  if (typeof value.execute !== "function") {
    throw invalid("tool", "execute must be a function", "execute", value.id);
  }
}

function invalid(
  contract: "tool",
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
    throw invalid("tool", `${field} must be a non-empty string`, field, id);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

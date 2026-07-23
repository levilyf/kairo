/**
 * Contract validation / registry errors.
 *
 * Distinct from ModuleError and HarnessError: these attribute failures to
 * contract identity (provider/tool/command/ui) and registration lookup rules.
 */

export type ContractName =
  | "provider"
  | "tool"
  | "command"
  | "ui"
  | "runtime-event";

export enum ContractErrorCode {
  INVALID_CONTRACT = "INVALID_CONTRACT",
  DUPLICATE_ID = "DUPLICATE_ID",
  NOT_FOUND = "NOT_FOUND",
}

export interface ContractErrorOptions {
  code: ContractErrorCode;
  message: string;
  contract: ContractName;
  field?: string;
  id?: string;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class ContractError extends Error {
  readonly code: ContractErrorCode;
  readonly contract: ContractName;
  readonly field?: string;
  readonly id?: string;
  readonly details?: Record<string, unknown>;
  override readonly cause?: unknown;

  constructor(options: ContractErrorOptions) {
    const parts = [
      `contract=${options.contract}`,
      options.id ? `id=${options.id}` : undefined,
      options.field ? `field=${options.field}` : undefined,
    ].filter(Boolean);
    super(`[${parts.join(" ")}] ${options.message}`, { cause: options.cause });
    this.name = "ContractError";
    this.code = options.code;
    this.contract = options.contract;
    if (options.field !== undefined) this.field = options.field;
    if (options.id !== undefined) this.id = options.id;
    if (options.details !== undefined) this.details = options.details;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

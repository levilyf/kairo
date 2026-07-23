/**
 * Tool argument validation against declared parameter contracts.
 *
 * Structural, fail-closed validation over the thin JsonSchema type.
 * Not a full JSON Schema engine — covers the Core contract subset:
 * type, properties, required, items, enum, additionalProperties.
 *
 * Source of truth: docs/CONTRACTS.md (Tool — generic validation)
 */

import type { JsonSchema, JsonSchemaType } from "../contracts/json-schema.js";
import {
  ToolRouterError,
  ToolRouterErrorCode,
  type ToolRouterErrorOptions,
} from "./errors.js";

export interface ValidateToolArgumentsOptions {
  readonly toolId?: string;
  readonly sessionId?: string;
  readonly turnId?: string;
  readonly runtimeId?: string;
}

/**
 * Validate tool args against a tool's declared parameter schema.
 * Throws ToolRouterError with INVALID_ARGUMENTS on failure.
 */
export function validateToolArguments(
  args: unknown,
  schema: JsonSchema,
  options: ValidateToolArgumentsOptions = {},
): asserts args is Readonly<Record<string, unknown>> {
  const attribution = pickAttribution(options);
  validateValue(args, schema, "args", attribution);
}

function validateValue(
  value: unknown,
  schema: JsonSchema,
  path: string,
  attribution: Pick<
    ToolRouterErrorOptions,
    "toolId" | "sessionId" | "turnId" | "runtimeId"
  >,
): void {
  if (schema.enum !== undefined) {
    const allowed = schema.enum;
    if (!allowed.some((candidate) => Object.is(candidate, value))) {
      throw invalid(
        `${path} must be one of: ${allowed.map(String).join(", ")}`,
        path,
        attribution,
        { value, enum: allowed },
      );
    }
  }

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => matchesType(value, type))) {
      throw invalid(
        `${path} must be of type ${types.join(" | ")}`,
        path,
        attribution,
        { value, expectedType: types },
      );
    }
  }

  if (isObjectSchema(schema) && isPlainObject(value)) {
    const required = schema.required ?? [];
    for (const key of required) {
      if (!(key in value) || value[key] === undefined) {
        throw invalid(
          `Missing required argument "${key}"`,
          path === "args" ? key : `${path}.${key}`,
          attribution,
        );
      }
    }

    const properties = schema.properties ?? {};
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (key in value && value[key] !== undefined) {
        validateValue(
          value[key],
          propertySchema,
          path === "args" ? key : `${path}.${key}`,
          attribution,
        );
      }
    }

    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) {
          throw invalid(
            `Unexpected argument "${key}"`,
            path === "args" ? key : `${path}.${key}`,
            attribution,
          );
        }
      }
    } else if (
      schema.additionalProperties !== undefined &&
      schema.additionalProperties !== true
    ) {
      for (const [key, child] of Object.entries(value)) {
        if (!(key in properties)) {
          validateValue(
            child,
            schema.additionalProperties,
            path === "args" ? key : `${path}.${key}`,
            attribution,
          );
        }
      }
    }
  }

  if (
    schema.items !== undefined &&
    Array.isArray(value) &&
    (schema.type === undefined ||
      schema.type === "array" ||
      (Array.isArray(schema.type) && schema.type.includes("array")))
  ) {
    value.forEach((item, index) => {
      validateValue(item, schema.items!, `${path}[${index}]`, attribution);
    });
  }
}

function matchesType(value: unknown, type: JsonSchemaType): boolean {
  switch (type) {
    case "object":
      return isPlainObject(value);
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value);
    case "null":
      return value === null;
    default:
      return false;
  }
}

function isObjectSchema(schema: JsonSchema): boolean {
  if (schema.type === undefined) {
    return (
      schema.properties !== undefined ||
      schema.required !== undefined ||
      schema.additionalProperties !== undefined
    );
  }
  if (Array.isArray(schema.type)) {
    return schema.type.includes("object");
  }
  return schema.type === "object";
}

function invalid(
  message: string,
  field: string,
  attribution: Pick<
    ToolRouterErrorOptions,
    "toolId" | "sessionId" | "turnId" | "runtimeId"
  >,
  details?: Record<string, unknown>,
): ToolRouterError {
  return new ToolRouterError({
    code: ToolRouterErrorCode.INVALID_ARGUMENTS,
    message,
    field,
    ...attribution,
    ...(details !== undefined ? { details } : {}),
  });
}

function pickAttribution(
  options: ValidateToolArgumentsOptions,
): Pick<ToolRouterErrorOptions, "toolId" | "sessionId" | "turnId" | "runtimeId"> {
  return {
    ...(options.toolId !== undefined ? { toolId: options.toolId } : {}),
    ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
    ...(options.turnId !== undefined ? { turnId: options.turnId } : {}),
    ...(options.runtimeId !== undefined ? { runtimeId: options.runtimeId } : {}),
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Minimal JSON-Schema-like parameter descriptor used by Tool and Command.
 *
 * Not a full JSON Schema implementation — only a stable structural type for
 * declaring parameter contracts. Validation engines may arrive later.
 */

export type JsonSchemaType =
  | "object"
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "array"
  | "null";

export interface JsonSchema {
  type?: JsonSchemaType | JsonSchemaType[];
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: ReadonlyArray<string | number | boolean | null>;
  additionalProperties?: boolean | JsonSchema;
  [key: string]: unknown;
}

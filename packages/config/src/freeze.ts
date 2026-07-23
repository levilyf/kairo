/**
 * Shared deep-freeze helper. Kept separate so both validate and resolve
 * can use it without creating a circular import on errors.ts.
 */

export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
  } else {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  Object.freeze(value);
  return value;
}

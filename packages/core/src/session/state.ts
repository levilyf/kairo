/**
 * Session lifecycle state.
 *
 * Intentionally minimal: turns and context attach in later milestones.
 */

export type SessionState = "ready" | "closing" | "closed";

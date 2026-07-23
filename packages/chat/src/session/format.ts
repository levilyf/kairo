/**
 * JSONL session record format (v:1).
 *
 * Lines under `.kairo/sessions/<sessionId>.jsonl`:
 *   session.start | message | session.end
 */

import type { ChatMessage } from "../types.js";

export const SESSION_FORMAT_VERSION = 1 as const;

export type SessionRecord =
  | SessionStartRecord
  | SessionMessageRecord
  | SessionEndRecord;

export interface SessionStartRecord {
  readonly v: typeof SESSION_FORMAT_VERSION;
  readonly type: "session.start";
  readonly sessionId: string;
  readonly createdAt: string;
  readonly model: string;
  readonly providerId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface SessionMessageRecord {
  readonly v: typeof SESSION_FORMAT_VERSION;
  readonly type: "message";
  readonly role: string;
  readonly content: ChatMessage["content"];
  readonly name?: string;
  readonly at: string;
}

export interface SessionEndRecord {
  readonly v: typeof SESSION_FORMAT_VERSION;
  readonly type: "session.end";
  readonly sessionId: string;
  readonly endedAt: string;
  readonly reason?: string;
}

export function isSessionRecord(value: unknown): value is SessionRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const rec = value as Record<string, unknown>;
  if (rec.v !== SESSION_FORMAT_VERSION) return false;
  if (typeof rec.type !== "string") return false;
  if (rec.type === "session.start") {
    return (
      typeof rec.sessionId === "string" &&
      typeof rec.createdAt === "string" &&
      typeof rec.model === "string"
    );
  }
  if (rec.type === "message") {
    return typeof rec.role === "string" && Array.isArray(rec.content);
  }
  if (rec.type === "session.end") {
    return typeof rec.sessionId === "string" && typeof rec.endedAt === "string";
  }
  return false;
}

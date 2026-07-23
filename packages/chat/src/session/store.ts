/**
 * JSONL session store under `.kairo/sessions/`.
 *
 * Chat owns durable history. Core Session remains non-persistent.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

import { ChatError, ChatErrorCode } from "../errors.js";
import type { ChatMessage } from "../types.js";
import {
  isSessionRecord,
  SESSION_FORMAT_VERSION,
  type SessionEndRecord,
  type SessionMessageRecord,
  type SessionRecord,
  type SessionStartRecord,
} from "./format.js";

export interface SessionStoreOptions {
  /** Project root (cwd). Sessions live at `<root>/.kairo/sessions/`. */
  readonly rootDir: string;
  /** Optional clock for tests. */
  readonly now?: () => Date;
  /** Optional id generator for tests. */
  readonly createId?: () => string;
}

export interface OpenSessionOptions {
  readonly model: string;
  readonly providerId?: string;
  readonly sessionId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface LoadedSession {
  readonly sessionId: string;
  readonly model: string;
  readonly providerId?: string;
  readonly messages: readonly ChatMessage[];
  readonly createdAt: string;
  readonly ended: boolean;
}

export class SessionStore {
  private readonly rootDir: string;
  private readonly sessionsDir: string;
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(options: SessionStoreOptions) {
    if (
      options === null ||
      typeof options !== "object" ||
      typeof options.rootDir !== "string" ||
      options.rootDir.trim().length === 0
    ) {
      throw new ChatError({
        code: ChatErrorCode.INVALID_OPTIONS,
        message: "SessionStore requires a non-empty rootDir",
        field: "rootDir",
      });
    }
    this.rootDir = options.rootDir;
    this.sessionsDir = path.join(this.rootDir, ".kairo", "sessions");
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? (() => randomUUID());
  }

  get directory(): string {
    return this.sessionsDir;
  }

  sessionPath(sessionId: string): string {
    return path.join(this.sessionsDir, `${sessionId}.jsonl`);
  }

  async ensureDir(): Promise<void> {
    try {
      await fs.mkdir(this.sessionsDir, { recursive: true });
    } catch (cause) {
      throw new ChatError({
        code: ChatErrorCode.SESSION_IO,
        message: `Cannot create sessions directory "${this.sessionsDir}"`,
        cause,
      });
    }
  }

  /**
   * Create a new session file and write session.start.
   */
  async create(options: OpenSessionOptions): Promise<LoadedSession> {
    if (typeof options.model !== "string" || options.model.trim().length === 0) {
      throw new ChatError({
        code: ChatErrorCode.MODEL_REQUIRED,
        message: "model is required to create a session",
        field: "model",
      });
    }
    await this.ensureDir();
    const sessionId =
      options.sessionId !== undefined && options.sessionId.trim().length > 0
        ? options.sessionId.trim()
        : this.createId();
    const createdAt = this.now().toISOString();
    const start: SessionStartRecord = {
      v: SESSION_FORMAT_VERSION,
      type: "session.start",
      sessionId,
      createdAt,
      model: options.model.trim(),
      ...(options.providerId !== undefined
        ? { providerId: options.providerId }
        : {}),
      ...(options.metadata !== undefined ? { metadata: options.metadata } : {}),
    };
    await this.writeLine(sessionId, start);
    return {
      sessionId,
      model: start.model,
      ...(start.providerId !== undefined
        ? { providerId: start.providerId }
        : {}),
      messages: Object.freeze([]),
      createdAt,
      ended: false,
    };
  }

  /**
   * Load an existing session by id. Fails closed if missing/corrupt.
   */
  async load(sessionId: string): Promise<LoadedSession> {
    if (typeof sessionId !== "string" || sessionId.trim().length === 0) {
      throw new ChatError({
        code: ChatErrorCode.INVALID_OPTIONS,
        message: "sessionId is required",
        field: "sessionId",
      });
    }
    const file = this.sessionPath(sessionId.trim());
    let raw: string;
    try {
      raw = await fs.readFile(file, "utf8");
    } catch (cause) {
      const err = cause as NodeJS.ErrnoException;
      if (err?.code === "ENOENT") {
        throw new ChatError({
          code: ChatErrorCode.SESSION_NOT_FOUND,
          message: `Session "${sessionId}" was not found`,
          sessionId,
          cause,
        });
      }
      throw new ChatError({
        code: ChatErrorCode.SESSION_IO,
        message: `Cannot read session "${sessionId}"`,
        sessionId,
        cause,
      });
    }

    const records = this.parseLines(raw, sessionId);
    return this.materialize(records, sessionId);
  }

  /**
   * Resolve "last" → most recently modified .jsonl session id.
   */
  async resolveLast(): Promise<string> {
    await this.ensureDir();
    let entries: string[];
    try {
      entries = await fs.readdir(this.sessionsDir);
    } catch (cause) {
      throw new ChatError({
        code: ChatErrorCode.SESSION_IO,
        message: "Cannot list sessions directory",
        cause,
      });
    }
    const files = entries.filter((name) => name.endsWith(".jsonl"));
    if (files.length === 0) {
      throw new ChatError({
        code: ChatErrorCode.SESSION_NOT_FOUND,
        message: "No previous chat session found",
      });
    }

    let best: { id: string; mtimeMs: number } | undefined;
    for (const name of files) {
      const full = path.join(this.sessionsDir, name);
      try {
        const stat = await fs.stat(full);
        if (best === undefined || stat.mtimeMs > best.mtimeMs) {
          best = {
            id: name.slice(0, -".jsonl".length),
            mtimeMs: stat.mtimeMs,
          };
        }
      } catch {
        // skip unreadable
      }
    }
    if (best === undefined) {
      throw new ChatError({
        code: ChatErrorCode.SESSION_NOT_FOUND,
        message: "No previous chat session found",
      });
    }
    return best.id;
  }

  async appendMessage(
    sessionId: string,
    message: ChatMessage,
  ): Promise<void> {
    const record: SessionMessageRecord = {
      v: SESSION_FORMAT_VERSION,
      type: "message",
      role: message.role,
      content: message.content,
      ...(message.name !== undefined ? { name: message.name } : {}),
      at: this.now().toISOString(),
    };
    await this.writeLine(sessionId, record);
  }

  async end(
    sessionId: string,
    reason?: string,
  ): Promise<void> {
    const record: SessionEndRecord = {
      v: SESSION_FORMAT_VERSION,
      type: "session.end",
      sessionId,
      endedAt: this.now().toISOString(),
      ...(reason !== undefined ? { reason } : {}),
    };
    await this.writeLine(sessionId, record);
  }

  private async writeLine(
    sessionId: string,
    record: SessionRecord,
  ): Promise<void> {
    await this.ensureDir();
    const file = this.sessionPath(sessionId);
    try {
      await fs.appendFile(file, JSON.stringify(record) + "\n", "utf8");
    } catch (cause) {
      throw new ChatError({
        code: ChatErrorCode.SESSION_IO,
        message: `Cannot write session "${sessionId}"`,
        sessionId,
        cause,
      });
    }
  }

  private parseLines(raw: string, sessionId: string): SessionRecord[] {
    const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length === 0) {
      throw new ChatError({
        code: ChatErrorCode.SESSION_CORRUPT,
        message: `Session "${sessionId}" is empty`,
        sessionId,
      });
    }
    const records: SessionRecord[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch (cause) {
        throw new ChatError({
          code: ChatErrorCode.SESSION_CORRUPT,
          message: `Session "${sessionId}" has invalid JSON on line ${i + 1}`,
          sessionId,
          cause,
          details: { line: i + 1 },
        });
      }
      if (!isSessionRecord(parsed)) {
        throw new ChatError({
          code: ChatErrorCode.SESSION_CORRUPT,
          message: `Session "${sessionId}" has invalid record on line ${i + 1}`,
          sessionId,
          details: { line: i + 1 },
        });
      }
      records.push(parsed);
    }
    return records;
  }

  private materialize(
    records: readonly SessionRecord[],
    expectedId: string,
  ): LoadedSession {
    const start = records[0];
    if (start === undefined || start.type !== "session.start") {
      throw new ChatError({
        code: ChatErrorCode.SESSION_CORRUPT,
        message: `Session "${expectedId}" is missing session.start`,
        sessionId: expectedId,
      });
    }
    if (start.sessionId !== expectedId) {
      throw new ChatError({
        code: ChatErrorCode.SESSION_CORRUPT,
        message: `Session file id mismatch: expected "${expectedId}", got "${start.sessionId}"`,
        sessionId: expectedId,
      });
    }

    const messages: ChatMessage[] = [];
    let ended = false;
    for (const record of records.slice(1)) {
      if (record.type === "message") {
        messages.push({
          role: record.role,
          content: record.content,
          ...(record.name !== undefined ? { name: record.name } : {}),
        });
      } else if (record.type === "session.end") {
        ended = true;
      } else if (record.type === "session.start") {
        throw new ChatError({
          code: ChatErrorCode.SESSION_CORRUPT,
          message: `Session "${expectedId}" has multiple session.start records`,
          sessionId: expectedId,
        });
      }
    }

    return {
      sessionId: start.sessionId,
      model: start.model,
      ...(start.providerId !== undefined
        ? { providerId: start.providerId }
        : {}),
      messages: Object.freeze([...messages]),
      createdAt: start.createdAt,
      ended,
    };
  }
}

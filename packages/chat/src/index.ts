/**
 * @kairo/chat — streaming chat engine, JSONL sessions, progressive renderer, REPL.
 *
 * Depends on @kairo/core + @kairo/app only.
 * Owns no providers, config loading, CLI parsing, or full-screen TUI.
 */

export { ChatError, ChatErrorCode, type ChatErrorOptions } from "./errors.js";
export type { ChatIO, ChatMessage, ChatRole } from "./types.js";

export {
  SessionStore,
  type SessionStoreOptions,
  type OpenSessionOptions,
  type LoadedSession,
} from "./session/store.js";
export {
  SESSION_FORMAT_VERSION,
  isSessionRecord,
  type SessionRecord,
  type SessionStartRecord,
  type SessionMessageRecord,
  type SessionEndRecord,
} from "./session/format.js";

export {
  ProgressiveRenderer,
  type ProgressiveRendererOptions,
} from "./renderer/progressive.js";

export {
  ChatEngine,
  type ChatEngineOptions,
  type StartChatOptions,
  type ChatTurnResult,
} from "./engine.js";

export {
  runChatRepl,
  type ChatReplOptions,
  type ChatReplResult,
} from "./repl.js";

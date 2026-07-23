/**
 * Public surface of the Kairo CLI UI component system.
 *
 * Every command draws through these helpers so the visual language is
 * consistent and centralized. Nothing here is hardcoded inside a
 * command body.
 */

export { renderLogo, LOGO_LINES, LOGO_TAGLINE } from "./logo.js";
export {
  heading,
  text,
  muted,
  success,
  warning,
  errorLine,
  separator,
  kv,
} from "./text.js";
export { table, emptyState, type TableSpec } from "./table.js";
export {
  prompt,
  select,
  type PromptOptions,
} from "./prompt.js";
export { makeRawPromptReader, type RawPromptOptions } from "./raw-prompt.js";
export { ConnectedFlow, type FlowPromptOptions } from "./flow.js";
export {
  startSpinner,
  withSpinner,
  type Spinner,
} from "./spinner.js";
export { selectTheme, type ColorTheme } from "./color.js";

/**
 * Kairo Code system prompt + the ContextBuilder module that contributes
 * it into the harness.
 *
 * The system prompt is a harness *opinion*. It reaches the model through
 * Core's normal composition path: a module contributes a `context.builder`
 * capability, the ContributionBinder wires it into the harness's
 * ContextBuilderRegistry, and the ContextAssembler merges its
 * `instructions` fragment into every assembled Context.
 *
 * The harness does not touch the Agent Loop, Provider Gateway, or any
 * Core mechanism to deliver this — it only contributes a builder.
 */

import type {
  ContextBuilder,
  Module,
  ModuleManifest,
  ModuleSource,
} from "@kairo/core";
import { createContextFragment } from "@kairo/core";

/**
 * The default Kairo Code system prompt.
 *
 * Intentionally minimal: identity and posture only. Tool definitions and
 * capability guidance are contributed by modules (e.g. workspace tools)
 * through normal context assembly — not hard-coded into this string.
 */
export const KAIRO_CODE_SYSTEM_PROMPT = [
  "You are Kairo Code, an AI coding assistant.",
  "You help developers understand, write, and improve software.",
  "Be direct and concise. Prefer correct, working solutions over speculation.",
  "When you are unsure, say so rather than guessing.",
].join(" ");

const SYSTEM_PROMPT_BUILDER_ID = "kairo.code/system-prompt";
const SYSTEM_PROMPT_MODULE_ID = "kairo.code/system-prompt";
const MODULE_VERSION = "0.1.0";

/**
 * Builds a ContextBuilder that contributes the given system prompt as a
 * single high-priority instruction fragment.
 */
export function createSystemPromptBuilder(prompt: string): ContextBuilder {
  return {
    id: SYSTEM_PROMPT_BUILDER_ID,
    name: "Kairo Code system prompt",
    description: "Contributes the Kairo Code system prompt as an instruction.",
    // Run first so the system prompt leads the assembled instructions.
    priority: 0,
    tags: Object.freeze(["instructions"]),
    build() {
      return {
        fragments: [createContextFragment({ instructions: [prompt] })],
      };
    },
  };
}

/**
 * Wraps the system-prompt ContextBuilder as a ModuleSource so it can be
 * composed into the harness via `extraModules`.
 */
export function createSystemPromptModule(prompt: string): ModuleSource {
  const manifest: ModuleManifest = {
    id: SYSTEM_PROMPT_MODULE_ID,
    name: "Kairo Code system prompt",
    version: MODULE_VERSION,
    description: "Contributes the Kairo Code system prompt.",
    capabilities: ["context.builder"],
    dependencies: [],
    permissions: [],
    compatibility: { min: "0.1.0" },
  };

  const builder = createSystemPromptBuilder(prompt);

  const module: Module = {
    manifest,
    async initialize(context) {
      context.registerContribution({
        capability: "context.builder",
        id: builder.id,
        value: builder,
      });
    },
  };

  return {
    manifest,
    load: async () => module,
  };
}

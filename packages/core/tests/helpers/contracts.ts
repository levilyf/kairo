import type {
  Command,
  Provider,
  Tool,
  UI,
} from "../../src/index.js";

export function makeProvider(
  id: string,
  overrides: Partial<Provider> = {},
): Provider {
  const provider: Provider = {
    id,
    name: overrides.name ?? id,
    capabilities: overrides.capabilities ?? {
      streaming: false,
      tools: false,
      modalities: ["text"],
    },
    complete:
      overrides.complete ??
      (async () => ({
        id: "resp",
        output: [{ type: "text", text: "ok" }],
        stopReason: "end",
      })),
    ...(overrides.stream !== undefined ? { stream: overrides.stream } : {}),
  };

  if (overrides.description !== undefined) {
    return { ...provider, description: overrides.description };
  }
  return provider;
}

export function makeTool(id: string, overrides: Partial<Tool> = {}): Tool {
  const tool: Tool = {
    id,
    name: overrides.name ?? id,
    description: overrides.description ?? `Tool ${id}`,
    parameters: overrides.parameters ?? { type: "object", properties: {} },
    execute:
      overrides.execute ??
      (async () => ({
        ok: true,
      })),
  };

  if (overrides.permissions !== undefined) {
    return { ...tool, permissions: overrides.permissions };
  }
  return tool;
}

export function makeCommand(
  id: string,
  overrides: Partial<Command> = {},
): Command {
  const command: Command = {
    id,
    name: overrides.name ?? id,
    description: overrides.description ?? `Command ${id}`,
    parameters: overrides.parameters ?? { type: "object", properties: {} },
    execute:
      overrides.execute ??
      (async () => ({
        ok: true,
      })),
  };

  if (overrides.permissions !== undefined) {
    return { ...command, permissions: overrides.permissions };
  }
  return command;
}

export function makeUI(id: string, overrides: Partial<UI> = {}): UI {
  const ui: UI = {
    id,
    name: overrides.name ?? id,
    onEvent: overrides.onEvent ?? (async () => {}),
    submit: overrides.submit ?? (async () => {}),
  };

  if (overrides.description !== undefined) {
    return { ...ui, description: overrides.description };
  }
  return ui;
}

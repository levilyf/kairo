import type {
  Module,
  ModuleManifest,
  ModuleSource,
} from "../../src/index.js";

export function createManifest(
  overrides: Partial<ModuleManifest> & Pick<ModuleManifest, "id">,
): ModuleManifest {
  return {
    name: overrides.name ?? overrides.id,
    version: overrides.version ?? "1.0.0",
    description: overrides.description ?? `Module ${overrides.id}`,
    capabilities: overrides.capabilities ?? [],
    dependencies: overrides.dependencies ?? [],
    permissions: overrides.permissions ?? [],
    compatibility: overrides.compatibility ?? { min: "0.1.0" },
    ...(overrides.optional !== undefined ? { optional: overrides.optional } : {}),
    id: overrides.id,
  };
}

export function createModule(
  manifest: ModuleManifest,
  hooks: Partial<
    Pick<Module, "load" | "initialize" | "start" | "stop" | "unload">
  > = {},
): Module {
  return {
    manifest,
    ...hooks,
  };
}

export function createSource(
  manifest: ModuleManifest,
  module: Module = createModule(manifest),
): ModuleSource {
  return {
    manifest,
    load: async () => module,
  };
}

export function createTrackingModule(manifest: ModuleManifest): {
  module: Module;
  calls: string[];
} {
  const calls: string[] = [];
  const module: Module = {
    manifest,
    async load() {
      calls.push("load");
    },
    async initialize() {
      calls.push("initialize");
    },
    async start() {
      calls.push("start");
    },
    async stop() {
      calls.push("stop");
    },
    async unload() {
      calls.push("unload");
    },
  };
  return { module, calls };
}

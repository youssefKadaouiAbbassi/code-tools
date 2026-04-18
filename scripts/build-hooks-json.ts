#!/usr/bin/env bun
// Regenerate hooks/hooks.json from src/hook-registry.ts — the single source
// of truth for hook event → matcher → script mappings. Run after touching
// HOOK_REGISTRATIONS in hook-registry.ts.
//
// Usage: bun scripts/build-hooks-json.ts
import { join, dirname } from "node:path";
import { buildHooksConfig } from "../src/hook-registry.js";

const repoRoot = join(dirname(new URL(import.meta.url).pathname), "..");
const outPath = join(repoRoot, "hooks", "hooks.json");

const hooks = buildHooksConfig((file) => ({
  type: "command",
  command: `\${CLAUDE_PLUGIN_ROOT}/configs/home-claude/hooks/${file}`,
}));

await Bun.write(outPath, JSON.stringify({ hooks }, null, 2) + "\n");
console.log(`wrote ${outPath} (${Object.keys(hooks).length} events)`);

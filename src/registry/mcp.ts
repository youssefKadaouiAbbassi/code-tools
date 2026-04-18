import { $ } from "bun";
import type { McpSpec } from "../types.js";
import { commandExists } from "../utils.js";

export function requireClaude(): boolean {
  return commandExists("claude");
}

export async function registerMcp(
  name: string,
  spec: McpSpec,
  opts: { scope?: "user" | "local" | "project" } = {},
): Promise<boolean> {
  if (!requireClaude()) return false;
  const scope = opts.scope ?? "user";

  await $`claude mcp remove ${name} -s ${scope}`.quiet().nothrow();

  let addExit: number;
  if (spec.transport === "stdio") {
    const envFlags = Object.entries(spec.env ?? {}).flatMap(([k, v]) => ["-e", `${k}=${v}`]);
    const args = spec.args ?? [];
    addExit = (await $`claude mcp add ${name} -s ${scope} ${envFlags} -- ${spec.command} ${args}`.quiet().nothrow()).exitCode;
  } else {
    const headerFlags = Object.entries(spec.headers ?? {}).flatMap(([k, v]) => ["-H", `${k}: ${v}`]);
    addExit = (await $`claude mcp add ${name} -s ${scope} --transport ${spec.transport} ${spec.url} ${headerFlags}`.quiet().nothrow()).exitCode;
  }

  if (addExit !== 0) return false;

  const listed = await $`claude mcp list`.quiet().nothrow();
  if (listed.exitCode !== 0) return false;
  return new RegExp(`^${name}:`, "m").test(listed.text());
}

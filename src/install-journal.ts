import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import { fileExists } from "./utils.js";

export type InstallJournal = {
  version: string;
  tier: "primordial" | "recommended" | "all";
  scope: "global" | "local";
  installedAt: string;
  plugins: { name: string; marketplace: string }[];
  skills: string[];
  commands: string[];
  agents: string[];
  hooks: string[];
};

export function getJournalPath(): string {
  return join(homedir(), ".config", "code-tools", "install.json");
}

export async function readJournal(): Promise<InstallJournal | null> {
  const path = getJournalPath();
  if (!(await fileExists(path))) return null;
  try {
    return JSON.parse(await Bun.file(path).text()) as InstallJournal;
  } catch {
    return null;
  }
}

export async function writeJournal(journal: InstallJournal): Promise<void> {
  const path = getJournalPath();
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, JSON.stringify(journal, null, 2) + "\n");
}

export function diffJournals(prev: InstallJournal | null, next: InstallJournal): {
  addedSkills: string[];
  removedSkills: string[];
  addedCommands: string[];
  removedCommands: string[];
  addedAgents: string[];
  removedAgents: string[];
  addedHooks: string[];
  removedHooks: string[];
  addedPlugins: { name: string; marketplace: string }[];
  removedPlugins: { name: string; marketplace: string }[];
} {
  const emptyJournal: InstallJournal = {
    version: "0.0.0",
    tier: "recommended",
    scope: "global",
    installedAt: "",
    plugins: [],
    skills: [],
    commands: [],
    agents: [],
    hooks: [],
  };
  const p = prev ?? emptyJournal;
  const diffStrings = (a: string[], b: string[]) => ({
    added: b.filter((x) => !a.includes(x)),
    removed: a.filter((x) => !b.includes(x)),
  });
  const pluginKey = (pl: { name: string; marketplace: string }) => `${pl.name}@${pl.marketplace}`;
  const prevPluginKeys = new Set(p.plugins.map(pluginKey));
  const nextPluginKeys = new Set(next.plugins.map(pluginKey));

  const skillsDiff = diffStrings(p.skills, next.skills);
  const commandsDiff = diffStrings(p.commands, next.commands);
  const agentsDiff = diffStrings(p.agents, next.agents);
  const hooksDiff = diffStrings(p.hooks, next.hooks);

  return {
    addedSkills: skillsDiff.added,
    removedSkills: skillsDiff.removed,
    addedCommands: commandsDiff.added,
    removedCommands: commandsDiff.removed,
    addedAgents: agentsDiff.added,
    removedAgents: agentsDiff.removed,
    addedHooks: hooksDiff.added,
    removedHooks: hooksDiff.removed,
    addedPlugins: next.plugins.filter((pl) => !prevPluginKeys.has(pluginKey(pl))),
    removedPlugins: p.plugins.filter((pl) => !nextPluginKeys.has(pluginKey(pl))),
  };
}

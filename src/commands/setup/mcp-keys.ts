import * as clack from "@clack/prompts";
import pc from "picocolors";
import {
  log,
  promptForMissingEnvVars,
  loadSecretsFromFile,
  saveSecretsToFile,
  getSecretsFilePath,
  appendToShellRc,
} from "../../utils.js";
import type { DetectedEnvironment, ComponentCategory } from "../../types.js";

const MCP_ENV_VARS: { key: string; description: string }[] = [
  { key: "DOCFORK_API_KEY", description: "Docfork documentation MCP server" },
  { key: "GITHUB_PAT", description: "GitHub MCP server" },
  { key: "COMPOSIO_API_KEY", description: "Composio workflow MCP (ak_... from app.composio.dev)" },
];

const CATEGORY_BY_KEY: Record<string, string> = {
  DOCFORK_API_KEY: "browser-web",
  GITHUB_PAT: "github",
  COMPOSIO_API_KEY: "workflow",
};

export async function promptForMcpKeys(
  env: DetectedEnvironment,
  selectedCategories: ComponentCategory[],
): Promise<void> {
  const installedCategoryIds = new Set(selectedCategories.map((c) => c.id));
  const needsKeys = MCP_ENV_VARS.filter(({ key }) => {
    const requiredCategory = CATEGORY_BY_KEY[key];
    return requiredCategory !== undefined && installedCategoryIds.has(requiredCategory);
  });

  if (needsKeys.length === 0) return;

  const secretsPath = getSecretsFilePath(env.homeDir);
  const savedSecrets = await loadSecretsFromFile(secretsPath);

  const missing = needsKeys.filter(({ key }) => !process.env[key] && !savedSecrets[key]);
  const alreadyKnown = needsKeys.filter(({ key }) => process.env[key] || savedSecrets[key]);

  if (alreadyKnown.length > 0) {
    clack.note(
      [
        "Already configured (from environment or ~/.config/yka-code/secrets.env):",
        ...alreadyKnown.map(({ key, description }) => `  ${pc.green("✓")} ${pc.bold(key)}  ${pc.dim(`(${description})`)}`),
      ].join("\n"),
      "API keys on file",
    );
  }

  if (missing.length === 0) {
    log.success("All required API keys are already configured — nothing to prompt for.");
    return;
  }

  const keyLines = [
    "To activate these MCP servers, provide these API keys:",
    ...missing.map(({ key, description }) => `  ${pc.cyan("-")} ${pc.bold(key)}  ${pc.dim(`(${description})`)}`),
    "",
    pc.dim("Saved to ~/.config/yka-code/secrets.env (chmod 600) and sourced from your shell rc."),
  ];
  clack.note(keyLines.join("\n"), "Required API keys");

  const setupKeys = await clack.confirm({
    message: "Enter the missing API keys now?",
    initialValue: true,
  });

  if (clack.isCancel(setupKeys) || !setupKeys) return;

  const newTokens = await promptForMissingEnvVars(missing, true, savedSecrets);
  if (Object.keys(newTokens).length === 0) return;

  try {
    await saveSecretsToFile(secretsPath, newTokens);
    await appendToShellRc(
      env,
      [`[ -f "${secretsPath}" ] && source "${secretsPath}"`],
      "secrets",
    );
    log.success(`Saved ${Object.keys(newTokens).length} key(s) to ${secretsPath}`);
    log.info(`Reload your shell to activate: ${pc.cyan(`source ${env.shellRcPath}`)}`);
  } catch (err) {
    log.error(`Failed to save secrets: ${err instanceof Error ? err.message : String(err)}`);
  }
}

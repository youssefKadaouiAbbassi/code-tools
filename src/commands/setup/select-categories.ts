import * as clack from "@clack/prompts";
import pc from "picocolors";
import {
  RECOMMENDED_CATEGORIES,
  OPTIONAL_CATEGORIES,
  ALL_CATEGORIES,
} from "../../components/index.js";
import type { ComponentCategory } from "../../types.js";

export interface CategorySelection {
  categories: ComponentCategory[];
  skippedComponents: Set<number>;
}

const SYSTEM_TOOLS = [
  { id: 36, name: "Ghostty", description: "Fast, feature-rich GPU-accelerated terminal emulator" },
  { id: 39, name: "chezmoi", description: "Dotfile manager with templating and encryption" },
  { id: 41, name: "age", description: "Simple, modern file encryption tool" },
];

function handleCancel(): never {
  clack.cancel("Setup cancelled.");
  process.exit(0);
}

export function pickCategoriesForTier(tier: string | undefined): ComponentCategory[] {
  if (tier === "recommended") return RECOMMENDED_CATEGORIES;
  if (tier === "all" || !tier) return ALL_CATEGORIES;
  return [];
}

export function selectBatch(tier: string | undefined): CategorySelection {
  return {
    categories: pickCategoriesForTier(tier),
    skippedComponents: new Set(),
  };
}

export async function selectInteractive(): Promise<CategorySelection> {
  const categories: ComponentCategory[] = [];
  const skippedComponents = new Set<number>();

  clack.note(
    [
      "Optional system tools (not directly Claude Code related):",
      "",
      ...SYSTEM_TOOLS.map(c => `  • ${pc.bold(c.name)} — ${c.description}`),
    ].join("\n"),
    "🛠️  System Tools"
  );

  const systemChoice = await clack.select({
    message: "Install these system tools?",
    options: [
      { value: "all", label: "Install all", hint: "recommended" },
      { value: "pick", label: "Let me pick", hint: "choose individually" },
      { value: "none", label: "Skip all", hint: "don't install any" },
    ],
    initialValue: "all",
  });

  if (clack.isCancel(systemChoice)) handleCancel();

  if (systemChoice === "all") {
    const workstationCat = RECOMMENDED_CATEGORIES.find(cat => cat.id === "workstation");
    if (workstationCat) categories.push(workstationCat);
  } else if (systemChoice === "pick") {
    for (const component of SYSTEM_TOOLS) {
      const install = await clack.confirm({
        message: `Install ${pc.bold(component.name)}?\n  ${pc.dim(component.description)}`,
        initialValue: false,
      });
      if (clack.isCancel(install)) handleCancel();
      if (!install) skippedComponents.add(component.id);
    }

    const selectedSystemTools = SYSTEM_TOOLS.filter(c => !skippedComponents.has(c.id));
    if (selectedSystemTools.length > 0) {
      const workstationCat = RECOMMENDED_CATEGORIES.find(cat => cat.id === "workstation");
      if (workstationCat) categories.push(workstationCat);
    }
  } else {
    SYSTEM_TOOLS.forEach(c => skippedComponents.add(c.id));
  }

  const claudeCategories = RECOMMENDED_CATEGORIES.filter(cat => cat.id !== "workstation");

  clack.note(
    [
      "Claude Code functionality categories:",
      "",
      ...claudeCategories.map(c => `  • ${pc.bold(c.name)} — ${c.description}`),
      "",
      "Optional categories:",
      ...OPTIONAL_CATEGORIES.map(c => `  • ${pc.bold(c.name)} — ${c.description}`),
    ].join("\n"),
    "🎯 Claude Code Features"
  );

  const claudeChoice = await clack.select({
    message: "Install Claude Code functionality?",
    options: [
      { value: "all", label: "Everything", hint: "recommended - install all features" },
      { value: "recommended", label: "Recommended only", hint: "skip optional categories" },
      { value: "pick", label: "Let me pick", hint: "choose categories individually" },
      { value: "none", label: "Skip all", hint: "just system tools + core" },
    ],
    initialValue: "all",
  });

  if (clack.isCancel(claudeChoice)) handleCancel();

  if (claudeChoice === "all") {
    categories.push(...claudeCategories, ...OPTIONAL_CATEGORIES);
  } else if (claudeChoice === "recommended") {
    categories.push(...claudeCategories);
  } else if (claudeChoice === "pick") {
    for (const cat of claudeCategories) {
      const install = await clack.confirm({
        message: `${pc.bold(cat.name)}\n  ${pc.dim(cat.description)}`,
        initialValue: true,
      });
      if (clack.isCancel(install)) handleCancel();
      if (install) categories.push(cat);
    }

    for (const cat of OPTIONAL_CATEGORIES) {
      const install = await clack.confirm({
        message: `${pc.bold(cat.name)}\n  ${pc.dim(cat.description)}`,
        initialValue: false,
      });
      if (clack.isCancel(install)) handleCancel();
      if (install) categories.push(cat);
    }
  }

  return { categories, skippedComponents };
}

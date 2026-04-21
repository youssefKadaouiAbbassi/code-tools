export type HookEvent =
  | "PreToolUse"
  | "PostToolUse"
  | "UserPromptSubmit"
  | "SessionStart"
  | "SessionEnd"
  | "Stop"
  | "StopFailure"
  | "PreCompact"
  | "PostCompact"
  | "PermissionDenied"
  | "CwdChanged"
  | "Elicitation"
  | "FileChanged"
  | "TaskCreated"
  | "TaskCompleted"
  | "TeammateIdle"
  | "Notification";

export type HookRegistration = {
  file: string;
  event: HookEvent;
  matcher?: string;
};

export const HOOK_REGISTRATIONS: HookRegistration[] = [
  { file: "pre-secrets-guard.sh",      event: "PreToolUse" },
  { file: "pre-destructive-blocker.sh", event: "PreToolUse", matcher: "Bash" },
  { file: "pre-pr-gate.sh",            event: "PreToolUse", matcher: "Bash" },
  { file: "pre-research-check.sh",     event: "PreToolUse", matcher: "WebSearch|WebFetch|mcp__docfork__.*|mcp__deepwiki__.*|mcp__github__.*" },

  { file: "user-prompt-submit.sh",     event: "UserPromptSubmit" },
  { file: "user-prompt-skill-primer.sh", event: "UserPromptSubmit" },

  { file: "post-lint-gate.sh",         event: "PostToolUse", matcher: "Write|Edit|MultiEdit" },
  { file: "post-edit-lint.sh",         event: "PostToolUse", matcher: "Write|Edit|MultiEdit" },
  { file: "post-bash-test.sh",         event: "PostToolUse", matcher: "Bash" },

  { file: "session-start.sh",          event: "SessionStart" },
  { file: "session-start-team-reaper.sh", event: "SessionStart" },
  { file: "session-start-update-check.sh", event: "SessionStart" },
  { file: "session-start-yka-update-check.sh", event: "SessionStart" },
  { file: "session-end.sh",            event: "SessionEnd" },

  { file: "stop-summary.sh",           event: "Stop" },
  { file: "stop-research-check.sh",    event: "Stop" },
  { file: "stop-verification-check.sh", event: "Stop" },
  { file: "stop-team-balance-check.sh", event: "Stop" },

  { file: "pre-compact.sh",            event: "PreCompact" },
  { file: "post-compact.sh",           event: "PostCompact" },
  { file: "stop-failure.sh",           event: "StopFailure" },

  { file: "permission-denied.sh",      event: "PermissionDenied" },
  { file: "elicitation.sh",            event: "Elicitation" },
  { file: "file-changed.sh",           event: "FileChanged", matcher: "\\.env|\\.env\\.local|\\.mcp\\.json|settings\\.local\\.json" },

  { file: "task-created.sh",           event: "TaskCreated" },
  { file: "task-completed.sh",         event: "TaskCompleted" },
  { file: "teammate-idle.sh",          event: "TeammateIdle" },
];

const RESERVED_HOOK_EVENTS: readonly HookEvent[] = ["Notification", "CwdChanged"];

export const HOOK_EVENT_KEYS: ReadonlySet<string> = new Set<string>([
  ...HOOK_REGISTRATIONS.map((r) => r.event),
  ...RESERVED_HOOK_EVENTS,
]);

type HookCommandEntry = { type: "command"; command: string };
type HookEntry = { matcher?: string; hooks: HookCommandEntry[] };

// Generate the `hooks.*` block shape used in settings.json AND hooks/hooks.json.
// `cmdBuilder` maps a hook script filename to its invocation entry (absolute path
// on the filesystem for settings.json, or `${CLAUDE_PLUGIN_ROOT}`-prefixed for
// the plugin-level hooks.json). `filter` optionally narrows to files on disk.
export function buildHooksConfig(
  cmdBuilder: (file: string) => HookCommandEntry,
  opts: { filter?: (file: string) => boolean } = {},
): Record<string, HookEntry[]> {
  const { filter } = opts;
  const out: Record<string, HookEntry[]> = {};
  for (const { file, event, matcher } of HOOK_REGISTRATIONS) {
    if (filter && !filter(file)) continue;
    const entry: HookEntry = matcher ? { matcher, hooks: [cmdBuilder(file)] } : { hooks: [cmdBuilder(file)] };
    (out[event] ??= []).push(entry);
  }
  return out;
}

permit (
  principal,
  action == Action::"Edit",
  resource
) when { context.tool == "Edit" };

permit (
  principal,
  action == Action::"Write",
  resource
) when { context.tool == "Write" };

forbid (
  principal,
  action,
  resource
) when {
  resource.path like ".forge/receipts/*"
  && context.tool != "protect-mcp:sign-receipt"
};

forbid (
  principal,
  action == Action::"Bash",
  resource
) when {
  context.command like "git commit*"
  && context.branch == "forge-meta"
  && context.tool != "signed-audit-trails:write"
};

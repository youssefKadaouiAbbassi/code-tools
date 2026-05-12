#!/usr/bin/env bash
# Runs INSIDE forge-dev. After install, launches a real `claude -p` session
# that does Bash + Read + statusLine invocations. Captures all stderr.
# PASS = no [PROTECT_MCP], no "hook error", no "Permission denied", statusLine renders content.
set -o pipefail
LOG=/tmp/forge-e2e
mkdir -p "$LOG"

echo "=== run install ==="
bash /workspace/forge/dev/install-harness.sh > "$LOG/install.log" 2>&1
[ $? -ne 0 ] && { echo "INSTALL HARNESS FAILED"; tail -20 "$LOG/install.log"; exit 1; }
echo "  install harness PASS"

echo
echo "=== launch claude -p with a Bash + Read prompt ==="
cd /tmp
echo "hello from forge" > /tmp/forge-e2e-target.txt
out=$(claude -p "Run these two tool calls in order: (1) Bash \`echo hello world\`. (2) Read /tmp/forge-e2e-target.txt. After both succeed, reply with the literal text DONE_E2E_OK and nothing else." \
  --permission-mode acceptEdits \
  --model claude-haiku-4-5-20251001 \
  2> "$LOG/stderr.log")
echo "$out" > "$LOG/stdout.log"

echo "--- stdout tail ---"
tail -20 "$LOG/stdout.log"
echo "--- stderr tail ---"
tail -30 "$LOG/stderr.log"

echo
echo "=== verdicts ==="
FAIL=0
if grep -qiE 'PROTECT_MCP|missing.*separator' "$LOG/stderr.log" "$LOG/stdout.log"; then
  echo "  ✗ PROTECT_MCP error found"; FAIL=$((FAIL+1))
else
  echo "  ✓ no PROTECT_MCP errors"
fi
if grep -qiE 'hook error.*non-blocking|permission denied' "$LOG/stderr.log" "$LOG/stdout.log"; then
  echo "  ✗ hook error or permission denied found"; FAIL=$((FAIL+1))
else
  echo "  ✓ no hook errors / permission denied"
fi
if grep -q 'DONE_E2E_OK' "$LOG/stdout.log"; then
  echo "  ✓ agent completed both tool calls"
else
  echo "  ✗ agent didn't finish the task (no DONE_E2E_OK)"; FAIL=$((FAIL+1))
fi

# statusLine command invocation by claude is not directly observable in headless -p mode (no TUI),
# so we re-verify the wrapper as Claude Code itself would invoke it.
echo
echo "=== statusLine command (as Claude Code invokes it) ==="
CMD=$(jq -r '.statusLine.command' ~/.claude/settings.json)
sl_out=$(echo '{"model":{"display_name":"Opus 4.7"},"workspace":{"current_dir":"/tmp"},"transcript_path":"/dev/null"}' | eval "$CMD" 2>&1)
sl_ec=$?
echo "  output: [$sl_out]"
echo "  exit:   $sl_ec"
[ $sl_ec -ne 0 ] || [ -z "$sl_out" ] && { echo "  ✗ statusLine broken"; FAIL=$((FAIL+1)); } || echo "  ✓ statusLine renders"

echo
echo "=== SUMMARY ==="
[ $FAIL -eq 0 ] && { echo "E2E PASS"; exit 0; } || { echo "E2E FAIL: $FAIL issue(s) — see $LOG/"; exit 1; }

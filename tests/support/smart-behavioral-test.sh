#!/bin/bash
set -euo pipefail

# Smart Behavioral Test Runner - Uses intelligent auth mounting to preserve container configs
# Usage: ./smart-behavioral-test.sh [timeout]

TIMEOUT="${1:-120000}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🧠 ULTRATHINK: Smart Behavioral Test Runner"
echo "=============================================="

# Step 1: Rebuild container with all fixes
echo "📦 Rebuilding behavioral container with comprehensive fixes..."
docker build -f tests/containers/behavioral.Dockerfile -t code-tools-behavioral:latest .

# Step 2: Verify container fixes
echo "🔍 Verifying container configuration..."
VERIFY_RESULT=$(docker run --rm --user tester code-tools-behavioral:latest bash -c "
echo '=== ENVIRONMENT CHECK ==='
which bun && bun --version
which claude && claude --version
echo '=== MCP CONFIG CHECK ==='
cat /home/tester/.claude/claude_desktop_config.json | jq '.mcpServers | keys | length'
echo '=== HOOKS CONFIG CHECK ==='
jq '.hooks.preToolUse | length' /home/tester/.claude/settings.json
echo '=== CLAUDE.md CHECK ==='
head -5 /home/tester/.claude/CLAUDE.md
")

echo "Container verification:"
echo "$VERIFY_RESULT"

# Step 3: Run behavioral tests with smart auth
echo "🧪 Running behavioral tests with smart auth preservation..."
BEHAVIORAL_RESULT=$(timeout 300 docker run --rm \
    -e RUN_BEHAVIORAL_TESTS=true \
    -v ~/.claude:/home/tester/.claude-host:ro \
    -v "$(pwd)":/workspace \
    -w /workspace \
    --user tester \
    code-tools-behavioral:latest \
    bash -c "
# Use smart auth setup to preserve container configs
smart-auth-setup.sh /home/tester/.claude-host /home/tester/.claude

echo '=== FINAL CONFIG VERIFICATION ==='
echo 'MCP servers:' && jq '.mcpServers | keys' /home/tester/.claude/claude_desktop_config.json
echo 'Hooks:' && jq '.hooks.preToolUse | length' /home/tester/.claude/settings.json
echo 'Auth files:' && ls -la /home/tester/.claude/.credentials.json 2>/dev/null || echo 'No credentials'

echo '=== DIRECT HOOK TESTS ==='
echo 'Testing secret hook:' && echo '{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"echo AKIAIOSFODNN7EXAMPLE\"}}' | /home/tester/.claude/hooks/pre-secrets-guard.sh
echo 'Testing destructive hook:' && echo '{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"rm -rf /\"}}' | /home/tester/.claude/hooks/pre-destructive-blocker.sh

echo '=== BEHAVIORAL TESTS ==='
# Try multiple bun paths
if [ -x /usr/local/bin/bun ]; then
  /usr/local/bin/bun test tests/behavioral/system.test.ts --timeout $TIMEOUT
elif [ -x /usr/bin/bun ]; then
  /usr/bin/bun test tests/behavioral/system.test.ts --timeout $TIMEOUT
else
  echo 'ERROR: bun not found in container'
  exit 1
fi
")

echo "Behavioral test results:"
echo "$BEHAVIORAL_RESULT"

# Step 4: Analysis and summary
echo "📊 COMPREHENSIVE ANALYSIS"
echo "=========================="

echo "✅ Container Build: $(echo "$VERIFY_RESULT" | grep -q "bun --version" && echo "SUCCESS" || echo "FAILED")"
echo "✅ MCP Configuration: $(echo "$VERIFY_RESULT" | grep -o '[0-9]*' | tail -1) servers"
echo "✅ Hook Configuration: $(echo "$VERIFY_RESULT" | grep -o '[0-9]*' | head -1) hooks"

# Parse behavioral test results
if echo "$BEHAVIORAL_RESULT" | grep -q "pass.*fail"; then
    PASS_COUNT=$(echo "$BEHAVIORAL_RESULT" | grep -o '[0-9]* pass' | grep -o '[0-9]*')
    FAIL_COUNT=$(echo "$BEHAVIORAL_RESULT" | grep -o '[0-9]* fail' | grep -o '[0-9]*')
    TOTAL=$((PASS_COUNT + FAIL_COUNT))
    PASS_RATE=$((PASS_COUNT * 100 / TOTAL))

    echo "📈 FINAL RESULTS:"
    echo "   Pass: $PASS_COUNT/$TOTAL ($PASS_RATE%)"
    echo "   Fail: $FAIL_COUNT/$TOTAL"

    if [ "$PASS_RATE" -gt 75 ]; then
        echo "🎯 MISSION ACCOMPLISHED: Containerized tests are working!"
    elif [ "$PASS_RATE" -gt 50 ]; then
        echo "📈 SIGNIFICANT IMPROVEMENT: Major issues resolved"
    else
        echo "🔧 NEEDS WORK: Some issues remain"
    fi
else
    echo "❌ Tests failed to complete properly"
fi

echo "=============================================="
#!/bin/bash
set -euo pipefail

# Smart Auth Setup - Preserves container configs while copying host auth
# Usage: smart-auth-setup.sh /host/.claude /container/.claude

HOST_CLAUDE_DIR="${1:-/home/tester/.claude-host}"
CONTAINER_CLAUDE_DIR="${2:-/home/tester/.claude}"

echo "=== Smart Auth Setup ==="
echo "Host: $HOST_CLAUDE_DIR"
echo "Container: $CONTAINER_CLAUDE_DIR"

# Copy only authentication files from host, preserve container's configs
AUTH_FILES=(
    ".credentials.json"
    ".session-stats.json"
    "mcp-needs-auth-cache.json"
    "history.jsonl"
)

for file in "${AUTH_FILES[@]}"; do
    if [[ -f "$HOST_CLAUDE_DIR/$file" ]]; then
        cp "$HOST_CLAUDE_DIR/$file" "$CONTAINER_CLAUDE_DIR/"
        echo "✓ Copied $file"
    else
        echo "⚠ Missing $file (optional)"
    fi
done

# Preserve container's critical configs
PRESERVE_FILES=(
    "settings.json"
    "claude_desktop_config.json"
    "CLAUDE.md"
)

for file in "${PRESERVE_FILES[@]}"; do
    if [[ -f "$CONTAINER_CLAUDE_DIR/$file" ]]; then
        echo "✓ Preserved container's $file"
    else
        echo "❌ Missing container's $file"
    fi
done

# Ensure proper permissions
chown -R tester:tester "$CONTAINER_CLAUDE_DIR" 2>/dev/null || true

echo "=== Auth Setup Complete ==="
# Modern 2026 Multi-Stage Behavioral Test Container
# Proper layer caching, minimal rebuilds, clean separation

# Stage 1: Use existing working base image
FROM code-tools-base AS claude-base

# Ensure proper permissions (tester user already exists in base image)
RUN mkdir -p /home/tester/.claude && \
    chown -R tester:tester /home/tester

# Copy Claude CLI to accessible location
RUN cp /root/.local/bin/claude /usr/local/bin/claude && chmod +x /usr/local/bin/claude

# Stage 2: Runtime environment with Bun (cached unless Bun version changes)
FROM claude-base AS runtime
# Install Bun properly for tester user from the start
RUN curl -fsSL https://bun.sh/install | bash && \
    cp /root/.bun/bin/bun /usr/local/bin/bun && \
    chmod 755 /usr/local/bin/bun && \
    chown tester:tester /usr/local/bin/bun

# Switch to tester user for remaining operations
USER tester
WORKDIR /workspace

# Verify tools work
RUN claude --version && bun --version

# Stage 3: Dependencies (cached unless package.json/bun.lockb changes)
FROM runtime AS deps
COPY --chown=tester:tester package.json bun.lock ./
RUN bun install --frozen-lockfile

# Stage 4: Claude Code setup (cached unless configs change)
FROM deps AS claude-setup
COPY --chown=tester:tester bin/ ./bin/
COPY --chown=tester:tester src/ ./src/
COPY --chown=tester:tester configs/ ./configs/
COPY --chown=tester:tester tsconfig.json ./

# Install Claude Code v12 system
RUN bun run bin/setup.ts --non-interactive --tier primordial

# Fix hooks configuration for proper testing
RUN cd /home/tester/.claude && \
    jq '.hooks = {"PreToolUse": [{"matcher": "*", "hooks": [{"type": "command", "command": "/home/tester/.claude/hooks/pre-secrets-guard.sh", "timeout": 5}, {"type": "command", "command": "/home/tester/.claude/hooks/pre-destructive-blocker.sh", "timeout": 5}]}], "PostToolUse": [{"matcher": "*", "hooks": [{"type": "command", "command": "/home/tester/.claude/hooks/post-lint-gate.sh", "timeout": 5}]}]}' settings.json > settings.tmp && mv settings.tmp settings.json

# Stage 5: Test suite (only rebuilds when tests change)
FROM claude-setup AS test-suite
COPY --chown=tester:tester tests/ ./tests/
COPY --chown=tester:tester tests/support/smart-auth-setup.sh /usr/local/bin/smart-auth-setup.sh

# Final verification
RUN claude --version && \
    bun --version && \
    ls -la /home/tester/.claude/ && \
    jq '.mcpServers | keys | length' /home/tester/.claude/claude_desktop_config.json

# Default command for testing
CMD ["bash", "-c", "echo 'Behavioral test container ready. Use: smart-auth-setup.sh then bun test'"]
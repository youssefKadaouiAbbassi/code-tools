# 2026 Modern Layered Behavioral Test Container
# Built on working foundation with proper caching

# Stage 1: Dependencies (cached unless package.json/bun.lock change)
FROM code-tools-base AS deps
WORKDIR /workspace
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Stage 2: Setup (cached unless setup scripts change)
FROM deps AS setup
COPY bin/ ./bin/
COPY src/ ./src/
COPY configs/ ./configs/
COPY tsconfig.json ./
# Install v12 system
RUN bun run bin/setup.ts --non-interactive --tier primordial

# Stage 3: Configuration (cached unless config logic changes)
FROM setup AS configured
# Fix hooks for proper testing
RUN cd /home/tester/.claude && \
    jq '.hooks = {"PreToolUse": [{"matcher": "*", "hooks": [{"type": "command", "command": "/home/tester/.claude/hooks/pre-secrets-guard.sh", "timeout": 5}, {"type": "command", "command": "/home/tester/.claude/hooks/pre-destructive-blocker.sh", "timeout": 5}]}], "PostToolUse": [{"matcher": "*", "hooks": [{"type": "command", "command": "/home/tester/.claude/hooks/post-lint-gate.sh", "timeout": 5}]}]}' settings.json > settings.tmp && mv settings.tmp settings.json

# Fix bun permissions (the key fix from earlier work)
USER root
RUN cp /root/.bun/bin/bun /usr/local/bin/bun-real && \
    chmod 755 /usr/local/bin/bun-real && \
    ln -sf /usr/local/bin/bun-real /usr/local/bin/bun && \
    echo 'export PATH="/usr/local/bin:$PATH"' >> /home/tester/.bashrc

# Stage 4: Tests (only rebuilds when tests change)
FROM configured AS final
USER tester
COPY --chown=tester:tester tests/ ./tests/
COPY --chown=tester:tester tests/support/smart-auth-setup.sh /usr/local/bin/smart-auth-setup.sh

USER root
RUN chmod +x /usr/local/bin/smart-auth-setup.sh

USER tester
WORKDIR /workspace

# Verify everything works
RUN claude --version && bun --version && \
    jq '.mcpServers | keys | length' /home/tester/.claude/claude_desktop_config.json

CMD ["bash"]
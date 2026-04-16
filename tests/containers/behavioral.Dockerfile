# Behavioral test container - builds from base and installs full v12 system
FROM code-tools-base

# Switch back to root for installation steps
USER root

# Copy the entire repository into the container
COPY . /workspace

# Install dependencies with frozen lockfile
RUN cd /workspace && bun install --frozen-lockfile

# Install the v12 system with primordial tier (hooks + settings)
# The bug fix ensures --non-interactive --tier primordial works correctly
RUN cd /workspace && bun run bin/setup.ts --non-interactive --tier primordial

# Fix hooks configuration in settings.json - use CORRECT format that actually works
RUN cd /home/tester/.claude && \
    jq '.hooks = {"PreToolUse": [{"matcher": "*", "hooks": [{"type": "command", "command": "/home/tester/.claude/hooks/pre-secrets-guard.sh", "timeout": 5}, {"type": "command", "command": "/home/tester/.claude/hooks/pre-destructive-blocker.sh", "timeout": 5}]}], "PostToolUse": [{"matcher": "*", "hooks": [{"type": "command", "command": "/home/tester/.claude/hooks/post-lint-gate.sh", "timeout": 5}]}]}' settings.json > settings.json.tmp && \
    mv settings.json.tmp settings.json

# The setup already installs to /home/tester/.claude, but we need to ensure proper ownership
# since we ran as root. The tester user should own their own files
RUN chown -R tester /home/tester/.claude && \
    chmod -R 755 /home/tester/.claude/hooks

# Copy Claude CLI to a globally accessible location and fix permissions
RUN cp /root/.local/bin/claude /usr/local/bin/claude && chmod +x /usr/local/bin/claude

# Copy bun executable to accessible location for tester user
RUN echo 'export PATH="/usr/local/bin:$PATH"' >> /home/tester/.bashrc && \
    echo 'export PATH="/usr/local/bin:$PATH"' >> /home/tester/.profile && \
    cp /root/.bun/bin/bun /usr/local/bin/bun-real && \
    chmod 755 /usr/local/bin/bun-real && \
    ln -sf /usr/local/bin/bun-real /usr/local/bin/bun

# Copy smart auth setup script
COPY tests/support/smart-auth-setup.sh /usr/local/bin/smart-auth-setup.sh
RUN chmod +x /usr/local/bin/smart-auth-setup.sh

# Verify Claude CLI is working at build time
RUN claude --version

# Verify Claude CLI is working at build time
RUN claude --version

# Switch back to tester user for runtime
USER tester
WORKDIR /workspace
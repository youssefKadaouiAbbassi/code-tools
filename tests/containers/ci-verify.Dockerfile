FROM base

# Switch back to root for installation operations
USER root

# Copy the entire codebase to workspace
COPY . /workspace

# Set working directory
WORKDIR /workspace

# Install dependencies and run primordial setup
RUN cd /workspace && bun install --frozen-lockfile && bun run bin/setup.ts --non-interactive --tier primordial

# Fix ownership of tester's files that were created as root
RUN chown -R tester:ubuntu /home/tester

# Switch back to tester user for runtime
USER tester
ENV HOME=/home/tester
WORKDIR /home/tester
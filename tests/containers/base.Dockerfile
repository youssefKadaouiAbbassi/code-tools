FROM ubuntu:24.04

# Install system packages for testing infrastructure
RUN apt-get update && apt-get install -y \
    curl \
    unzip \
    git \
    sudo \
    jq \
    bats \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Bun via official installer and add to PATH
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"
RUN ln -s /root/.bun/bin/bun /usr/local/bin/bun

# Install Claude Code CLI via official installer
RUN curl -fsSL https://claude.ai/install.sh | bash
ENV PATH="/root/.local/bin:${PATH}"

# Rename the existing ubuntu user (uid 1000) to tester
RUN usermod -l tester -d /home/tester -m ubuntu

# Switch to tester user and set environment
USER tester
ENV HOME=/home/tester

# Set working directory
WORKDIR /workspace
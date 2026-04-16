#!/usr/bin/env bash
set -euo pipefail

echo "=== Ultimate Claude Code System v12 — Bootstrap ==="
echo ""

# Detect OS and package manager
OS="$(uname -s)"
if [[ "$OS" == "Darwin" ]]; then
  PKG_MGR="brew"
elif command -v apt-get &>/dev/null; then
  PKG_MGR="apt"
elif command -v pacman &>/dev/null; then
  PKG_MGR="pacman"
elif command -v dnf &>/dev/null; then
  PKG_MGR="dnf"
else
  echo "ERROR: No supported package manager found (brew/apt/pacman/dnf)"
  exit 1
fi

echo "Detected: OS=$OS, Package manager=$PKG_MGR"

# Install Bun if missing
if ! command -v bun &>/dev/null; then
  echo "Installing Bun..."
  curl -fsSL https://bun.sh/install | bash
  # Source the updated profile so bun is available
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
fi

echo "Bun: $(bun --version)"

# Install Claude Code if missing
if ! command -v claude &>/dev/null; then
  echo "Installing Claude Code..."
  curl -fsSL https://claude.ai/install.sh | bash
fi

# Install jq if missing (required for hooks)
if ! command -v jq &>/dev/null; then
  echo "Installing jq..."
  case "$PKG_MGR" in
    brew)   brew install jq ;;
    apt)    sudo apt-get install -y jq ;;
    pacman) sudo pacman -S --noconfirm jq ;;
    dnf)    sudo dnf install -y jq ;;
  esac
fi

# Run the installer in non-interactive mode
echo ""
echo "Running code-tools setup..."
bunx @youssefKadaouiAbbassi/code-tools-setup --non-interactive

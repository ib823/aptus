#!/usr/bin/env bash
# Install the tracked git hooks at .githooks/.
# Idempotent — safe to run any number of times.
# Auto-runs after pnpm install via the 'prepare' script in package.json.

set -euo pipefail

# Skip on CI — CI doesn't push, doesn't need hooks.
if [ -n "${CI:-}" ]; then
  exit 0
fi

# Skip if not inside a git work tree (e.g., installing from a tarball).
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  exit 0
fi

current=$(git config --get core.hooksPath || echo "")
if [ "$current" = ".githooks" ]; then
  # Already configured — silent success.
  exit 0
fi

git config core.hooksPath .githooks
chmod +x .githooks/* 2>/dev/null || true
printf "\033[32m✓\033[0m githooks installed (core.hooksPath = .githooks)\n"
printf "   Pre-push will run 'next build' before allowing pushes.\n"
printf "   Bypass: SKIP_PRE_PUSH=1 git push  (use sparingly)\n"

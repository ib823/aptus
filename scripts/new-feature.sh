#!/usr/bin/env bash
# Create a feature branch from latest main and push it to set up tracking.
# Usage: bash scripts/new-feature.sh <short-name>
#   short-name: lowercase, hyphens, no spaces. e.g. "scope-pricing-tier"
#
# Why this script: ensures you start from latest main (not a stale local branch)
# and that the branch name follows the feat/ convention so PR titles read well.

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: bash scripts/new-feature.sh <short-name>"
  echo "  e.g.  bash scripts/new-feature.sh scope-pricing-tier"
  exit 1
fi

name="$1"

# Validate format: lowercase, alphanumeric + hyphens
if ! echo "$name" | grep -qE '^[a-z][a-z0-9-]*$'; then
  echo "✗ short-name must be lowercase letters, digits, and hyphens only."
  echo "  Got: $name"
  exit 1
fi

# Confirm clean working tree
if [ -n "$(git status --porcelain)" ]; then
  echo "✗ Working tree has uncommitted changes. Stash or commit them first:"
  git status --short
  exit 1
fi

branch="feat/$name"

echo "→ Fetching latest main…"
git fetch origin main >/dev/null

echo "→ Switching to main and fast-forwarding…"
git switch main
git pull --ff-only origin main

echo "→ Creating branch $branch from main…"
git switch -c "$branch"

echo ""
echo "✓ On branch $branch"
echo ""
echo "Next steps:"
echo "  1. Make your changes"
echo "  2. Commit in small chunks (each commit deployable on its own)"
echo "  3. git push -u origin $branch    # pre-push hook runs build"
echo "  4. gh pr create --fill           # creates PR + Vercel preview URL"
echo "  5. Click the preview URL, verify your change, then:"
echo "     gh pr merge --squash --delete-branch"

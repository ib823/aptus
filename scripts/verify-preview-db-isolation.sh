#!/usr/bin/env bash
#
# verify-preview-db-isolation.sh — P6 preview-DB isolation gate (READ-ONLY).
#
# Asserts that the Vercel **Preview** DATABASE_URL points at a DIFFERENT database
# endpoint than **Production**, so an e2e run against a preview can never touch
# production data. Exits:
#   0  — Preview endpoint ≠ Production endpoint  (safe: suites may run)
#   1  — Preview endpoint == Production endpoint  (UNSAFE: do NOT run any suite)
#   2  — could not determine one/both endpoints    (inconclusive: treat as unsafe)
#
# Safety properties:
#   - Never connects to any database.
#   - Never prints a password or a full connection string — only a masked
#     endpoint label plus a short hash, so equality is auditable in CI logs
#     without leaking the endpoint.
#   - Compares the normalised Neon endpoint id: the first host label with a
#     trailing "-pooler" stripped, so pooled/unpooled of the SAME project
#     collapse to one identity and are correctly flagged as "same database".
#
# Usage:
#   ./scripts/verify-preview-db-isolation.sh
#
# Requires: vercel CLI, authenticated, project linked (.vercel/project.json).
# It pulls each environment's env to a temp file, reads only DATABASE_URL, and
# deletes the temp files on exit.

set -euo pipefail

TMPDIR="$(mktemp -d)"
cleanup() { rm -rf "$TMPDIR"; }
trap cleanup EXIT

# host_of <url> — the host between "@" and the next "/" ":" or "?".
host_of() {
  printf '%s' "$1" | sed -E 's#^[a-zA-Z0-9+.-]+://[^@]+@([^/:?]+).*#\1#'
}

# endpoint_of <url> — normalised Neon endpoint id (first label, minus -pooler).
endpoint_of() {
  local host
  host="$(host_of "$1")"
  printf '%s' "$host" | cut -d. -f1 | sed -E 's/-pooler$//'
}

# db_url_from <envfile> — the raw DATABASE_URL value, unquoted.
db_url_from() {
  grep -E '^DATABASE_URL=' "$1" 2>/dev/null | head -1 | cut -d= -f2- | sed -E 's/^"//; s/"$//; s/^'\''//; s/'\''$//'
}

mask() {   # first 8 chars then an ellipsis; empty stays empty
  local s="$1"; [ -z "$s" ] && { printf '<missing>'; return; }
  printf '%s…' "${s:0:8}"
}
hash8() {  # short, stable fingerprint for exact-equality auditing
  printf '%s' "$1" | sha256sum | cut -c1-12
}

pull_env() {  # $1=environment  $2=dest file
  if ! vercel env pull "$2" --environment="$1" --yes >/dev/null 2>&1; then
    echo "  could not pull '$1' env (vercel CLI auth / project link?)." >&2
    return 1
  fi
}

echo "P6 · Preview↔Production database-isolation check (read-only)"
echo "-----------------------------------------------------------"

PREVIEW_OK=1; PROD_OK=1
pull_env preview    "$TMPDIR/preview.env"    || PREVIEW_OK=0
pull_env production "$TMPDIR/production.env" || PROD_OK=0

if [ "$PREVIEW_OK" -ne 1 ] || [ "$PROD_OK" -ne 1 ]; then
  echo "RESULT: INCONCLUSIVE — could not read both environments. Treat as UNSAFE."
  exit 2
fi

PREVIEW_EP="$(endpoint_of "$(db_url_from "$TMPDIR/preview.env")")"
PROD_EP="$(endpoint_of "$(db_url_from "$TMPDIR/production.env")")"

echo "  Preview    DB endpoint: $(mask "$PREVIEW_EP")  (fp $( [ -n "$PREVIEW_EP" ] && hash8 "$PREVIEW_EP" || echo '--' ))"
echo "  Production DB endpoint: $(mask "$PROD_EP")  (fp $( [ -n "$PROD_EP" ] && hash8 "$PROD_EP" || echo '--' ))"
echo ""

if [ -z "$PREVIEW_EP" ] || [ -z "$PROD_EP" ]; then
  echo "RESULT: INCONCLUSIVE — DATABASE_URL missing in one or both environments. Treat as UNSAFE."
  exit 2
fi

if [ "$PREVIEW_EP" = "$PROD_EP" ]; then
  echo "❌ RESULT: FAIL — Preview and Production share the SAME database endpoint."
  echo "   A preview run would read/write production data. Do NOT run any suite."
  echo "   Give Preview its own Neon project (see docs/neutral-discovery/PREVIEW-DB-RUNBOOK.md)."
  exit 1
fi

echo "✅ RESULT: PASS — Preview is a DIFFERENT database from Production. Suites may run against the preview."
exit 0

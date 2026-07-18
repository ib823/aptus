#!/usr/bin/env bash
# One-off post-merge shape-drift check against a real deployed database.
#
# WHY THIS EXISTS
# The Brownfield reconciliation migration is EXISTENCE-guarded: every statement
# is `IF NOT EXISTS` / `to_regclass` / `pg_constraint`-guarded, so it creates a
# missing object but SKIPS an object that already exists. That is exactly what
# makes it a zero-touch no-op on the already-pushed production database.
#
# The one thing existence guards cannot see is SHAPE. If a production object was
# pushed with a DIFFERENT shape than schema.prisma declares (a column of another
# type, a nullable/notnull mismatch, a missing index column), the guard skips it
# and the divergence persists silently. CI's parity gate proves history == schema
# on a FRESH database; it cannot reach production. This script closes that gap.
#
# It is READ-ONLY: it runs `prisma migrate diff` in report mode against the live
# datasource and prints the SQL that WOULD be needed to make production match
# schema.prisma. It never writes to the database.
#
# WHEN TO RUN
# Once, after this PR is deployed, by someone holding production credentials.
# Add it to the deploy checklist. Expected result: "No difference detected."
# Any output is a real shape mismatch to investigate before considering the
# Brownfield subsystem fully reconciled in production.
#
# USAGE
#   DATABASE_URL="postgresql://…prod…" ./scripts/verify-prod-schema-parity.sh
# or against a preview branch DB:
#   DATABASE_URL="postgresql://…preview…" ./scripts/verify-prod-schema-parity.sh
#
# Exit codes: 0 = in sync (no drift), 2 = drift detected, 1 = usage/tool error.

set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "error: DATABASE_URL must be set to the database you want to verify." >&2
  echo "       This script is READ-ONLY; it inspects, it does not migrate." >&2
  exit 1
fi

# Redacted echo so a pasted terminal doesn't leak credentials.
REDACTED=$(printf '%s' "$DATABASE_URL" | sed -E 's#(://[^:]+:)[^@]+@#\1***@#')
echo "Verifying schema parity (read-only) against: $REDACTED"
echo

# --from-url introspects the LIVE database at exactly the URL you pass (it does
# NOT read .env, so it can never accidentally point at a local dev database);
# --to-schema-datamodel is what the code expects. --exit-code makes drift a
# non-zero exit so this can gate a deploy checklist step if desired.
set +e
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --exit-code
code=$?
set -e

echo
case "$code" in
  0) echo "PASS: production schema matches schema.prisma — no shape drift." ;;
  2) echo "DRIFT: the SQL above is what production is missing or has differently." ;;
  *) echo "ERROR: prisma migrate diff failed (exit $code) — check connectivity/credentials." ;;
esac
exit "$code"

#!/usr/bin/env bash
#
# Run CI's Migration Integrity drift gate locally.
#
# WHY THIS EXISTS. The `Migration Integrity` workflow asserts that a database
# built from `prisma/migrations` is identical to `prisma/schema.prisma`. Nothing
# ran that assertion outside CI, and the pre-push hook builds the app but never
# touches the database — so a schema/migration mismatch could be committed,
# pushed, and deployed with every local gate green. It was: three migrations
# created objects (two indexes, two column defaults) that schema.prisma never
# declared, and `main` sat red for two pushes before anyone looked.
#
# This is the same `prisma migrate diff --exit-code` the workflow runs. Exit 0
# means no drift; exit 2 means drift and names what moved.
#
# USAGE
#   scripts/check-migration-drift.sh
#
# It needs a Postgres it can create a throwaway shadow database on. Set
# SHADOW_DATABASE_URL to one that already exists, or just set DATABASE_URL and
# let this derive `migration_drift_shadow` on the same server and manage it for
# you — create before, drop after. Prisma does NOT create the shadow database
# itself; CI does it with an explicit psql, and this does it through
# `prisma db execute` so the script needs no client binary beyond the repo's own
# toolchain.
#
# The database named in DATABASE_URL is never written to. It is used for its
# host and credentials only, and is not even connected to: the CREATE runs
# against the server's `postgres` maintenance database.

set -euo pipefail

cd "$(dirname "$0")/.."

SHADOW_DB_NAME=migration_drift_shadow
OWNED_SHADOW=0

if [ -z "${SHADOW_DATABASE_URL:-}" ]; then
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "error: set SHADOW_DATABASE_URL, or DATABASE_URL to derive one from." >&2
    echo "       e.g. DATABASE_URL=postgresql://user:pw@localhost:5432/aptus $0" >&2
    exit 1
  fi
  # Replace the path component (database name), preserving any ?query string.
  SHADOW_DATABASE_URL="$(printf '%s' "$DATABASE_URL" \
    | sed -E "s#/[^/?]+(\\?|\$)#/${SHADOW_DB_NAME}\\1#")"
  MAINTENANCE_URL="$(printf '%s' "$DATABASE_URL" \
    | sed -E 's#/[^/?]+(\?|$)#/postgres\1#')"
  OWNED_SHADOW=1
  echo "note: derived shadow database '${SHADOW_DB_NAME}' from DATABASE_URL."
fi

# Only ever drop a database this script created, and only one named exactly
# what we derived — never a SHADOW_DATABASE_URL the caller supplied.
drop_shadow() {
  [ "$OWNED_SHADOW" = "1" ] || return 0
  printf 'DROP DATABASE IF EXISTS "%s";' "$SHADOW_DB_NAME" \
    | npx --no-install prisma db execute --url "$MAINTENANCE_URL" --stdin >/dev/null 2>&1 || true
}

if [ "$OWNED_SHADOW" = "1" ]; then
  trap drop_shadow EXIT
  drop_shadow
  printf 'CREATE DATABASE "%s";' "$SHADOW_DB_NAME" \
    | npx --no-install prisma db execute --url "$MAINTENANCE_URL" --stdin >/dev/null
fi

echo "Comparing prisma/migrations -> prisma/schema.prisma ..."

# --exit-code: 0 = no drift, 2 = drift, 1 = error. `set -e` would swallow the
# distinction, so the call is guarded and the code inspected explicitly.
set +e
npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "$SHADOW_DATABASE_URL" \
  --exit-code
code=$?
set -e

case "$code" in
  0) echo "OK: migration history reconciles to schema.prisma with zero drift." ;;
  2) echo ""
     echo "DRIFT. The listing above reads migrations -> schema: '[-] Removed index'"
     echo "means the migrations create an index schema.prisma does not declare."
     echo ""
     echo "Fix the SCHEMA, not an applied migration: migration files are"
     echo "checksummed, and editing one that production has already run breaks"
     echo "the next 'migrate deploy'. Declare the object in schema.prisma, or add"
     echo "a new migration that removes it."
     exit 2 ;;
  *) echo "error: prisma migrate diff failed (exit $code)." >&2; exit "$code" ;;
esac

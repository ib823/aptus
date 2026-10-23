-- Interface.requestSchemaStamp (P1.3, P1 on wave 2 integration review round 1).
--
-- A verified write interface's `{"x-contract": stamp}`: which snapshot's
-- create or update body GET /interfaces/{id}/schema serves as requestSchema
-- (lib/contracts/record.ts, request-schema.ts). It was written into
-- Interface.requestSchema, which every build before P1.3 (wave 2, c7cfd162)
-- returns from /schema as stored and the Studio shows as "captured". After an
-- Instant Rollback to such a build, a consumer that had requestSchema null got
-- the bare stamp as a JSON Schema: no type and no properties, so it accepts any
-- record, and no older PATCH clears it. Kept in its own column, requestSchema
-- stays NULL, which is what an older build means by "none compiled".
--
-- NOTHING STOPS ON DEPLOY: a nullable column with no default (a catalogue
-- change, no table rewrite). No backfill: no build that ran on a shared
-- database ever wrote the stamp; a write interface gets one at its next verify.
--
-- Backout: backout.sql beside this file.

-- AlterTable
ALTER TABLE "Interface" ADD COLUMN     "requestSchemaStamp" JSONB;

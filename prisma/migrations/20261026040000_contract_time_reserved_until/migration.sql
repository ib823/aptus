-- ContractTime.reservedUntil (P1.3, consolidated containment review round 4).
--
-- When the latest of an organisation's reservations of compiler time expires
-- (lib/contracts/contract-time.ts). A reservation that is never settled (its
-- process died, or the settling statement failed) held the rest of the day:
-- every job of the organisation BUSY until 00:00 UTC. Past reservedUntil the
-- row's reservedMs counts as 0, so a leaked reservation clears in about 20 s.
--
-- NOTHING STOPS ON DEPLOY: a nullable column with no default (a catalogue
-- change, no table rewrite). No backfill: a row without it keeps its
-- reservations until they are settled, as before.
--
-- Backout: backout.sql beside this file.

-- AlterTable
ALTER TABLE "ContractTime" ADD COLUMN     "reservedUntil" TIMESTAMPTZ(3);

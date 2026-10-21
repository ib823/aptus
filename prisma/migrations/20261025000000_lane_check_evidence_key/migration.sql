-- P0.2 (A18): lane evidence says what it was gathered against.
--
-- A LaneCheck row recorded the connection it ran through and nothing about
-- the dataset or the feed version it read, and the board compared none of
-- them, so a replaced connection or an edited feed inherited a Live status
-- for up to a day. The board now uses a row only while its connectionId,
-- entitySet and interfaceVersion match the lane's binding and feed.
--
-- Additive: two nullable columns, no default, no backfill. A row written
-- before this migration carries NULLs and proves nothing until the next lane
-- check rewrites it (the nightly sweep at 04:30 UTC, or Re-check): we do not
-- know what it was gathered against, and guessing would be the defect.

-- AlterTable
ALTER TABLE "LaneCheck" ADD COLUMN     "entitySet" TEXT,
ADD COLUMN     "interfaceVersion" INTEGER;

-- P0.2 review (A18): a connection's settings carry a revision.
--
-- A lane check reads SAP for seconds to minutes through the connection it
-- loaded. A re-save in place keeps the row's id, so a check that finished
-- after the re-save wrote the previous system's proof under that id, after
-- the re-save had dropped the checks. Every save now bumps `revision`, and
-- a check records its evidence only while the row still carries the
-- revision it read through (lane-check-sweep.ts). NOT NULL DEFAULT 1 is a
-- metadata-only change on PostgreSQL 11+: no table rewrite, no backfill.

-- AlterTable
ALTER TABLE "SapConnection" ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 1;

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

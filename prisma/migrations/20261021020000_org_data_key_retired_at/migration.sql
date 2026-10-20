-- P0.10 review: a data-key version can be retired after a rekey, so a leaked
-- old data key stops opening (and so stops forging) sealed SAP secrets.
--
-- Additive only: one nullable column. Null means "may open blobs", which is
-- every existing row, so the code already running is unaffected.

-- AlterTable
ALTER TABLE "OrgDataKey" ADD COLUMN     "retiredAt" TIMESTAMP(3);

-- ABeam Workbench — v2 schema delta for the consultant question editor.
--
-- AffirmQuestion grows two long-text columns and a custom-question
-- marker. AffirmBundleQuestion grows three editor controls: enabled,
-- displayOrder, format.
--
-- The question editor (screen 2.5 — /affirm/[id]/questions) lets the
-- consultant:
--   - edit plain-language wording (existing consultantWording column)
--   - set format (decision | information) — new on the join row
--   - enable / disable a question — kept in the record, not shown to
--     the client when disabled; the 15 SAP-excluded rows arrive
--     pre-disabled
--   - reorder questions within a sub-process — new displayOrder on
--     the join row
--   - add custom questions — new isCustom + createdBy on AffirmQuestion
--
-- aboutText + standardMeans seed from the SAP Topic Definition file
-- (input 2 in the v2 prompt); both may start empty and the consultant
-- fills them in the editor.
--
-- All adds are additive — no existing row touched. enabled defaults
-- TRUE so existing AffirmBundleQuestion rows behave unchanged.

-- AlterTable: AffirmQuestion gets two TEXT columns + custom marker
ALTER TABLE "AffirmQuestion"
  ADD COLUMN "aboutText"     TEXT,
  ADD COLUMN "createdById"   TEXT,
  ADD COLUMN "isCustom"      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "standardMeans" TEXT;

-- AlterTable: AffirmBundleQuestion gets editor controls
ALTER TABLE "AffirmBundleQuestion"
  ADD COLUMN "displayOrder" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "enabled"      BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "format"       TEXT    NOT NULL DEFAULT 'decision';

-- CreateIndex
CREATE INDEX "AffirmQuestion_isCustom_idx" ON "AffirmQuestion"("isCustom");
CREATE INDEX "AffirmBundleQuestion_bundleId_enabled_idx"
  ON "AffirmBundleQuestion"("bundleId", "enabled");
CREATE INDEX "AffirmBundleQuestion_bundleId_displayOrder_idx"
  ON "AffirmBundleQuestion"("bundleId", "displayOrder");

-- AddForeignKey: custom-question authors. SET NULL: deactivating a
-- consultant doesn't orphan the question record (consultant deletion
-- is rare; deactivation is the normal lifecycle).
ALTER TABLE "AffirmQuestion" ADD CONSTRAINT "AffirmQuestion_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

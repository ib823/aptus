-- 2608 WS5 — SAP's BDC Level on the affirm question bank.
--
-- Additive only. `AffirmQuestion.bdcLevel` records the Level column of the SAP
-- Business-Driven Configuration questionnaire a question came from ("L1" |
-- "L2" | "L3"), as read from the 2608 workbook — never inferred. NULL for the
-- 2602-era rows until the loader matches them to a 2608 sheet, and for rows
-- whose SAP sheet carries no Level (S4H_706 Process Automation).
--
-- No data is touched; no default; no index (the column is read per question,
-- never filtered on).

-- AlterTable
ALTER TABLE "AffirmQuestion" ADD COLUMN     "bdcLevel" TEXT;

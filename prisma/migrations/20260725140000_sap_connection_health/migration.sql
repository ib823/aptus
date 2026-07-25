-- Connection health for the Studio Connections screen.
--
-- Records the outcome of a read-only connectivity probe against a specific
-- SapConnection. `lastValidatedAt` moves ONLY on a real 200, so it can never
-- imply a health that was not observed; `lastValidationStatus` keeps "not set
-- up" (401/403) distinct from "unreachable" (5xx/timeout), because they are
-- different problems with different fixes.
--
-- Non-destructive: two nullable columns on an existing table.

-- AlterTable
ALTER TABLE "SapConnection" ADD COLUMN     "lastValidatedAt" TIMESTAMP(3),
ADD COLUMN     "lastValidationStatus" TEXT;

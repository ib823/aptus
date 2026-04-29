-- Add optional presence fields introduced in schema but missing from prior migration.
ALTER TABLE "PresenceRecord"
ADD COLUMN IF NOT EXISTS "userImage" TEXT,
ADD COLUMN IF NOT EXISTS "entityId" TEXT;

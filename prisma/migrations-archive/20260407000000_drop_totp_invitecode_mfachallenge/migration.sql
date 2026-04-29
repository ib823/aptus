-- Drop legacy second-factor and invite-code tables/columns now that the auth model
-- is "magic link first-touch + passkey upgrade". Passkey enrollment is the only
-- second factor; admin-issued 6-digit invite codes are replaced by magic links;
-- TOTP is removed entirely.

-- 1. Drop the InviteCode table (admin-issued 6-digit codes — replaced by magic links)
DROP TABLE IF EXISTS "InviteCode";

-- 2. Drop the MfaChallenge table (TOTP attempt tracking — TOTP removed)
DROP TABLE IF EXISTS "MfaChallenge";

-- 3. Drop legacy TOTP / MFA columns from User
ALTER TABLE "User"
  DROP COLUMN IF EXISTS "totpSecret",
  DROP COLUMN IF EXISTS "totpVerified",
  DROP COLUMN IF EXISTS "totpVerifiedAt",
  DROP COLUMN IF EXISTS "mfaMethod";

-- Remove Stripe-specific columns and the StripeWebhookEvent table. Payment
-- processing is not part of the product going forward; plan / limits stay
-- as internal-only fields powered by admin tooling.

ALTER TABLE "Organization" DROP COLUMN IF EXISTS "stripeCustomerId";
ALTER TABLE "Organization" DROP COLUMN IF EXISTS "stripeSubscriptionId";
ALTER TABLE "Organization" DROP COLUMN IF EXISTS "billingEmail";

DROP INDEX IF EXISTS "Organization_stripeCustomerId_idx";
DROP INDEX IF EXISTS "Organization_stripeCustomerId_key";
DROP INDEX IF EXISTS "Organization_stripeSubscriptionId_key";

DROP TABLE IF EXISTS "StripeWebhookEvent";

-- UsageEvent's stripeSent / stripeError fields are now meaningless.
ALTER TABLE "UsageEvent" DROP COLUMN IF EXISTS "stripeSent";
ALTER TABLE "UsageEvent" DROP COLUMN IF EXISTS "stripeError";
DROP INDEX IF EXISTS "UsageEvent_stripeSent_idx";

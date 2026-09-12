-- A durable record of every attempt to use an intentional auth backdoor.
--
-- `/api/auth/test-login` and `/api/auth/verify-izzat` mint real sessions — the
-- first as platform_admin by default. Both called `logBackdoorAttempt`, which
-- wrote `console.warn` beneath a comment describing it as "audit-logged". A
-- successful sign-in therefore left nothing inside the product: nothing to query,
-- nothing to join to the session it created, and a retention window owned by
-- whoever operates the log sink.
--
-- Additive: a new table, no change to any existing one.

CREATE TABLE "BackdoorAttempt" (
  "id"        TEXT NOT NULL,
  "endpoint"  TEXT NOT NULL,
  "outcome"   TEXT NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "email"     TEXT,
  "userId"    TEXT,
  "at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BackdoorAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BackdoorAttempt_at_idx" ON "BackdoorAttempt" ("at");
CREATE INDEX "BackdoorAttempt_endpoint_at_idx" ON "BackdoorAttempt" ("endpoint", "at");
CREATE INDEX "BackdoorAttempt_outcome_at_idx" ON "BackdoorAttempt" ("outcome", "at");

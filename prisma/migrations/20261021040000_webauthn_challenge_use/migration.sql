-- WebAuthnChallengeUse: passkey sign-in challenges that have been spent.
--
-- The WebAuthn challenge cookie is HMAC-signed and stateless, so a captured
-- sign-in (cookie plus assertion) minted a fresh session, which counts as
-- stepped up for the governance actions, for as long as the cookie lived; a
-- captured step-up replayed at the sign-in route did the same. The cookie now
-- carries the ceremony it was issued for, and the sign-in route records each
-- challenge here once its signature verifies: the primary key refuses a second
-- use. Rows are swept once the challenge would have expired.
--
-- Additive. The code already deployed neither reads nor writes it.

-- CreateTable
CREATE TABLE "WebAuthnChallengeUse" (
    "challengeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebAuthnChallengeUse_pkey" PRIMARY KEY ("challengeHash")
);

-- CreateIndex
CREATE INDEX "WebAuthnChallengeUse_expiresAt_idx" ON "WebAuthnChallengeUse"("expiresAt");

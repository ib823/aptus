-- One-time claim links: a URL that CREATES a key when opened.
--
-- THE ORDERING IS THE GUARANTEE. No SolutionClient row exists before the link
-- is opened, so an expired link has no key behind it to leak. Minting up front
-- and merely revealing would make "shown once" a UI convention described as a
-- guarantee, and would make the lane state after expiry a lie.
--
-- tokenHash is SHA-256 of the link token, the same shape SolutionClient uses:
-- a database copy grants nothing, and the raw token exists only in the URL.

CREATE TABLE "KeyClaimLink" (
    "id"              TEXT NOT NULL,
    "organizationId"  TEXT NOT NULL,
    "solutionId"      TEXT NOT NULL,
    "environment"     TEXT NOT NULL,
    "tokenHash"       TEXT NOT NULL,
    "createdById"     TEXT NOT NULL,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"       TIMESTAMP(3) NOT NULL,
    "claimedAt"       TIMESTAMP(3),
    "claimedClientId" TEXT,
    "revokedAt"       TIMESTAMP(3),
    "revokedReason"   TEXT,

    CONSTRAINT "KeyClaimLink_pkey" PRIMARY KEY ("id")
);

-- Unique so one token identifies exactly one link, and so the claim path can
-- look it up by hash without scanning.
CREATE UNIQUE INDEX "KeyClaimLink_tokenHash_key" ON "KeyClaimLink"("tokenHash");

-- Superseding a link for a lane ("send a new link") revokes the live one, which
-- reads by this key.
CREATE INDEX "KeyClaimLink_organizationId_solutionId_environment_idx"
    ON "KeyClaimLink"("organizationId", "solutionId", "environment");

-- Expiry sweeps and "which links are still live" both read by this key.
CREATE INDEX "KeyClaimLink_organizationId_expiresAt_idx"
    ON "KeyClaimLink"("organizationId", "expiresAt");

ALTER TABLE "KeyClaimLink"
    ADD CONSTRAINT "KeyClaimLink_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

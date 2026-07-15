-- CreateTable
CREATE TABLE "AffirmAccessGrant" (
    "id" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "roleLabel" TEXT,
    "tokenHash" TEXT NOT NULL,
    "valueStreamIds" TEXT[],
    "ackAt" TIMESTAMP(3),
    "pdpaVersion" TEXT,
    "otpHash" TEXT,
    "otpExpiresAt" TIMESTAMP(3),
    "otpAttemptCount" INTEGER NOT NULL DEFAULT 0,
    "otpVerifiedUaHashes" TEXT[],
    "lastAccessAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "supersededByGrantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffirmAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffirmGuestSession" (
    "id" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "uaHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endedReason" TEXT,

    CONSTRAINT "AffirmGuestSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AffirmAccessGrant_tokenHash_key" ON "AffirmAccessGrant"("tokenHash");

-- CreateIndex
CREATE INDEX "AffirmAccessGrant_bundleId_idx" ON "AffirmAccessGrant"("bundleId");

-- CreateIndex
CREATE INDEX "AffirmAccessGrant_email_idx" ON "AffirmAccessGrant"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AffirmGuestSession_tokenHash_key" ON "AffirmGuestSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AffirmGuestSession_grantId_idx" ON "AffirmGuestSession"("grantId");

-- AddForeignKey
ALTER TABLE "AffirmAccessGrant" ADD CONSTRAINT "AffirmAccessGrant_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "AffirmBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffirmAccessGrant" ADD CONSTRAINT "AffirmAccessGrant_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffirmAccessGrant" ADD CONSTRAINT "AffirmAccessGrant_supersededByGrantId_fkey" FOREIGN KEY ("supersededByGrantId") REFERENCES "AffirmAccessGrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffirmGuestSession" ADD CONSTRAINT "AffirmGuestSession_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "AffirmAccessGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;


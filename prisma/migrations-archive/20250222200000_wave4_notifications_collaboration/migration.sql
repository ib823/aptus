-- WAVE-4: Phase 19 (Notifications) + Phase 28 (Collaboration)
-- Adds PushSubscription, EditingLock, PresenceRecord models

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditingLock" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "lockedById" TEXT NOT NULL,
    "lockedByName" TEXT NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "EditingLock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresenceRecord" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "userRole" TEXT NOT NULL,
    "currentPage" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PresenceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_userId_endpoint_key" ON "PushSubscription"("userId", "endpoint");

-- CreateIndex
CREATE INDEX "EditingLock_assessmentId_isActive_idx" ON "EditingLock"("assessmentId", "isActive");

-- CreateIndex
CREATE INDEX "EditingLock_expiresAt_idx" ON "EditingLock"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "EditingLock_assessmentId_entityType_entityId_key" ON "EditingLock"("assessmentId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "PresenceRecord_assessmentId_lastSeenAt_idx" ON "PresenceRecord"("assessmentId", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "PresenceRecord_assessmentId_userId_key" ON "PresenceRecord"("assessmentId", "userId");

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditingLock" ADD CONSTRAINT "EditingLock_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditingLock" ADD CONSTRAINT "EditingLock_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresenceRecord" ADD CONSTRAINT "PresenceRecord_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresenceRecord" ADD CONSTRAINT "PresenceRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

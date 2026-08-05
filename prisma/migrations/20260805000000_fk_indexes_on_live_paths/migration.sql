-- CreateIndex
CREATE INDEX "ApiAccessGrant_solutionId_idx" ON "ApiAccessGrant"("solutionId");

-- CreateIndex
CREATE INDEX "TestCase_interfaceId_idx" ON "TestCase"("interfaceId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "PresalesBundleDecision_setByGrantId_idx" ON "PresalesBundleDecision"("setByGrantId");

-- CreateIndex
CREATE INDEX "PresalesAuditEvent_actorUserId_idx" ON "PresalesAuditEvent"("actorUserId");

-- CreateIndex
CREATE INDEX "AffirmResponse_questionId_idx" ON "AffirmResponse"("questionId");

-- CreateIndex
CREATE INDEX "DiscoveryEvent_actorId_idx" ON "DiscoveryEvent"("actorId");

-- CreateIndex
CREATE INDEX "DiscoveryNote_grantId_idx" ON "DiscoveryNote"("grantId");


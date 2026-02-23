-- Wave 6: Phase 22 (Conversation Mode), Phase 23 (Intelligent Dashboard), Phase 24 (Onboarding)

-- Phase 22: ConversationTemplate
CREATE TABLE "ConversationTemplate" (
    "id" TEXT NOT NULL,
    "scopeItemId" TEXT NOT NULL,
    "processStepId" TEXT NOT NULL,
    "questionFlow" JSONB NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConversationTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConversationTemplate_scopeItemId_processStepId_language_key"
    ON "ConversationTemplate"("scopeItemId", "processStepId", "language");
CREATE INDEX "ConversationTemplate_scopeItemId_idx"
    ON "ConversationTemplate"("scopeItemId");
CREATE INDEX "ConversationTemplate_isActive_idx"
    ON "ConversationTemplate"("isActive");

-- Phase 22: ConversationSession
CREATE TABLE "ConversationSession" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scopeItemId" TEXT NOT NULL,
    "currentQuestionId" TEXT,
    "responses" JSONB NOT NULL DEFAULT '[]',
    "derivedClassifications" JSONB,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "ConversationSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConversationSession_assessmentId_userId_idx"
    ON "ConversationSession"("assessmentId", "userId");
CREATE INDEX "ConversationSession_assessmentId_scopeItemId_idx"
    ON "ConversationSession"("assessmentId", "scopeItemId");
CREATE INDEX "ConversationSession_status_idx"
    ON "ConversationSession"("status");

-- Phase 23: DashboardWidget
CREATE TABLE "DashboardWidget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "widgetType" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "settings" JSONB,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "DashboardWidget_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DashboardWidget_userId_idx"
    ON "DashboardWidget"("userId");
CREATE INDEX "DashboardWidget_userId_isVisible_idx"
    ON "DashboardWidget"("userId", "isVisible");

ALTER TABLE "DashboardWidget"
    ADD CONSTRAINT "DashboardWidget_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Phase 23: DashboardDeadline
CREATE TABLE "DashboardDeadline" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "assignedRole" TEXT,
    "assignedUser" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "completedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DashboardDeadline_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DashboardDeadline_assessmentId_idx"
    ON "DashboardDeadline"("assessmentId");
CREATE INDEX "DashboardDeadline_dueDate_idx"
    ON "DashboardDeadline"("dueDate");
CREATE INDEX "DashboardDeadline_assignedRole_idx"
    ON "DashboardDeadline"("assignedRole");
CREATE INDEX "DashboardDeadline_status_idx"
    ON "DashboardDeadline"("status");

-- Phase 24: OnboardingProgress
CREATE TABLE "OnboardingProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "completedSteps" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "skippedSteps" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "OnboardingProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OnboardingProgress_userId_key"
    ON "OnboardingProgress"("userId");

ALTER TABLE "OnboardingProgress"
    ADD CONSTRAINT "OnboardingProgress_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Phase 24: OnboardingTooltip
CREATE TABLE "OnboardingTooltip" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tooltipKey" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OnboardingTooltip_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OnboardingTooltip_userId_tooltipKey_key"
    ON "OnboardingTooltip"("userId", "tooltipKey");
CREATE INDEX "OnboardingTooltip_userId_idx"
    ON "OnboardingTooltip"("userId");

ALTER TABLE "OnboardingTooltip"
    ADD CONSTRAINT "OnboardingTooltip_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "AffirmProcessChapter" (
    "id" TEXT NOT NULL,
    "scopeItemId" TEXT NOT NULL,
    "chapterNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "stepStart" INTEGER NOT NULL,
    "stepEnd" INTEGER NOT NULL,
    "roles" TEXT[],
    "fioriApps" TEXT[],
    "benefitNote" TEXT,

    CONSTRAINT "AffirmProcessChapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffirmScopeItemStory" (
    "scopeItemId" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "outcomeBullets" TEXT[],
    "kpiHints" TEXT[],
    "integrationNotes" TEXT[],
    "sourceAttribution" TEXT NOT NULL,
    "processNavigatorUrl" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "AffirmScopeItemStory_pkey" PRIMARY KEY ("scopeItemId")
);

-- CreateIndex
CREATE INDEX "AffirmProcessChapter_scopeItemId_idx" ON "AffirmProcessChapter"("scopeItemId");

-- CreateIndex
CREATE UNIQUE INDEX "AffirmProcessChapter_scopeItemId_chapterNumber_key" ON "AffirmProcessChapter"("scopeItemId", "chapterNumber");

-- CreateIndex
CREATE INDEX "AffirmScopeItemStory_reviewedAt_idx" ON "AffirmScopeItemStory"("reviewedAt");

-- AddForeignKey
ALTER TABLE "AffirmProcessChapter" ADD CONSTRAINT "AffirmProcessChapter_scopeItemId_fkey" FOREIGN KEY ("scopeItemId") REFERENCES "AffirmScopeItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffirmScopeItemStory" ADD CONSTRAINT "AffirmScopeItemStory_scopeItemId_fkey" FOREIGN KEY ("scopeItemId") REFERENCES "AffirmScopeItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffirmScopeItemStory" ADD CONSTRAINT "AffirmScopeItemStory_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


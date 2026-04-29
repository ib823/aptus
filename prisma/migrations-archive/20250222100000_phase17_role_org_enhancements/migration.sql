-- Phase 17: Role System & Organization Model enhancements

-- User: add jobTitle, department, phone, lastActiveAt
ALTER TABLE "User" ADD COLUMN "jobTitle" TEXT;
ALTER TABLE "User" ADD COLUMN "department" TEXT;
ALTER TABLE "User" ADD COLUMN "phone" TEXT;
ALTER TABLE "User" ADD COLUMN "lastActiveAt" TIMESTAMP(3);

-- Organization: add viewerCanExport, dataRetentionDays, ssoExclusive, ssoEntityId, reportLogoUrl
ALTER TABLE "Organization" ADD COLUMN "viewerCanExport" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organization" ADD COLUMN "dataRetentionDays" INTEGER;
ALTER TABLE "Organization" ADD COLUMN "ssoExclusive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organization" ADD COLUMN "ssoEntityId" TEXT;
ALTER TABLE "Organization" ADD COLUMN "reportLogoUrl" TEXT;

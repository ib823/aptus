-- AlterTable: Add soft-delete fields to Comment model
ALTER TABLE "Comment" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Comment" ADD COLUMN "deletedAt" TIMESTAMP(3);

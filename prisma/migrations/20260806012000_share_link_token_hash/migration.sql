-- Share-link tokens become hashes. The plaintext column goes nullable for the
-- dual-read window: a legacy row upgrades (hash written, plaintext nulled) on
-- its first successful use. New links store only the SHA-256.
ALTER TABLE "AssessmentShareLink" ALTER COLUMN "token" DROP NOT NULL;
ALTER TABLE "AssessmentShareLink" ADD COLUMN "tokenHash" TEXT;
CREATE UNIQUE INDEX "AssessmentShareLink_tokenHash_key" ON "AssessmentShareLink"("tokenHash");

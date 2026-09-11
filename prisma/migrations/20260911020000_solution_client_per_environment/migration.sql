-- DropIndex
DROP INDEX "SolutionClient_organizationId_solutionId_key";

-- DropIndex
DROP INDEX "SolutionClient_solutionId_key";

-- CreateIndex
CREATE INDEX "SolutionClient_organizationId_solutionId_idx" ON "SolutionClient"("organizationId", "solutionId");

-- CreateIndex
CREATE UNIQUE INDEX "SolutionClient_organizationId_solutionId_environment_key" ON "SolutionClient"("organizationId", "solutionId", "environment");


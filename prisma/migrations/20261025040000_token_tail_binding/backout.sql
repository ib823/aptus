-- Backout for 20261025040000_token_tail_binding (P0.3 A45, wave 2 integration
-- review round 4).
--
-- In this file, not in migration.sql, because an applied migration is never
-- edited (docs/runbooks/coreedge-release.md). Prisma reads only migration.sql.
--
-- Backouts run newest first, so this one runs before
-- 20261025010000_truthful_registers drops the column (the function does not
-- fail without it either). What it loses: only the rule; no row changes.
-- Without it, a key changed by code before P0.3 keeps the previous key's tail
-- (docs/runbooks/coreedge-truthful-screens.md, Backout). Dropping it is never
-- needed for safety: the trigger refuses nothing and writes only "tokenTail".
--
-- Print it with its _prisma_migrations line:
--   pnpm migrations:backout-sql 20261025040000_token_tail_binding
DROP TRIGGER "SolutionClient_token_tail_binding" ON "SolutionClient";
DROP FUNCTION "solution_client_token_tail_binding"();

-- SolutionClient.tokenTail is bound to the key it describes (P0.3 A45, wave 2
-- integration review round 4).
--
-- The tail is the last four characters of the CURRENT key, written beside its
-- hash by every mint since P0.3. The code before P0.3 does not know the
-- column: rolled back to it (the release protocol's Instant Rollback keeps
-- the additive migrations), a rotation, a re-issue or a collected claim link
-- writes a new "tokenHash" and leaves the previous key's tail in place, so
-- after rolling forward every screen showed the masked reference of a key
-- that no longer exists, and a leaked key could not be matched to its row.
--
-- So the database holds the rule, whichever build writes: an UPDATE that
-- changes "tokenHash" without writing a new "tokenTail" clears the tail, and
-- the screens say "ending not recorded" until the next mint records it. Every
-- mint since P0.3 writes both in one statement, so it keeps its own tail. The
-- one exception is a new key whose last four happen to equal the old key's
-- (one in 64^4): its tail is cleared too, which is still never a wrong
-- reference. The rule is a trigger because it must hold for code that
-- predates it; the screens never read the hash (tests/unit/ops).
--
-- Additive: one function and one trigger. It never refuses a statement and
-- touches no column but "tokenTail"; nothing that works today can be refused
-- by it. It reads the tail through the row's JSON rather than by name, so a
-- schema without the column (20261025010000_truthful_registers backed out on
-- its own) leaves it a no-op instead of failing every key change.

CREATE OR REPLACE FUNCTION "solution_client_token_tail_binding"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."tokenHash" IS DISTINCT FROM OLD."tokenHash"
     AND to_jsonb(OLD) ? 'tokenTail'
     AND (to_jsonb(NEW) -> 'tokenTail') IS NOT DISTINCT FROM (to_jsonb(OLD) -> 'tokenTail') THEN
    NEW := jsonb_populate_record(NEW, '{"tokenTail": null}'::jsonb);
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE TRIGGER "SolutionClient_token_tail_binding"
BEFORE UPDATE OF "tokenHash" ON "SolutionClient"
FOR EACH ROW EXECUTE FUNCTION "solution_client_token_tail_binding"();

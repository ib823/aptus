-- 2608 WS9 — ConfigActivity.mainScopeItemCodes: every scope item an activity
-- applies to, not only the first one the loader kept.
--
-- `scopeItemId` stores firstScopeItemId(rawScopeItemIds) and every consumer
-- joins on it, so an SSCUI naming hundreds of scope items was reachable from
-- exactly one. `rawScopeItemIds` always carried the full list, but as an
-- unindexed string no query could use it.
--
-- Additive and self-backfilling: the column is derived here from data already
-- in the table, so no re-import and no large insert is needed. Rows written
-- before this migration are covered; the loader fills it from now on.

ALTER TABLE "ConfigActivity"
  ADD COLUMN "mainScopeItemCodes" TEXT[] NOT NULL DEFAULT '{}';

-- Backfill. rawScopeItemIds is set only where the raw value differed from the
-- single stored id, so fall back to scopeItemId when it is null. Split on
-- comma or semicolon, trim, drop empties. "All" survives as a single element.
UPDATE "ConfigActivity"
SET "mainScopeItemCodes" = COALESCE(
  (
    SELECT array_agg(t)
    FROM (
      SELECT DISTINCT btrim(x) AS t
      FROM unnest(
        regexp_split_to_array(COALESCE("rawScopeItemIds", "scopeItemId"), '[,;]')
      ) AS x
      WHERE btrim(x) <> ''
    ) s
  ),
  '{}'
);

CREATE INDEX "ConfigActivity_mainScopeItemCodes_idx"
  ON "ConfigActivity" USING GIN ("mainScopeItemCodes");

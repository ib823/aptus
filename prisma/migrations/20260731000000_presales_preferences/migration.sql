-- Consultant presales preferences — the column the settings form never had.
--
-- /presales/settings has rendered and POSTed this form since Pass 7; the
-- receiving route was a no-op that answered with a success-shaped 303
-- redirect. Users pressed Save and nothing was stored. NULL means "never
-- saved" (the form falls back to its built-in defaults), which is why there
-- is no backfill and no default value here.
ALTER TABLE "User" ADD COLUMN "presalesPreferences" JSONB;

-- System-level audit events (org governance, catalogue imports, onboarding)
-- were written with assessmentId "system"/"SYSTEM", violating the FK on every
-- call — no Assessment with that id exists — so the writes threw or were silently
-- swallowed. NULL is the honest value: these events have no assessment.
ALTER TABLE "DecisionLogEntry" ALTER COLUMN "assessmentId" DROP NOT NULL;

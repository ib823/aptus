-- Why the broker refused before it reached a connection.
--
-- A binding refusal audits as HTTP 403 with a null connection — byte-identical
-- to a grant-gate refusal, which is also 403 with a null connection. Without the
-- reason, the one event meaning "no connection serves the environment this
-- credential asked for" could not be told apart from "you have no grant", so
-- nothing could score it.
--
-- Nullable: null means the call was not refused at the binding step, which is
-- true of every row written before this column existed and of every call that
-- reached a connection.

ALTER TABLE "NorthboundAuditEvent" ADD COLUMN "bindingRefusal" TEXT;

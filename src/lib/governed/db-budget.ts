/**
 * The database budget per governed call (P0.19).
 *
 * WHY A BUDGET. The documented pool is `connection_limit=5` per serverless
 * instance (.env.example), and the roadmap adds database work to every call
 * (decision-log rows P3.5, manifest lookups P3.1, the audit outbox and chain
 * P3.10, twin queries P1.6). Each SQL statement holds one pooled connection
 * for a round trip, so the number of statements a call sends is what decides
 * how many calls an instance can serve at once and how much of a call's
 * latency is ours. Before P0.19 a served read sent seven and a write eleven.
 *
 * WHAT COUNTS. Every SQL statement the call sends, on the response path or
 * after it (`afterResponse`): moving work after the response shortens the
 * call, it does not spare a connection. BEGIN and COMMIT count. The budget
 * is checked in CI by tests/integration/governed-db-budget.test.ts, which
 * counts Prisma's query events against PostgreSQL for the main paths: a
 * served read, a read refused by its grant, a read refused by its key's
 * state, a served write and a replayed write.
 *
 * THE BUDGETS, steady state (a warm instance, a key stamped in the last
 * minute):
 *
 *   read  4  — today 3: the key (one statement for the current, previous
 *              and retired keys and the solution's status), the interface
 *              with its grants and connections, the audit row.
 *   write 5  — today 5: the read's 3, plus the Idempotency-Key claimed
 *              before SAP is called and its outcome stored after. A write
 *              differs because those two must be separate statements on
 *              either side of the SAP call: merged into one, a transaction
 *              would be held open across SAP, which this pipeline never does.
 *              A replay is 5 too: the claim is refused by the key's unique
 *              constraint and the stored outcome is read.
 *
 * OCCASIONAL STATEMENTS, outside the steady state and each bounded:
 *
 *   - the key's `lastUsedAt` stamp: at most once a minute per key, after
 *     the response (auth.ts LAST_USED_STAMP_INTERVAL_MS): +1, within budget;
 *   - the first-call milestone (P2.12): once per app and environment per
 *     instance, after the response: +3 (createMany's BEGIN, INSERT, COMMIT);
 *   - an organisation's data key (P0.10): once per organisation per
 *     instance per 10 minutes (DATA_KEY_CACHE_TTL_MS): +1;
 *   - an unbound legacy grant's use stamp (P0.1): at most hourly per grant,
 *     and only while COREEDGE_GRANT_BINDING is legacy: +1;
 *   - a write whose Idempotency-Key expired: +1 (the renewal).
 *
 * A later item that needs another statement per call either fits under the
 * budget, merges into a statement already sent, or changes this file with a
 * reason the review accepts. Docs: docs/runbooks/coreedge-db-budget.md.
 */

export const DB_BUDGET = {
  /** A read through the pipeline, served or refused. */
  read: 4,
  /** A write through the pipeline, created, refused or replayed. */
  write: 5,
} as const;

export type BudgetedOperation = keyof typeof DB_BUDGET;

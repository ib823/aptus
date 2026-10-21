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
 *              A replay is 5 too: the claim finds the key held (ON CONFLICT,
 *              so no error is raised or logged) and the stored outcome is
 *              read.
 *
 *   console 4 — today 3 (P0.14b review round 3): a Workbench console read
 *              that makes one call to SAP — the preview, the operations
 *              dashboard, a capability or catalogue probe, Probe all's run,
 *              an Ariba call — on a stored connection: the connection, the
 *              organization's console row, and the platform-scope row with
 *              its outcome in one statement (audit/platform-audit.ts
 *              `consoleReadInsert`; a nested create was five, a transaction
 *              included, and took a preview from 2 to 7). Refused by the
 *              environment ceiling: 4, the grant lookup added. A deployment
 *              tenant has no connection to read: 2. A route that makes two
 *              calls (the entity list with its probe fan-out) records each
 *              call's two rows. Work a route adds besides the call (Probe
 *              all's catalogue query and per-service result writes, the
 *              capability probe's own audit) is that route's, not the
 *              pipeline's. tests/integration/governed-db-budget.test.ts
 *              asserts a served and a refused preview and the operations
 *              dashboard.
 *
 * OCCASIONAL STATEMENTS, outside the steady state and each bounded. Counted
 * as Prisma sends them: `createMany` and `updateMany` are BEGIN, the
 * statement and COMMIT, three round trips, so none of these uses them except
 * the milestone (review round 1 measured them on PostgreSQL;
 * tests/integration/governed-db-budget.test.ts asserts all but the data key):
 *
 *   - the key's `lastUsedAt` stamp, at most once a minute per key (auth.ts
 *     LAST_USED_STAMP_INTERVAL_MS) and so on most calls of a low-volume app.
 *     A write that claims its Idempotency-Key (created, replayed or in
 *     conflict) carries it in the claim's own statement: +0, still 5. A read,
 *     or a write refused before its claim, stamps it after the response: +1,
 *     within budget (4, and at most 4 for the write);
 *   - a write whose Idempotency-Key had expired: +0, renewed by the claim's
 *     own ON CONFLICT arm;
 *   - an unbound legacy grant's use stamp (P0.1): at most hourly per grant,
 *     only while COREEDGE_GRANT_BINDING is legacy, after the response, one
 *     UPDATE: +1 (a read 4; a write that hour 6);
 *   - the first-call milestone (P2.12): once per app and environment per
 *     instance, after the response: +3 (createMany's BEGIN, INSERT, COMMIT);
 *   - an organisation's data key (P0.10): once per organisation per
 *     instance per 10 minutes (DATA_KEY_CACHE_TTL_MS): +1.
 *
 * The last three can take a call over its steady-state budget, once per
 * period each, and two can coincide; they are rare by construction (hourly,
 * once per instance, ten-minutely), which is why they are budgeted as
 * occasional rather than raising the budget every call is held to.
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
  /**
   * A Workbench console read that makes one call to SAP (P0.14b): the
   * preview, the operations dashboard, a capability or catalogue probe, an
   * Ariba call, served or refused by a console step.
   */
  consoleRead: 4,
} as const;

export type BudgetedOperation = keyof typeof DB_BUDGET;

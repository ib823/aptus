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
 *   console 4 — today 4 (P0.14b review rounds 3 to 5): a Workbench
 *              console read is a read through the pipeline, held to the
 *              read's budget. One that makes one call to SAP and does
 *              nothing else — the preview, the entity list without its
 *              probe fan-out, the operations dashboard — on a stored
 *              connection: the person's session
 *              (the `authenticate` step, as the read counts its key; one
 *              joined statement, auth/session.ts `sessionLookup`, validated
 *              once per request), the connection WITH the grants its
 *              environment ceiling judges (governed/call-loads.ts
 *              `loadConsoleConnection`, one statement), the organization's
 *              console row, and the platform-scope row with its outcome in
 *              one statement (audit/platform-audit.ts `consoleReadInsert`):
 *              4, on any environment, served or refused. Round 4 had raised
 *              this budget to 5 for a TEST, PROD or undeclared connection,
 *              whose ceiling looked its grants up apart; review round 5 put
 *              that lookup in the connection's statement instead. It is
 *              still read with every call, never cached (an authorisation a
 *              cache would let outlive a revoked grant), and the two rows
 *              stay two statements (two trails, each written so that its
 *              failure never loses the other or the read). A deployment
 *              tenant has no connection and no grant to read: 3. An Ariba call has no
 *              connection and no organization row: 3, the session, the
 *              platform row and the assessment trail's decision-log entry
 *              the route has always written beside it (best effort).
 *              Until review round 4 the session was mocked in
 *              the test, so these figures left it out: it was three
 *              statements (Prisma's nested select), sent twice (the probe
 *              guard and the route each validated it), and a warm DEV
 *              preview sent 9. The session's `lastActiveAt` stamp is
 *              occasional: at most once every five minutes per session, +1.
 *              tests/integration/governed-db-budget.test.ts asserts a served
 *              DEV and PROD preview, a refused preview, the entity list, the
 *              operations dashboard and an Ariba call, with the session
 *              validated against PostgreSQL.
 *
 *   THE OTHER CONSOLE ROUTES are not one call and nothing else, and are NOT
 *   held to 4 (review round 6: rounds 3 to 5 said they were, while CI
 *   measured only the preview, operations and the Ariba call). Each sends
 *   the console read's statements plus work of its own that predates the
 *   pipeline, stated in CONSOLE_ROUTE_STATEMENTS below and asserted, route by
 *   route, by the same test: the entity list's probe fan-out (two calls, each
 *   with its two rows), the capability probe (its catalogue read and the
 *   decision-log entry it has always written), the catalogue detail probe
 *   (the catalogue row it shows), the catalogue list's live overlay (the
 *   page's own catalogue queries, which vary with the page) and Probe all (a
 *   fixed part plus one stored result per service probed). They are
 *   operator-triggered and rate- or role-limited, not the call path an
 *   application drives; their extra statements are the catalogue's, not the
 *   pipeline's.
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
   * A Workbench console read that makes one call to SAP and does nothing
   * else (P0.14b): the preview, the entity list without its probe fan-out,
   * the operations dashboard, an Ariba call, served or refused by a console
   * step, its session included. A read through the pipeline, so the read's
   * budget: the ceiling's grants ride in the connection's statement (review
   * round 5). The console routes that add work of their own are in
   * CONSOLE_ROUTE_STATEMENTS (review round 6).
   */
  consoleRead: 4,
} as const;

export type BudgetedOperation = keyof typeof DB_BUDGET;

/**
 * WHAT THE CONSOLE ROUTES THAT DO MORE THAN ONE READ SEND (P0.14b review
 * round 6), warm, on a stored DEV connection, served. Measured, and asserted
 * exactly by tests/integration/governed-db-budget.test.ts, so a change in
 * any of them is seen; not a budget the read is held to. Each includes the
 * console read's statements (`DB_BUDGET.consoleRead`).
 */
export const CONSOLE_ROUTE_STATEMENTS = {
  /** `/api/sap/tdd/entities?probe=1`: two calls (the metadata, then the probe fan-out), each with its two rows. */
  entityListWithProbe: 6,
  /**
   * `/api/sap/tdd/capabilities`: the console read's 4, the dynamic catalogue
   * read the probe targets come from (an edition product's), and the
   * decision-log entry the route has always written (best effort).
   */
  capabilityProbe: 6,
  /**
   * `/api/sap/tdd/hub-content/[id]` with a live probe of an OData V2 API: the
   * console read's 4, the catalogue row it shows, and (P1.2, on S/4HANA Cloud
   * Public Edition) the communication scenarios SAP's table lists the service
   * under, one statement with its release. A V4 address adds 2 (its
   * verification written, then read back); an item whose prerequisites are
   * resolved adds the scope-item reads. The catalogue LIST adds the same one
   * scenario statement per page (none when no row on it has a joinable
   * address); it is not a governed call.
   */
  catalogueDetailProbe: 6,
  /**
   * Probe all (`/api/sap/tdd/hub-content/probe-all`), a run, not a call: the
   * console read's 4, the candidate rows, and the decision-log entry...
   */
  probeAllFixed: 6,
  /** ...plus one stored result per service probed (and one more per V4 address it verifies or withdraws). */
  probeAllPerService: 1,
  /**
   * P1.2's live tenant service listing (`POST /api/sap/tdd/tenant-services`),
   * on a stored S/4 Public DEV connection, a listing with entries: the console
   * read's 4 (the session, the connection with its ceiling's grants, the
   * console row, the platform row), the catalogue rows the listed names could
   * be, the scenarios SAP's table lists them under, and the listing's upsert.
   * Refused at authorise, bind or contain it is the console read's own figure.
   */
  tenantServiceList: 7,
  /**
   * Its stored read (`GET /api/studio/tenant-services`): no SAP call and no
   * audit row, since no system is read. The session, the connection, the
   * listing, who listed it, and the Published entries' scenarios.
   */
  tenantServiceListStored: 5,
} as const;

/**
 * WHAT GET /schema SENDS (P1.3 on P0.19), and its /v1 alias, which is the
 * same handler. NOT a governed read: it reaches no SAP system, so it is not on
 * the pipeline and not held to `DB_BUDGET.read`. It serves the texts a verify
 * stored (P1.3, lib/contracts/snapshot.ts) and renders nothing. Measured warm
 * (a key stamped in the last minute), and asserted exactly by
 * tests/integration/governed-db-budget.test.ts, so a change in either is seen.
 */
export const NORTHBOUND_SCHEMA_STATEMENTS = {
  /**
   * A contract a verify recorded: the key (the governed read's one-statement
   * lookup), the interface, the captured schema's stamp and size, the current
   * snapshot's summary, its stored texts, and the audit row. A captured
   * schema of this contract adds its read (+1); texts a record moved between
   * the summary and the texts read the new head once more (+1, rare). The
   * key's `lastUsedAt` stamp, at most once a minute per key: +1.
   */
  compiled: 6,
  /** No contract recorded yet: the same, without the texts. */
  none: 5,
} as const;

/**
 * WHAT DISCOVERY SENDS (GET /api/northbound/interfaces, and its /v1 alias,
 * which is the same handler). NOT a governed read either: it lists the
 * solution's interfaces and reaches no SAP system. Measured warm (a key
 * stamped in the last minute) and asserted exactly by
 * tests/integration/governed-db-budget.test.ts. Its key's `lastUsedAt` stamp
 * follows the governed calls' rule, at most once a minute per key (+1); it
 * was written on every call before.
 *
 * The verdicts' part varies with the solution (northbound/read-verdict.ts,
 * COST): one connections query per SAP product among the interfaces that
 * pass the grant gate, and one catalogue lookup per distinct service among
 * those that also bind and that is not in the curated list. The figures below
 * are for one product whose granted services are curated, the measured case;
 * each further product adds 1, each such catalogue service 1.
 */
export const NORTHBOUND_DISCOVERY_STATEMENTS = {
  /**
   * Warm: the key (the governed read's one-statement lookup), the solution's
   * interfaces, their grants, the connections their verdicts are read
   * against, and the audit row.
   */
  warm: 5,
  /** A key last stamped over a minute ago: the same, plus the stamp. */
  stamped: 6,
  /** No interface passes the grant gate (none granted in the key's environment): no connections are read. */
  nothingGranted: 4,
} as const;

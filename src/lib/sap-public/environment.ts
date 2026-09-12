/**
 * The SAP environment vocabulary — the one gate between a string and the enum.
 *
 * `SapConnection.environment` was TEXT and is now `SapEnvironment` (settled
 * decision D1). Two columns it is compared against — `SolutionClient.environment`
 * and `ApiAccessGrant.environment` — are still `String`, written by paths this
 * change does not touch, so every comparison between them still runs through a
 * parse rather than an `===` on two differently-typed values.
 *
 * WHY A MODULE AND NOT AN INLINE CAST. The conversion has to agree with the SQL
 * in `migrations/20260912010000_sap_environment_enum` exactly: a row that the
 * migration turned into NULL must not be re-accepted here under the same
 * spelling, and a spelling the migration accepted must not be refused on the
 * next save. One table, two consumers, no drift.
 *
 * THIS MODULE MUST NOT IMPORT PRISMA. It is read by the connections form's
 * validation (a route), by the resolver (server), and by tests; pulling the
 * client in would put a database dependency on the vocabulary itself. The enum
 * is re-declared here as a union rather than imported from `@prisma/client` for
 * the same reason, and `ENVIRONMENT_VALUES` is asserted against the generated
 * Prisma enum in `tests/unit/sap-public/environment.test.ts` so the two cannot
 * drift apart silently.
 */

/** The four trust levels, in ascending order of trust — the order the UI shows. */
export const ENVIRONMENT_VALUES = ["SANDBOX", "DEV", "TEST", "PROD"] as const;

export type SapEnvironment = (typeof ENVIRONMENT_VALUES)[number];

/**
 * Aliases the conversion accepts, mirroring the migration's CASE arms exactly.
 *
 * Deliberately short. Every entry here is a spelling seen in real SAP landscape
 * naming; anything absent becomes NULL rather than being guessed at, because the
 * guess this column exists to prevent is exactly "a row labelled something we do
 * not recognise is probably not production".
 */
const ALIASES: Readonly<Record<string, SapEnvironment>> = {
  SANDBOX: "SANDBOX",
  SBX: "SANDBOX",
  DEV: "DEV",
  DEVELOPMENT: "DEV",
  TEST: "TEST",
  QA: "TEST",
  QAS: "TEST",
  PROD: "PROD",
  PRD: "PROD",
  PRODUCTION: "PROD",
};

/**
 * A string to an environment, or null when it names none.
 *
 * NULL IS NOT A FAILURE, it is the undeclared state — the resolver has always
 * modelled it (a read proceeds flagged `bindingUnverified`, a write refuses with
 * `UNDECLARED_ENVIRONMENT_WRITE`). A caller that needs to tell "the user left it
 * blank" from "the user typed something we do not accept" should check
 * `isUnrecognisedEnvironment` first; the connections route does, because those
 * two want different sentences on the form.
 */
export function parseSapEnvironment(
  value: string | null | undefined,
): SapEnvironment | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toUpperCase();
  if (!key) return null;
  return ALIASES[key] ?? null;
}

/** True when the caller typed something non-empty that names no environment. */
export function isUnrecognisedEnvironment(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return parseSapEnvironment(trimmed) === null;
}

/** True for exactly the four canonical words, in canonical casing. */
export function isSapEnvironment(value: unknown): value is SapEnvironment {
  return (
    typeof value === "string" &&
    (ENVIRONMENT_VALUES as readonly string[]).includes(value)
  );
}

/**
 * Environments a caller-driven live SAP read is allowed to touch.
 *
 * Used by the `/api/sap/tdd/*` guard (audit E15). The rule is progressive trust:
 * a read a human triggered from a console, with no `ApiAccessGrant` behind it,
 * may reach the two landscapes where a mistake is cheap and may not reach the
 * two where it is not. TEST is excluded alongside PROD on purpose — a client's
 * TEST system holds their data and answers to their change control, and "it is
 * only test" is the sentence that precedes the incident.
 */
export const UNGRANTED_READ_ENVIRONMENTS: readonly SapEnvironment[] = ["SANDBOX", "DEV"];

export function allowsUngrantedRead(env: SapEnvironment | null): boolean {
  // NULL is undeclared, and undeclared never qualifies: the whole point of the
  // restriction is knowing which landscape you are in.
  return env !== null && UNGRANTED_READ_ENVIRONMENTS.includes(env);
}

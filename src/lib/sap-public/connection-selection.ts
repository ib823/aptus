/**
 * WHICH CONNECTION A CREDENTIAL BINDS TO — the decision alone, with no I/O.
 *
 * Moved here from connection-resolver.ts (P0.2) so that a module that may not
 * reach the database — the lane derivation, which a browser component imports
 * — can ask the broker's own question instead of keeping a copy of it. The
 * resolver re-exports every name, so no importer changed.
 */

/**
 * Resolve the connection for a CALLER'S DECLARED ENVIRONMENT — the binding the
 * broker must use, and the reason `resolveSapConnection` (connection-resolver.ts)
 * is not safe on a
 * runtime path.
 *
 * THE DEFECT THIS CLOSES. `resolveSapConnection` ends at `all[0]` — the OLDEST
 * active connection for an org+product. The grant check matches an environment,
 * but it matches it against the TOKEN's environment and then stops; nothing ever
 * compared it to the connection actually called. An organization holding a PROD
 * connection created before its SANDBOX one served every call — reads AND writes
 * — from PROD, while the audit row sincerely recorded "SANDBOX". The environment
 * ladder was enforced on paper and not on the wire.
 *
 * THE RULE, and why it is split by operation. `SapConnection.environment` shipped
 * one day before this fix, so an undeclared environment is an UNBACKFILLED estate,
 * not a legacy one. Refusing every undeclared connection would break every
 * deployment on day one over a column nobody has had the chance to fill, and would
 * push operators to type a guessed value purely to clear the error — manufacturing
 * exactly the fabricated environments the console's chip exists to prevent. So:
 *
 *   - A declared connection matching the caller's environment  → use it.
 *   - Two or more matches                                      → refuse. Ambiguity
 *     must never be resolved by creation order; that is the original bug.
 *   - Undeclared, and it is the org's ONLY connection:
 *       READ  → allow, flagged `bindingUnverified` so the audit row and the
 *               operations console can both say the binding was not proven.
 *       WRITE → REFUSE, always. `writeEnabled` is no substitute: it is a
 *               per-connection yes/no that says nothing about WHICH landscape it
 *               enables writes on. A read against an undeclared landscape is a
 *               disclosure risk that already exists; a write is a record created
 *               in a customer's ledger with nobody having declared it production,
 *               and it cannot be taken back.
 *   - Anything else                                            → refuse.
 *
 * The permissive read is a BACKLOG, not a home: `bindingUnverified` is counted in
 * the operations console and is expected to trend to zero as environments are
 * declared.
 */
export type ConnectionBindingFailure =
  /** The organization has no active connection at all for this product. */
  | "NO_CONNECTION"
  /**
   * A connection declares this environment, but none carries the SAP client
   * the caller's credential is bound to. Distinct from NO_MATCH_FOR_ENVIRONMENT
   * because the fix is different: the landscape is configured, the data
   * container is not.
   */
  | "NO_MATCH_FOR_CLIENT"
  /** It has connections, but none declares this environment. */
  | "NO_MATCH_FOR_ENVIRONMENT"
  /** Several candidates and no way to choose — refuse rather than guess. */
  | "AMBIGUOUS"
  /**
   * NOTHING declares the caller's environment, and more than one connection
   * has not declared its own — so none can be assumed to be it.
   *
   * This used to fall through to AMBIGUOUS, and AMBIGUOUS's sentence says "more
   * than one SAP connection could serve the SANDBOX environment". With one DEV
   * row and one undeclared row that is false — zero connections declare
   * SANDBOX — and it sent the developer hunting for a duplicate that did not
   * exist, with a suggested fix ("declare a distinct environment on each") that
   * was not the fix. The situation is different, so it gets its own name and
   * its own sentence: declare the environment on the undeclared rows.
   */
  | "NO_DECLARED_CANDIDATE"
  /** A write against a connection that has not declared its landscape. */
  | "UNDECLARED_ENVIRONMENT_WRITE"
  /**
   * A stored connection row could not be resolved at all — an authType outside
   * the vocabulary, or secrets that failed to open (key rotation, AAD
   * mismatch, corruption). Before this reason existed the resolver's throw
   * escaped the northbound routes as an unhandled 500 with NO audit row and no
   * correlation id: an organization whose row went bad lost its whole
   * northbound surface and the trail showed nothing. A refusal with a name is
   * the honest shape — the caller gets an actionable sentence, the audit gets
   * a countable reason.
   */
  | "CONNECTION_UNREADABLE"
  /**
   * The INTERFACE names a product the connector registry does not know. Not an
   * estate state at all — an interface-config defect — and it used to be
   * audited as NO_CONNECTION, which the incident coverage deliberately
   * excludes as "has not started": a permanently broken interface was
   * invisible to every rule and its caller was told to configure a connection
   * that would never have helped.
   */
  | "UNKNOWN_PRODUCT";


/** The two fields the binding decides on — so the SELECTION can run on rows that were never decrypted. */
export interface BindableConnection {
  environment: string | null;
  client: string | null;
}

function normalizedEnvironmentOf(conn: BindableConnection): string | null {
  const raw = conn.environment?.trim();
  return raw ? raw.toUpperCase() : null;
}

export type ConnectionSelection<T extends BindableConnection> =
  | { ok: true; connection: T; bindingUnverified: boolean }
  | { ok: false; reason: Exclude<ConnectionBindingFailure, "CONNECTION_UNREADABLE" | "UNKNOWN_PRODUCT"> };

/**
 * THE DECISION, SEPARATED FROM THE SECRETS. Which connection a credential's
 * environment + SAP client selects depends on nothing but `environment` and
 * `client` across the organization's active rows — so it can be answered from
 * redacted rows, before a run, without opening a single ciphertext. The Test
 * Console uses that to say "this will bind to X5M/100 · TEST" BEFORE Run: a
 * session showed the top bar on X5M/080 DEV while the run reported "Bound to
 * Customizing X5M/100 · TEST", because the picker and the binding never
 * shared a rule. Now they share this function.
 *
 * resolveSapConnectionForEnvironment calls exactly this on the decrypted rows,
 * so the preview and the run cannot disagree.
 */
export function selectConnectionForEnvironment<T extends BindableConnection>(
  all: readonly T[],
  environment: string,
  operation: "READ" | "WRITE",
  sapClient?: string | null,
): ConnectionSelection<T> {
  if (all.length === 0) return { ok: false, reason: "NO_CONNECTION" };

  const target = environment.trim().toUpperCase();
  const envMatches = all.filter((c) => normalizedEnvironmentOf(c) === target);

  /*
   * THE SECOND HALF OF THE BINDING. Environment names a landscape; on-premise
   * and RISE put several data containers inside one — X5M/100 and X5M/080
   * share a baseUrl and differ only here. Before this, such an estate could
   * only ever get AMBIGUOUS: both rows matched DEV and nothing could choose.
   *
   * A credential that names a client is answered ONLY by a connection carrying
   * that client. It never falls back to a client-less row: "no client" is not
   * a wildcard, it is a different container, and serving one for the other is
   * the cross-container read this whole mechanism exists to prevent.
   */
  const declaredClient = sapClient?.trim() ? sapClient.trim() : null;
  const matches = declaredClient
    ? envMatches.filter((c) => (c.client ?? null) === declaredClient)
    : envMatches;

  if (matches.length === 1) {
    return { ok: true, connection: matches[0]!, bindingUnverified: false };
  }
  if (matches.length > 1) return { ok: false, reason: "AMBIGUOUS" };

  // The environment matched but the client did not — a distinct failure from
  // "nothing serves this environment", and a distinct fix (correct the
  // credential's client, or add the connection for that container).
  if (declaredClient && envMatches.length > 0) {
    return { ok: false, reason: "NO_MATCH_FOR_CLIENT" };
  }

  const undeclared = all.filter((c) => normalizedEnvironmentOf(c) === null);
  if (undeclared.length === 0) return { ok: false, reason: "NO_MATCH_FOR_ENVIRONMENT" };

  // Undeclared candidates exist. A write never proceeds on one.
  if (operation === "WRITE") return { ok: false, reason: "UNDECLARED_ENVIRONMENT_WRITE" };

  // A read proceeds ONLY when there is nothing to confuse it with. With a
  // declared PROD row beside an undeclared one we must not assume the undeclared
  // row is the sandbox the caller asked for.
  if (all.length === 1) {
    /*
     * …and not even then, when the row AFFIRMATIVELY CONTRADICTS the caller.
     * An undeclared environment is missing information, which the
     * bindingUnverified flag exists to carry. A row that declares client 080
     * against a credential bound to 100 is not missing information — it is
     * the wrong data container, and reading it would be exactly the
     * cross-container read the client field was added to stop.
     */
    const only = all[0]!;
    if (declaredClient && only.client != null && only.client !== declaredClient) {
      return { ok: false, reason: "NO_MATCH_FOR_CLIENT" };
    }
    return { ok: true, connection: only, bindingUnverified: true };
  }
  // Reached only when envMatches is empty and undeclared rows exist beside
  // others: nothing declares the target, several could be it. Not AMBIGUOUS —
  // that word claims more than one connection DECLARES the environment.
  return { ok: false, reason: "NO_DECLARED_CANDIDATE" };
}

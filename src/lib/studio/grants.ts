/**
 * API access grants — the governance rules, as pure functions.
 *
 * v1 is a LEDGER: it records who asked for what, who decided, and why. It does
 * not enforce anything at runtime, because in v1 nothing calls SAP on a
 * solution's behalf. Saying that plainly matters — a developer who believes an
 * APPROVED row is granting them live access has misunderstood what they are
 * looking at, and the UI says so too.
 *
 * The rules live here, separated from the route, because they are the part worth
 * testing exhaustively: a decision that skipped segregation of duties, or a WRITE
 * that slipped through without its checklist, is a governance failure that would
 * be invisible in a passing integration test.
 */

export type GrantDecision =
  | "REQUESTED"
  | "APPROVED"
  | "SANDBOX_ONLY"
  | "READ_ONLY"
  | "REJECTED"
  | "EXPIRED";

export type GrantEnvironment = "SANDBOX" | "DEV" | "TEST" | "PROD";
export type GrantOperation = "READ" | "CREATE" | "UPDATE";

/** Ascending trust. Used to describe where a solution has got to, not to block. */
export const ENVIRONMENT_ORDER: readonly GrantEnvironment[] = ["SANDBOX", "DEV", "TEST", "PROD"];

/** Decisions that leave a grant open for a later decision. */
const PENDING: ReadonlySet<GrantDecision> = new Set(["REQUESTED"]);

/** Decisions that actually confer something (in the ledger's terms). */
const GRANTING: ReadonlySet<GrantDecision> = new Set(["APPROVED", "SANDBOX_ONLY", "READ_ONLY"]);

/** A decision an approver may set directly. EXPIRED is reached by time, not by hand. */
export const DECIDABLE: readonly GrantDecision[] = [
  "APPROVED",
  "SANDBOX_ONLY",
  "READ_ONLY",
  "REJECTED",
];

export function isPending(decision: GrantDecision): boolean {
  return PENDING.has(decision);
}

/**
 * "Confers something, in the LEDGER's terms" — for display only.
 *
 * DO NOT USE THIS ON A RUNTIME PATH. It answers "did this decision give the
 * solution anything at all", which is the right question for the progressive-
 * trust ladder and the wrong one for an access check: it cannot distinguish a
 * READ_ONLY decision from an APPROVED one, so using it to authorise a write let
 * "read only" grant a write. `grantsRead` / `grantsWrite` below are the runtime
 * predicates.
 */
export function isGranting(decision: GrantDecision): boolean {
  return GRANTING.has(decision);
}

/**
 * RUNTIME: does this decision authorise a READ in this environment?
 *
 * All three granting decisions permit reading — READ_ONLY exists precisely to
 * permit it — except that SANDBOX_ONLY means what it says (see below).
 */
export function grantsRead(decision: GrantDecision, environment: GrantEnvironment): boolean {
  if (!GRANTING.has(decision)) return false;
  if (decision === "SANDBOX_ONLY") return environment === "SANDBOX";
  return true;
}

/**
 * RUNTIME: does this decision authorise a WRITE in this environment?
 *
 * WHAT THIS FIXES. Both restricting decisions were previously accepted as write
 * authorisation, because the broker asked only "is this granting?".
 *
 *  - READ_ONLY never authorises a write. It was the obvious gesture for "you may
 *    read this, not write it", and it granted the write anyway — while
 *    `evaluateDecision` demanded the write checklist for that very combination,
 *    lending the whole thing an air of having been reviewed.
 *  - SANDBOX_ONLY authorises only in SANDBOX. It was matched against the grant
 *    row's own environment and then ignored, so a PROD grant decided
 *    SANDBOX_ONLY authorised PROD. A decision that downgrades must downgrade
 *    something.
 */
export function grantsWrite(decision: GrantDecision, environment: GrantEnvironment): boolean {
  if (decision === "READ_ONLY") return false;
  if (decision === "SANDBOX_ONLY") return environment === "SANDBOX";
  return decision === "APPROVED";
}

/** CREATE and UPDATE are writes; writes carry the stronger review path. */
export function isWriteOperation(operation: GrantOperation): boolean {
  return operation === "CREATE" || operation === "UPDATE";
}

export interface DecisionRequest {
  /** Current state of the grant being decided. */
  current: GrantDecision;
  operation: GrantOperation;
  environment: GrantEnvironment;
  /** Who raised the request. Null for legacy rows with no recorded requester. */
  requestedById: string | null;
  /** Who is deciding now. */
  deciderId: string;
  next: GrantDecision;
  /** The approver has explicitly worked through the write checklist. */
  writeChecklistAcknowledged: boolean;
  /**
   * When this grant lapses. Null means never — which a write may not be.
   * See GRANT_REQUIRES_EXPIRY.
   */
  expiresAt: Date | null;
}

export type DecisionRefusal =
  | "NOT_PENDING"
  | "NOT_DECIDABLE"
  | "SELF_APPROVAL"
  | "WRITE_CHECKLIST_REQUIRED"
  /** Renamed from WRITE_GRANT_REQUIRES_EXPIRY: it applies to reads too now. */
  | "GRANT_REQUIRES_EXPIRY";

export type DecisionOutcome = { ok: true } | { ok: false; reason: DecisionRefusal; message: string };

/**
 * May this decision be recorded?
 *
 * Refusals, in the order they are checked:
 *
 *  - NOT_PENDING — a grant is decided once. Re-deciding a settled grant would
 *    quietly rewrite history; the way to change your mind is a new request, which
 *    leaves both rows in the ledger.
 *  - NOT_DECIDABLE — EXPIRED is a consequence of time passing, not something an
 *    approver may assert by hand.
 *  - SELF_APPROVAL — segregation of duties. The person who asked cannot be the
 *    person who agreed, no matter how senior. This is the single control that
 *    makes the ledger worth keeping.
 *  - WRITE_CHECKLIST_REQUIRED — a write into a client's SAP system is never
 *    approved by reflex. The checklist must be worked through explicitly, and no
 *    write is ever auto-approved.
 */
export function evaluateDecision(req: DecisionRequest): DecisionOutcome {
  if (!isPending(req.current)) {
    return {
      ok: false,
      reason: "NOT_PENDING",
      message: "This request has already been decided. Raise a new request instead.",
    };
  }

  if (!DECIDABLE.includes(req.next)) {
    return {
      ok: false,
      reason: "NOT_DECIDABLE",
      message: "That decision cannot be set by hand.",
    };
  }

  if (req.requestedById !== null && req.requestedById === req.deciderId) {
    return {
      ok: false,
      reason: "SELF_APPROVAL",
      message: "You cannot decide your own request. Someone else must review it.",
    };
  }

  // Only a decision that ACTUALLY authorises a write carries the write gates.
  // Previously this asked `isGranting`, so a READ_ONLY decision on a CREATE
  // request demanded the write checklist — and then let the write through.
  const authorisesWrite =
    isWriteOperation(req.operation) && grantsWrite(req.next, req.environment);

  if (authorisesWrite && !req.writeChecklistAcknowledged) {
    return {
      ok: false,
      reason: "WRITE_CHECKLIST_REQUIRED",
      message:
        "This request writes into the client's SAP system. Work through the write checklist before approving.",
    };
  }

  /*
   * ANY GRANT THAT AUTHORISES ANYTHING MUST BE BOUNDED IN TIME.
   *
   * This is the compensating control for the deliberate absence of revocation:
   * a settled grant cannot be re-decided (NOT_PENDING above) and there is no
   * withdrawal path, so an approved grant with no expiry is PERMANENT — reachable
   * by simply not filling in a field. Expiry is evaluated on every call, which
   * makes a bounded grant the one form of "ending" the runtime honours today,
   * with no new state and no invariant broken.
   *
   * IT USED TO ASK `authorisesWrite`, SO ONLY WRITES WERE BOUNDED. A read grant
   * approved with no expiry authorised reads of a client's SAP data forever, and
   * the product had no way to stop it: Control Tower states plainly that "an
   * approved grant ends by lapsing", and one that cannot lapse cannot end.
   *
   * The asymmetry was not a decision anyone made. Every piece needed to close it
   * already existed — this rule, the field, and an `unbounded` flag the grants
   * API has always computed and returned. The manual even calls the resulting
   * state "a defect, not a state". Only the condition on this `if` was narrow.
   *
   * A read is not harmless. It is a standing authorisation to pull a client's
   * financial and master data out of their production system, and "we cannot
   * revoke it, but it is only reading" is not an answer anyone wants to give.
   *
   * `== null` deliberately, not `=== null`: a caller that omits the field
   * entirely must be refused exactly like one that passes null. This is a
   * security control, and "the property was missing" is not a permission.
   */
  const authorisesAnything = isGranting(req.next);

  if (authorisesAnything && req.expiresAt == null) {
    return {
      ok: false,
      reason: "GRANT_REQUIRES_EXPIRY",
      message: authorisesWrite
        ? "A write grant must have an expiry date. There is no way to revoke it afterwards, so it has to end on its own."
        : "A grant must have an expiry date. There is no way to revoke one afterwards, so it has to end on its own — an approved request with no expiry would authorise access to the client's SAP system permanently.",
    };
  }

  return { ok: true };
}

/**
 * How far a solution has actually got, for the progressive-trust display.
 *
 * NOTE this REPORTS state; it does not gate. v1 deliberately does not refuse a
 * PROD request because TEST has not been approved yet — no document defines that
 * policy, and inventing a rule that blocks legitimate work would be worse than
 * showing an honest picture and letting a human decide. The stepper is therefore
 * a description of reality, not decoration and not a gate.
 */
export function highestApprovedEnvironment(
  grants: readonly { environment: string; decision: string }[],
): GrantEnvironment | null {
  let best: GrantEnvironment | null = null;
  for (const g of grants) {
    if (!isGranting(g.decision as GrantDecision)) continue;
    const env = g.environment as GrantEnvironment;
    const idx = ENVIRONMENT_ORDER.indexOf(env);
    if (idx < 0) continue;
    if (best === null || idx > ENVIRONMENT_ORDER.indexOf(best)) best = env;
  }
  return best;
}

/** Has this grant passed its expiry? Pure — the caller supplies "now". */
export function isExpired(
  grant: { decision: string; expiresAt: Date | null },
  now: Date,
): boolean {
  if (!isGranting(grant.decision as GrantDecision)) return false;
  return grant.expiresAt !== null && grant.expiresAt.getTime() <= now.getTime();
}

/**
 * The decision as it should be DISPLAYED: a granting decision whose expiry has
 * passed reads as EXPIRED, without needing a sweep job to have run first. The
 * stored row is left alone; this is a view concern.
 */
export function effectiveDecision(
  grant: { decision: string; expiresAt: Date | null },
  now: Date,
): GrantDecision {
  return isExpired(grant, now) ? "EXPIRED" : (grant.decision as GrantDecision);
}

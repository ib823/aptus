"use client";

/**
 * Control Tower's own primitives — the two concepts governance needs that the
 * Operations Center did not.
 *
 * Everything else is imported from `@/components/ops/OpsChrome`. The two
 * workspaces are one product and must be visually indistinguishable in family;
 * what differs here is not styling but subject matter.
 *
 * WHERE GOVERNANCE DIFFERS FROM OPERATIONS, and why it changes the components:
 *
 *   These screens are CENSUSES, not floors. The portfolio, the registers and the
 *   grant queue list every row in scope. That is the opposite of the broker
 *   feeds, and the strips say so — a reader who learned "these numbers are a
 *   floor" in the Operations Center would otherwise carry that doubt onto a
 *   screen where it is untrue, and under-trust a complete count.
 *
 *   The audience is reviewing, not on shift. So a governance row spends more
 *   words, states its verdicts rather than printing ids to cross-reference, and
 *   links out to where an action lives instead of compressing.
 */

import { AbsencePill, OpsChip, type OpsTone } from "@/components/ops/OpsChrome";

/**
 * TIME REMAINING AS A RUNWAY, NOT A DATE.
 *
 * There is no revocation path in this release and a settled grant cannot be
 * re-decided, so an approved grant ends exactly one way: its expiry passes.
 * That makes time-remaining the entire lifecycle control rather than a field.
 *
 * "Ends 8 Sep" requires arithmetic against today; "6 days" does not, and the bar
 * makes a short runway visible without reading either. It DEPLETES toward zero
 * rather than filling toward it — what is being measured is what is left.
 */
export function ExpiryRunway({
  expiresAt,
  /** Days at which the remedy — re-requesting — needs to start. */
  runwayDays = 14,
  /** Whether an absent expiry is legitimate here. Writes: never. */
  unboundedIsLegitimate,
}: {
  expiresAt: string | null;
  runwayDays?: number;
  unboundedIsLegitimate: boolean;
}) {
  if (expiresAt === null) {
    return unboundedIsLegitimate ? (
      <AbsencePill
        label="no expiry"
        meaning="a read grant may run indefinitely; it is not a write and cannot become one"
      />
    ) : (
      // The one row that should never exist. The server refuses to settle a
      // write grant without an expiry, so this predates that rule — and it
      // cannot be ended, because there is nothing to revoke it with.
      <OpsChip
        tone="bad"
        label="unbounded"
        meaning="a write grant with no expiry cannot be ended — it needs a new, bounded request to replace it"
      />
    );
  }

  const msLeft = new Date(expiresAt).getTime() - Date.now();
  if (Number.isNaN(msLeft)) return <AbsencePill label="expiry unreadable" />;

  const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));

  if (daysLeft <= 0) {
    return (
      <span
        style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 12.5, color: "var(--ink-muted)" }}
      >
        lapsed {new Date(expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
      </span>
    );
  }

  const short = daysLeft <= runwayDays;
  // Full at three runways out, so the bar is informative long before it is
  // urgent rather than sitting at 100% and then dropping.
  const pct = Math.max(4, Math.min(100, Math.round((daysLeft / (runwayDays * 3)) * 100)));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          role="progressbar"
          aria-valuenow={daysLeft}
          aria-valuemin={0}
          aria-label={`${daysLeft} days remaining`}
          style={{
            height: 5,
            width: 84,
            borderRadius: 9999,
            background: "var(--status-expired-bg)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background: short ? "var(--warning)" : "var(--success)",
            }}
          />
        </div>
        <span
          style={{
            fontFamily: "var(--font-mono, monospace)",
            fontSize: 12.5,
            fontVariantNumeric: "tabular-nums",
            color: short ? "var(--warning)" : "var(--ink-secondary)",
          }}
        >
          {daysLeft} day{daysLeft === 1 ? "" : "s"}
        </span>
      </div>
      {short ? (
        // The ONLY remedy. There is nothing to extend — a new request must be
        // raised, which leaves both rows in the ledger.
        <div style={{ fontSize: 11.5, color: "var(--warning)", marginTop: 3 }}>
          re-request to extend
        </div>
      ) : null}
    </div>
  );
}

/**
 * What a decision actually permits — computed by the endpoint with the runtime
 * predicates, rendered here without interpretation.
 *
 * A DECISION LABEL IS NOT A PERMISSION. `SANDBOX_ONLY` on a PROD grant
 * authorises nothing; `READ_ONLY` on a CREATE request authorises a read and not
 * the write that was asked for. Showing the decision alone would leave a
 * reviewer to know those rules from somewhere else — which is how the label and
 * the runtime drifted apart in the first place.
 */
export function Authorises({ read, write }: { read: boolean; write: boolean }) {
  if (write) return <OpsChip tone="attention" label="read + write" meaning="writes into the client's SAP system" />;
  if (read) return <OpsChip tone="info" label="read" meaning="may read, may not write" />;
  return <AbsencePill label="nothing" meaning="this decision authorises no call at all" />;
}

/**
 * A control that exists and belongs to somebody else.
 *
 * Rotating a credential and enabling write on a connection are real
 * capabilities gated to the CONSULTANT role — so a platform admin, this
 * workspace's owner, gets a 403. Deleting them hides a capability from the
 * person doing oversight; wiring them live ships a button that fails for the
 * only role that can reach the screen.
 *
 * TWO DETAILS THAT MATTER:
 *
 *   The button keeps its REAL label. "Rotate or revoke", never "Unavailable" —
 *   a reviewer needs to know what capability exists and who holds it, and
 *   renaming the control to describe its own disabled-ness discards exactly
 *   that.
 *
 *   The reason lives in the provenance strip, not a tooltip. A tooltip needs a
 *   hover to discover and is unreachable by keyboard on a disabled control.
 */
export function DelegatedAction({ label, availableTo }: { label: string; availableTo: string }) {
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      title={`${label} is a ${availableTo}'s action — see the note below for where it lives`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 11px",
        borderRadius: 8,
        fontSize: 12.5,
        fontWeight: 600,
        background: "transparent",
        border: "1px solid var(--border-default)",
        color: "var(--ink-disabled)",
        cursor: "not-allowed",
      }}
    >
      {label}
    </button>
  );
}

/**
 * Whether segregation of duties held for one credential — as a VERDICT.
 *
 * The register's job is to let a reviewer confirm the control held.
 * "issuer was not an owner" is the finding; `createdById: u_7f3a` is homework.
 *
 * `null` is unknowable, not passing — the solution is outside the caller's
 * scope, so the check could not be performed. On a governance screen that
 * difference is the whole point.
 */
export function SegregationVerdict({
  segregation,
}: {
  segregation: {
    issuerWasAnOwner: boolean;
    ownershipComplete: boolean;
  } | null;
}) {
  if (segregation === null) {
    return (
      <AbsencePill
        label="unknowable"
        meaning="the solution is outside this scope, so the check could not be performed — which is not the same as passing"
      />
    );
  }
  if (segregation.issuerWasAnOwner) {
    return (
      <OpsChip
        tone="bad"
        label="issued by an owner"
        meaning="issuance refuses an owner, so this row means the control did not hold — worth investigating rather than dismissing"
      />
    );
  }
  if (!segregation.ownershipComplete) {
    return (
      <OpsChip
        tone="attention"
        label="issued while unowned"
        meaning="the solution does not have all three owners now; issuance requires them, so ownership changed after the credential was issued"
      />
    );
  }
  return (
    <OpsChip
      tone="good"
      label="issuer was not an owner"
      meaning="segregation of duties held: somebody accepted accountability and somebody else issued"
    />
  );
}

/** Decision label → tone. A lapsed grant keeps its decision and loses its force. */
export function decisionTone(decision: string, lapsed: boolean): OpsTone {
  if (lapsed) return "muted";
  switch (decision) {
    case "APPROVED":
      return "good";
    case "REJECTED":
      return "bad";
    case "READ_ONLY":
    case "SANDBOX_ONLY":
      return "neutral";
    default:
      return "info";
  }
}

/** `SANDBOX_ONLY` → "sandbox only". The enum is not a label. */
export function humanDecision(decision: string): string {
  return decision.toLowerCase().replace(/_/g, " ");
}

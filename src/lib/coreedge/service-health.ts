/**
 * Reading the per-service health matrix, and turning it into an owner.
 *
 * THE POINT OF SEPARATING THE TWO FACTS is who gets called. The handoff:
 * "The 401/403 distinction and the correct owner attribution both derive from
 * this. One green dot per system sends half of all triage to the wrong person."
 *
 *   · metadata 401  → the platform admin. The credential is wrong, and EVERY
 *     lane on that system stops.
 *   · read 403      → the client's SAP admin. We signed in; ONE entity set is
 *     unauthorised, and one lane stops.
 *
 * Same colour on a dashboard, opposite phone calls.
 */

import type { LaneStatus } from "./status-vocabulary";
import { freshnessOf, LANE_PROOF_TTL_MS } from "./freshness";

export type MetadataStatus = "OK" | "UNAUTHORIZED" | "NOT_FOUND" | "TIMEOUT" | "ERROR";
export type ReadStatus = "OK" | "EMPTY" | "FORBIDDEN" | "NOT_FOUND" | "TIMEOUT" | "ERROR";

export interface ServiceHealthFacts {
  readonly metadataStatus: MetadataStatus | null;
  readonly metadataAt: Date | null;
  readonly readStatus: ReadStatus | null;
  readonly readAt: Date | null;
  readonly readRowCount: number | null;
}

export interface ServiceVerdict {
  readonly status: LaneStatus;
  readonly because: string;
  /** The evidence behind it, or null when there is none. */
  readonly provenAt: Date | null;
}

/**
 * Resolve one service's health to a lane status.
 *
 * Metadata is consulted first because it is the earlier hop: if we cannot sign
 * in, nothing about the read is knowable, and reporting a stale read alongside a
 * 401 would suggest two problems where there is one.
 */
export function verdictForService(facts: ServiceHealthFacts, now: Date = new Date()): ServiceVerdict {
  // ── Metadata hop ──────────────────────────────────────────────────────────
  if (facts.metadataStatus === "UNAUTHORIZED") {
    return {
      status: "signInRefused",
      because: "SAP rejected our sign-in. Every lane on this system stops until the credential is fixed.",
      provenAt: facts.metadataAt,
    };
  }
  if (facts.metadataStatus === "TIMEOUT" || facts.metadataStatus === "ERROR") {
    return {
      status: "sapUnavailable",
      because: "The SAP system did not answer the metadata request. Nothing was refused.",
      provenAt: facts.metadataAt,
    };
  }
  if (facts.metadataStatus === null || freshnessOf(facts.metadataAt, LANE_PROOF_TTL_MS, now) !== "fresh") {
    return {
      status: "unknown",
      because:
        facts.metadataStatus === null
          ? "This service has never been checked. That says nothing about SAP — only that we have not looked."
          : "The last metadata check is more than 24 hours old.",
      provenAt: facts.metadataAt,
    };
  }

  // ── Data read hop ─────────────────────────────────────────────────────────
  if (facts.readStatus === "FORBIDDEN") {
    return {
      status: "sapRefused",
      because:
        "We signed in and SAP refused this dataset. The fix is in SAP authorisation, not in CoreEdge.",
      provenAt: facts.readAt,
    };
  }
  if (facts.readStatus === "TIMEOUT" || facts.readStatus === "ERROR") {
    return {
      status: "sapUnavailable",
      because: "The read timed out or errored. Nothing was refused.",
      provenAt: facts.readAt,
    };
  }
  if (facts.readStatus === null || freshnessOf(facts.readAt, LANE_PROOF_TTL_MS, now) !== "fresh") {
    /*
     * METADATA IS GREEN AND THE READ IS NOT PROVEN — the exact state the old
     * console called "Reachable" and rendered as healthy. It is not healthy; it
     * is unmeasured, and a 403 on the entity set is the most common thing
     * hiding behind it.
     */
    return {
      status: "unknown",
      because:
        facts.readStatus === null
          ? "Metadata is reachable, but no read has been proven. Reachable is not the same as readable."
          : "The last proven read is more than 24 hours old.",
      provenAt: facts.readAt,
    };
  }
  if (facts.readStatus === "NOT_FOUND") {
    /*
     * GAP, recorded rather than papered over. PR-2 found the eighteen statuses
     * have no chip for a 404 on a dataset, and the nearest — SAP refused — is
     * explicitly a 403 and would send the user to their SAP admin over
     * something a different dataset would fix. Until that decision is made this
     * reports Unknown with the real reason, which is at least true.
     */
    return {
      status: "unknown",
      because:
        "The dataset was not found on this SAP system. The status vocabulary has no chip for a 404 " +
        "yet — see PR-2's gap list — so this reports what we know rather than a wrong owner.",
      provenAt: facts.readAt,
    };
  }
  if (facts.readStatus === "EMPTY") {
    return {
      status: "noData",
      because: "SAP answered successfully and had nothing to return. This is a success.",
      provenAt: facts.readAt,
    };
  }

  return {
    status: "live",
    because:
      facts.readRowCount === null
        ? "Signed in, metadata read, and a data read proven."
        : `Signed in, metadata read, and ${facts.readRowCount} ${
            facts.readRowCount === 1 ? "row" : "rows"
          } proven.`,
    provenAt: facts.readAt,
  };
}

/**
 * Who to call about this service.
 *
 * Derived from the verdict rather than from the raw status codes, so it cannot
 * disagree with the chip beside it.
 */
export function ownerForService(facts: ServiceHealthFacts, now: Date = new Date()): string {
  const { status } = verdictForService(facts, now);
  switch (status) {
    case "signInRefused":
      return "Platform admin";
    case "sapRefused":
      return "Client SAP admin";
    case "sapUnavailable":
      return "Client Basis team";
    case "unknown":
      return "Operator";
    default:
      return "Nobody — this service is fine";
  }
}

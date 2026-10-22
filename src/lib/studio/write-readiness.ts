/**
 * Where a WRITE interface can actually be called — per environment.
 *
 * A write reaches SAP only when THREE things line up in ONE environment: a
 * live runtime credential for that environment (AD-11: one per environment),
 * a write key sealed onto that credential, and a live approved write grant
 * for this capability in that environment (resolveWritableInterface, at call
 * time). The interim R4 gate checked only "some credential of the solution
 * carries a write key" — so a solution with a DEV write key and a PROD write
 * grant could activate an interface that no environment could call.
 *
 * YOUR OWN API ADDS A FOURTH. A custom service is written through only in an
 * environment where it has been verified, through that environment's current
 * connection (the write route's isVerifiedForBinding). Checking that
 * "verified somewhere" at activation repeated the defect above with other
 * halves: verified in SANDBOX, the chain complete only in PROD, ACTIVE — and
 * every PROD write refused (review round 2). So for a custom interface the
 * caller passes the environments that hold a current verification, and an
 * environment is ready only when it holds one too. And the connection that
 * environment's credential binds to must have writes switched on: the write
 * route refuses every write through one with writeEnabled=false (review
 * round 5).
 *
 * This is the pure part: given the rows, say for each environment which
 * halves are present, and whether the chain is complete. The route refuses
 * activation when no environment is complete; the Interfaces page shows the
 * same table before the click. Predicates mirror the broker's, in the
 * broker's order (revoked before expired), so what this says is what the
 * call will get.
 */

import {
  ENVIRONMENT_ORDER,
  grantsWrite,
  type GrantDecision,
  type GrantEnvironment,
} from "@/lib/studio/grants";

export type CredentialReadiness = "none" | "no-write-key" | "ready";
export type GrantReadiness = "none" | "not-granting" | "revoked" | "expired" | "approved";
/** Your own API only: is the service verified in this environment, through its current connection? */
export type ServiceReadiness = "verified" | "not-verified";

export interface WriteReadinessRow {
  environment: GrantEnvironment;
  credential: CredentialReadiness;
  grant: GrantReadiness;
  /** Present only for your own API (a custom service path). */
  service?: ServiceReadiness;
  /**
   * Your own API only, and present only when true: the connection this
   * environment's credential binds to has writes switched off, a veto the
   * write route enforces whatever the other halves say (review round 5).
   */
  writesDisabled?: true;
  /** Every half present: a call in this environment would pass the gates. */
  ready: boolean;
}

export interface WriteReadinessInput {
  /** LIVE credentials only (active, unrevoked, unexpired) — the caller filters. */
  credentials: readonly { environment: string; hasWriteKey: boolean }[];
  /** Grants for THIS capability (externalId) and THIS operation, any decision. */
  grants: readonly {
    environment: string;
    decision: string;
    expiresAt: Date | string | null;
    revokedAt: Date | string | null;
  }[];
  /**
   * Your own API only: the environments where a live credential's own
   * binding — environment AND its SAP client, selected the way the write
   * route selects it — holds a verification that still matches that
   * connection (verifiedEnvironmentsForCredentials). Omitted or
   * null for a catalogue interface, whose writes are not gated on Verify.
   */
  serviceVerifiedEnvironments?: readonly string[] | null;
  /**
   * Your own API only: the environments whose credential binds to a
   * connection with writeEnabled=false (writesDisabledEnvironmentsForCredentials).
   * The write route refuses every write there ("Writes are not enabled on
   * this SAP connection"), so such an environment is never ready.
   */
  writesDisabledEnvironments?: readonly string[] | null;
  now?: Date;
}

function toTime(value: Date | string | null): number | null {
  if (value == null) return null;
  const t = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

export function writeReadinessByEnvironment(input: WriteReadinessInput): WriteReadinessRow[] {
  const now = (input.now ?? new Date()).getTime();
  return ENVIRONMENT_ORDER.map((environment) => {
    const creds = input.credentials.filter((c) => c.environment === environment);
    const credential: CredentialReadiness =
      creds.length === 0 ? "none" : creds.some((c) => c.hasWriteKey) ? "ready" : "no-write-key";

    // The broker's own order: granting decision → not revoked → not expired.
    const here = input.grants.filter((g) => g.environment === environment);
    const granting = here.filter((g) => grantsWrite(g.decision as GrantDecision, environment));
    const unrevoked = granting.filter((g) => g.revokedAt == null);
    const live = unrevoked.filter((g) => {
      const t = toTime(g.expiresAt);
      return t === null || t > now;
    });
    const grant: GrantReadiness =
      here.length === 0
        ? "none"
        : granting.length === 0
          ? "not-granting"
          : unrevoked.length === 0
            ? "revoked"
            : live.length === 0
              ? "expired"
              : "approved";

    const chainReady = credential === "ready" && grant === "approved";
    if (input.serviceVerifiedEnvironments == null) {
      return { environment, credential, grant, ready: chainReady };
    }
    const service: ServiceReadiness = input.serviceVerifiedEnvironments.includes(environment)
      ? "verified"
      : "not-verified";
    const writesDisabled = input.writesDisabledEnvironments?.includes(environment) === true;
    return {
      environment,
      credential,
      grant,
      service,
      ...(writesDisabled ? { writesDisabled: true as const } : {}),
      ready: chainReady && service === "verified" && !writesDisabled,
    };
  });
}

export function readyEnvironments(rows: readonly WriteReadinessRow[]): GrantEnvironment[] {
  return rows.filter((r) => r.ready).map((r) => r.environment);
}

const CREDENTIAL_WORDS: Record<CredentialReadiness, string> = {
  none: "no live credential",
  "no-write-key": "credential without a write key",
  ready: "credential with write key",
};

const GRANT_WORDS: Record<GrantReadiness, string> = {
  none: "no write grant requested",
  "not-granting": "write grant not approved",
  revoked: "write grant revoked",
  expired: "write grant expired",
  approved: "write grant approved",
};

const SERVICE_WORDS: Record<ServiceReadiness, string> = {
  verified: "service verified here",
  "not-verified": "service not verified here",
};

/** One line per environment, for the Contract card. */
export function describeWriteReadiness(row: WriteReadinessRow): string {
  const service = row.service ? ` · ${SERVICE_WORDS[row.service]}` : "";
  const writes = row.writesDisabled ? " · writes disabled on the connection" : "";
  return `${row.environment}: ${CREDENTIAL_WORDS[row.credential]} · ${GRANT_WORDS[row.grant]}${service}${writes}${row.ready ? " → ready" : ""}`;
}

/**
 * The refusal, when no environment is complete. Names which half each
 * environment lacks, skipping environments where nothing at all has been
 * started — "no credential, no grant" four times over is noise, not help.
 */
export function writeReadinessRefusal(operation: string, rows: readonly WriteReadinessRow[]): string {
  const started = rows.filter((r) => r.credential !== "none" || r.grant !== "none" || r.service === "verified");
  const custom = rows.some((r) => r.service !== undefined);
  const detail =
    started.length === 0
      ? "No environment has a credential or a write grant yet."
      : started.map(describeWriteReadiness).join("; ") + ".";
  // The one half no developer action fixes: say who can, and where (P0.3:
  // the Connections form is where writes are switched on).
  const vetoed = rows.some((r) => r.writesDisabled)
    ? " A builder enables writes on the connection under Connections: save it with Allow writes ticked."
    : "";
  return (
    `A ${operation} interface cannot be activated until some environment holds the full write chain — ` +
    "a live credential for that environment carrying a write key, AND a live approved write grant for this capability in it" +
    (custom ? ", AND a verification of this interface's own SAP service through that environment's connection. " : ". ") +
    `The broker refuses every write that lacks any of them, so activating now would build toward a call that cannot succeed. ${detail}${vetoed} ` +
    "Get the write grant approved for an environment, issue the write key for that environment under API Access (Runtime credentials, Issue write key)" +
    (custom ? ", verify the service in that same environment" : "") +
    ", then activate."
  );
}

/**
 * Why an UPDATE interface cannot be activated — one sentence, for the route's
 * refusal and the button's reason alike.
 *
 * The broker's executor only POSTs to the entity set, which OData treats as a
 * create, so it refuses UPDATE outright (OPERATION_NOT_SUPPORTED in
 * northbound/access.ts). An ACTIVE UPDATE interface would therefore be refused
 * on every call — the same "building toward a wall" the write-chain gate above
 * exists to stop, so it is stopped at the same point.
 */
export const UPDATE_NOT_EXECUTABLE =
  "An UPDATE interface cannot be activated yet: the broker can only create records, and it refuses an update " +
  "rather than sending it as a create, which would add a new record instead of changing the one you meant.";

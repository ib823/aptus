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

export interface WriteReadinessRow {
  environment: GrantEnvironment;
  credential: CredentialReadiness;
  grant: GrantReadiness;
  /** Both halves present: a call in this environment would pass the gates. */
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

    return { environment, credential, grant, ready: credential === "ready" && grant === "approved" };
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

/** One line per environment, for the Contract card. */
export function describeWriteReadiness(row: WriteReadinessRow): string {
  return `${row.environment}: ${CREDENTIAL_WORDS[row.credential]} · ${GRANT_WORDS[row.grant]}${row.ready ? " → ready" : ""}`;
}

/**
 * The refusal, when no environment is complete. Names which half each
 * environment lacks, skipping environments where nothing at all has been
 * started — "no credential, no grant" four times over is noise, not help.
 */
export function writeReadinessRefusal(operation: string, rows: readonly WriteReadinessRow[]): string {
  const started = rows.filter((r) => r.credential !== "none" || r.grant !== "none");
  const detail =
    started.length === 0
      ? "No environment has a credential or a write grant yet."
      : started.map(describeWriteReadiness).join("; ") + ".";
  return (
    `A ${operation} interface cannot be activated until some environment holds the full write chain — ` +
    "a live credential for that environment carrying a write key, AND a live approved write grant for this capability in it. " +
    `The broker refuses every write that lacks either, so activating now would build toward a call that cannot succeed. ${detail} ` +
    "Get the write grant approved for an environment, issue the write credential for that environment under API Access, then activate."
  );
}

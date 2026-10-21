import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { OpsTable } from "@/components/coreedge/OpsTable";
import { EMPTY_STATES, SCREEN_NOTES } from "@/lib/coreedge/copy";
import { ENVIRONMENT_LABELS } from "@/lib/coreedge/lanes";
import { listPassport } from "@/lib/coreedge/queries";
import { GATE_GLYPHS, KEY_STATE_GATES } from "@/lib/coreedge/status-vocabulary";
import { getCurrentUser } from "@/lib/auth/session";
import { KEY_STATE_LABELS } from "@/lib/northbound/key-policy";

import { CoreEdgeShell } from "../CoreEdgeShell";

/**
 * Screen 07 · Passport — what leaves SAP, for the client's CIO.
 *
 * READ-ONLY BY CONSTRUCTION, not by hiding buttons. X06 is explicit: there is no
 * revoke here, because a CIO who wants something stopped says so and an ABeam
 * reviewer does it with a reason on the record. A kill switch on this screen
 * would be an action with no author, which is the opposite of what a passport
 * is for. The query behind it has no write path either.
 *
 * SANDBOX NEVER APPEARS, AND NEITHER DOES LAPSED ACCESS (P0.3, A58). Sandbox
 * reads ABeam's own API Hub, not the client's system — so a sandbox approval
 * moves no client data and listing it here would overstate what leaves SAP.
 * It is excluded by its ENVIRONMENT: since D2 a sandbox request is approved as
 * APPROVED, so excluding the SANDBOX_ONLY decision alone listed every new one.
 * An approval that has expired or been revoked is excluded by the same rule
 * the broker applies (`isPassportGrant` in queries.ts): the screen used to
 * list a grant that lapsed in February as current access, for ever.
 *
 * THE FIELDS COLUMN IS BLANK, AND SAYS WHY. X06 shows "12 of 71" on every row
 * and calls it the fact that matters. Nothing in this schema records which
 * fields an approval covers; the nearest available number counts what SAP
 * describes, which is a different question. On the one screen whose whole job
 * is telling a client exactly what is readable, a plausible substitute would be
 * worse than an admission.
 *
 * THE KEY COLUMN SAYS WHETHER ANYTHING CAN LEAVE NOW (P0.11). An approval is
 * what may be read; the key is whether the app can read it today. An expired
 * or revoked key reads as exactly that, never as live, and a TEST or PROD key
 * with no expiry is live but flagged "no expiry - set one".
 */

export const metadata: Metadata = { title: "Passport" };

function dateLine(at: Date | null): string {
  return at === null ? "—" : at.toISOString().slice(0, 10);
}

export default async function PassportPage(): Promise<ReactNode> {
  const user = await getCurrentUser();
  if (!user) redirect("/presales/login");

  if (user.organizationId === null) {
    return (
      <CoreEdgeShell current="/coreedge/passport" title="Passport">
        <p className="max-w-prose text-sm text-ink-soft">
          Your account is not attached to an organization, so no approvals are visible.
        </p>
      </CoreEdgeShell>
    );
  }

  const rows = await listPassport(user.organizationId);
  const apps = new Set(rows.map((r) => r.appName)).size;
  const feeds = new Set(rows.map((r) => r.externalId)).size;
  const writes = rows.filter((r) => r.operation.toUpperCase() !== "READ").length;

  return (
    <CoreEdgeShell
      current="/coreedge/passport"
      title="Passport"
      subtitle="Every approval in force for your SAP systems: what ABeam apps may read, and write"
    >
      <p className="max-w-prose text-sm text-ink-muted">
        {GATE_GLYPHS["gate-info"]} {SCREEN_NOTES.passportReadOnly}
      </p>

      <dl className="flex flex-wrap gap-8">
        <div>
          <dt className="text-xs uppercase tracking-wide text-ink-muted">Apps with access</dt>
          <dd className="text-2xl text-ink">{apps}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-ink-muted">Data feeds</dt>
          <dd className="text-2xl text-ink">{feeds}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-ink-muted">Writes into SAP</dt>
          <dd className="text-2xl text-ink">{writes}</dd>
        </div>
      </dl>

      <OpsTable
        caption="Approvals in force, by app and data feed"
        legend={
          <span>
            Every line names who approved it, and the date it stops if it has one. Approvals that have
            ended are not listed, and neither is sandbox access, which never reaches your system.
          </span>
        }
        rows={rows}
        // The grant's id: app, feed and environment are shared by a READ and a
        // CREATE approval for one feed, and a shared key drops a row.
        rowKey={(r) => r.id}
        empty={<p className="text-sm text-ink-soft">{EMPTY_STATES.passportNone.message}</p>}
        columns={[
          { key: "app", header: "App", cell: (r) => r.appName },
          { key: "feed", header: "Data feed", cell: (r) => r.feedName },
          {
            key: "fields",
            header: "Fields",
            cell: () => <span className="text-sm text-ink-muted">Not recorded</span>,
          },
          {
            key: "env",
            header: "Environment",
            cell: (r) =>
              r.environment === null ? (
                <span className="font-mono text-xs text-ink-muted">{r.environmentRaw}</span>
              ) : (
                ENVIRONMENT_LABELS[r.environment]
              ),
          },
          {
            key: "approved",
            header: "Approved by",
            cell: (r) => (
              <span className="flex flex-col">
                <span>{r.approvedBy ?? "—"}</span>
                <span className="text-xs text-ink-muted">{dateLine(r.approvedAt)}</span>
              </span>
            ),
          },
          { key: "ends", header: "Access ends", cell: (r) => dateLine(r.accessEnds) },
          {
            key: "key",
            header: "Key",
            cell: (r) => (
              <span>
                {GATE_GLYPHS[KEY_STATE_GATES[r.keyState]]} {KEY_STATE_LABELS[r.keyState]}
              </span>
            ),
          },
        ]}
      />

      <p className="max-w-prose text-sm text-ink-muted">
        {SCREEN_NOTES.passportFieldsUnknown}
      </p>
    </CoreEdgeShell>
  );
}

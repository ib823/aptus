import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { OpsTable } from "@/components/coreedge/OpsTable";
import { EMPTY_STATES, SCREEN_NOTES } from "@/lib/coreedge/copy";
import { ENVIRONMENT_LABELS } from "@/lib/coreedge/lanes";
import { listPassport } from "@/lib/coreedge/queries";
import { GATE_GLYPHS } from "@/lib/coreedge/status-vocabulary";
import { getCurrentUser } from "@/lib/auth/session";

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
 * SANDBOX NEVER APPEARS. Sandbox reads ABeam's own API Hub, not the client's
 * system — so a sandbox approval moves no client data and listing it here would
 * overstate what leaves SAP. See PASSPORT_DECISIONS.
 *
 * THE FIELDS COLUMN IS BLANK, AND SAYS WHY. X06 shows "12 of 71" on every row
 * and calls it the fact that matters. Nothing in this schema records which
 * fields an approval covers; the nearest available number counts what SAP
 * describes, which is a different question. On the one screen whose whole job
 * is telling a client exactly what is readable, a plausible substitute would be
 * worse than an admission.
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
      subtitle="Everything ABeam apps are approved to read from this SAP system"
    >
      <p className="max-w-prose text-sm text-ink-muted">
        {GATE_GLYPHS["gate-info"]} {SCREEN_NOTES.passportReadOnly}
      </p>

      <dl className="flex flex-wrap gap-8">
        <div>
          <dt className="text-xs uppercase tracking-wide text-ink-muted">Apps reading</dt>
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
        caption="Approved reads, by app and data feed"
        legend={<span>Every line has a person who approved it and a date it stops.</span>}
        rows={rows}
        rowKey={(r) => `${r.appName}::${r.externalId}::${r.environmentRaw}`}
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
        ]}
      />

      <p className="max-w-prose text-sm text-ink-muted">
        {SCREEN_NOTES.passportFieldsUnknown}
      </p>
    </CoreEdgeShell>
  );
}

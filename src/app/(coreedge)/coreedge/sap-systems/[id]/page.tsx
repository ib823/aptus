import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { DecisionBar } from "@/components/coreedge/DecisionBar";
import { OpsTable } from "@/components/coreedge/OpsTable";
import { DISABLED_REASONS, EMPTY_STATES, SCREEN_NOTES } from "@/lib/coreedge/copy";
import { describeAge } from "@/lib/coreedge/freshness";
import { ENVIRONMENT_LABELS } from "@/lib/coreedge/lanes";
import { getSapSystemDetail, type ServiceHealthRow } from "@/lib/coreedge/queries";
import { GATE_GLYPHS } from "@/lib/coreedge/status-vocabulary";
import { getCurrentUser } from "@/lib/auth/session";

import { CoreEdgeShell } from "../../CoreEdgeShell";

/**
 * Screen 10 · One SAP system — health per service, not one "Reachable".
 *
 * THE MATRIX IS THE SCREEN. A02's whole argument is that a single green dot on
 * a system sends half of all triage to the wrong person: sign-in can work, three
 * services can read, and one can be refused. Metadata reachable and data
 * readable are two facts SAP grants separately, so they stay two columns here
 * and are never merged into a summary.
 *
 * A REFUSED READ IS NOT A SICK SYSTEM. 403 means SAP signed us in, understood
 * the request and said no — an authorisation problem belonging to the client's
 * SAP admin, not to Basis. The row says so rather than colouring the system red.
 *
 * WHERE NOTHING HAS BEEN PROBED, THE ROW IS ABSENT AND THE TABLE SAYS SO.
 * Unknown is a real answer here; an empty matrix rendered as "all clear" would
 * be the exact lie the freshness work exists to stop.
 */

export const metadata: Metadata = { title: "SAP system" };

/** Metadata and read statuses render with their own glyph, never a shared one. */
function statusCell(status: string | null, at: Date | null, now: Date, rows?: number | null) {
  if (status === null) {
    return <span className="text-ink-muted">{GATE_GLYPHS["gate-off"]} Never probed</span>;
  }
  const age = describeAge(at, now);
  const glyph =
    status === "OK"
      ? GATE_GLYPHS["gate-ok"]
      : status === "EMPTY"
        ? GATE_GLYPHS["gate-info"]
        : GATE_GLYPHS["gate-bad"];
  return (
    <span className="flex flex-col">
      <span>
        {glyph} {status}
        {rows === null || rows === undefined ? "" : ` · ${rows} ${rows === 1 ? "row" : "rows"}`}
      </span>
      {age === null ? null : <span className="text-xs text-ink-muted">{age}</span>}
    </span>
  );
}

export default async function SapSystemDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}): Promise<ReactNode> {
  const user = await getCurrentUser();
  if (!user) redirect("/presales/login");
  if (user.organizationId === null) notFound();

  const { id } = await params;
  const detail = await getSapSystemDetail(user.organizationId, id);
  if (detail === null) notFound();

  const now = new Date();
  const { system, services } = detail;
  const readable = services.filter(
    (s: ServiceHealthRow) => s.readStatus === "OK" || s.readStatus === "EMPTY",
  ).length;

  return (
    <CoreEdgeShell
      current="/coreedge/sap-systems"
      title={system.name}
      subtitle={`${system.host}${system.client === null ? "" : ` · ${system.client}`} · ${system.authType}`}
    >
      <dl className="flex flex-wrap gap-8">
        <div>
          <dt className="text-xs uppercase tracking-wide text-ink-muted">Environment</dt>
          <dd className="text-ink">
            {system.environment === null
              ? (system.environmentRaw ?? "none")
              : ENVIRONMENT_LABELS[system.environment]}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-ink-muted">State</dt>
          <dd className="text-ink">{system.isActive ? "Active" : "Deactivated"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-ink-muted">Services readable</dt>
          <dd className="text-ink">
            {services.length === 0 ? "—" : `${readable} of ${services.length}`}
          </dd>
        </div>
      </dl>

      {system.environmentContested ? (
        <p className="max-w-prose text-sm text-gate-bad-fg">
          {GATE_GLYPHS["gate-bad"]} {SCREEN_NOTES.environmentContested}
        </p>
      ) : null}

      <OpsTable
        caption={`Per-service health for ${system.name}`}
        legend={
          <span>
            {GATE_GLYPHS["gate-ok"]} readable · {GATE_GLYPHS["gate-info"]} reachable but empty ·{" "}
            {GATE_GLYPHS["gate-bad"]} refused or failed · {GATE_GLYPHS["gate-off"]} never probed
          </span>
        }
        rows={services}
        rowKey={(s) => `${s.serviceName}::${s.entitySet ?? ""}`}
        empty={
          <p className="text-sm text-ink-soft">{EMPTY_STATES.servicesNoneProbed.message}</p>
        }
        columns={[
          {
            key: "service",
            header: "Service",
            cell: (s) => (
              <span className="flex flex-col">
                <span className="font-mono text-xs">{s.serviceName}</span>
                {s.entitySet === null ? null : (
                  <span className="font-mono text-xs text-ink-muted">{s.entitySet}</span>
                )}
              </span>
            ),
          },
          {
            key: "metadata",
            header: "Metadata",
            cell: (s) => statusCell(s.metadataStatus, s.metadataAt, now),
          },
          {
            key: "read",
            header: "Data read",
            cell: (s) => statusCell(s.readStatus, s.readAt, now, s.readRowCount),
          },
        ]}
      />

      <p className="max-w-prose text-sm text-ink-muted">{SCREEN_NOTES.twoFactsNeverMerged}</p>

      <DecisionBar
        idPrefix="sap-system-detail"
        primary={{ label: "Probe again", disabledReason: DISABLED_REASONS.noWritePathYet }}
        narrower={[
          { label: "Rotate secret", disabledReason: DISABLED_REASONS.platformAdminOnly },
        ]}
        destructive={{
          label: system.isActive ? "Deactivate system" : "Activate system",
          disabledReason: system.isActive
            ? DISABLED_REASONS.platformAdminOnly
            : DISABLED_REASONS.alreadyDeactivated,
        }}
      />
    </CoreEdgeShell>
  );
}

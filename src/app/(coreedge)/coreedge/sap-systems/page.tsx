import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { DecisionBar } from "@/components/coreedge/DecisionBar";
import { OpsTable } from "@/components/coreedge/OpsTable";
import { DISABLED_REASONS, EMPTY_STATES, SCREEN_NOTES } from "@/lib/coreedge/copy";
import { describeAge } from "@/lib/coreedge/freshness";
import { ENVIRONMENT_LABELS } from "@/lib/coreedge/lanes";
import { listSapSystemDetails } from "@/lib/coreedge/queries";
import { GATE_GLYPHS } from "@/lib/coreedge/status-vocabulary";
import { getCurrentUser } from "@/lib/auth/session";

import { CoreEdgeShell } from "../CoreEdgeShell";

/**
 * Screen 08 · SAP systems — one system per environment, and what each proves.
 *
 * A CONTESTED ENVIRONMENT IS THE HEADLINE, not a footnote. When two active
 * systems claim the same environment every lane there refuses to bind, and the
 * operator arriving at this screen is usually arriving because of that. It is
 * called out above the table and marked on both rows, because naming only one
 * of them would imply the other is correct.
 *
 * "Connect SAP system" stays visible for everyone and carries its reason when
 * the viewer cannot use it — the rail rule applies to actions too. Role gating
 * never redirects.
 */

export const metadata: Metadata = { title: "SAP systems" };

export default async function SapSystemsPage(): Promise<ReactNode> {
  const user = await getCurrentUser();
  if (!user) redirect("/presales/login");

  if (user.organizationId === null) {
    return (
      <CoreEdgeShell current="/coreedge/sap-systems" title="SAP systems">
        <p className="max-w-prose text-sm text-ink-soft">
          Your account is not attached to an organization, so no SAP systems are visible.
        </p>
      </CoreEdgeShell>
    );
  }

  const now = new Date();
  const systems = await listSapSystemDetails(user.organizationId);
  const contested = systems.filter((s) => s.environmentContested);

  return (
    <CoreEdgeShell
      current="/coreedge/sap-systems"
      title="SAP systems"
      subtitle="One system per environment: Sandbox, Dev, Test, Prod"
    >
      {contested.length === 0 ? null : (
        <p className="max-w-prose text-sm text-gate-bad-fg">
          {GATE_GLYPHS["gate-bad"]} {SCREEN_NOTES.environmentContested}
        </p>
      )}

      <OpsTable
        caption="Connected SAP systems"
        legend={
          <span>
            {GATE_GLYPHS["gate-ok"]} active · {GATE_GLYPHS["gate-off"]} deactivated ·{" "}
            {GATE_GLYPHS["gate-bad"]} environment contested
          </span>
        }
        rows={systems}
        rowKey={(s) => s.id}
        empty={<p className="text-sm text-ink-soft">{EMPTY_STATES.sapSystemsNone.message}</p>}
        columns={[
          {
            key: "name",
            header: "System",
            cell: (s) => (
              <a
                href={`/coreedge/sap-systems/${s.id}`}
                className="underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring-navy"
              >
                <span className="flex flex-col">
                  <span>{s.name}</span>
                  <span className="font-mono text-xs text-ink-muted">
                    {s.host}
                    {s.client === null ? "" : ` · ${s.client}`}
                  </span>
                </span>
              </a>
            ),
          },
          {
            key: "env",
            header: "Environment",
            cell: (s) => (
              <span className={s.environmentContested ? "text-gate-bad-fg" : undefined}>
                {s.environmentContested ? `${GATE_GLYPHS["gate-bad"]} ` : ""}
                {s.environment === null ? (
                  <span className="font-mono text-xs text-ink-muted">
                    {s.environmentRaw ?? "none"}
                  </span>
                ) : (
                  ENVIRONMENT_LABELS[s.environment]
                )}
              </span>
            ),
          },
          { key: "auth", header: "Sign-in", cell: (s) => s.authType },
          {
            key: "state",
            header: "State",
            cell: (s) =>
              s.isActive ? (
                <span>{GATE_GLYPHS["gate-ok"]} Active</span>
              ) : (
                <span className="text-ink-muted">{GATE_GLYPHS["gate-off"]} Deactivated</span>
              ),
          },
          {
            key: "checked",
            header: "Last checked",
            cell: (s) => {
              const age = describeAge(s.lastValidatedAt, now);
              return age === null ? (
                <span className="text-ink-muted">Never</span>
              ) : (
                <span className="flex flex-col">
                  <span>{age}</span>
                  <span className="text-xs text-ink-muted">
                    {s.lastValidationStatus ?? "no status recorded"}
                  </span>
                </span>
              );
            },
          },
          {
            key: "lanes",
            header: "Approvals bound",
            cell: (s) => String(s.boundLanes),
          },
        ]}
      />

      <DecisionBar
        idPrefix="sap-systems"
        primary={{
          label: EMPTY_STATES.sapSystemsNone.action,
          disabledReason: DISABLED_REASONS.noWritePathYet,
        }}
      />
    </CoreEdgeShell>
  );
}

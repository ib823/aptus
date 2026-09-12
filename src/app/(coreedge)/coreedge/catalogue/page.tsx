import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { OpsTable } from "@/components/coreedge/OpsTable";
import { EMPTY_STATES } from "@/lib/coreedge/copy";
import { CATALOGUE_BADGE_TTL_MS, describeAge, freshnessOf } from "@/lib/coreedge/freshness";
import { ENVIRONMENT_LABELS } from "@/lib/coreedge/lanes";
import { listCatalogue, type CatalogueEntry } from "@/lib/coreedge/queries";
import { GATE_GLYPHS } from "@/lib/coreedge/status-vocabulary";
import { getCurrentUser } from "@/lib/auth/session";

import { CoreEdgeShell } from "../CoreEdgeShell";

/**
 * Screen 06 · Catalogue — every feed, and where it is already proven.
 *
 * PLAIN WORDS FIRST, SAP IDENTIFIERS UNDERNEATH. S03 searches "purchase orders",
 * not CE_PURCHASEORDER_0001, and the service name sits in the detail line for
 * when two feeds read alike. The order is the same one the command bar uses.
 *
 * A BADGE IS A CLAIM WITH AN AGE. "Reads proven" means a read returned, in a
 * named environment, against a named system, at a time this page prints. An
 * entry with no proof says Unknown rather than showing a green tick for a feed
 * nobody has ever successfully read — which is the failure this product exists
 * to correct.
 *
 * Past the 7-day catalogue TTL the proof is rendered as stale, not dropped.
 * Dropping it would turn "it worked last month" into "it has never worked", and
 * those are different facts for someone deciding whether to build on a feed.
 */

export const metadata: Metadata = { title: "Catalogue" };

function proofLine(entry: CatalogueEntry, now: Date): ReactNode {
  if (entry.provenIn.length === 0) {
    return (
      <span className="text-ink-muted">
        {GATE_GLYPHS["gate-off"]} Unknown · no read has ever returned
      </span>
    );
  }
  return (
    <ul className="flex flex-col gap-1">
      {entry.provenIn.map((p) => {
        const age = describeAge(p.at, now);
        const stale = freshnessOf(p.at, CATALOGUE_BADGE_TTL_MS, now) !== "fresh";
        return (
          <li key={`${p.environment}-${p.system}`} className="text-sm">
            <span className={stale ? "text-ink-muted" : "text-ink-soft"}>
              {stale ? GATE_GLYPHS["gate-off"] : GATE_GLYPHS["gate-ok"]}{" "}
              {ENVIRONMENT_LABELS[p.environment]} · {p.system}
              {p.rows === null ? "" : ` · ${p.rows} ${p.rows === 1 ? "row" : "rows"}`}
              {age === null ? "" : ` · ${age}`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default async function CataloguePage(): Promise<ReactNode> {
  const user = await getCurrentUser();
  if (!user) redirect("/presales/login");

  if (user.organizationId === null) {
    return (
      <CoreEdgeShell current="/coreedge/catalogue" title="Catalogue">
        <p className="max-w-prose text-sm text-ink-soft">
          Your account is not attached to an organization, so no data feeds are visible.
        </p>
      </CoreEdgeShell>
    );
  }

  const now = new Date();
  const entries = await listCatalogue(user.organizationId);

  return (
    <CoreEdgeShell
      current="/coreedge/catalogue"
      title="Catalogue"
      subtitle="Every SAP data feed this organization can reach, and what has been proven about each"
    >
      <OpsTable
        caption="SAP data feeds and where each has been proven"
        legend={
          <span>
            {GATE_GLYPHS["gate-ok"]} proven within 7 days · {GATE_GLYPHS["gate-off"]} unknown or
            older than 7 days
          </span>
        }
        rows={entries}
        rowKey={(e) => `${e.externalId}::${e.entitySet ?? ""}`}
        empty={<p className="text-sm text-ink-soft">{EMPTY_STATES.catalogueNone.message}</p>}
        columns={[
          {
            key: "name",
            header: "Data feed",
            cell: (e) => (
              <span className="flex flex-col">
                <span>{e.names.join(" · ")}</span>
                <span className="font-mono text-xs text-ink-muted">
                  {e.externalId}
                  {e.entitySet === null ? "" : ` · ${e.entitySet}`} · {e.operation}
                </span>
              </span>
            ),
          },
          { key: "proof", header: "Proven in", cell: (e) => proofLine(e, now) },
          {
            key: "contract",
            header: "Contract",
            cell: (e) =>
              e.contractCaptured ? (
                <span className="text-sm text-ink-soft">Captured</span>
              ) : (
                <span className="text-sm text-ink-muted">Not captured</span>
              ),
          },
        ]}
      />
    </CoreEdgeShell>
  );
}

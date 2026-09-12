import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { DecisionBar } from "@/components/coreedge/DecisionBar";
import { FieldPicker } from "@/components/coreedge/FieldPicker";
import { OpsTable } from "@/components/coreedge/OpsTable";
import { DISABLED_REASONS, EMPTY_STATES, SCREEN_NOTES } from "@/lib/coreedge/copy";
import { CATALOGUE_BADGE_TTL_MS, describeAge, freshnessOf } from "@/lib/coreedge/freshness";
import { ENVIRONMENT_LABELS } from "@/lib/coreedge/lanes";
import { getAppSettings, getFeedDraft, listCatalogue } from "@/lib/coreedge/queries";
import { GATE_GLYPHS } from "@/lib/coreedge/status-vocabulary";
import { getCurrentUser } from "@/lib/auth/session";

import { CoreEdgeShell } from "../../../CoreEdgeShell";

/**
 * Screen 12 · Add a data feed to an app.
 *
 * PLAIN WORDS, THEN IDENTIFIERS — the same order as the catalogue and the
 * command bar, because a builder searches "purchase orders" and recognises
 * CE_PURCHASEORDER_0001 only afterwards.
 *
 * THE FIELD PICKER IS READ-ONLY, AND THAT IS A BACKEND GAP RATHER THAN A
 * DESIGN CHOICE. S03 has the builder choose 12 of 71 fields and says a later
 * change re-opens the review — which requires somewhere to record the choice.
 * Nothing in this schema holds one: `Interface.responseSchema` is a captured
 * contract, the shape of what a read returned, not a selection. Writing a
 * selection into it would put a number on the passport that means "what SAP
 * describes" while reading as "what this app may read".
 *
 * So the picker shows the fields the captured contract actually names, submit
 * carries the reason it cannot save, and nothing is written anywhere it would
 * not be read back. Recorded in the PR as a missing capability.
 */

export const metadata: Metadata = { title: "Add data feed" };

export default async function AddFeedPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly app: string }>;
  readonly searchParams: Promise<{ readonly feed?: string }>;
}): Promise<ReactNode> {
  const user = await getCurrentUser();
  if (!user) redirect("/presales/login");
  if (user.organizationId === null) notFound();

  const { app } = await params;
  const { feed } = await searchParams;

  const settings = await getAppSettings(user.organizationId, app);
  if (settings === null) notFound();

  const now = new Date();
  const draft = feed === undefined ? null : await getFeedDraft(user.organizationId, feed);

  // No feed chosen yet: the catalogue, scoped to choosing one.
  if (draft === null) {
    const entries = await listCatalogue(user.organizationId);
    return (
      <CoreEdgeShell
        current="/coreedge/catalogue"
        title={`Add a data feed to ${settings.name}`}
        subtitle="Pick the feed first, then the fields"
      >
        <OpsTable
          caption={`Data feeds available to add to ${settings.name}`}
          legend={<span>{GATE_GLYPHS["gate-ok"]} proven · {GATE_GLYPHS["gate-off"]} unknown</span>}
          rows={entries}
          rowKey={(e) => `${e.externalId}::${e.entitySet ?? ""}`}
          empty={<p className="text-sm text-ink-soft">{EMPTY_STATES.catalogueNone.message}</p>}
          columns={[
            {
              key: "feed",
              header: "Data feed",
              cell: (e) => (
                <a
                  href={`/coreedge/apps/${settings.slug}/add-feed?feed=${encodeURIComponent(e.externalId)}`}
                  className="underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring-navy"
                >
                  <span className="flex flex-col">
                    <span>{e.names.join(" · ")}</span>
                    <span className="font-mono text-xs text-ink-muted">{e.externalId}</span>
                  </span>
                </a>
              ),
            },
            {
              key: "proven",
              header: "Proven in",
              cell: (e) =>
                e.provenIn.length === 0 ? (
                  <span className="text-ink-muted">{GATE_GLYPHS["gate-off"]} Unknown</span>
                ) : (
                  <span>
                    {e.provenIn
                      .map((p) => {
                        const stale =
                          freshnessOf(p.at, CATALOGUE_BADGE_TTL_MS, now) !== "fresh";
                        const age = describeAge(p.at, now);
                        return `${stale ? GATE_GLYPHS["gate-off"] : GATE_GLYPHS["gate-ok"]} ${ENVIRONMENT_LABELS[p.environment]}${age === null ? "" : ` · ${age}`}`;
                      })
                      .join(" · ")}
                  </span>
                ),
            },
          ]}
        />
      </CoreEdgeShell>
    );
  }

  const { entry, availableFields } = draft;

  return (
    <CoreEdgeShell
      current="/coreedge/catalogue"
      title={`Add ${entry.names[0] ?? entry.externalId} to ${settings.name}`}
      subtitle={`${entry.externalId}${entry.entitySet === null ? "" : ` · ${entry.entitySet}`} · ${entry.operation}`}
    >
      <p className="max-w-prose text-sm text-ink-soft">
        {SCREEN_NOTES.fieldsChangeReopensReview}
      </p>

      {availableFields.length === 0 ? (
        <p className="max-w-prose text-sm text-ink-muted">
          {GATE_GLYPHS["gate-off"]} No contract has been captured for this feed, so there are no
          field names to choose from. A field list appears once a read against this service has
          returned.
        </p>
      ) : (
        <FieldPicker
          id="add-feed-fields"
          fields={availableFields}
          chosen={[]}
          readOnly
          disabledReason={DISABLED_REASONS.noFieldSelectionStore}
        />
      )}

      <DecisionBar
        idPrefix="add-feed"
        primary={{
          label: "Add data feed",
          disabledReason: DISABLED_REASONS.noFieldSelectionStore,
        }}
      />
    </CoreEdgeShell>
  );
}

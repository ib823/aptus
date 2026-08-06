"use client";

/**
 * Catalogue health — "never silently stale", made a screen.
 *
 * DEPLOYMENT-SCOPED BY DESIGN (FRESHNESS-RESPEC.md): no tenant strip, no
 * environment chip — both would imply the numbers vary by organization, and
 * they do not. Every figure is a real column; the staleness constant is
 * printed beside every verdict; and the refresh flow is file-based end to end
 * because the Hub's terms of use rule out scraping api.sap.com from product
 * code.
 *
 * THE GUIDED REFRESH RUNS THE EXISTING MACHINERY. "Rebuild from bundled drops"
 * calls the admin seed route; "Import a harvested type" drives the chunked
 * harvest-import route to completion. Both demand their confirmation phrase
 * TYPED, not clicked through — the same discipline as every destructive admin
 * action here — and both return the import's own summary (inserted / updated /
 * skipped), which the server also writes to the append-only audit. What this
 * screen shows after a refresh is that recorded summary, never a locally
 * invented "done".
 */

import { useState } from "react";

import {
  AbsencePill,
  OpsCard,
  OpsChip,
  OpsHeading,
  OpsPlaceholder,
  OpsTable,
  ProvenanceStrip,
  opsCellStyle,
  opsMonoStyle,
  type OpsTone,
} from "@/components/ops/OpsChrome";
import { count, FeedAsAt, sinceLabel, useOpsFeed } from "@/components/ops/useOpsFeed";
import { ProductLabel } from "@/components/sap/ProductLabel";

interface TypeRow {
  contentType: string;
  label: string;
  kind: string;
  loadedRows: number;
  groupedItemSum: number;
  illustrativeRows: number;
  publishedReference: number;
  oldestRowAt: string | null;
  newestRowAt: string | null;
  freshness: "CURRENT" | "STALE" | "NEVER_IMPORTED";
  latestImport: { source: string | null; importedAt: string | null };
}

interface CataloguePayload {
  stalenessDays: number;
  types: TypeRow[];
  reference: {
    publishedCountsNote: string;
    artifactCounts: Record<string, unknown> | null;
  };
  probeCoverage: {
    tenants: { key: string; label: string; product: string; environment: string | null }[];
    lastProbeSweep: { startedAt: string; finishedAt: string; ok: boolean } | null;
    note: string;
  };
  provenance: {
    deploymentWide: string;
    floorNotCensus: string;
    refreshIsFileBased: string;
    stalenessBasis: string;
  };
}

const FRESHNESS: Record<TypeRow["freshness"], { tone: OpsTone; label: string; meaning: string }> = {
  CURRENT: { tone: "good", label: "current", meaning: "the newest row write is inside the staleness window" },
  STALE: { tone: "attention", label: "stale", meaning: "older than one SAP release cycle — at least one release behind" },
  NEVER_IMPORTED: { tone: "muted", label: "never imported", meaning: "no rows at all — an absence, not a staleness" },
};

/** The confirmation the two admin import routes demand, typed not clicked. */
const CONFIRMATION = "REBUILD SAP HUB CATALOGUE";

/** The types the harvest emits as individual rows (mirrors harvest-import). */
const HARVEST_TYPES = ["BADI", "BO_INTERFACE", "EVENT", "INTEGRATION", "SCENARIO"] as const;

export function CatalogueHealthClient() {
  const { feed, reload, fetchedAt } = useOpsFeed<CataloguePayload>("/api/ops/catalogue-health");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <OpsHeading
        title="Catalogue health"
        lede="How current is the SAP catalogue this deployment serves from — per content type, with each import's own provenance. Deployment-wide on purpose: the catalogue is one table serving every organization, so there is no per-tenant number here."
      />
      <FeedAsAt fetchedAt={fetchedAt} />

      {feed.state === "loading" ? (
        <OpsCard>
          <OpsPlaceholder kind="loading" title="" detail="" />
        </OpsCard>
      ) : feed.state === "error" ? (
        <OpsCard>
          <OpsPlaceholder kind="error" title="Catalogue health could not be read" detail={feed.message} />
        </OpsCard>
      ) : (
        <>
          <CatalogueBody data={feed.data} />
          <GuidedRefresh onImported={reload} />
        </>
      )}
    </div>
  );
}

function CatalogueBody({ data }: { data: CataloguePayload }) {
  const { types, provenance, probeCoverage, reference } = data;
  const harvestedAt =
    typeof reference.artifactCounts?.harvestedAt === "string"
      ? reference.artifactCounts.harvestedAt
      : null;

  return (
    <>
      <OpsCard>
        <OpsTable head={["Content type", "Loaded", "Published (ref)", "Freshness", "Last import"]}>
          {types.map((t) => (
            <tr key={t.contentType}>
              <td style={opsCellStyle}>
                {t.label}
                <div style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 11.5, color: "var(--ink-muted)" }}>
                  {t.contentType} · {t.kind}
                  {t.illustrativeRows > 0 ? ` · ${count(t.illustrativeRows)} illustrative` : ""}
                </div>
              </td>
              <td style={opsMonoStyle}>
                {count(t.loadedRows)}
                {/* Grouped rows carry how many items they stand for; saying
                    "43 rows" about ~9,000 CDS views would be a wrong claim. */}
                {t.groupedItemSum > 0 ? ` rows ≈ ${count(t.groupedItemSum)} items` : ""}
              </td>
              <td style={opsMonoStyle}>
                {t.publishedReference === 0 ? "n/a by design" : count(t.publishedReference)}
              </td>
              <td style={opsCellStyle}>
                <OpsChip
                  tone={FRESHNESS[t.freshness].tone}
                  label={FRESHNESS[t.freshness].label}
                  meaning={FRESHNESS[t.freshness].meaning}
                />
              </td>
              <td style={opsCellStyle}>
                {t.newestRowAt === null ? (
                  <AbsencePill label="no import recorded" meaning="this type holds no rows" />
                ) : (
                  <div style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 11.5, color: "var(--ink-secondary)" }}>
                    {sinceLabel(t.newestRowAt)}
                    {t.latestImport.source ? (
                      <div style={{ color: "var(--ink-muted)" }}>{t.latestImport.source}</div>
                    ) : null}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </OpsTable>
        <ProvenanceStrip claim={`Stale after ${count(data.stalenessDays)} days — one SAP release cycle`}>
          {provenance.stalenessBasis}
          <div style={{ marginTop: 6 }}>{provenance.floorNotCensus}</div>
          <div style={{ marginTop: 6 }}>
            {reference.publishedCountsNote}
            {harvestedAt ? ` Committed artifact-count drop harvested ${sinceLabel(harvestedAt)}.` : ""}
          </div>
        </ProvenanceStrip>
      </OpsCard>

      <OpsCard>
        <div style={{ padding: "13px 16px 4px", fontSize: 13, fontWeight: 600 }}>Probe coverage</div>
        {probeCoverage.tenants.length === 0 ? (
          <OpsPlaceholder
            kind="empty"
            title="No deployment tenant configured"
            detail="Capability probes are recorded per env-configured tenant, and this deployment has none. Connection-level probing still runs against stored connections."
          />
        ) : (
          <OpsTable head={["Tenant", "Product", "Environment"]}>
            {probeCoverage.tenants.map((t) => (
              <tr key={`${t.product}:${t.key}`}>
                <td style={opsCellStyle}>
                  {t.label}
                  <div style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 11.5, color: "var(--ink-muted)" }}>
                    {t.key}
                  </div>
                </td>
                <td style={opsCellStyle}>
                  <ProductLabel product={t.product} size={16} />
                </td>
                <td style={opsCellStyle}>
                  {t.environment ? (
                    <OpsChip tone="info" label={t.environment} />
                  ) : (
                    <AbsencePill label="environment not declared" />
                  )}
                </td>
              </tr>
            ))}
          </OpsTable>
        )}
        <ProvenanceStrip claim="Probes are tenant-keyed; connections have their own history">
          {probeCoverage.note}
          <div style={{ marginTop: 6 }}>
            {probeCoverage.lastProbeSweep
              ? `Last connection probe sweep ${probeCoverage.lastProbeSweep.ok ? "completed" : "FAILED"} ${sinceLabel(probeCoverage.lastProbeSweep.finishedAt)}.`
              : "No connection probe sweep has been recorded yet — an absence, not a failure."}
          </div>
        </ProvenanceStrip>
      </OpsCard>
    </>
  );
}

/**
 * The refresh flow, guided. Step 1 is outside the product on purpose (export
 * from a logged-in Hub session, commit, deploy — the ToU-compliant path); steps
 * 2–3 run here against the existing admin routes, and what renders afterwards
 * is the server's own audited summary.
 */
function GuidedRefresh({ onImported }: { onImported: () => void }) {
  const [phrase, setPhrase] = useState("");
  const [harvestType, setHarvestType] = useState<(typeof HARVEST_TYPES)[number]>("EVENT");
  const [running, setRunning] = useState<"seed" | "harvest" | "api-reference" | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const armed = phrase === CONFIRMATION;

  /** The rebuild call alone — shared by the button and the api-ref chain. */
  const rebuildOnce = async (): Promise<string> => {
    const res = await fetch("/api/sap/tdd/hub-content/seed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: phrase }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      data?: Record<string, unknown>;
      error?: { message?: string };
    };
    if (!res.ok || !body.data) {
      throw new Error(body.error?.message ?? `Rebuild failed (HTTP ${res.status}).`);
    }
    return `Rebuild complete: ${JSON.stringify(body.data)}`;
  };

  const runSeed = async () => {
    setRunning("seed");
    setOutcome(null);
    setFailure(null);
    try {
      setOutcome(await rebuildOnce());
      onImported();
    } catch (err) {
      setFailure(err instanceof Error ? err.message : "The rebuild request could not be sent.");
    } finally {
      setRunning(null);
    }
  };

  /**
   * The API reference import, then the rebuild, as ONE action. The reference
   * table is what the API tile projects FROM — refreshing it without
   * re-projecting would leave the screen unchanged and the operator concluding
   * the import did nothing. Chunked like the harvest imports (~4,600 rows).
   */
  const runApiReference = async () => {
    setRunning("api-reference");
    setOutcome(null);
    setFailure(null);
    let offset = 0;
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    try {
      for (;;) {
        const res = await fetch("/api/sap/tdd/hub-content/api-reference-import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmation: phrase, offset }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          data?: { inserted: number; updated: number; skipped: number; nextOffset: number | null };
          error?: { message?: string };
        };
        if (!res.ok || !body.data) {
          setFailure(body.error?.message ?? `API reference import failed at offset ${offset} (HTTP ${res.status}).`);
          return;
        }
        inserted += body.data.inserted;
        updated += body.data.updated;
        skipped += body.data.skipped;
        if (body.data.nextOffset === null) break;
        offset = body.data.nextOffset;
      }
      // Chain the rebuild so the refreshed reference is re-projected into the
      // catalogue rows the console actually reads.
      const rebuildSummary = await rebuildOnce();
      setOutcome(
        `API reference import complete: ${count(inserted)} inserted, ${count(updated)} updated, ${count(skipped)} skipped. ${rebuildSummary}`,
      );
      onImported();
    } catch (err) {
      setFailure(
        err instanceof Error
          ? `${err.message} The import itself is idempotent — re-running resumes safely.`
          : `The import stopped at offset ${offset}. Re-running resumes safely — it is idempotent.`,
      );
    } finally {
      setRunning(null);
    }
  };

  const runHarvest = async () => {
    setRunning("harvest");
    setOutcome(null);
    setFailure(null);
    // The route is chunked and resumable; this loop drives it to completion,
    // accumulating the server's own numbers rather than inventing a total.
    let offset = 0;
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    try {
      for (;;) {
        const res = await fetch("/api/sap/tdd/hub-content/harvest-import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmation: phrase, contentType: harvestType, offset }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          data?: { inserted: number; updated: number; skipped: number; nextOffset: number | null };
          error?: { message?: string };
        };
        if (!res.ok || !body.data) {
          setFailure(body.error?.message ?? `Import failed at offset ${offset} (HTTP ${res.status}).`);
          return;
        }
        inserted += body.data.inserted;
        updated += body.data.updated;
        skipped += body.data.skipped;
        if (body.data.nextOffset === null) break;
        offset = body.data.nextOffset;
      }
      setOutcome(
        `${harvestType} import complete: ${count(inserted)} inserted, ${count(updated)} updated, ${count(skipped)} skipped (malformed rows counted, not hidden).`,
      );
      onImported();
    } catch {
      setFailure(`The import stopped at offset ${offset}. Re-running resumes safely — the import is idempotent.`);
    } finally {
      setRunning(null);
    }
  };

  return (
    <OpsCard>
      <div style={{ padding: "15px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Guided refresh</div>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.6, color: "var(--ink-secondary)" }}>
          <li>
            Export from a <b>logged-in</b> SAP Business Accelerator Hub session and commit the drop
            file to the repository (the ToU-compliant path — this product never fetches
            api.sap.com). Deploy the commit.
          </li>
          <li>Type the confirmation phrase, exactly.</li>
          <li>
            Run the rebuild (bundled drops + the API slice), a harvested-type import, or the API
            reference import (which refreshes the table the API tile projects from, then chains the
            rebuild automatically). The summary shown afterwards is the server&apos;s own, and the
            same numbers are written to the append-only audit.
          </li>
        </ol>

        <label style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: 420 }}>
          <span style={{ fontSize: 12, color: "var(--ink-secondary)" }}>
            Confirmation phrase — <code style={{ fontSize: 11.5 }}>{CONFIRMATION}</code>
          </span>
          <input
            type="text"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder="type the phrase to arm the actions"
            style={{
              fontSize: 12.5,
              padding: "6px 9px",
              borderRadius: 6,
              border: "1px solid var(--border-default)",
              background: "var(--surface-paper)",
              color: "var(--ink-primary)",
              fontFamily: "var(--font-mono, monospace)",
            }}
          />
        </label>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={runSeed}
            disabled={!armed || running !== null}
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid var(--border-strong)",
              background: "var(--surface-paper)",
              color: "var(--ink-primary)",
              cursor: armed && running === null ? "pointer" : "default",
              opacity: armed ? 1 : 0.5,
            }}
          >
            {running === "seed" ? "Rebuilding…" : "Rebuild from bundled drops"}
          </button>

          <button
            type="button"
            onClick={runApiReference}
            disabled={!armed || running !== null}
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid var(--border-strong)",
              background: "var(--surface-paper)",
              color: "var(--ink-primary)",
              cursor: armed && running === null ? "pointer" : "default",
              opacity: armed ? 1 : 0.5,
            }}
          >
            {running === "api-reference" ? "Importing API reference…" : "Import API reference + rebuild"}
          </button>

          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <select
              value={harvestType}
              onChange={(e) => setHarvestType(e.target.value as (typeof HARVEST_TYPES)[number])}
              style={{
                fontSize: 12.5,
                padding: "5px 7px",
                borderRadius: 6,
                border: "1px solid var(--border-default)",
                background: "var(--surface-paper)",
                color: "var(--ink-primary)",
              }}
            >
              {HARVEST_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={runHarvest}
              disabled={!armed || running !== null}
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid var(--border-strong)",
                background: "var(--surface-paper)",
                color: "var(--ink-primary)",
                cursor: armed && running === null ? "pointer" : "default",
                opacity: armed ? 1 : 0.5,
              }}
            >
              {running === "harvest" ? "Importing…" : "Import harvested type"}
            </button>
          </span>
        </div>

        {outcome ? (
          <div style={{ fontSize: 12.5, color: "var(--status-signed-fg)", background: "var(--status-signed-bg)", padding: "8px 10px", borderRadius: 6 }}>
            {outcome}
          </div>
        ) : null}
        {failure ? (
          <div role="alert" style={{ fontSize: 12.5, color: "var(--status-revoked-fg)", background: "var(--status-revoked-bg)", padding: "8px 10px", borderRadius: 6 }}>
            {failure}
          </div>
        ) : null}
      </div>
      <ProvenanceStrip claim="File-based refresh, by the Hub's terms of use">
        Imports are idempotent upserts keyed on (contentType, externalId): re-running one refreshes
        metadata and preserves each row&apos;s tenant-keyed probe history. CDS views and BAdIs stay
        counts-only by design — bundling ~10,000 rows nothing probes would bloat every deployment
        for no capability.
      </ProvenanceStrip>
    </OpsCard>
  );
}

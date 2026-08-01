"use client";

/**
 * SAP Capability Catalogue (CatalogueList) — the full published menu for
 * S/4HANA Cloud Public, token-first (design-token contract). Scorecard + tiles
 * + LoB-grouped list with token status badges + capability chips + inline
 * "needs setup" hint, filters/search/pagination, and an expandable detail.
 * Colour via var(--token) only; flips in dark within [data-cap-catalogue].
 */

import { useCallback, useEffect, useId, useState } from "react";
import { AlertTriangle, RefreshCw, Search } from "lucide-react";
import { HUB_CONTENT_TYPE_META, type HubContentType, type HubStatus } from "@/lib/sap-public/hub-content";
import { HARVEST_TYPES } from "@/lib/sap-public/hub-harvest-types";
import { useAffirmLearn } from "@/components/affirm/learn/context";
import { glossaryIdForStatus } from "@/constants/sap-glossary";
import { ReadinessScorecard } from "./capability/ReadinessScorecard";
import { ContentTypeTiles } from "./capability/ContentTypeTiles";
import { StatusBadge, type BadgeStatus } from "./capability/StatusBadge";
import { CapabilityChips } from "./capability/CapabilityChips";
import { CapabilityDetail } from "./capability/CapabilityDetail";

interface HubItem {
  id: string;
  contentType: HubContentType;
  externalId: string;
  title: string;
  description: string;
  packageId: string | null;
  apiType: string | null;
  source?: "sap" | "partner";
  domain?: string | null;
  communicationScenarios: string[];
  scopeItemCodes: string[];
  itemCount: number | null;
  /** TRUE = repo-authored placeholder, not SAP-published. Null = unrecorded. */
  illustrative?: boolean | null;
  hubUrl: string;
  status: HubStatus;
  availabilityNote?: "subscribe" | null;
  dataConfirmed?: boolean;
  /** Real read/write for the ~60 probed rows (else null → "not probed"). */
  capability?: { read: boolean; write: boolean } | null;
}
interface HubData {
  note?: string;
  items: HubItem[];
  total: number;
  page: number;
  limit: number;
  counts: { byType: Record<string, number>; byTypeItems?: Record<string, number>; aiApis?: number; byStatus: Record<HubStatus, number>; byLob?: Record<string, number>; probeableRuntime: number; probed: number; lastProbedAt?: string | null; dataConfirmed?: number; dataProbe?: boolean };
  catalogueImported: boolean;
  tenant: string | null;
  isAdmin?: boolean;
}

type StatusFilter = "ALL" | HubStatus;
// Full faceted set. Each facet renders only when it has rows (or is selected),
// so empty statuses stay out of the way — but NOT_PROBEABLE (~470) always shows
// its count and is never hidden. Counts come from the edition-wide byStatus.
const STATUS_FILTERS: StatusFilter[] = ["ALL", "ACTIVATED", "NEEDS_SETUP", "NOT_CHECKED", "NOT_PROBEABLE", "NOT_FOUND", "AVAILABLE", "REFERENCE"];
const STATUS_LABEL: Record<StatusFilter, string> = {
  ALL: "All",
  ACTIVATED: "Activated",
  NEEDS_SETUP: "Needs setup",
  NOT_FOUND: "Not found",
  NOT_CHECKED: "Not checked",
  NOT_PROBEABLE: "Not probeable",
  AVAILABLE: "Available",
  REFERENCE: "Reference",
};

/**
 * A one-line hint under the row, driven ONLY by the confirmed probe status —
 * never fabricated from catalogue metadata. Un-probed says "open to probe",
 * not "needs setup" (which killed the list-vs-detail contradiction).
 */
function statusHint(status: BadgeStatus): { text: string; color: string } | null {
  switch (status) {
    case "NEEDS_SETUP":
      return { text: "needs setup — activate the arrangement", color: "var(--status-awaiting-fg)" };
    case "NOT_CHECKED":
      return { text: "not checked — open to run a live probe", color: "var(--ink-muted)" };
    case "NOT_PROBEABLE":
      return { text: "not probeable — no OData endpoint (SOAP/async)", color: "var(--ink-muted)" };
    case "NOT_FOUND":
      return { text: "path not found on this tenant", color: "var(--ink-muted)" };
    default:
      return null;
  }
}

/** A tiny coverage-tile swatch for the legend: filled = Loaded, outline = Not loaded. */
function LegendSwatch({ filled, label }: { filled?: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5" style={{ color: "var(--ink-secondary)" }}>
      <span
        aria-hidden
        style={{
          width: 12,
          height: 12,
          borderRadius: 3,
          background: filled ? "var(--brand-navy)" : "var(--surface-cream)",
          border: filled ? "1px solid var(--brand-navy)" : "1px solid var(--border-default)",
        }}
      />
      {label}
    </span>
  );
}

function groupByLoB(items: HubItem[]): Array<[string, HubItem[]]> {
  const map = new Map<string, HubItem[]>();
  for (const it of items) {
    const key = it.packageId ?? "Other";
    (map.get(key) ?? map.set(key, []).get(key)!).push(it);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/** The subset of a catalogue row a caller needs to seed governance from it. */
export interface CatalogueSelection {
  id: string;
  externalId: string;
  title: string;
  contentType: HubContentType;
  apiType: string | null;
  product: string;
}

export function SapCapabilityCatalogue({
  product = "s4hana",
  /**
   * Business-domain lens (CoreEdge Developer Studio). When true, a line-of-business
   * filter row renders, built from the LoB counts the catalogue endpoint reports —
   * so it offers the domains that ACTUALLY exist, with their real sizes, rather
   * than a hardcoded taxonomy that would drift into empty buckets.
   *
   * NOTE it filters `lob` (persisted on packageId, and what the grouped list below
   * is grouped by) and NOT the `domain` facet, which carries SAP's own vocabulary
   * ("AI"). Different fields, different vocabularies.
   *
   * Omitted → the control does not exist and behaviour is unchanged.
   */
  domainLens = false,
  /**
   * When provided, each row gains an "Add to interface" action. Omitted → no
   * action renders, so the existing SAP Operations surface is untouched.
   */
  onAddToInterface,
  /**
   * Which tenant this catalogue is about. Omitted → the routes fall back to the
   * first configured tenant, which is what /sap-explorer has always done and
   * still does.
   *
   * Studio passes the tenant the switcher selected. Without it, Discover claimed
   * "what THIS tenant exposes" while silently reporting the default one — and
   * probe results are stored per tenant key, so the page could show one tenant's
   * status under another tenant's name.
   */
  tenant,
}: {
  product?: string;
  domainLens?: boolean;
  onAddToInterface?: (selection: CatalogueSelection) => void;
  tenant?: string | undefined;
}) {
  const [data, setData] = useState<HubData | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [contentType, setContentType] = useState<HubContentType | "ALL">("ALL");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [dataProbe, setDataProbe] = useState(false);
  // Source/domain facets: SAP-only (hide partner) and AI-only (domain=AI).
  const [sapOnly, setSapOnly] = useState(false);
  const [aiOnly, setAiOnly] = useState(false);
  // Business-domain lens (Studio). Null = "All domains". Filters `lob`.
  const [lob, setLob] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Confirmed statuses lifted from a detail live-probe, keyed by item id. These
  // OVERRIDE the list's (capped) status so list & detail can never contradict.
  const [probedStatus, setProbedStatus] = useState<Record<string, HubStatus>>({});
  // Confirmed read/write lifted from a detail live-probe, keyed by item id — so an
  // expanded row's collapsed chip matches its detail exactly (mirrors probedStatus).
  const [probedCapability, setProbedCapability] = useState<Record<string, { read: boolean; write: boolean }>>({});
  // Tap any status badge to open the plain-language glossary at that status.
  const { openGlossary } = useAffirmLearn();
  // Robust autofill suppression: Chrome ignores autoComplete="off" on search
  // fields, so also use a randomized name + readonly-until-focus so nothing is
  // ever autofilled on load.
  const searchFieldName = `cap-search-${useId()}`;
  const [searchReadOnly, setSearchReadOnly] = useState(true);
  const limit = 50;

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [contentType, status, q, lob]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNote(null);
    try {
      const sp = new URLSearchParams({ product, page: String(page), limit: String(limit) });
      if (tenant) sp.set("tenant", tenant);
      if (contentType !== "ALL") sp.set("contentType", contentType);
      if (status !== "ALL") sp.set("status", status);
      if (q) sp.set("q", q);
      if (dataProbe) sp.set("dataProbe", "1");
      if (sapOnly) sp.set("source", "sap");
      if (aiOnly) sp.set("domain", "AI");
      if (lob) sp.set("lob", lob);
      const res = await fetch(`/api/sap/tdd/hub-content?${sp.toString()}`);
      const json = (await res.json()) as { data?: HubData; error?: { message?: string } };
      if (!res.ok || !json.data) throw new Error(json.error?.message ?? "Failed to load the catalogue");
      if (json.data.note) setNote(json.data.note);
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the catalogue");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [product, tenant, page, contentType, status, q, dataProbe, sapOnly, aiOnly, lob]);

  useEffect(() => {
    void load();
  }, [load]);

  const [seeding, setSeeding] = useState(false);
  const importSeed = useCallback(async () => {
    /*
     * CONFIRM BEFORE REBUILDING. The server requires a confirmation PHRASE, and
     * this client has always supplied it automatically — so the guard proved
     * "a caller that knows the API" and never "a human who meant it". These
     * are plain buttons beside ordinary filters; a mis-click regenerated the
     * catalogue with nothing to undo it.
     */
    if (
      !window.confirm(
        "Rebuild the API rows from SapApiReference?\n\n" +
          "This regenerates the catalogue for this tenant. Probe results already " +
          "stored are kept, but any row SAP no longer publishes disappears.\n\n" +
          "There is no undo.",
      )
    ) {
      return;
    }
    setSeeding(true);
    setError(null);
    try {
      const res = await fetch("/api/sap/tdd/hub-content/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "REBUILD SAP HUB CATALOGUE" }),
      });
      const json = (await res.json()) as { data?: { imported: number }; error?: { message?: string } };
      if (!res.ok) throw new Error(json.error?.message ?? "Rebuild failed (admin only)");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setSeeding(false);
    }
  }, [load]);

  /*
   * IMPORT THE HARVESTED ARTIFACTS — DRIVEN TO COMPLETION FROM HERE.
   *
   * The endpoint is chunked and resumable because it fetches over the network
   * and one call must not outrun the platform timeout. That makes the LOOP the
   * caller's job, and leaving it to whoever holds a terminal would have meant a
   * delivery path reachable only by curl — which is the gap this closes, not a
   * smaller version of it.
   *
   * Progress is shown as it goes, and a partial result is reported as partial.
   * A run that stops halfway leaves rows behind that look exactly like a
   * finished import, so the count on screen is the only thing that can tell an
   * operator which one they got.
   */
  const [harvesting, setHarvesting] = useState(false);
  const [harvestProgress, setHarvestProgress] = useState<string | null>(null);
  const importHarvest = useCallback(async () => {
    if (
      !window.confirm(
        "Import the harvested Hub artifacts?\n\n" +
          "This replaces the stored integrations, BAdIs, scenarios, events and " +
          "BO interfaces with the set harvested at this deployment's commit.",
      )
    ) {
      return;
    }
    setHarvesting(true);
    setError(null);
    setHarvestProgress(null);
    let total = 0;
    try {
      for (const type of HARVEST_TYPES) {
        let offset: number | null = 0;
        let forType = 0;
        // Bounded: 1,000 rows a call against the largest file (4,439) is 5 calls.
        // The cap is a runaway guard, not an expected limit.
        for (let guard = 0; offset !== null && guard < 50; guard++) {
          const res = await fetch("/api/sap/tdd/hub-content/harvest-import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ confirmation: "REBUILD SAP HUB CATALOGUE", contentType: type, offset, limit: 500 }),
          });
          const json = (await res.json()) as {
            data?: { inserted: number; updated: number; nextOffset: number | null; total: number };
            error?: { message?: string };
          };
          if (!res.ok || !json.data) throw new Error(json.error?.message ?? `Harvest import failed for ${type}`);
          forType += json.data.inserted + json.data.updated;
          total += json.data.inserted + json.data.updated;
          offset = json.data.nextOffset;
          setHarvestProgress(`${type}: ${forType} of ${json.data.total}`);
        }
      }
      setHarvestProgress(`Imported ${total} artifacts`);
      await load();
    } catch (err) {
      // Says how far it got. "Failed" alone would hide that rows did land.
      setError(`${err instanceof Error ? err.message : "Harvest import failed"} — ${total} artifacts imported before stopping`);
      setHarvestProgress(null);
    } finally {
      setHarvesting(false);
    }
  }, [load]);

  const [probing, setProbing] = useState(false);
  const probeAll = useCallback(async () => {
    /*
     * This fires one live $metadata request per probeable service at a REAL
     * client tenant. Read-only, but hundreds of calls arriving unannounced is
     * something an operator should choose rather than discover — and the cost
     * is knowable, so it is shown rather than described as "a lot".
     */
    const toProbe = data?.counts.probeableRuntime ?? 0;
    if (
      !window.confirm(
        `Probe all ${toProbe} probeable services on ${tenant ?? "the default tenant"}?\n\n` +
          "Each is a live read-only $metadata request against the client's SAP " +
          "system. They are not billable, but they are real traffic on someone " +
          "else's tenant and cannot be cancelled once started.",
      )
    ) {
      return;
    }
    setProbing(true);
    setError(null);
    try {
      const res = await fetch("/api/sap/tdd/hub-content/probe-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Probe the tenant on screen. Results are stored under this tenant's key,
        // so omitting it would write the default tenant's results while the page
        // is captioned with another.
        body: JSON.stringify({ confirmation: "PROBE ALL SAP SERVICES", product, ...(tenant ? { tenant } : {}) }),
      });
      const json = (await res.json()) as { data?: { probed: number }; error?: { message?: string } };
      if (!res.ok) throw new Error(json.error?.message ?? "Probe-all failed (admin only)");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Probe-all failed");
    } finally {
      setProbing(false);
    }
  }, [load, product, tenant, data?.counts.probeableRuntime]);

  const byType = data?.counts.byType ?? {};
  const byTypeItems = data?.counts.byTypeItems ?? {};
  // Lens options come from the catalogue's own LoB counts — biggest domains
  // first, so the lens reflects what is actually there rather than a fixed list.
  const byLob = data?.counts.byLob ?? {};
  const lobOptions = Object.keys(byLob).sort(
    (a, b) => (byLob[b] ?? 0) - (byLob[a] ?? 0) || a.localeCompare(b),
  );
  const totalItems = Object.values(byTypeItems).reduce((n, c) => n + c, 0);
  const aiApis = data?.counts.aiApis ?? 0;
  const byStatus: Record<HubStatus, number> = data?.counts.byStatus ?? {
    ACTIVATED: 0,
    NEEDS_SETUP: 0,
    NOT_FOUND: 0,
    NOT_CHECKED: 0,
    NOT_PROBEABLE: 0,
    AVAILABLE: 0,
    REFERENCE: 0,
  };
  // Edition-wide total for the ALL facet (byStatus is computed over every row,
  // independent of the active contentType/search/status filters).
  const allCount = Object.values(byStatus).reduce((sum, n) => sum + n, 0);
  const probeable = data?.counts.probeableRuntime ?? 0;
  const probed = data?.counts.probed ?? 0;
  const lastProbedAt = data?.counts.lastProbedAt ?? null;
  const dataConfirmedCount = data?.counts.dataConfirmed ?? 0;
  const dataProbeOn = data?.counts.dataProbe ?? false;
  const apiTotal = data?.counts.byType.API ?? 0;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / limit)) : 1;
  const groups = data ? groupByLoB(data.items) : [];

  return (
    <section
      data-cap-catalogue
      className="space-y-5 rounded-[var(--radius-card-warm)] p-1"
      style={{ background: "var(--surface-cream)", color: "var(--ink-primary)" }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight" style={{ color: "var(--brand-navy)" }}>
            Capability Catalogue
          </h2>
          <p className="text-sm" style={{ color: "var(--ink-secondary)" }}>
            Every SAP Business Accelerator Hub content type for S/4HANA Cloud Public on {data?.tenant ?? "no tenant"}. Two independent axes: <strong>coverage</strong> — whether we&apos;ve imported SAP&apos;s published list for a type (the tiles) — and <strong>tenant status</strong> — whether a specific item is live on this tenant (the row badges). A badge only asserts what a probe established; nothing is inferred.
          </p>
        </div>
        {/* Always-available admin controls (server still enforces the guard). */}
        {data?.isAdmin && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void importSeed()}
              disabled={seeding || probing || harvesting}
              title="Rebuild the API rows from SapApiReference (admin only)"
              className="inline-flex items-center gap-2 rounded-[var(--radius-input)] px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              style={{ border: "1px solid var(--brand-navy)", color: "var(--brand-navy)", background: "var(--surface-paper)" }}
            >
              {seeding && <RefreshCw className="size-3.5 animate-spin" />}
              Rebuild from API reference
            </button>
            <button
              type="button"
              onClick={() => void importHarvest()}
              disabled={seeding || probing || harvesting}
              title="Fetch the harvested Hub artifacts (integrations, BAdIs, scenarios, events, BO interfaces) at this deployment's commit and import them (admin only)."
              className="inline-flex items-center gap-2 rounded-[var(--radius-input)] px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              style={{ border: "1px solid var(--brand-navy)", color: "var(--brand-navy)", background: "var(--surface-paper)" }}
            >
              {harvesting && <RefreshCw className="size-3.5 animate-spin" />}
              {harvestProgress ?? "Import harvested artifacts"}
            </button>
            <button
              type="button"
              onClick={() => void probeAll()}
              disabled={seeding || probing || harvesting}
              title="Probe every OData service and store the result (admin only). Read-only $metadata."
              className="inline-flex items-center gap-2 rounded-[var(--radius-input)] px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              style={{ border: "1px solid var(--brand-navy)", color: "var(--ink-on-navy)", background: "var(--brand-navy)" }}
            >
              {probing && <RefreshCw className="size-3.5 animate-spin" />}
              Probe all
            </button>
          </div>
        )}
      </div>

      {error && (
        <div
          className="rounded-[var(--radius-card-warm)] px-3 py-2 text-sm"
          style={{ background: "var(--status-revoked-bg)", color: "var(--status-revoked-fg)" }}
        >
          {error}
        </div>
      )}
      {note && (
        <div
          className="rounded-[var(--radius-card-warm)] px-4 py-6 text-sm"
          style={{ border: "1px dashed var(--border-default)", background: "var(--surface-paper)", color: "var(--ink-muted)" }}
        >
          <p className="flex items-center gap-2 font-medium" style={{ color: "var(--ink-primary)" }}>
            <AlertTriangle className="size-4" /> Catalogue not imported
          </p>
          <p className="mt-1">{note}</p>
          {data?.isAdmin && <p className="mt-2 text-xs">Use “Rebuild from API reference” in the header above to populate it.</p>}
        </div>
      )}

      {!note && (
        <>
          <div data-tour="sap-scorecard">
            <ReadinessScorecard
              activated={byStatus.ACTIVATED}
              dataConfirmed={dataConfirmedCount}
              dataProbe={dataProbeOn}
              needsSetup={byStatus.NEEDS_SETUP}
              notChecked={byStatus.NOT_CHECKED}
              notProbeable={byStatus.NOT_PROBEABLE}
              available={byStatus.AVAILABLE}
              probed={probed}
              probeable={probeable}
              apiTotal={apiTotal}
              reference={byStatus.REFERENCE}
              totalItems={totalItems}
              aiApis={aiApis}
              lastProbedAt={lastProbedAt}
            />
          </div>
          {/* Compact visual two-axis legend: COVERAGE (tiles) vs TENANT STATUS (badges). */}
          <div
            className="flex flex-col gap-2 rounded-[var(--radius-input)] px-3 py-2.5 text-xs"
            style={{ background: "var(--surface-paper)", border: "1px solid var(--border-default)" }}
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <span className="font-semibold uppercase tracking-wide" style={{ color: "var(--ink-secondary)" }}>Coverage</span>
              <span style={{ color: "var(--ink-muted)" }}>tiles —</span>
              <LegendSwatch filled label="Loaded" />
              <LegendSwatch label="Not loaded" />
              <span style={{ color: "var(--ink-muted)" }}>have we imported SAP&apos;s published list for a type</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <span className="font-semibold uppercase tracking-wide" style={{ color: "var(--ink-secondary)" }}>Tenant status</span>
              <span style={{ color: "var(--ink-muted)" }}>badges —</span>
              <StatusBadge status="ACTIVATED" />
              <StatusBadge status="NEEDS_SETUP" />
              <StatusBadge status="NOT_CHECKED" />
              <StatusBadge status="NOT_PROBEABLE" />
              <StatusBadge status="REFERENCE" />
              <span style={{ color: "var(--ink-muted)" }}>whether an item is live on this tenant</span>
            </div>
            <p style={{ color: "var(--ink-muted)" }}>
              Tiles never make a tenant claim; badges never claim coverage. A badge asserts only what a probe established.
            </p>
          </div>
          <div data-tour="sap-tiles">
            <ContentTypeTiles byType={byType} byTypeItems={byTypeItems} activeType={contentType} onSelect={setContentType} />
          </div>

          {/* Source / domain facets — SAP-only (hide partner) + AI-only. Read from
              rawMetadataJson server-side; makes the 158 integrations & 26 AI APIs findable. */}
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Source and domain filter">
            <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>Source</span>
            <button
              type="button"
              aria-pressed={sapOnly}
              onClick={() => { setSapOnly((v) => !v); setPage(1); }}
              className="rounded-[var(--radius-pill)] px-2.5 py-1 text-xs font-medium transition"
              style={{
                background: sapOnly ? "var(--brand-navy)" : "var(--surface-paper)",
                color: sapOnly ? "var(--surface-paper)" : "var(--ink-secondary)",
                border: `1px solid ${sapOnly ? "var(--brand-navy)" : "var(--border-default)"}`,
              }}
            >
              SAP only {sapOnly ? "· partner hidden" : "· incl. partner"}
            </button>
            <button
              type="button"
              aria-pressed={aiOnly}
              onClick={() => { setAiOnly((v) => !v); setPage(1); }}
              className="rounded-[var(--radius-pill)] px-2.5 py-1 text-xs font-medium transition"
              style={{
                background: aiOnly ? "var(--brand-navy)" : "var(--surface-paper)",
                color: aiOnly ? "var(--surface-paper)" : "var(--ink-secondary)",
                border: `1px solid ${aiOnly ? "var(--brand-navy)" : "var(--border-default)"}`,
              }}
            >
              AI APIs only{aiApis ? ` · ${aiApis}` : ""}
            </button>
          </div>

          {/* Business-domain lens (Studio only — rendered when a taxonomy is passed).
              Narrows the same server-side `domain` facet; it is a VIEW over the
              catalogue, never a claim about the tenant. */}
          {domainLens && lobOptions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Business domain filter">
              <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
                Business domain
              </span>
              {[null, ...lobOptions].map((d) => {
                const selected = lob === d;
                const count = d ? (byLob[d] ?? 0) : null;
                return (
                  <button
                    key={d ?? "__all"}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setLob(d)}
                    className="rounded-[var(--radius-pill)] px-2.5 py-1 text-xs font-medium transition"
                    style={{
                      background: selected ? "var(--brand-navy)" : "var(--surface-paper)",
                      color: selected ? "var(--surface-paper)" : "var(--ink-secondary)",
                      border: `1px solid ${selected ? "var(--brand-navy)" : "var(--border-default)"}`,
                    }}
                  >
                    {d ?? "All domains"}
                    {count != null ? ` · ${count}` : ""}
                  </button>
                );
              })}
            </div>
          )}

          {/* status filter + search */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Status filter" data-tour="sap-filters">
              {STATUS_FILTERS.map((s) => {
                const selected = status === s;
                const count = s === "ALL" ? allCount : byStatus[s];
                // Hide empty facets to declutter — but never hide the selected one,
                // and ALL is always shown. Non-empty facets (incl. Not-probeable) stay.
                if (s !== "ALL" && count === 0 && !selected) return null;
                return (
                  <button
                    key={s}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setStatus(s)}
                    className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-3 py-1 text-xs font-medium transition"
                    style={
                      selected
                        ? { background: "var(--brand-navy)", color: "var(--surface-paper)" }
                        : { background: "var(--surface-paper)", color: "var(--ink-primary)", border: "1px solid var(--border-default)" }
                    }
                  >
                    {STATUS_LABEL[s]}
                    <span
                      className="tabular-nums"
                      style={{ color: selected ? "var(--surface-paper)" : "var(--ink-muted)", opacity: selected ? 0.85 : 1 }}
                    >
                      {count.toLocaleString()}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
            <label
              className="flex cursor-pointer items-center gap-1.5 text-xs"
              style={{ color: "var(--ink-secondary)" }}
              title="Also run a read-only 1-row GET ($top=1) on each authorized service to confirm the comm user can read live data — bounded, read-only."
            >
              <input
                type="checkbox"
                checked={dataProbe}
                onChange={(e) => setDataProbe(e.target.checked)}
                className="size-3.5 accent-[var(--brand-navy)]"
              />
              Confirm data reads
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2" style={{ color: "var(--ink-muted)" }} />
              <input
                type="search"
                name={searchFieldName}
                readOnly={searchReadOnly}
                onFocus={() => setSearchReadOnly(false)}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-1p-ignore
                data-lpignore="true"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search title, id, description…"
                className="h-9 w-full rounded-[var(--radius-input)] pl-8 pr-3 text-sm outline-none sm:w-72"
                style={{ background: "var(--surface-paper)", color: "var(--ink-primary)", border: "1px solid var(--border-default)" }}
              />
            </div>
            </div>
          </div>

          {/* grouped list */}
          <div
            data-tour="sap-row"
            className="overflow-hidden rounded-[var(--radius-card-warm)]"
            style={{ background: "var(--surface-paper)", border: "1px solid var(--border-default)" }}
          >
            <div className="flex items-center justify-between px-4 py-2 text-xs" style={{ color: "var(--ink-muted)", borderBottom: "1px solid var(--border-default)" }}>
              <span>
                {data ? `${data.total.toLocaleString()} item${data.total === 1 ? "" : "s"}` : "…"}
                {loading && <RefreshCw className="ml-2 inline size-3 animate-spin" />}
              </span>
              <span className="tabular-nums">Page {data?.page ?? 1} / {totalPages}</span>
            </div>

            {groups.map(([lob, rows]) => (
              <div key={lob}>
                <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide" style={{ background: "var(--surface-ink-tint)", color: "var(--brand-navy)" }}>
                  {lob} <span style={{ color: "var(--ink-muted)" }}>· {rows.length}</span>
                </div>
                <ul>
                  {rows.map((item) => {
                    const meta = HUB_CONTENT_TYPE_META[item.contentType];
                    const expanded = expandedId === item.id;
                    // Detail-probe result (if any) wins over the capped list status.
                    const effStatus: BadgeStatus = probedStatus[item.id] ?? item.status;
                    const hint = statusHint(effStatus);
                    return (
                      <li key={item.id} style={{ borderTop: "1px solid var(--border-default)" }}>
                        <div className="flex w-full flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                          <button
                            type="button"
                            onClick={() => setExpandedId(expanded ? null : item.id)}
                            aria-expanded={expanded}
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate font-medium" style={{ color: "var(--ink-primary)" }}>
                                {item.title}
                              </span>
                              {/* Disambiguate same-title variants (in/out, version, V2/V4). */}
                              <code className="rounded-[var(--radius-input)] px-1.5 py-0.5 text-[11px]" style={{ background: "var(--surface-ink-tint)", color: "var(--ink-secondary)" }}>
                                {item.externalId}
                              </code>
                              {item.apiType && (
                                <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
                                  {item.apiType}
                                </span>
                              )}
                              {item.itemCount != null && (
                                <span className="text-xs tabular-nums" style={{ color: "var(--ink-muted)" }}>
                                  {item.itemCount.toLocaleString()} items
                                </span>
                              )}
                              {item.illustrative === true && (
                                <span
                                  className="rounded-[var(--radius-input)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                                  style={{ background: "var(--surface-ink-tint)", color: "var(--ink-muted)" }}
                                  title="Repo-authored placeholder — not SAP-published catalogue content"
                                >
                                  Illustrative
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 text-sm" style={{ color: "var(--ink-secondary)" }}>
                              {item.description || meta.whyItMatters}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <CapabilityChips
                                contentType={item.contentType}
                                apiType={item.apiType}
                                capability={probedCapability[item.id] ?? item.capability ?? null}
                                subscribe={item.availabilityNote === "subscribe"}
                              />
                              {item.communicationScenarios[0] && (
                                <code className="rounded-[var(--radius-input)] px-1.5 py-0.5 text-xs" style={{ background: "var(--surface-ink-tint)", color: "var(--ink-primary)" }}>
                                  {item.communicationScenarios[0]}
                                </code>
                              )}
                              {item.dataConfirmed && (
                                <span className="text-xs font-medium" style={{ color: "var(--status-signed-fg)" }}>
                                  ✓ data-confirmed
                                </span>
                              )}
                              {hint && (
                                <span className="text-xs" style={{ color: hint.color }}>
                                  {hint.text}
                                </span>
                              )}
                            </div>
                          </button>
                          <div className="flex shrink-0 items-center gap-2">
                            {/* Studio: seed a governed Interface draft from this
                                service. Renders only when a handler is passed, so
                                the SAP Operations surface is unchanged. */}
                            {onAddToInterface && (
                              <button
                                type="button"
                                onClick={() =>
                                  onAddToInterface({
                                    id: item.id,
                                    externalId: item.externalId,
                                    title: item.title,
                                    contentType: item.contentType,
                                    apiType: item.apiType,
                                    product,
                                  })
                                }
                                title={`Add ${item.externalId} to an interface`}
                                aria-label={`Add ${item.title} to an interface`}
                                className="rounded-[var(--radius-input)] px-2.5 py-1 text-xs font-semibold transition"
                                style={{
                                  background: "var(--surface-paper)",
                                  color: "var(--brand-navy)",
                                  border: "1px solid var(--brand-navy)",
                                }}
                              >
                                Add to interface
                              </button>
                            )}
                            {/* Tap the badge → plain-language definition of this status. */}
                            <button
                              type="button"
                              onClick={() => openGlossary(glossaryIdForStatus(effStatus))}
                              title="What does this status mean?"
                              aria-label={`What does "${effStatus}" mean?`}
                              className="cursor-help rounded-[var(--radius-pill)]"
                            >
                              <StatusBadge status={effStatus} subscribe={item.availabilityNote === "subscribe"} />
                            </button>
                          </div>
                        </div>
                        {expanded && (
                          <div className="px-4 pb-4">
                            <CapabilityDetail
                              id={item.id}
                              product={product}
                              tenant={data?.tenant ?? null}
                              onClose={() => setExpandedId(null)}
                              onResolved={(s, cap) => {
                                setProbedStatus((m) => (m[item.id] === s ? m : { ...m, [item.id]: s }));
                                if (cap) setProbedCapability((m) => ({ ...m, [item.id]: cap }));
                              }}
                            />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}

            {!loading && data && data.items.length === 0 && (
              <div className="px-4 py-10 text-center text-sm" style={{ color: "var(--ink-muted)" }}>
                No items match these filters.
              </div>
            )}
            {loading && !data && (
              <div className="space-y-2 p-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-12 animate-pulse rounded-[var(--radius-input)]" style={{ background: "var(--surface-ink-tint)" }} />
                ))}
              </div>
            )}

            {data && data.total > limit && (
              <div className="flex items-center justify-between px-4 py-2" style={{ borderTop: "1px solid var(--border-default)" }}>
                <button
                  type="button"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-[var(--radius-input)] px-3 py-1 text-sm disabled:opacity-40"
                  style={{ border: "1px solid var(--border-default)", color: "var(--ink-primary)" }}
                >
                  Previous
                </button>
                <span className="text-xs tabular-nums" style={{ color: "var(--ink-muted)" }}>
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-[var(--radius-input)] px-3 py-1 text-sm disabled:opacity-40"
                  style={{ border: "1px solid var(--border-default)", color: "var(--ink-primary)" }}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

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
  communicationScenarios: string[];
  scopeItemCodes: string[];
  itemCount: number | null;
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
  counts: { byType: Record<string, number>; byStatus: Record<HubStatus, number>; probeableRuntime: number; probed: number; dataConfirmed?: number; dataProbe?: boolean };
  catalogueImported: boolean;
  tenant: string | null;
  isAdmin?: boolean;
}

type StatusFilter = "ALL" | HubStatus;
const STATUS_FILTERS: StatusFilter[] = ["ALL", "ACTIVATED", "NEEDS_SETUP", "NOT_CHECKED", "REFERENCE"];
const STATUS_LABEL: Record<StatusFilter, string> = {
  ALL: "All",
  ACTIVATED: "Activated",
  NEEDS_SETUP: "Needs setup",
  NOT_FOUND: "Not found",
  NOT_CHECKED: "Not checked",
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
    case "NOT_FOUND":
      return { text: "path not found on this tenant", color: "var(--ink-muted)" };
    default:
      return null;
  }
}

function groupByLoB(items: HubItem[]): Array<[string, HubItem[]]> {
  const map = new Map<string, HubItem[]>();
  for (const it of items) {
    const key = it.packageId ?? "Other";
    (map.get(key) ?? map.set(key, []).get(key)!).push(it);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

export function SapCapabilityCatalogue({ product = "s4hana" }: { product?: string }) {
  const [data, setData] = useState<HubData | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [contentType, setContentType] = useState<HubContentType | "ALL">("ALL");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [dataProbe, setDataProbe] = useState(false);
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
  useEffect(() => setPage(1), [contentType, status, q]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNote(null);
    try {
      const sp = new URLSearchParams({ product, page: String(page), limit: String(limit) });
      if (contentType !== "ALL") sp.set("contentType", contentType);
      if (status !== "ALL") sp.set("status", status);
      if (q) sp.set("q", q);
      if (dataProbe) sp.set("dataProbe", "1");
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
  }, [product, page, contentType, status, q, dataProbe]);

  useEffect(() => {
    void load();
  }, [load]);

  const [seeding, setSeeding] = useState(false);
  const importSeed = useCallback(async () => {
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

  const byType = data?.counts.byType ?? {};
  const byStatus: Record<HubStatus, number> = data?.counts.byStatus ?? {
    ACTIVATED: 0,
    NEEDS_SETUP: 0,
    NOT_FOUND: 0,
    NOT_CHECKED: 0,
    AVAILABLE: 0,
    REFERENCE: 0,
  };
  const probeable = data?.counts.probeableRuntime ?? 0;
  const probed = data?.counts.probed ?? 0;
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
            Every SAP Business Accelerator Hub content type for S/4HANA Cloud Public on {data?.tenant ?? "no tenant"} — badged only by what a live probe confirms. Runtime APIs are probed for activation; events are published subscribe-only (tenant subscription not verified); reference content is design-time. Empty types load once a real Hub export is imported.
          </p>
        </div>
        {/* Always-available admin control (server still enforces the guard). */}
        {data?.isAdmin && (
          <button
            type="button"
            onClick={() => void importSeed()}
            disabled={seeding}
            title="Rebuild the API rows from SapApiReference (admin only)"
            className="inline-flex shrink-0 items-center gap-2 rounded-[var(--radius-input)] px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            style={{ border: "1px solid var(--brand-navy)", color: "var(--brand-navy)", background: "var(--surface-paper)" }}
          >
            {seeding && <RefreshCw className="size-3.5 animate-spin" />}
            Rebuild from API reference
          </button>
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
              probed={probed}
              probeable={probeable}
              apiTotal={apiTotal}
              reference={byStatus.REFERENCE}
            />
          </div>
          <div data-tour="sap-tiles">
            <ContentTypeTiles byType={byType} activeType={contentType} onSelect={setContentType} />
          </div>

          {/* status filter + search */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Status filter" data-tour="sap-filters">
              {STATUS_FILTERS.map((s) => {
                const selected = status === s;
                return (
                  <button
                    key={s}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setStatus(s)}
                    className="rounded-[var(--radius-pill)] px-3 py-1 text-xs font-medium transition"
                    style={
                      selected
                        ? { background: "var(--brand-navy)", color: "var(--surface-paper)" }
                        : { background: "var(--surface-paper)", color: "var(--ink-primary)", border: "1px solid var(--border-default)" }
                    }
                  >
                    {STATUS_LABEL[s]}
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
                          {/* Tap the badge → plain-language definition of this status. */}
                          <button
                            type="button"
                            onClick={() => openGlossary(glossaryIdForStatus(effStatus))}
                            title="What does this status mean?"
                            aria-label={`What does "${effStatus}" mean?`}
                            className="shrink-0 cursor-help rounded-[var(--radius-pill)]"
                          >
                            <StatusBadge status={effStatus} subscribe={item.availabilityNote === "subscribe"} />
                          </button>
                        </div>
                        {expanded && (
                          <div className="px-4 pb-4">
                            <CapabilityDetail
                              id={item.id}
                              product={product}
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

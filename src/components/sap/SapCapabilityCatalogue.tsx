"use client";

/**
 * SAP Capability Catalogue — the full published menu for S/4HANA Cloud Public,
 * every content type with an honest status badge. Defaults to "All" (imagine
 * all activated). Server-paginated + filtered for volume (12k+ items).
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Circle, ExternalLink, FileText, RefreshCw, Search, Server } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  HUB_CONTENT_TYPES,
  HUB_CONTENT_TYPE_META,
  type HubContentType,
  type HubStatus,
} from "@/lib/sap-public/hub-content";

interface HubItem {
  id: string;
  contentType: HubContentType;
  externalId: string;
  title: string;
  description: string;
  packageId: string | null;
  apiType: string | null;
  communicationScenarios: string[];
  itemCount: number | null;
  hubUrl: string;
  status: HubStatus;
}

interface HubResponse {
  data: {
    note?: string;
    items: HubItem[];
    total: number;
    page: number;
    limit: number;
    counts: { byType: Record<string, number>; byStatus: Record<HubStatus, number> };
    catalogueImported: boolean;
    tenant: string | null;
  };
  error?: { message?: string };
}

type StatusFilter = "ALL" | HubStatus;
const STATUS_FILTERS: StatusFilter[] = ["ALL", "ACTIVATED", "AVAILABLE", "REFERENCE"];
const STATUS_LABEL: Record<StatusFilter, string> = {
  ALL: "All",
  ACTIVATED: "Activated",
  AVAILABLE: "Available",
  REFERENCE: "Reference",
};

function StatusBadge({ status }: { status: HubStatus }) {
  if (status === "ACTIVATED")
    return (
      <Badge variant="default" title="Probed live — tenant serves it now (HTTP 200)">
        <CheckCircle2 className="size-3.5" /> Activated
      </Badge>
    );
  if (status === "AVAILABLE")
    return (
      <Badge variant="secondary" title="SAP publishes it; this tenant hasn't activated it yet">
        <Circle className="size-3.5" /> Available
      </Badge>
    );
  return (
    <Badge variant="outline" title="Design-time content — not a tenant endpoint">
      <FileText className="size-3.5" /> Reference
    </Badge>
  );
}

export function SapCapabilityCatalogue({ product = "s4hana" }: { product?: string }) {
  const [data, setData] = useState<HubResponse["data"] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [contentType, setContentType] = useState<HubContentType | "ALL">("ALL");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const limit = 50;

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to page 1 whenever a filter changes.
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
      const res = await fetch(`/api/sap/tdd/hub-content?${sp.toString()}`);
      const json = (await res.json()) as HubResponse;
      if (!res.ok || !json.data) throw new Error(json.error?.message ?? "Failed to load the catalogue");
      if (json.data.note) setNote(json.data.note);
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the catalogue");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [product, page, contentType, status, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const byType = data?.counts.byType ?? {};
  const byStatus = data?.counts.byStatus ?? { ACTIVATED: 0, AVAILABLE: 0, REFERENCE: 0 };
  const totalAllTypes = Object.values(byType).reduce((n, c) => n + c, 0);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / limit)) : 1;

  // Types present in the catalogue (in canonical order), for the chip row.
  const typesPresent = HUB_CONTENT_TYPES.filter((t) => (byType[t] ?? 0) > 0);
  const activeWhy = contentType !== "ALL" ? HUB_CONTENT_TYPE_META[contentType].whyItMatters : null;

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">Capability Catalogue</h2>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Server className="size-4" />
          <span>{data?.tenant ?? "No SAP tenant"}</span>
          <span>Every content type SAP publishes for S/4HANA Cloud Public — imagine all activated.</span>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
      )}
      {note && (
        <div className="rounded-md border border-dashed bg-card px-4 py-6 text-sm text-muted-foreground">
          <p className="flex items-center gap-2 font-medium text-foreground">
            <AlertTriangle className="size-4" /> Catalogue not imported
          </p>
          <p className="mt-1">{note}</p>
        </div>
      )}

      {!note && (
        <>
          {/* status filter + search */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Status filter">
              {STATUS_FILTERS.map((s) => {
                const count = s === "ALL" ? totalAllTypes : byStatus[s];
                const selected = status === s;
                return (
                  <button
                    key={s}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setStatus(s)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                      selected ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground hover:border-foreground/50"
                    }`}
                  >
                    {STATUS_LABEL[s]} <span className="opacity-60 tabular-nums">{count}</span>
                  </button>
                );
              })}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search title, id, description…"
                className="h-9 w-full rounded-md border border-border bg-card pl-8 pr-3 text-sm outline-none focus:border-foreground/50 sm:w-72"
              />
            </div>
          </div>

          {/* content-type chips */}
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Content type filter">
            <button
              type="button"
              role="tab"
              onClick={() => setContentType("ALL")}
              aria-selected={contentType === "ALL"}
              className={`rounded-md border px-2.5 py-1 text-xs transition ${
                contentType === "ALL" ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:border-foreground/50"
              }`}
            >
              All types <span className="opacity-60 tabular-nums">{totalAllTypes}</span>
            </button>
            {typesPresent.map((t) => {
              const selected = contentType === t;
              return (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  onClick={() => setContentType(t)}
                  aria-selected={selected}
                  title={HUB_CONTENT_TYPE_META[t].whyItMatters}
                  className={`rounded-md border px-2.5 py-1 text-xs transition ${
                    selected ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:border-foreground/50"
                  }`}
                >
                  {HUB_CONTENT_TYPE_META[t].label} <span className="opacity-60 tabular-nums">{byType[t] ?? 0}</span>
                </button>
              );
            })}
          </div>

          {activeWhy && (
            <p className="rounded-md border-l-2 border-primary/50 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Why it matters:</span> {activeWhy}
            </p>
          )}

          {/* rows */}
          <div className="overflow-hidden rounded-md border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-2 text-xs text-muted-foreground">
              <span>
                {data ? `${data.total.toLocaleString()} item${data.total === 1 ? "" : "s"}` : "…"}
                {loading && <RefreshCw className="ml-2 inline size-3 animate-spin" />}
              </span>
              <span className="tabular-nums">Page {data?.page ?? 1} / {totalPages}</span>
            </div>

            <ul className="divide-y">
              {(data?.items ?? []).map((item) => {
                const meta = HUB_CONTENT_TYPE_META[item.contentType];
                return (
                  <li key={item.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">{item.title}</span>
                        <Badge variant="outline" className="shrink-0">{meta.label}</Badge>
                        {item.itemCount != null && (
                          <span className="text-xs text-muted-foreground tabular-nums">{item.itemCount.toLocaleString()} items</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">{item.description || meta.whyItMatters}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <code className="rounded bg-muted px-1.5 py-0.5">{item.externalId}</code>
                        {item.packageId && <span>· {item.packageId}</span>}
                        {item.communicationScenarios[0] && (
                          <code className="rounded bg-muted px-1.5 py-0.5">{item.communicationScenarios[0]}</code>
                        )}
                        <a
                          href={item.hubUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-foreground/70 underline-offset-2 hover:underline"
                        >
                          api.sap.com <ExternalLink className="size-3" />
                        </a>
                      </div>
                    </div>
                    <div className="shrink-0"><StatusBadge status={item.status} /></div>
                  </li>
                );
              })}
              {!loading && data && data.items.length === 0 && (
                <li className="px-4 py-10 text-center text-sm text-muted-foreground">No items match these filters.</li>
              )}
            </ul>

            {data && data.total > limit && (
              <div className="flex items-center justify-between border-t px-4 py-2">
                <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground tabular-nums">Page {page} of {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

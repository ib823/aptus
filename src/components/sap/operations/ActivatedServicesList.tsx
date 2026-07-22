"use client";

/**
 * ActivatedServicesList — WS2's "All activated services" surface for the
 * Operations Workbench. It lists EVERY service the current tenant has activated
 * (GET /hub-content?status=ACTIVATED — the stored per-tenant probe result),
 * paginated and tenant-reactive, going beyond the curated 4 in the Featured
 * grid above it.
 *
 * Load discipline (WS4): the list render issues ZERO tenant reads — each item
 * is a COLLAPSED card. Only expanding a card mounts WS1's CapabilityDetail,
 * which probes that one service and reads live rows on further demand
 * (on-open, one-at-a-time, cached). Switching tenant re-derives the whole set
 * from that tenant's ACTIVATED ids.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, RadioTower, RefreshCw } from "lucide-react";
import type { HubContentType, HubStatus } from "@/lib/sap-public/hub-content";
import { CapabilityDetail } from "../capability/CapabilityDetail";
import { CapabilityChips } from "../capability/CapabilityChips";
import { StatusBadge } from "../capability/StatusBadge";

interface ActivatedItem {
  id: string;
  externalId: string;
  title: string;
  contentType: HubContentType;
  apiType: string | null;
  status: HubStatus;
  capability: { read: boolean; write: boolean } | null;
  itemCount: number | null;
  packageId: string | null;
}

const PAGE_SIZE = 20;

export function ActivatedServicesList({ product, tenantKey }: { product: string; tenantKey: string }) {
  const [items, setItems] = useState<ActivatedItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Lifted live-probe status from the expanded detail, so the collapsed card's
  // badge can never contradict what the detail actually found on this tenant.
  const [resolved, setResolved] = useState<Record<string, HubStatus>>({});
  // Status freshness: the activated SET is derived from the STORED per-tenant
  // probe; lastProbedAt is when that probe last ran. It only changes on an
  // explicit "Refresh status" re-probe — never on a timer.
  const [lastProbedAt, setLastProbedAt] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [reprobing, setReprobing] = useState(false);
  const [reprobeError, setReprobeError] = useState<string | null>(null);

  // Switching tenant re-derives the whole set: back to page 1, collapse, and
  // drop the previous tenant's resolved statuses.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setPage(1);
    setExpandedId(null);
    setResolved({});
  }, [tenantKey]);

  // Re-derive the activated set from the STORED per-tenant probe. This reads
  // Postgres only — it NEVER touches the SAP tenant (no dataProbe), so calling
  // it (even after a probe, or on tenant switch) can't amplify onto the tenant.
  const reqId = useRef(0);
  const loadList = useCallback(async () => {
    if (!tenantKey) return;
    const token = ++reqId.current; // ignore results from a superseded call
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ product, tenant: tenantKey, status: "ACTIVATED", page: String(page), limit: String(PAGE_SIZE) });
    try {
      const r = await fetch(`/api/sap/tdd/hub-content?${qs.toString()}`);
      const j = (await r.json()) as {
        data?: { items: ActivatedItem[]; total: number; isAdmin?: boolean; counts?: { lastProbedAt?: string | null } };
        error?: { message?: string };
      };
      if (token !== reqId.current) return; // a newer load (e.g. tenant switch) won
      if (!j.data) throw new Error(j.error?.message ?? "Failed to load activated services");
      setItems(j.data.items);
      setTotal(j.data.total);
      setIsAdmin(Boolean(j.data.isAdmin));
      setLastProbedAt(j.data.counts?.lastProbedAt ?? null);
    } catch (e) {
      if (token === reqId.current) setError(e instanceof Error ? e.message : "Failed to load activated services");
    } finally {
      if (token === reqId.current) setLoading(false);
    }
  }, [product, tenantKey, page]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  // "Refresh status" — an EXPLICIT, admin-gated, rate-limited re-probe (the same
  // bounded Probe-all the catalogue uses: read-only $metadata, concurrency 8,
  // in the tight sapLive bucket). Never runs on a timer. On completion the set
  // re-derives, so a newly-activated API appears only after this runs.
  const refreshStatus = useCallback(async () => {
    setReprobing(true);
    setReprobeError(null);
    try {
      const r = await fetch("/api/sap/tdd/hub-content/probe-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "PROBE ALL SAP SERVICES", product, tenant: tenantKey }),
      });
      const j = (await r.json()) as { data?: { probed: number }; error?: { message?: string } };
      if (!r.ok) throw new Error(j.error?.message ?? "Refresh status failed (admin only)");
      setExpandedId(null);
      await loadList();
    } catch (e) {
      setReprobeError(e instanceof Error ? e.message : "Refresh status failed");
    } finally {
      setReprobing(false);
    }
  }, [product, tenantKey, loadList]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <section id="sap-activated-services" className="space-y-3" data-testid="activated-services">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="font-serif text-base tracking-tight" style={{ color: "var(--brand-navy)" }}>
            All activated services
          </h3>
          <p className="mt-0.5 max-w-2xl text-xs" style={{ color: "var(--ink-secondary)" }}>
            Every service this tenant has activated (probed 200), beyond the curated Featured set above. Expand a
            card to inspect it and read live rows on demand — the list itself never reads the tenant.
          </p>
        </div>
        <div className="text-xs" style={{ color: "var(--ink-muted)" }}>
          {loading ? "Loading…" : total > 0 ? `${from}–${to} of ${total}` : ""}
        </div>
      </div>

      {/* Status freshness: the set reflects a STORED probe, not a live read.
          State it plainly, with when it was taken and how to update it. */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-input)] px-3 py-2 text-xs" style={{ background: "var(--surface-ink-tint)", color: "var(--ink-secondary)" }}>
        <span>
          Status as of{" "}
          <strong style={{ color: "var(--ink-primary)" }}>
            {lastProbedAt ? new Date(lastProbedAt).toLocaleString() : "never probed"}
          </strong>{" "}
          (stored, not live). A newly-activated API appears here only after{" "}
          {isAdmin ? "Refresh status" : "an admin runs Refresh status / Probe-all"}.
        </span>
        {isAdmin && (
          <button
            type="button"
            onClick={() => void refreshStatus()}
            disabled={reprobing || !tenantKey}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-input)] border px-2.5 py-1 disabled:opacity-40"
            style={{ borderColor: "var(--border-default)", color: "var(--ink-primary)" }}
            title="Bounded, rate-limited re-probe of this tenant (read-only $metadata). Then re-derives the set."
          >
            <RadioTower className={`size-3 ${reprobing ? "animate-pulse" : ""}`} />
            {reprobing ? "Re-probing…" : "Refresh status"}
          </button>
        )}
      </div>

      {reprobeError && (
        <div className="rounded-[var(--radius-input)] border px-3 py-2 text-sm" style={{ background: "var(--status-revoked-bg)", borderColor: "var(--status-revoked-fg)", color: "var(--status-revoked-fg)" }}>
          {reprobeError}
        </div>
      )}

      {error && (
        <div
          className="rounded-[var(--radius-input)] border px-3 py-2 text-sm"
          style={{ background: "var(--status-revoked-bg)", borderColor: "var(--status-revoked-fg)", color: "var(--status-revoked-fg)" }}
        >
          {error}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="flex items-center gap-2 rounded-[var(--radius-card-warm)] border px-4 py-8 text-sm" style={{ background: "var(--surface-paper)", borderColor: "var(--border-default)", color: "var(--ink-muted)" }}>
          <AlertTriangle className="size-4" />
          No services are activated on this tenant, or none have been probed yet. Run Probe-all in the Capability
          Catalogue to populate this tenant&apos;s activated set.
        </div>
      )}

      <ul className="space-y-2">
        {items.map((item) => {
          const isOpen = expandedId === item.id;
          const effStatus = resolved[item.id] ?? item.status;
          return (
            <li
              key={item.id}
              className="rounded-[var(--radius-card-warm)] border"
              style={{ background: "var(--surface-paper)", borderColor: "var(--border-default)" }}
            >
              <button
                type="button"
                onClick={() => setExpandedId(isOpen ? null : item.id)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                {isOpen ? (
                  <ChevronDown className="size-4 shrink-0" style={{ color: "var(--ink-muted)" }} />
                ) : (
                  <ChevronRight className="size-4 shrink-0" style={{ color: "var(--ink-muted)" }} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold" style={{ color: "var(--ink-primary)" }}>
                    {item.title}
                  </div>
                  <div className="truncate text-xs" style={{ color: "var(--ink-muted)" }}>
                    {item.externalId} · {item.contentType}
                    {item.apiType ? ` · ${item.apiType}` : ""}
                  </div>
                </div>
                <div className="hidden shrink-0 sm:block">
                  <CapabilityChips contentType={item.contentType} apiType={item.apiType} capability={item.capability} />
                </div>
                <StatusBadge status={effStatus} />
              </button>
              {isOpen && (
                <div className="px-4 pb-4">
                  {/* WS1 in full: entities on expand, live rows per entity on click. */}
                  <CapabilityDetail
                    id={item.id}
                    product={product}
                    tenant={tenantKey}
                    onResolved={(s) => setResolved((m) => (m[item.id] === s ? m : { ...m, [item.id]: s }))}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {pageCount > 1 && (
        <div className="flex items-center justify-between gap-2 text-xs" style={{ color: "var(--ink-muted)" }}>
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            className="rounded-[var(--radius-input)] border px-3 py-1.5 disabled:opacity-40"
            style={{ borderColor: "var(--border-default)" }}
          >
            Previous
          </button>
          <span className="inline-flex items-center gap-1.5">
            {loading && <RefreshCw className="size-3 animate-spin" />}
            Page {page} of {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            disabled={page >= pageCount || loading}
            className="rounded-[var(--radius-input)] border px-3 py-1.5 disabled:opacity-40"
            style={{ borderColor: "var(--border-default)" }}
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}

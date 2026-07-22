"use client";

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import {
  AlertTriangle,
  BriefcaseBusiness,
  CheckCircle2,
  FileText,
  RefreshCw,
  ReceiptText,
  Server,
  ShoppingCart,
} from "lucide-react";
import { HttpStatusPill, httpTone } from "@/components/sap/HttpStatusPill";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ActivatedServicesList } from "@/components/sap/operations/ActivatedServicesList";
import { useGentleAutoRefresh } from "@/hooks/useGentleAutoRefresh";

interface TenantOption {
  key: string;
  label: string;
}

interface CatalogResponse {
  data: {
    tenants: TenantOption[];
  };
}

interface OperationSection {
  key: string;
  title: string;
  serviceLabel: string;
  scenario: string;
  entitySet: string;
  ok: boolean;
  /** 200-reachable but zero rows on this tenant → amber, not green. */
  empty?: boolean;
  status: number;
  durationMs: number;
  rowCount: number;
  fields: string[];
  rows: Array<Record<string, string>>;
  error: string | null;
}

interface OperationsResponse {
  data: {
    tenant: TenantOption;
    generatedAt: string;
    /** true when the 30s server cache served this read (not a fresh tenant hit). */
    fromCache?: boolean;
    sections: OperationSection[];
  };
}


function sectionIcon(key: string) {
  if (key === "purchaseOrders") return <ShoppingCart className="size-4" />;
  if (key === "supplierInvoices") return <ReceiptText className="size-4" />;
  if (key === "purchaseContracts") return <FileText className="size-4" />;
  return <BriefcaseBusiness className="size-4" />;
}

function truncate(value: string): string {
  return value.length > 90 ? `${value.slice(0, 87)}...` : value;
}

/**
 * Smooth-scroll to an on-page section. Uses scrollIntoView (which finds the real
 * scroll container) instead of relying on native #hash navigation, which does
 * nothing here. preventDefault stops the (broken) native jump from fighting it;
 * the hash is still set for shareability.
 */
function scrollToSection(e: MouseEvent<HTMLAnchorElement>, id: string): void {
  const el = document.getElementById(id);
  if (!el) return; // section not on this product tab — let the default run
  e.preventDefault();
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  if (typeof history !== "undefined") history.replaceState(null, "", `#${id}`);
}

export function SapOperationsDashboard({ product = "s4hana" }: { product?: string }) {
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [tenantKey, setTenantKey] = useState("");
  const [sections, setSections] = useState<OperationSection[]>([]);
  const [generatedAt, setGeneratedAt] = useState("");
  const [fromCache, setFromCache] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const selectedTenant = tenants.find((tenant) => tenant.key === tenantKey);
  // Two honest tallies: sections returning data (green) vs reachable-but-empty
  // (amber, 200 with 0 rows). Empty reads are NOT counted as "returning data".
  const withDataSections = useMemo(
    () => sections.filter((section) => section.ok && !section.empty).length,
    [sections],
  );
  const emptySections = useMemo(
    () => sections.filter((section) => section.ok && section.empty).length,
    [sections],
  );

  // force=true → ?refresh=1 (a live re-read, only when the user clicks Refresh).
  // Auto-refresh always calls with force=false so it reuses the 30s server cache.
  const loadOperations = useCallback(async (nextTenantKey: string, force = false) => {
    if (!nextTenantKey) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/sap/tdd/operations?tenant=${encodeURIComponent(nextTenantKey)}&product=${encodeURIComponent(product)}${force ? "&refresh=1" : ""}`,
      );
      const json = (await response.json()) as Partial<OperationsResponse> & {
        error?: { message?: string };
      };
      if (!response.ok || !json.data) {
        throw new Error(json.error?.message ?? "Failed to load SAP operations");
      }
      setSections(json.data.sections);
      setGeneratedAt(json.data.generatedAt);
      setFromCache(Boolean(json.data.fromCache));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load SAP operations");
      setSections([]);
      setGeneratedAt("");
      setFromCache(false);
    } finally {
      setLoading(false);
    }
  }, [product]);

  useEffect(() => {
    let cancelled = false;
    async function loadCatalog() {
      setError(null);
      try {
        const response = await fetch(`/api/sap/tdd/catalog?product=${encodeURIComponent(product)}`);
        const json = (await response.json()) as Partial<CatalogResponse> & {
          error?: { message?: string };
        };
        if (!response.ok || !json.data) {
          throw new Error(json.error?.message ?? "Failed to load SAP tenants");
        }
        if (cancelled) return;
        const firstTenant = json.data.tenants[0]?.key ?? "";
        setTenants(json.data.tenants);
        setTenantKey(firstTenant);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load SAP tenants");
      }
    }
    void loadCatalog();
    return () => {
      cancelled = true;
    };
  }, [product]);

  useEffect(() => {
    if (tenantKey) void loadOperations(tenantKey);
  }, [loadOperations, tenantKey]);

  // Gentle, opt-in auto-refresh of the VISIBLE Featured read only. It calls
  // loadOperations WITHOUT force, so it reuses the 30s server cache (never a
  // forced live re-read). It re-reads only the always-visible Featured grid —
  // the activated list's collapsed cards are never touched, so no per-card fan-
  // out onto the tenant can happen on a timer.
  useGentleAutoRefresh({
    enabled: autoRefresh && Boolean(tenantKey),
    onRefresh: () => {
      if (tenantKey) void loadOperations(tenantKey, false);
    },
  });

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="font-serif text-lg tracking-tight" style={{ color: "var(--brand-navy)" }}>
            Procurement Operations
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--ink-muted)" }}>
            <Server className="size-4" />
            <span>{selectedTenant?.label ?? "No SAP tenant"}</span>
            {generatedAt && (
              <span>
                {fromCache ? "cached read · as of " : "live read · "}
                {new Date(generatedAt).toLocaleTimeString()}
              </span>
            )}
          </div>
          {/* Featured = the curated 4 (eager, 25-row sample). The full activated
              set now lives right below in "All activated services". */}
          <p className="mt-1.5 max-w-2xl text-xs" style={{ color: "var(--ink-secondary)" }}>
            <strong style={{ color: "var(--ink-primary)" }}>Featured:</strong> 4 key services, 25-row sample, loaded
            eagerly. For every service this tenant has activated, see{" "}
            <a href="#sap-activated-services" onClick={(e) => scrollToSection(e, "sap-activated-services")} className="cursor-pointer font-medium underline" style={{ color: "var(--cta-red)" }}>
              All activated services
            </a>{" "}
            below (each opens on demand), or inspect any service by apiId in the{" "}
            <a href="#sap-entity-explorer" onClick={(e) => scrollToSection(e, "sap-entity-explorer")} className="cursor-pointer font-medium underline" style={{ color: "var(--cta-red)" }}>
              Entity Explorer
            </a>.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(220px,280px)_auto]">
          <Select value={tenantKey} onValueChange={setTenantKey}>
            <SelectTrigger>
              <SelectValue placeholder="Tenant" />
            </SelectTrigger>
            <SelectContent>
              {tenants.map((tenant) => (
                <SelectItem key={tenant.key} value={tenant.key}>
                  {tenant.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => void loadOperations(tenantKey, true)}
            disabled={!tenantKey || loading}
            title="Force a fresh live read (bypasses the 30s cache)"
          >
            <RefreshCw />
            Refresh
          </Button>
        </div>
      </div>

      {/* Opt-in gentle auto-refresh of the Featured read (on focus / every 60s),
          cache-reusing — never a forced live re-read, never touches collapsed
          activated cards. Label is associated via htmlFor (not nested) so the
          input isn't inside its own label. */}
      <div className="flex w-fit items-center gap-2 text-xs" style={{ color: "var(--ink-secondary)" }}>
        <input
          id="sap-ops-auto-refresh"
          type="checkbox"
          checked={autoRefresh}
          onChange={(e) => setAutoRefresh(e.target.checked)}
          disabled={!tenantKey}
        />
        <label htmlFor="sap-ops-auto-refresh" className="cursor-pointer">
          Auto-refresh Featured (on focus / 60s, cache-reusing)
        </label>
      </div>

      {error && (
        <div className="rounded-[var(--radius-input)] border px-3 py-2 text-sm" style={{ background: "var(--status-revoked-bg)", borderColor: "var(--status-revoked-fg)", color: "var(--status-revoked-fg)" }}>
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {sections.map((section) => (
          <div key={section.key} className="rounded-[var(--radius-card-warm)] border p-3" style={{ background: "var(--surface-paper)", borderColor: "var(--border-default)" }}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2 text-xs" style={{ color: "var(--ink-muted)" }}>
                {sectionIcon(section.key)}
                <span className="truncate">{section.title}</span>
              </div>
              <HttpStatusPill tone={httpTone(section.ok, section.empty)} label={section.empty ? "no data" : section.status ? String(section.status) : "error"} />
            </div>
            <div className="mt-3 text-2xl font-semibold" style={{ color: "var(--brand-navy)" }}>{section.rowCount}</div>
            <div className="mt-1 text-xs" style={{ color: "var(--ink-muted)" }}>sample rows</div>
          </div>
        ))}
        {!sections.length && (
          <div className="rounded-[var(--radius-card-warm)] border p-3 md:col-span-2 xl:col-span-4" style={{ background: "var(--surface-paper)", borderColor: "var(--border-default)" }}>
            <div className="flex items-center gap-2 text-sm" style={{ color: "var(--ink-muted)" }}>
              {loading ? <RefreshCw className="size-4 animate-spin" /> : <AlertTriangle className="size-4" />}
              {loading ? "Loading operations data" : "No operations data loaded"}
            </div>
          </div>
        )}
      </div>

      {sections.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm" style={{ color: "var(--ink-secondary)" }}>
          <CheckCircle2 className="size-4" style={{ color: "var(--status-signed-fg)" }} />
          <span>
            {withDataSections}/{sections.length} SAP reads returning data
          </span>
          {emptySections > 0 && (
            <span style={{ color: "var(--status-awaiting-fg)" }}>
              · {emptySections} reachable, no data
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {sections.map((section) => (
          <section key={section.key} className="rounded-[var(--radius-card-warm)] border" style={{ background: "var(--surface-paper)", borderColor: "var(--border-default)" }}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "var(--border-default)" }}>
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold" style={{ color: "var(--ink-primary)" }}>{section.title}</h3>
                <p className="truncate text-xs" style={{ color: "var(--ink-muted)" }}>
                  {section.scenario} / {section.entitySet}
                </p>
              </div>
              <HttpStatusPill tone={httpTone(section.ok, section.empty)} label={section.empty ? `HTTP ${section.status} · no data` : section.status ? `HTTP ${section.status}` : "error"} />
            </div>

            {section.error ? (
              <div className="px-4 py-8 text-sm" style={{ color: "var(--status-revoked-fg)" }}>{section.error}</div>
            ) : section.rows.length > 0 ? (
              <div className="overflow-auto">
                <table className="w-full min-w-[680px] text-sm">
                  <thead className="text-left text-xs" style={{ background: "var(--surface-ink-tint)", color: "var(--ink-muted)" }}>
                    <tr>
                      {section.fields.map((field) => (
                        <th key={field} scope="col" className="px-3 py-2 font-medium">
                          {field}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {section.rows.map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-t" style={{ borderColor: "var(--border-default)" }}>
                        {section.fields.map((field) => (
                          <td key={field} className="max-w-[220px] truncate px-3 py-2" title={row[field]}>
                            {truncate(row[field] ?? "") || <span style={{ color: "var(--ink-muted)" }}>-</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-4 py-8 text-sm" style={{ color: "var(--ink-muted)" }}>No rows returned.</div>
            )}
          </section>
        ))}
      </div>

      {/* WS2: the full activated set for this tenant — collapsed cards, rows on
          demand. Reuses the same tenantKey so it re-derives when the tenant
          selector above changes. */}
      {tenantKey && (
        <div className="border-t pt-4" style={{ borderColor: "var(--border-default)" }}>
          <ActivatedServicesList product={product} tenantKey={tenantKey} />
        </div>
      )}
    </section>
  );
}

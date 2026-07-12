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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const loadOperations = useCallback(async (nextTenantKey: string) => {
    if (!nextTenantKey) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/sap/tdd/operations?tenant=${encodeURIComponent(nextTenantKey)}&product=${encodeURIComponent(product)}`,
      );
      const json = (await response.json()) as Partial<OperationsResponse> & {
        error?: { message?: string };
      };
      if (!response.ok || !json.data) {
        throw new Error(json.error?.message ?? "Failed to load SAP operations");
      }
      setSections(json.data.sections);
      setGeneratedAt(json.data.generatedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load SAP operations");
      setSections([]);
      setGeneratedAt("");
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
            {generatedAt && <span>{new Date(generatedAt).toLocaleTimeString()}</span>}
          </div>
          {/* Coherence: this is a curated live sample, not the full activated set. */}
          <p className="mt-1.5 max-w-2xl text-xs" style={{ color: "var(--ink-secondary)" }}>
            Curated live sample: 4 key services, 25-row cap — not the full activated set. See the{" "}
            <a href="#sap-capability-catalogue" onClick={(e) => scrollToSection(e, "sap-capability-catalogue")} className="cursor-pointer font-medium underline" style={{ color: "var(--cta-red)" }}>
              Capability Catalogue
            </a>{" "}
            above for all activated services, or inspect any activated service by apiId in the{" "}
            <a href="#sap-entity-explorer" onClick={(e) => scrollToSection(e, "sap-entity-explorer")} className="cursor-pointer font-medium underline" style={{ color: "var(--cta-red)" }}>
              Entity Explorer
            </a>{" "}
            below.
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
            onClick={() => void loadOperations(tenantKey)}
            disabled={!tenantKey || loading}
          >
            <RefreshCw />
            Refresh
          </Button>
        </div>
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
    </section>
  );
}

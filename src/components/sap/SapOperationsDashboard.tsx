"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
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
  baseHost: string;
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

function statusTone(ok: boolean): "default" | "destructive" {
  return ok ? "default" : "destructive";
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

export function SapOperationsDashboard() {
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [tenantKey, setTenantKey] = useState("");
  const [sections, setSections] = useState<OperationSection[]>([]);
  const [generatedAt, setGeneratedAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTenant = tenants.find((tenant) => tenant.key === tenantKey);
  const healthySections = useMemo(
    () => sections.filter((section) => section.ok).length,
    [sections],
  );

  const loadOperations = useCallback(async (nextTenantKey: string) => {
    if (!nextTenantKey) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/sap/tdd/operations?tenant=${encodeURIComponent(nextTenantKey)}`);
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
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadCatalog() {
      setError(null);
      try {
        const response = await fetch("/api/sap/tdd/catalog");
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
  }, []);

  useEffect(() => {
    if (tenantKey) void loadOperations(tenantKey);
  }, [loadOperations, tenantKey]);

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Procurement Operations</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Server className="size-4" />
            <span>{selectedTenant?.baseHost ?? "No SAP tenant"}</span>
            {generatedAt && <span>{new Date(generatedAt).toLocaleTimeString()}</span>}
          </div>
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
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {sections.map((section) => (
          <div key={section.key} className="rounded-md border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                {sectionIcon(section.key)}
                <span className="truncate">{section.title}</span>
              </div>
              <Badge variant={statusTone(section.ok)}>{section.status || "error"}</Badge>
            </div>
            <div className="mt-3 text-2xl font-semibold">{section.rowCount}</div>
            <div className="mt-1 text-xs text-muted-foreground">sample rows</div>
          </div>
        ))}
        {!sections.length && (
          <div className="rounded-md border bg-card p-3 md:col-span-2 xl:col-span-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {loading ? <RefreshCw className="size-4 animate-spin" /> : <AlertTriangle className="size-4" />}
              {loading ? "Loading operations data" : "No operations data loaded"}
            </div>
          </div>
        )}
      </div>

      {sections.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-primary" />
          <span>
            {healthySections}/{sections.length} SAP reads available
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {sections.map((section) => (
          <section key={section.key} className="rounded-md border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold">{section.title}</h3>
                <p className="truncate text-xs text-muted-foreground">
                  {section.scenario} / {section.entitySet}
                </p>
              </div>
              <Badge variant={statusTone(section.ok)}>
                {section.status ? `HTTP ${section.status}` : "error"}
              </Badge>
            </div>

            {section.error ? (
              <div className="px-4 py-8 text-sm text-destructive">{section.error}</div>
            ) : section.rows.length > 0 ? (
              <div className="overflow-auto">
                <table className="w-full min-w-[680px] text-sm">
                  <thead className="bg-muted/80 text-left text-xs text-muted-foreground">
                    <tr>
                      {section.fields.map((field) => (
                        <th key={field} className="px-3 py-2 font-medium">
                          {field}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {section.rows.map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-t">
                        {section.fields.map((field) => (
                          <td key={field} className="max-w-[220px] truncate px-3 py-2" title={row[field]}>
                            {truncate(row[field] ?? "") || <span className="text-muted-foreground">-</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-4 py-8 text-sm text-muted-foreground">No rows returned.</div>
            )}
          </section>
        ))}
      </div>
    </section>
  );
}

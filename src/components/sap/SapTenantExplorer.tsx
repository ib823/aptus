"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Database, Eye, RefreshCw, Server, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

interface ServiceOption {
  key: string;
  label: string;
  scenario: string;
  path: string;
  domain: string;
}

interface EntitySet {
  name: string;
  entityType: string;
}

interface EntityProbe {
  name: string;
  ok: boolean;
  status: number;
  durationMs: number;
  resultCount?: number;
  firstResultKeys?: string[];
}

interface CatalogResponse {
  data: {
    tenants: TenantOption[];
    services: ServiceOption[];
  };
}

interface EntitiesResponse {
  data: {
    entitySets: EntitySet[];
    probes: EntityProbe[];
  };
}

interface PreviewResponse {
  data: {
    entitySet: string;
    ok: boolean;
    status: number;
    durationMs: number;
    rows: Array<Record<string, unknown>>;
    nextLink: string | null;
    fields: string[];
  };
}

function valueLabel(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") {
    const sapDate = value.match(/^\/Date\((-?\d+)(?:[+-]\d+)?\)\/$/);
    if (sapDate?.[1]) {
      const millis = Number.parseInt(sapDate[1], 10);
      if (Number.isFinite(millis)) return new Date(millis).toISOString().slice(0, 10);
    }
    return value.length > 80 ? `${value.slice(0, 77)}...` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value).slice(0, 80);
}

function statusTone(ok: boolean | undefined): "default" | "secondary" | "destructive" | "outline" {
  if (ok === true) return "default";
  if (ok === false) return "destructive";
  return "outline";
}

export function SapTenantExplorer({ product = "s4hana" }: { product?: string }) {
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [tenantKey, setTenantKey] = useState("");
  const [serviceKey, setServiceKey] = useState("");
  // Admin spot-read: any activated service by apiId (== SapHubContent.externalId),
  // not just the curated picker. Kept in a ref so typing doesn't refetch per key.
  const [customService, setCustomService] = useState("");
  const customServiceRef = useRef("");
  customServiceRef.current = customService;
  const [entities, setEntities] = useState<EntitySet[]>([]);
  const [probes, setProbes] = useState<EntityProbe[]>([]);
  const [selectedEntity, setSelectedEntity] = useState("");
  const [preview, setPreview] = useState<PreviewResponse["data"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTenant = tenants.find((tenant) => tenant.key === tenantKey);
  const effectiveService = customService.trim() || serviceKey;
  const selectedService = services.find((service) => service.key === effectiveService);
  const probeByName = useMemo(
    () => new Map(probes.map((probe) => [probe.name, probe])),
    [probes],
  );

  const loadEntities = useCallback(
    async (probe: boolean) => {
      const service = customServiceRef.current.trim() || serviceKey;
      if (!tenantKey || !service) return;
      setLoading(true);
      setError(null);
      setPreview(null);
      try {
        const params = new URLSearchParams({
          tenant: tenantKey,
          service,
          probe: probe ? "1" : "0",
          product,
        });
        const response = await fetch(`/api/sap/tdd/entities?${params.toString()}`);
        const json = (await response.json()) as Partial<EntitiesResponse> & {
          error?: { message?: string };
        };
        if (!response.ok || !json.data) {
          throw new Error(json.error?.message ?? "Failed to inspect SAP service");
        }
        setEntities(json.data.entitySets);
        setProbes(json.data.probes);
        setSelectedEntity((current) =>
          json.data!.entitySets.some((entity) => entity.name === current)
            ? current
            : json.data!.entitySets[0]?.name ?? "",
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to inspect SAP service");
      } finally {
        setLoading(false);
      }
    },
    [serviceKey, tenantKey, product],
  );

  const loadPreview = useCallback(async () => {
    const service = customServiceRef.current.trim() || serviceKey;
    if (!tenantKey || !service || !selectedEntity) return;
    setPreviewLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        tenant: tenantKey,
        service,
        entity: selectedEntity,
        limit: "10",
        product,
      });
      const response = await fetch(`/api/sap/tdd/preview?${params.toString()}`);
      const json = (await response.json()) as Partial<PreviewResponse> & {
        error?: { message?: string };
      };
      if (!response.ok || !json.data) {
        throw new Error(json.error?.message ?? "Failed to load preview");
      }
      setPreview(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load preview");
    } finally {
      setPreviewLoading(false);
    }
  }, [selectedEntity, serviceKey, tenantKey, product]);

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
          throw new Error(json.error?.message ?? "Failed to load SAP catalog");
        }
        if (cancelled) return;
        setTenants(json.data.tenants);
        setServices(json.data.services);
        setTenantKey(json.data.tenants[0]?.key ?? "");
        setServiceKey(json.data.services[0]?.key ?? "");
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load SAP catalog");
      }
    }
    void loadCatalog();
    return () => {
      cancelled = true;
    };
  }, [product]);

  useEffect(() => {
    setEntities([]);
    setProbes([]);
    setSelectedEntity("");
    setPreview(null);
    if (tenantKey && serviceKey) void loadEntities(false);
  }, [loadEntities, serviceKey, tenantKey]);

  const previewFields = preview?.fields.slice(0, 8) ?? [];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr_auto_auto]">
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Tenant</span>
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
        </label>

        <label className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Service</span>
          <Select value={serviceKey} onValueChange={(v) => { setCustomService(""); setServiceKey(v); }}>
            <SelectTrigger>
              <SelectValue placeholder="Service" />
            </SelectTrigger>
            <SelectContent>
              {services.map((service) => (
                <SelectItem key={service.key} value={service.key}>
                  {service.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Admin spot-read: any activated service by apiId, beyond the curated list. */}
          <input
            value={customService}
            onChange={(event) => setCustomService(event.target.value)}
            placeholder="…or any activated apiId (e.g. API_OPLACCTGDOCITEMCUBE_SRV)"
            className="mt-1 h-8 w-full rounded-md border bg-background px-2 font-mono text-xs outline-none focus:border-ring"
            spellCheck={false}
            autoComplete="off"
          />
        </label>

        <Button
          className="self-end"
          variant="outline"
          onClick={() => void loadEntities(false)}
          disabled={!tenantKey || !effectiveService || loading}
        >
          <RefreshCw />
          Inspect
        </Button>
        <Button
          className="self-end"
          onClick={() => void loadEntities(true)}
          disabled={!tenantKey || !effectiveService || loading}
        >
          <Activity />
          Probe Reads
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="rounded-md border bg-card p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Server className="size-4" />
            Tenant
          </div>
          <div className="mt-2 truncate text-sm font-medium">{selectedTenant?.baseHost ?? "Not configured"}</div>
        </div>
        <div className="rounded-md border bg-card p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Database className="size-4" />
            Scenario
          </div>
          <div className="mt-2 truncate text-sm font-medium">{selectedService?.scenario ?? "-"}</div>
        </div>
        <div className="rounded-md border bg-card p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Table2 className="size-4" />
            Entity Sets
          </div>
          <div className="mt-2 text-sm font-medium">{entities.length}</div>
        </div>
        <div className="rounded-md border bg-card p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Eye className="size-4" />
            Reads OK
          </div>
          <div className="mt-2 text-sm font-medium">
            {probes.length ? probes.filter((probe) => probe.ok).length : "-"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)]">
        <section className="rounded-md border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Entity Sets</h2>
            {loading && <span className="text-xs text-muted-foreground">Loading</span>}
          </div>
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Read</th>
                  <th className="px-3 py-2 text-right font-medium">Rows</th>
                </tr>
              </thead>
              <tbody>
                {entities.map((entity) => {
                  const probe = probeByName.get(entity.name);
                  const selected = entity.name === selectedEntity;
                  return (
                    <tr
                      key={entity.name}
                      className={selected ? "bg-accent/60" : "hover:bg-muted/40"}
                    >
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          className="block max-w-[320px] truncate text-left font-medium text-foreground"
                          title={entity.entityType}
                          onClick={() => {
                            setSelectedEntity(entity.name);
                            setPreview(null);
                          }}
                        >
                          {entity.name}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={statusTone(probe?.ok)}>
                          {probe ? probe.status : "idle"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground">
                        {probe?.resultCount ?? "-"}
                      </td>
                    </tr>
                  );
                })}
                {!entities.length && (
                  <tr>
                    <td className="px-4 py-8 text-sm text-muted-foreground" colSpan={3}>
                      No entity sets loaded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-md border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Preview</h2>
              <p className="text-xs text-muted-foreground">{selectedEntity || "Select an entity set"}</p>
            </div>
            <Button
              size="sm"
              onClick={() => void loadPreview()}
              disabled={!selectedEntity || previewLoading}
            >
              <Eye />
              Preview 10
            </Button>
          </div>
          <div className="overflow-auto">
            {preview && previewFields.length > 0 ? (
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/80 text-left text-xs text-muted-foreground">
                  <tr>
                    {previewFields.map((field) => (
                      <th key={field} className="px-3 py-2 font-medium">
                        {field}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-t">
                      {previewFields.map((field) => (
                        <td key={field} className="max-w-[220px] truncate px-3 py-2" title={valueLabel(row[field])}>
                          {valueLabel(row[field]) || <span className="text-muted-foreground">-</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="px-4 py-10 text-sm text-muted-foreground">
                {previewLoading ? "Loading preview." : "No preview loaded."}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

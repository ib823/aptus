"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, SendHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface TenantOption {
  key: string;
  label: string;
  baseHost: string;
}

interface ServiceOption {
  key: string;
  label: string;
  scenario: string;
}

interface EntitySet {
  name: string;
  entityType: string;
}

interface CatalogResponse {
  data: {
    tenants: TenantOption[];
    services: ServiceOption[];
  };
}

interface WriteStatusResponse {
  data: {
    enabled: boolean;
    confirmationPhrase: string;
    writeSecretRequired: boolean;
  };
}

interface EntitiesResponse {
  data: {
    entitySets: EntitySet[];
  };
}

interface WriteResponse {
  data?: {
    ok: boolean;
    status: number;
    durationMs: number;
    location: string | null;
    body: unknown;
  };
  error?: {
    message?: string;
  };
}

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function SapWriteBackPanel() {
  const [enabled, setEnabled] = useState(false);
  const [confirmationPhrase, setConfirmationPhrase] = useState("WRITE TO SAP TDD");
  const [writeSecretRequired, setWriteSecretRequired] = useState(false);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [tenantKey, setTenantKey] = useState("");
  const [serviceKey, setServiceKey] = useState("commercial-projects");
  const [entities, setEntities] = useState<EntitySet[]>([]);
  const [entity, setEntity] = useState("ProjectSet");
  const [payload, setPayload] = useState("{\n}");
  const [confirmation, setConfirmation] = useState("");
  const [writeSecret, setWriteSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [entitiesLoading, setEntitiesLoading] = useState(false);
  const [result, setResult] = useState<WriteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedService = services.find((service) => service.key === serviceKey);
  const parsedPayload = useMemo(() => {
    try {
      const parsed = JSON.parse(payload) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }, [payload]);

  useEffect(() => {
    let cancelled = false;
    async function loadInitialData() {
      setError(null);
      try {
        const [statusResponse, catalogResponse] = await Promise.all([
          fetch("/api/sap/tdd/write"),
          fetch("/api/sap/tdd/catalog"),
        ]);
        const statusJson = (await statusResponse.json()) as WriteStatusResponse;
        const catalogJson = (await catalogResponse.json()) as CatalogResponse;
        if (cancelled) return;
        setEnabled(statusJson.data.enabled);
        setConfirmationPhrase(statusJson.data.confirmationPhrase);
        setWriteSecretRequired(statusJson.data.writeSecretRequired);
        setTenants(catalogJson.data.tenants);
        setServices(catalogJson.data.services);
        const developmentTenant =
          catalogJson.data.tenants.find((tenant) => tenant.key.includes("development")) ??
          catalogJson.data.tenants[0];
        setTenantKey(developmentTenant?.key ?? "");
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load SAP write-back status");
      }
    }
    void loadInitialData();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!tenantKey || !serviceKey) return;
    let cancelled = false;
    async function loadEntities() {
      setEntitiesLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ tenant: tenantKey, service: serviceKey, probe: "0" });
        const response = await fetch(`/api/sap/tdd/entities?${params.toString()}`);
        const json = (await response.json()) as Partial<EntitiesResponse> & {
          error?: { message?: string };
        };
        if (!response.ok || !json.data) {
          throw new Error(json.error?.message ?? "Failed to load entity sets");
        }
        if (cancelled) return;
        setEntities(json.data.entitySets);
        setEntity((current) =>
          json.data!.entitySets.some((entitySet) => entitySet.name === current)
            ? current
            : json.data!.entitySets[0]?.name ?? "",
        );
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load entity sets");
      } finally {
        if (!cancelled) setEntitiesLoading(false);
      }
    }
    void loadEntities();
    return () => {
      cancelled = true;
    };
  }, [serviceKey, tenantKey]);

  const createRecord = useCallback(async () => {
    if (!enabled || !tenantKey || !serviceKey || !entity || !parsedPayload) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/sap/tdd/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant: tenantKey,
          service: serviceKey,
          entity,
          payload: parsedPayload,
          confirmation,
          writeSecret: writeSecret || undefined,
        }),
      });
      const json = (await response.json()) as WriteResponse;
      if (!response.ok || !json.data) {
        throw new Error(json.error?.message ?? "SAP write-back failed");
      }
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "SAP write-back failed");
    } finally {
      setLoading(false);
    }
  }, [confirmation, enabled, entity, parsedPayload, serviceKey, tenantKey, writeSecret]);

  return (
    <section className="rounded-md border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Write Mode</h2>
          <p className="text-xs text-muted-foreground">{selectedService?.scenario ?? "SAP TDD"}</p>
        </div>
        <Badge variant={enabled ? "default" : "outline"}>{enabled ? "Live" : "Disabled"}</Badge>
      </div>

      <div className="space-y-4 p-4">
        {!enabled && (
          <div className="flex items-center gap-2 rounded-md border border-muted bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            <AlertTriangle className="size-4" />
            Write-back is disabled.
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
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
            <Select value={serviceKey} onValueChange={setServiceKey}>
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
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Entity Set</span>
            <Select value={entity} onValueChange={setEntity} disabled={entitiesLoading}>
              <SelectTrigger>
                <SelectValue placeholder="Entity set" />
              </SelectTrigger>
              <SelectContent>
                {entities.map((entitySet) => (
                  <SelectItem key={entitySet.name} value={entitySet.name}>
                    {entitySet.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>

        <label className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">JSON Payload</span>
          <Textarea
            className="min-h-[220px] font-mono text-xs"
            value={payload}
            spellCheck={false}
            onChange={(event) => setPayload(event.target.value)}
          />
        </label>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr_auto]">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Confirmation</span>
            <Input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder={confirmationPhrase}
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Write Secret</span>
            <Input
              value={writeSecret}
              onChange={(event) => setWriteSecret(event.target.value)}
              placeholder={writeSecretRequired ? "Required" : "Optional"}
              type="password"
            />
          </label>

          <Button
            className="self-end"
            onClick={() => void createRecord()}
            disabled={
              !enabled ||
              loading ||
              confirmation !== confirmationPhrase ||
              !parsedPayload ||
              (writeSecretRequired && !writeSecret)
            }
          >
            <SendHorizontal />
            {loading ? "Posting" : "Post to SAP"}
          </Button>
        </div>

        {!parsedPayload && (
          <div className="text-xs text-destructive">Payload must be a valid JSON object.</div>
        )}

        {result?.data && (
          <div className="rounded-md border bg-background">
            <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
              <span className="text-sm font-medium">Result</span>
              <Badge variant={result.data.ok ? "default" : "destructive"}>HTTP {result.data.status}</Badge>
            </div>
            <pre className="max-h-[360px] overflow-auto p-3 text-xs">
              {prettyJson({
                ok: result.data.ok,
                status: result.data.status,
                durationMs: result.data.durationMs,
                location: result.data.location,
                body: result.data.body,
              })}
            </pre>
          </div>
        )}
      </div>
    </section>
  );
}

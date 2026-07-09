"use client";

/**
 * SapAribaExplorer — REST endpoint browser for SAP Ariba.
 *
 * Ariba has no OData $metadata, so instead of an entity explorer this
 * lists the curated endpoint catalog (grouped) + a realm switcher, and
 * previews an endpoint's JSON rows via /api/sap/ariba/call. Mirrors the
 * look of the OData components.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Play, RefreshCw, Server } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Endpoint {
  key: string;
  label: string;
  group: string;
  path: string;
  description: string;
}
interface Realm {
  key: string;
  label: string;
}
interface CatalogResponse {
  data: { configured: boolean; realms: Realm[]; endpoints: Endpoint[] };
}
interface CallResult {
  endpoint: string;
  ok: boolean;
  status: number;
  durationMs: number;
  rows: Array<Record<string, unknown>>;
  fields: string[];
  nextPageToken: string | null;
  error: string | null;
}

function valueLabel(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.length > 80 ? `${value.slice(0, 77)}...` : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value).slice(0, 80);
}

export function SapAribaExplorer() {
  const [realms, setRealms] = useState<Realm[]>([]);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [realm, setRealm] = useState("");
  const [endpointKey, setEndpointKey] = useState("");
  const [result, setResult] = useState<CallResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, Endpoint[]>();
    for (const e of endpoints) {
      const arr = map.get(e.group) ?? [];
      arr.push(e);
      map.set(e.group, arr);
    }
    return Array.from(map.entries());
  }, [endpoints]);

  const selectedEndpoint = endpoints.find((e) => e.key === endpointKey);
  const previewFields = result?.fields.slice(0, 8) ?? [];

  useEffect(() => {
    let cancelled = false;
    fetch("/api/sap/ariba/catalog")
      .then((r) => r.json())
      .then((j: Partial<CatalogResponse> & { error?: { message?: string } }) => {
        if (cancelled) return;
        if (!j.data) throw new Error(j.error?.message ?? "Failed to load Ariba catalog");
        setRealms(j.data.realms);
        setEndpoints(j.data.endpoints);
        setRealm(j.data.realms[0]?.key ?? "");
        setEndpointKey(j.data.endpoints[0]?.key ?? "");
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load Ariba catalog");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const run = useCallback(async () => {
    if (!endpointKey) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const params = new URLSearchParams({ endpoint: endpointKey, realm, limit: "10" });
      const response = await fetch(`/api/sap/ariba/call?${params.toString()}`);
      const json = (await response.json()) as { data?: CallResult; error?: { message?: string } };
      if (!response.ok || !json.data) {
        throw new Error(json.error?.message ?? "Ariba call failed");
      }
      setResult(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ariba call failed");
    } finally {
      setLoading(false);
    }
  }, [endpointKey, realm]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1.4fr_auto]">
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Realm</span>
          <Select value={realm} onValueChange={setRealm}>
            <SelectTrigger>
              <SelectValue placeholder="Realm" />
            </SelectTrigger>
            <SelectContent>
              {realms.map((r) => (
                <SelectItem key={r.key} value={r.key}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Endpoint</span>
          <Select value={endpointKey} onValueChange={setEndpointKey}>
            <SelectTrigger>
              <SelectValue placeholder="Endpoint" />
            </SelectTrigger>
            <SelectContent>
              {grouped.map(([group, items]) => (
                <div key={group}>
                  <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {group}
                  </div>
                  {items.map((e) => (
                    <SelectItem key={e.key} value={e.key}>
                      {e.label}
                    </SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>
        </label>

        <Button className="self-end" onClick={() => void run()} disabled={!endpointKey || loading}>
          {loading ? <RefreshCw className="animate-spin" /> : <Play />}
          Run
        </Button>
      </div>

      {selectedEndpoint && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Server className="size-4" />
          <span className="font-mono">{selectedEndpoint.path}</span>
          <span>· {selectedEndpoint.description}</span>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <section className="rounded-md border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Preview</h2>
            <p className="text-xs text-muted-foreground">
              {selectedEndpoint?.label ?? "Select an endpoint"}
            </p>
          </div>
          {result && (
            <Badge variant={result.ok ? "default" : "destructive"}>
              {result.status ? `HTTP ${result.status}` : "error"} · {result.durationMs}ms
            </Badge>
          )}
        </div>
        <div className="overflow-auto">
          {result?.error ? (
            <div className="px-4 py-8 text-sm text-destructive">{result.error}</div>
          ) : result && previewFields.length > 0 ? (
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
                {result.rows.map((row, rowIndex) => (
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
              {loading ? "Running." : "No results yet. Pick an endpoint and Run."}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

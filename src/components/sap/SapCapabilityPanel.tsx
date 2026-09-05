"use client";

/**
 * SapCapabilityPanel — the tenant capability map.
 *
 * Fetches GET /api/sap/tdd/capabilities?product=<key> and shows, for every
 * OData service SAP publishes for this edition, whether the configured TDD
 * tenant actually exposes it:
 *   - exposed      → ✓ + entity-set count
 *   - not-activated→ · + HTTP status + the SAP_COM_xxxx scenario to request
 * A non-200 is NOT a system error — it means the tenant hasn't activated that
 * API's communication arrangement, so we surface the scenario id to request.
 *
 * Mirrors SapOperationsDashboard's fetch + styling conventions.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Circle, RefreshCw, Server } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface CapabilityRow {
  service: string;
  label: string;
  scenario: string;
  exposed: boolean;
  status: number;
  entitySetCount?: number;
  protocol?: string;
  note?: string;
  error?: string;
}

interface CapabilitySummary {
  tenant: string;
  published: number;
  exposed: number;
  notActivated: number;
  byStatus?: Record<string, number>;
  rows: CapabilityRow[];
}

interface CapabilityResponse {
  data: {
    note?: string;
    summary?: CapabilitySummary | null;
    // Happy path returns the summary fields directly under `data`.
    tenant?: string;
    published?: number;
    exposed?: number;
    notActivated?: number;
    byStatus?: Record<string, number>;
    catalogueImported?: boolean;
    rows?: CapabilityRow[];
  };
  error?: { message?: string };
}

function toSummary(data: CapabilityResponse["data"]): CapabilitySummary | null {
  if (data.summary) return data.summary;
  if (typeof data.tenant === "string" && Array.isArray(data.rows)) {
    return {
      tenant: data.tenant,
      published: data.published ?? 0,
      exposed: data.exposed ?? 0,
      notActivated: data.notActivated ?? 0,
      ...(data.byStatus ? { byStatus: data.byStatus } : {}),
      rows: data.rows,
    };
  }
  return null;
}

// Human-readable meaning for the HTTP statuses the probe surfaces.
function statusMeaning(status: string): string {
  if (status === "200") return "exposed";
  if (status === "401") return "auth rejected";
  if (status === "403") return "not activated (forbidden)";
  if (status === "404") return "not activated (not found)";
  if (status === "0") return "no response (timeout/network)";
  return `HTTP ${status}`;
}

export function SapCapabilityPanel({ product = "s4hana" }: { product?: string }) {
  const [summary, setSummary] = useState<CapabilitySummary | null>(null);
  const [catalogueImported, setCatalogueImported] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNote(null);
    try {
      const response = await fetch(`/api/sap/tdd/capabilities?product=${encodeURIComponent(product)}`);
      const json = (await response.json()) as CapabilityResponse;
      if (!response.ok || !json.data) {
        throw new Error(json.error?.message ?? "Failed to load capabilities");
      }
      if (json.data.note) {
        setNote(json.data.note);
        setSummary(null);
        return;
      }
      setSummary(toSummary(json.data));
      setCatalogueImported(json.data.catalogueImported !== false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load capabilities");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [product]);

  useEffect(() => {
    void load();
  }, [load]);

  // Sort exposed first, then by service id — same ordering as the CLI probe.
  const rows = summary
    ? [...summary.rows].sort(
        (a, b) => Number(b.exposed) - Number(a.exposed) || a.service.localeCompare(b.service),
      )
    : [];

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Tenant Capabilities</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Server className="size-4" />
            <span>{summary?.tenant ?? "No SAP tenant"}</span>
            <span>Which published OData services this tenant actually exposes ($metadata, read-only)</span>
          </div>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : undefined} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {note && (
        <div className="rounded-md border border-dashed bg-card px-4 py-6 text-sm text-muted-foreground">
          <p className="flex items-center gap-2 font-medium text-foreground">
            <AlertTriangle className="size-4" /> Catalogue not imported
          </p>
          <p className="mt-1">{note}</p>
        </div>
      )}

      {summary && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-md border bg-card p-3">
              <div className="text-2xl font-semibold">{summary.exposed}</div>
              <div className="mt-1 text-xs text-muted-foreground">exposed by tenant</div>
            </div>
            <div className="rounded-md border bg-card p-3">
              <div className="text-2xl font-semibold">{summary.published}</div>
              <div className="mt-1 text-xs text-muted-foreground">published by SAP</div>
            </div>
            <div className="rounded-md border bg-card p-3">
              <div className="text-2xl font-semibold">{summary.notActivated}</div>
              <div className="mt-1 text-xs text-muted-foreground">not activated</div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-primary" />
            <span>
              {summary.exposed}/{summary.published} probed services exposed by this tenant
            </span>
          </div>

          {/* Status breakdown — makes the *reason* for not-activated visible
              (e.g. all-401 = auth problem vs 403/404 = genuinely not activated). */}
          {summary.byStatus && Object.keys(summary.byStatus).length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">Breakdown:</span>
              {Object.entries(summary.byStatus)
                .sort((a, b) => b[1] - a[1])
                .map(([status, count]) => (
                  <span
                    key={status}
                    className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5"
                    title={`HTTP ${status}`}
                  >
                    <span className="font-medium">{count}×</span>
                    <span className="text-muted-foreground">{statusMeaning(status)}</span>
                  </span>
                ))}
            </div>
          )}

          {!catalogueImported && (
            <div className="rounded-md border border-dashed bg-card px-3 py-2 text-xs text-muted-foreground">
              Showing the curated service set only — the full api.sap.com catalogue
              isn&apos;t imported yet, so the broad sweep didn&apos;t run. Run{" "}
              <code className="rounded bg-muted px-1 py-0.5">pnpm sap:catalog:import</code> to widen coverage.
            </div>
          )}
          {summary.exposed === 0 && summary.published > 0 && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
              0 exposed across {summary.published} probed. If the rows are mostly{" "}
              <strong>401</strong> this is an auth/credentials issue; if <strong>403/404</strong>,
              those services simply aren&apos;t activated in this tenant (request the listed{" "}
              <code className="rounded bg-muted px-1 py-0.5">SAP_COM_xxxx</code> scenario).
            </div>
          )}

          <div className="overflow-auto rounded-md border bg-card">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/80 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Service</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Detail</th>
                  <th className="px-3 py-2 font-medium">Comm. scenario</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.service} className="border-t">
                    <td className="px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{row.label}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {row.service}
                          {row.protocol === "ODATAV4" ? " · OData V4" : ""}
                        </div>
                        {/* 2608 WS4: SAP changed authorisations for some services — say so where the status is read. */}
                        {row.note && (
                          <div className="mt-0.5 whitespace-normal text-xs text-muted-foreground" data-testid="capability-note">
                            {row.note}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {row.exposed ? (
                        <Badge variant="default">
                          <CheckCircle2 className="size-3.5" /> exposed
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <Circle className="size-3.5" /> not activated
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {row.exposed
                        ? `${row.entitySetCount ?? 0} entity sets`
                        : `HTTP ${row.status || "err"}`}
                    </td>
                    <td className="px-3 py-2">
                      {row.scenario ? (
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{row.scenario}</code>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      {loading ? "Probing tenant…" : "No published services to probe."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            A “not activated” row means SAP publishes the API but this tenant hasn’t activated its
            communication arrangement — request the listed <code>SAP_COM_xxxx</code> scenario to enable it.
          </p>
        </>
      )}
    </section>
  );
}

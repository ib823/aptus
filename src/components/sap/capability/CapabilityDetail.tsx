"use client";

/**
 * CapabilityDetail — one item's full picture: the Phase-2 capability ladder +
 * per-entity C/R/U/D, and the Phase-3 dependencies + honest debug hint, from
 * GET /api/sap/tdd/hub-content/[id]. Colour via var(--token) only.
 */
import { Fragment, useEffect, useRef, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { deprecationTooltip, type HubContentType, type HubStatus } from "@/lib/sap-public/hub-content";
import { ProcessBlueprintView, type BlueprintStep } from "./ProcessBlueprintView";
import { CapabilityChips } from "./CapabilityChips";

interface EntityCap {
  name: string;
  readable: boolean;
  creatable: boolean | null;
  updatable: boolean | null;
  deletable: boolean | null;
  pageable: boolean | null;
}
interface DetailData {
  item: {
    id: string;
    contentType: HubContentType;
    externalId: string;
    title: string;
    description: string;
    packageId: string | null;
    apiType: string | null;
    communicationScenarios: string[];
    hubUrl: string;
    /** 2608 WS3 — Hub State / successor as published by SAP. */
    hubState?: string | null;
    hubVersion?: string | null;
    successorExternalId?: string | null;
  };
  status: string;
  ladder: string | null;
  entities: EntityCap[] | null;
  capability: { read: boolean; write: boolean } | null;
  metadataFlavor: string | null;
  probeStatus: number | null;
  dependencies: {
    communicationScenarios: string[];
    prerequisiteScopeItems: Array<{ scopeCode: string; nameClean: string; functionalArea: string; prerequisitesHtml: string }>;
    prerequisiteNote: string | null;
    debugHint: string;
  };
  steps: BlueprintStep[];
}

const LADDER = ["reachable", "readable", "writable"] as const;

// Non-color-dependent encoding: each state has a distinct GLYPH + text label,
// so it reads for colourblind users and screen readers, not by hue alone.
//   supported → ✓ (green)   not supported → — (muted)   not probed → ? (muted)
function crud(v: boolean | null): { glyph: string; text: string; color: string } {
  if (v === true) return { glyph: "✓", text: "Yes", color: "var(--decision-standard)" };
  if (v === false) return { glyph: "—", text: "No", color: "var(--ink-muted)" };
  return { glyph: "?", text: "Not probed", color: "var(--ink-muted)" };
}

/** One entity set's live row read — kept per entity so a repeat open is instant. */
interface RowPreview {
  loading: boolean;
  ok: boolean;
  status: number;
  rows: Array<Record<string, unknown>>;
  fields: string[];
  durationMs: number;
  error: string | null;
}

/** Compact a cell value for the preview grid without exploding the layout. */
function cell(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") return Array.isArray(v) ? `[${v.length}]` : "{…}";
  const s = String(v);
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
}

export function CapabilityDetail({
  id,
  product = "s4hana",
  tenant,
  onClose,
  onResolved,
}: {
  id: string;
  product?: string;
  /**
   * Tenant key the row-preview reads target. Without it, live "View rows" is
   * disabled (the ladder/CRUD from the item probe still render) — we never
   * guess a tenant for a data read.
   */
  tenant?: string | null;
  onClose?: () => void;
  /** Lift the detail's live-probe status + capability up so the list can't contradict it. */
  onResolved?: (status: HubStatus, capability: { read: boolean; write: boolean } | null) => void;
}) {
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Live row previews, keyed by entity-set name. On-demand only (a user clicks
  // "View rows"), one open at a time, cached here so re-opening is free and no
  // read fires per render — the "never hammer the tenant" guardrail.
  const [openEntity, setOpenEntity] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, RowPreview>>({});

  const loadRows = (entityName: string) => {
    // Toggle closed if already open; serve from cache without a re-read.
    if (openEntity === entityName) {
      setOpenEntity(null);
      return;
    }
    setOpenEntity(entityName);
    if (previews[entityName] && !previews[entityName].loading) return; // cached
    if (!tenant || !data) return;
    setPreviews((m) => ({
      ...m,
      [entityName]: { loading: true, ok: false, status: 0, rows: [], fields: [], durationMs: 0, error: null },
    }));
    const qs = new URLSearchParams({
      product,
      tenant,
      service: data.item.externalId,
      entity: entityName,
      limit: "10",
    });
    fetch(`/api/sap/tdd/preview?${qs.toString()}`)
      .then((r) => r.json())
      .then((j: { data?: { ok: boolean; status: number; rows?: Array<Record<string, unknown>>; fields?: string[]; durationMs?: number }; error?: { message?: string } }) => {
        setPreviews((m) => ({
          ...m,
          [entityName]: j.data
            ? {
                loading: false,
                ok: j.data.ok,
                status: j.data.status,
                rows: j.data.rows ?? [],
                fields: j.data.fields ?? [],
                durationMs: j.data.durationMs ?? 0,
                error: null,
              }
            : { loading: false, ok: false, status: 0, rows: [], fields: [], durationMs: 0, error: j.error?.message ?? "Failed to read rows" },
        }));
      })
      .catch((e: unknown) => {
        setPreviews((m) => ({
          ...m,
          [entityName]: { loading: false, ok: false, status: 0, rows: [], fields: [], durationMs: 0, error: e instanceof Error ? e.message : "Failed to read rows" },
        }));
      });
  };
  // Hold the latest callback in a ref so an inline parent arrow doesn't retrigger
  // the fetch every render (it would loop). The probe runs once per id/product.
  const onResolvedRef = useRef(onResolved);
  onResolvedRef.current = onResolved;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setOpenEntity(null);
    setPreviews({});
    // Forward the tenant ON SCREEN. Without it the detail route fell back to
    // the deployment's first configured tenant, probed THAT, and the result
    // was lifted into probedStatus to override the list badge — so on a
    // multi-tenant deployment an expanded row showed tenant A's status under
    // tenant B's caption, the exact hazard the list's `tenant` prop exists
    // to prevent.
    fetch(
      `/api/sap/tdd/hub-content/${encodeURIComponent(id)}?product=${encodeURIComponent(product)}${tenant ? `&tenant=${encodeURIComponent(tenant)}` : ""}`,
    )
      .then((r) => r.json())
      .then((j: { data?: DetailData; error?: { message?: string } }) => {
        if (cancelled) return;
        if (!j.data) throw new Error(j.error?.message ?? "Failed to load item");
        setData(j.data);
        onResolvedRef.current?.(j.data.status as HubStatus, j.data.capability ?? null);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "Failed to load item"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id, product, tenant]);

  const reachedIndex = data?.ladder ? LADDER.indexOf(data.ladder as (typeof LADDER)[number]) : -1;

  return (
    <div
      className="rounded-[var(--radius-card-warm)] p-4"
      style={{ background: "var(--surface-paper)", border: "1px solid var(--border-default)" }}
    >
      {loading && (
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--ink-muted)" }}>
          <RefreshCw className="size-4 animate-spin" /> Loading item…
        </div>
      )}
      {error && (
        <div className="text-sm" style={{ color: "var(--status-revoked-fg)" }}>
          {error}
        </div>
      )}

      {data && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-base font-semibold" style={{ color: "var(--brand-navy)" }}>
                {data.item.title}
              </h3>
              <p className="text-sm" style={{ color: "var(--ink-secondary)" }}>
                {data.item.description}
              </p>
            </div>
            {onClose && (
              <button type="button" onClick={onClose} className="text-sm" style={{ color: "var(--ink-muted)" }}>
                Close
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <CapabilityChips contentType={data.item.contentType} apiType={data.item.apiType} capability={data.capability} />
            <a
              href={data.item.hubUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm"
              style={{ color: "var(--cta-red)" }}
            >
              api.sap.com <ExternalLink className="size-3" />
            </a>
          </div>
          {data.status === "DEPRECATED" && (
            <p
              data-testid="deprecation-note"
              className="rounded-[var(--radius-input)] px-3 py-2 text-sm"
              style={{ background: "var(--status-revoked-bg)", color: "var(--status-revoked-fg)" }}
            >
              {deprecationTooltip(data.item.successorExternalId)}
              {data.item.hubVersion ? ` (Hub version ${data.item.hubVersion})` : ""}
            </p>
          )}

          {/* Capability ladder */}
          {reachedIndex >= 0 && (
            <div data-tour="sap-ladder">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
                Capability ladder
              </div>
              <div className="flex items-center gap-2">
                {LADDER.map((rung, i) => (
                  <span
                    key={rung}
                    className="rounded-[var(--radius-pill)] px-2.5 py-1 text-xs font-medium capitalize"
                    style={
                      i <= reachedIndex
                        ? { background: "var(--status-signed-bg)", color: "var(--status-signed-fg)" }
                        : { background: "var(--surface-ink-tint)", color: "var(--ink-muted)" }
                    }
                  >
                    {rung}
                  </span>
                ))}
                {data.metadataFlavor === "v4-best-effort" && (
                  <span className="text-xs" style={{ color: "var(--ink-muted)" }}>
                    (v4 best-effort)
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Operations C/R/U/D */}
          {data.entities && data.entities.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr style={{ color: "var(--ink-muted)" }}>
                    <th scope="col" className="px-2 py-1 text-left text-xs font-medium">Entity set</th>
                    {["Read", "Create", "Update", "Delete"].map((h) => (
                      <th key={h} scope="col" className="px-2 py-1 text-center text-xs font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.entities.slice(0, 50).map((e) => {
                    const p = previews[e.name];
                    const isOpen = openEntity === e.name;
                    const canRead = e.readable && !!tenant;
                    return (
                      <Fragment key={e.name}>
                        <tr style={{ borderTop: "1px solid var(--border-default)" }}>
                          <td className="px-2 py-1" style={{ color: "var(--ink-primary)" }}>
                            {canRead ? (
                              <button
                                type="button"
                                onClick={() => loadRows(e.name)}
                                aria-expanded={isOpen}
                                className="inline-flex items-center gap-1.5 text-left hover:underline"
                                style={{ color: "var(--cta-red)" }}
                              >
                                {e.name}
                                <span className="text-[10px] font-normal" style={{ color: "var(--ink-muted)" }}>
                                  {isOpen ? "hide rows" : "view rows"}
                                </span>
                              </button>
                            ) : (
                              <span title={e.readable ? "Select a tenant to read live rows" : "Not readable on this tenant"}>{e.name}</span>
                            )}
                          </td>
                          {[e.readable, e.creatable, e.updatable, e.deletable].map((v, i) => {
                            const c = crud(v);
                            return (
                              <td
                                key={i}
                                className="px-2 py-1 text-center font-semibold"
                                style={{ color: c.color }}
                                title={c.text}
                                aria-label={c.text}
                              >
                                <span aria-hidden>{c.glyph}</span>
                              </td>
                            );
                          })}
                        </tr>
                        {isOpen && (
                          <tr>
                            <td colSpan={5} className="px-2 pb-3">
                              {(!p || p.loading) && (
                                <div className="flex items-center gap-2 text-xs" style={{ color: "var(--ink-muted)" }}>
                                  <RefreshCw className="size-3 animate-spin" /> Reading live rows from {tenant}…
                                </div>
                              )}
                              {p && !p.loading && p.error && (
                                <div className="text-xs" style={{ color: "var(--status-revoked-fg)" }}>
                                  Live read failed: {p.error}
                                </div>
                              )}
                              {p && !p.loading && !p.error && !p.ok && (
                                <div className="text-xs" style={{ color: "var(--ink-muted)" }}>
                                  Not reachable on {tenant} — HTTP {p.status}. This entity set is likely not activated or needs setup on this tenant.
                                </div>
                              )}
                              {p && !p.loading && !p.error && p.ok && p.rows.length === 0 && (
                                <div className="text-xs" style={{ color: "var(--ink-muted)" }}>
                                  No records on {tenant}. The service is reachable (HTTP {p.status}) but this entity set returned zero rows.
                                </div>
                              )}
                              {p && !p.loading && !p.error && p.ok && p.rows.length > 0 && (
                                <RowGrid preview={p} tenant={tenant ?? ""} />
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              {/* Legend so the glyphs are unambiguous without relying on colour. */}
              <p className="mt-1.5 px-2 text-[11px]" style={{ color: "var(--ink-muted)" }}>
                <span style={{ color: "var(--decision-standard)" }}>✓</span> supported · — not supported · ? not probed
                {tenant ? " · a readable entity set opens live rows on demand" : ""}
              </p>
            </div>
          )}

          {/* Dependencies + honest debug */}
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
              Dependencies &amp; debug
            </div>
            {data.dependencies.communicationScenarios.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs" style={{ color: "var(--ink-secondary)" }}>
                <span>Comm. scenarios:</span>
                {data.dependencies.communicationScenarios.map((s) => (
                  <code
                    key={s}
                    className="rounded-[var(--radius-input)] px-1.5 py-0.5"
                    style={{ background: "var(--surface-ink-tint)", color: "var(--ink-primary)" }}
                  >
                    {s}
                  </code>
                ))}
              </div>
            )}
            {data.dependencies.prerequisiteScopeItems.map((si) => (
              <div key={si.scopeCode} className="text-xs" style={{ color: "var(--ink-secondary)" }}>
                <strong style={{ color: "var(--ink-primary)" }}>{si.scopeCode}</strong> — {si.nameClean}
                <span style={{ color: "var(--ink-muted)" }}> · {si.functionalArea}</span>
              </div>
            ))}
            {data.dependencies.prerequisiteNote && (
              <div className="text-xs italic" style={{ color: "var(--ink-muted)" }}>
                {data.dependencies.prerequisiteNote}
              </div>
            )}
            <div
              className="rounded-[var(--radius-input)] px-3 py-2 text-xs"
              style={{ background: "var(--surface-ink-tint)", color: "var(--ink-secondary)" }}
            >
              <strong style={{ color: "var(--ink-primary)" }}>
                Probe {data.probeStatus != null ? `HTTP ${data.probeStatus}` : "(not run)"}:
              </strong>{" "}
              {data.dependencies.debugHint}
            </div>
          </div>

          {(data.item.contentType === "PROCESS_BLUEPRINT" || data.item.contentType === "SCENARIO" || data.item.contentType === "LIVEPROCESS") && (
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
                Process blueprint
              </div>
              <ProcessBlueprintView steps={data.steps} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * RowGrid — the actual live records for one entity set (a genuine tenant read,
 * not stored probe state). Columns are capped for width; the footer states the
 * read is live, from which tenant, and how long it took, so stored-vs-live is
 * never ambiguous.
 */
function RowGrid({ preview, tenant }: { preview: RowPreview; tenant: string }) {
  const MAX_COLS = 8;
  const cols = preview.fields.slice(0, MAX_COLS);
  const moreCols = preview.fields.length - cols.length;
  return (
    <div className="overflow-x-auto rounded-[var(--radius-input)]" style={{ border: "1px solid var(--border-default)" }}>
      <table className="w-full min-w-[420px] text-xs">
        <thead>
          <tr style={{ background: "var(--surface-ink-tint)", color: "var(--ink-muted)" }}>
            {cols.map((f) => (
              <th key={f} scope="col" className="px-2 py-1 text-left font-medium whitespace-nowrap">
                {f}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {preview.rows.map((row, ri) => (
            <tr key={ri} style={{ borderTop: "1px solid var(--border-default)" }}>
              {cols.map((f) => (
                <td key={f} className="px-2 py-1 whitespace-nowrap" style={{ color: "var(--ink-primary)" }} title={cell(row[f])}>
                  {cell(row[f])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-2 py-1 text-[11px]" style={{ color: "var(--ink-muted)" }}>
        Live read · {preview.rows.length} row{preview.rows.length === 1 ? "" : "s"} from {tenant} · HTTP {preview.status} · {preview.durationMs}ms
        {moreCols > 0 ? ` · +${moreCols} more field${moreCols === 1 ? "" : "s"}` : ""}
      </p>
    </div>
  );
}

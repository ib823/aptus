"use client";

/**
 * CapabilityDetail — one item's full picture: the Phase-2 capability ladder +
 * per-entity C/R/U/D, and the Phase-3 dependencies + honest debug hint, from
 * GET /api/sap/tdd/hub-content/[id]. Colour via var(--token) only.
 */
import { useEffect, useRef, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import type { HubContentType, HubStatus } from "@/lib/sap-public/hub-content";
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

export function CapabilityDetail({
  id,
  product = "s4hana",
  onClose,
  onResolved,
}: {
  id: string;
  product?: string;
  onClose?: () => void;
  /** Lift the detail's live-probe status + capability up so the list can't contradict it. */
  onResolved?: (status: HubStatus, capability: { read: boolean; write: boolean } | null) => void;
}) {
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Hold the latest callback in a ref so an inline parent arrow doesn't retrigger
  // the fetch every render (it would loop). The probe runs once per id/product.
  const onResolvedRef = useRef(onResolved);
  onResolvedRef.current = onResolved;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/sap/tdd/hub-content/${encodeURIComponent(id)}?product=${encodeURIComponent(product)}`)
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
  }, [id, product]);

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
                  {data.entities.slice(0, 50).map((e) => (
                    <tr key={e.name} style={{ borderTop: "1px solid var(--border-default)" }}>
                      <td className="px-2 py-1" style={{ color: "var(--ink-primary)" }}>
                        {e.name}
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
                  ))}
                </tbody>
              </table>
              {/* Legend so the glyphs are unambiguous without relying on colour. */}
              <p className="mt-1.5 px-2 text-[11px]" style={{ color: "var(--ink-muted)" }}>
                <span style={{ color: "var(--decision-standard)" }}>✓</span> supported · — not supported · ? not probed
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

/**
 * ContentTypeTiles — per-type count tiles with a runtime/reference tag.
 * Doubles as the content-type filter (click to select). Colour via var(--token).
 *
 * Each tile reads "imported of ~published (indicative)". The published figure is
 * an INDICATIVE volume snapshot — NOT pinned to a release (order of magnitude is
 * stable across releases, exact counts are not). Empty tiles say so honestly and
 * point at the drop-target workflow, never a bare zero.
 */
import {
  HUB_CONTENT_TYPES,
  HUB_CONTENT_TYPE_META,
  S4_PUBLIC_PUBLISHED_COUNTS,
  isRuntimeType,
  type HubContentType,
} from "@/lib/sap-public/hub-content";

const INDICATIVE_NOTE =
  "Indicative published volume from an SAP Business Accelerator Hub snapshot; not pinned to a release. Refresh from a logged-in Hub check for release-accurate figures.";

export function ContentTypeTiles({
  byType,
  activeType,
  onSelect,
}: {
  byType: Record<string, number>;
  activeType?: HubContentType | "ALL";
  onSelect?: (type: HubContentType | "ALL") => void;
}) {
  const total = Object.values(byType).reduce((n, c) => n + c, 0);

  const tile = (
    key: HubContentType | "ALL",
    label: string,
    count: number,
    published: number | null,
    tag: string | null,
    selected: boolean,
    empty: boolean,
  ) => {
    // "of ~Y indicative" is context for what's MISSING — only meaningful for an
    // empty type with a real published figure. Once imported (count > 0), the
    // count IS the truth (a stale indicative would read "943 of ~862"). A 0/absent
    // published count never renders "~0" — it falls back to the runtime/reference tag.
    const hasPublished = published != null && published > 0;
    const showIndicative = empty && hasPublished;
    const title = empty
      ? `${label}: none imported yet — drop a logged-in Hub export in sap-references/hub-content/${key}.json${hasPublished ? ` (~${published!.toLocaleString()} published). ${INDICATIVE_NOTE}` : "."}`
      : label;
    return (
      <button
        key={key}
        type="button"
        role="tab"
        aria-selected={selected}
        onClick={() => !empty && onSelect?.(key)}
        disabled={empty}
        title={title}
        className="flex flex-col items-start gap-1 rounded-[var(--radius-card-warm)] px-3 py-2 text-left transition disabled:cursor-not-allowed"
        style={{
          background: "var(--surface-paper)",
          border: `1px solid ${selected ? "var(--brand-navy)" : "var(--border-default)"}`,
          opacity: empty ? 0.62 : 1,
        }}
      >
        <span className="text-lg font-bold tabular-nums" style={{ color: empty ? "var(--ink-muted)" : "var(--brand-navy)" }}>
          {count.toLocaleString()}
        </span>
        <span className="text-xs font-medium" style={{ color: "var(--ink-primary)" }}>
          {label}
        </span>
        {showIndicative ? (
          <span className="text-[10px] tabular-nums" style={{ color: "var(--ink-muted)" }}>
            of ~{published!.toLocaleString()} <span className="uppercase tracking-wide">indicative</span>
          </span>
        ) : (
          tag && (
            <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
              {tag}
            </span>
          )
        )}
      </button>
    );
  };

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6" role="tablist" aria-label="Content types">
      {tile("ALL", "All types", total, null, null, activeType === "ALL" || activeType === undefined, false)}
      {/* Every content type, with imported-vs-published context. Empty ones dimmed
          and disabled, so it's clear what's loaded vs pending a real export. */}
      {HUB_CONTENT_TYPES.map((t) =>
        tile(
          t,
          HUB_CONTENT_TYPE_META[t].label,
          byType[t] ?? 0,
          S4_PUBLIC_PUBLISHED_COUNTS[t] ?? null,
          isRuntimeType(t) ? "runtime" : "reference",
          activeType === t,
          (byType[t] ?? 0) === 0,
        ),
      )}
    </div>
  );
}

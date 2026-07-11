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
import { useAffirmLearn } from "@/components/affirm/learn/context";
import { glossaryIdForContentType } from "@/constants/sap-glossary";

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
  // Tap the "?" on a tile → plain-language definition of that content type.
  const { openGlossary } = useAffirmLearn();

  const tile = (
    key: HubContentType | "ALL",
    label: string,
    count: number,
    published: number | null,
    tag: string | null,
    selected: boolean,
    empty: boolean,
    defineId?: string,
  ) => {
    // Tiles speak COVERAGE, never tenant status. Loaded → the real count is the
    // truth (no "indicative"). Not loaded → "~Y published" is the SCALE of what
    // could be imported (coverage language only), and a 0/absent published figure
    // never renders "~0". The ALL tile (published null) shows no coverage line.
    const hasPublished = published != null && published > 0;
    const isAll = key === "ALL";
    const title = empty
      ? `${label}: not loaded — no rows imported yet. ${hasPublished ? `~${published!.toLocaleString()} published by SAP. ${INDICATIVE_NOTE} ` : ""}Drop a logged-in Hub export in sap-references/hub-content/${key}.json.`
      : label;
    return (
      <div
        key={key}
        className="relative rounded-[var(--radius-card-warm)]"
        style={{
          background: "var(--surface-paper)",
          border: `1px solid ${selected ? "var(--brand-navy)" : "var(--border-default)"}`,
          opacity: empty ? 0.62 : 1,
        }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={selected}
          onClick={() => !empty && onSelect?.(key)}
          disabled={empty}
          title={title}
          className="flex w-full flex-col items-start gap-1 px-3 py-2 pr-7 text-left transition disabled:cursor-not-allowed"
        >
          <span className="text-lg font-bold tabular-nums" style={{ color: empty ? "var(--ink-muted)" : "var(--brand-navy)" }}>
            {count.toLocaleString()}
          </span>
          <span className="text-xs font-medium" style={{ color: "var(--ink-primary)" }}>
            {label}
          </span>
          {isAll ? null : empty ? (
            <span className="text-[10px] tabular-nums" style={{ color: "var(--ink-muted)" }}>
              Not loaded{hasPublished ? ` · ~${published!.toLocaleString()} published` : ""}
            </span>
          ) : (
            <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
              loaded{tag ? ` · ${tag}` : ""}
            </span>
          )}
        </button>
        {defineId && (
          <button
            type="button"
            onClick={() => openGlossary(defineId)}
            title={`What is "${label}"?`}
            aria-label={`What is "${label}"?`}
            className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full text-[11px] leading-none"
            style={{ color: "var(--ink-muted)", border: "1px solid var(--border-default)" }}
          >
            ?
          </button>
        )}
      </div>
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
          glossaryIdForContentType(t),
        ),
      )}
    </div>
  );
}

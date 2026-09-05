/**
 * ContentTypeTiles — per-type count tiles with a runtime/reference tag.
 * Doubles as the content-type filter (click to select). Colour via var(--token).
 *
 * Each tile headlines the loaded ITEM count. A loaded tile adds "of which N
 * deprecated" when SAP has retired part of that type (2608 WS3 — Hub State).
 * An empty tile shows "N published (2608)" — the figure SAP publishes for the
 * content release in S4_PUBLIC_PUBLISHED_RELEASE, so the scale of what could be
 * imported is release-pinned, never a bare zero.
 */
import {
  HUB_CONTENT_TYPES,
  HUB_CONTENT_TYPE_META,
  S4_PUBLIC_PUBLISHED_COUNTS,
  S4_PUBLIC_PUBLISHED_RELEASE,
  isRuntimeType,
  type HubContentType,
} from "@/lib/sap-public/hub-content";
import { useAffirmLearn } from "@/components/affirm/learn/context";
import { glossaryIdForContentType } from "@/constants/sap-glossary";

const INDICATIVE_NOTE = `Published volume for SAP content release ${S4_PUBLIC_PUBLISHED_RELEASE} (SAP Business Accelerator Hub, S/4HANA Cloud Public Edition). SAP moves these figures every release — compare within drift, never for equality.`;

/** Types with no distinct content in the S/4 Public product would render as an
 *  honest "n/a by design" (em dash, NA_NOTE sublabel, NA_HELP on the "?"),
 *  never "0 · N published". 2608 WS3: nothing is n/a at this release —
 *  PROCESS_BLUEPRINT is the Hub's "Process Blueprints" tab (16 solution
 *  variants at 2608) and carries a published figure like every other type.
 *  The mechanism stays for the next type SAP folds into another. */
const NA_NOTE: Partial<Record<HubContentType, string>> = {};
const NA_HELP: Partial<Record<HubContentType, string>> = {};

export function ContentTypeTiles({
  byType,
  byTypeItems,
  byTypeDeprecated,
  activeType,
  onSelect,
}: {
  /** Loaded-row count per type — decides loaded vs empty. */
  byType: Record<string, number>;
  /** Item volume per type (grouped rows expand by itemCount) — the headline. */
  byTypeItems?: Record<string, number>;
  /** Items per type whose Hub State is DEPRECATED (2608 WS3) — "of which N deprecated". */
  byTypeDeprecated?: Record<string, number> | undefined;
  activeType?: HubContentType | "ALL";
  onSelect?: (type: HubContentType | "ALL") => void;
}) {
  // ALL tile headlines total items (grouped rows counted by their itemCount).
  const total = byTypeItems
    ? Object.values(byTypeItems).reduce((n, c) => n + c, 0)
    : Object.values(byType).reduce((n, c) => n + c, 0);
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
    naNote?: string,
    naHelp?: string,
    deprecated = 0,
  ) => {
    // Tiles speak COVERAGE, never tenant status. Loaded → the real count is the
    // truth. Not loaded → "Y published (2608)" is the SCALE of what could be
    // imported (coverage language only), and a 0/absent published figure never
    // renders "0 published". The ALL tile (published null) shows no coverage line.
    const hasPublished = published != null && published > 0;
    const isAll = key === "ALL";
    // n/a-by-design types show an em dash, never "0" (0 reads as missing/broken).
    const displayCount = naNote ? "—" : count.toLocaleString();
    const title = empty
      ? naNote
        ? `${label}: ${naHelp ?? naNote}`
        : `${label}: not loaded — no rows imported yet. ${hasPublished ? `${published!.toLocaleString()} published by SAP at release ${S4_PUBLIC_PUBLISHED_RELEASE}. ${INDICATIVE_NOTE} ` : ""}Drop a logged-in Hub export in sap-references/hub-content/${key}.json.`
      : label;
    // Explicit accessible name for the per-type tiles — stable and collision
    // free (n/a types say "not applicable", never the sublabel that names other
    // tiles). The ALL tile keeps its default text-content name (starts with the
    // count) so it never collides with the status "All" filter tab.
    const ariaLabel = isAll
      ? undefined
      : naNote
        ? `${label}: not applicable`
        : empty
          ? `${label}: not loaded`
          : `${label}: ${count.toLocaleString()} loaded${tag ? `, ${tag}` : ""}${deprecated > 0 ? `, ${deprecated.toLocaleString()} deprecated` : ""}`;
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
          aria-label={ariaLabel}
          onClick={() => !empty && onSelect?.(key)}
          disabled={empty}
          title={title}
          className="flex w-full flex-col items-start gap-1 px-3 py-2 pr-7 text-left transition disabled:cursor-not-allowed"
        >
          <span className="text-lg font-bold tabular-nums" style={{ color: empty ? "var(--ink-muted)" : "var(--brand-navy)" }}>
            {displayCount}
          </span>
          <span className="text-xs font-medium" style={{ color: "var(--ink-primary)" }}>
            {label}
          </span>
          {isAll ? null : empty ? (
            <span className="text-[10px] tabular-nums" style={{ color: "var(--ink-muted)" }}>
              {naNote ?? `Not loaded${hasPublished ? ` · ${published!.toLocaleString()} published (${S4_PUBLIC_PUBLISHED_RELEASE})` : ""}`}
            </span>
          ) : (
            <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
              loaded{tag ? ` · ${tag}` : ""}
              {deprecated > 0 ? ` · of which ${deprecated.toLocaleString()} deprecated` : ""}
            </span>
          )}
        </button>
        {(defineId || naHelp) && (
          <button
            type="button"
            onClick={() => defineId && openGlossary(defineId)}
            title={naHelp ?? `What is "${label}"?`}
            aria-label={naHelp ? `About ${label}` : `What is "${label}"?`}
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
          // Headline the ITEM count (grouped rows expand by itemCount); fall back
          // to the row count if byTypeItems wasn't supplied.
          byTypeItems?.[t] ?? byType[t] ?? 0,
          // Suppress "~N published" for n/a types — nothing is pending for them.
          NA_NOTE[t] ? null : S4_PUBLIC_PUBLISHED_COUNTS[t] ?? null,
          isRuntimeType(t) ? "runtime" : "reference",
          activeType === t,
          (byType[t] ?? 0) === 0,
          glossaryIdForContentType(t),
          NA_NOTE[t],
          NA_HELP[t],
          byTypeDeprecated?.[t] ?? 0,
        ),
      )}
    </div>
  );
}

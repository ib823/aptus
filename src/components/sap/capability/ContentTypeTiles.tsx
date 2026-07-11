/**
 * ContentTypeTiles — per-type count tiles with a runtime/reference tag.
 * Doubles as the content-type filter (click to select). Colour via var(--token).
 */
import {
  HUB_CONTENT_TYPES,
  HUB_CONTENT_TYPE_META,
  isRuntimeType,
  type HubContentType,
} from "@/lib/sap-public/hub-content";

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

  const tile = (key: HubContentType | "ALL", label: string, count: number, tag: string | null, selected: boolean, empty: boolean) => (
    <button
      key={key}
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={() => !empty && onSelect?.(key)}
      disabled={empty}
      title={empty ? `${label}: none loaded yet (pending real exports)` : label}
      className="flex flex-col items-start gap-1 rounded-[var(--radius-card-warm)] px-3 py-2 text-left transition disabled:cursor-not-allowed"
      style={{
        background: "var(--surface-paper)",
        border: `1px solid ${selected ? "var(--brand-navy)" : "var(--border-default)"}`,
        opacity: empty ? 0.55 : 1,
      }}
    >
      <span className="text-lg font-bold tabular-nums" style={{ color: empty ? "var(--ink-muted)" : "var(--brand-navy)" }}>
        {count.toLocaleString()}
      </span>
      <span className="text-xs font-medium" style={{ color: "var(--ink-primary)" }}>
        {label}
      </span>
      {tag && (
        <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
          {tag}
        </span>
      )}
    </button>
  );

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6" role="tablist" aria-label="Content types">
      {tile("ALL", "All types", total, null, activeType === "ALL" || activeType === undefined, false)}
      {/* Show ALL content types with real counts — empty ones dimmed, so it's
          clear what's loaded (APIs) vs pending real exports (Events/CDS/…). */}
      {HUB_CONTENT_TYPES.map((t) =>
        tile(t, HUB_CONTENT_TYPE_META[t].label, byType[t] ?? 0, isRuntimeType(t) ? "runtime" : "reference", activeType === t, (byType[t] ?? 0) === 0),
      )}
    </div>
  );
}

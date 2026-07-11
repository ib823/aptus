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
  const present = HUB_CONTENT_TYPES.filter((t) => (byType[t] ?? 0) > 0);
  const total = Object.values(byType).reduce((n, c) => n + c, 0);

  const tile = (key: HubContentType | "ALL", label: string, count: number, tag: string | null, selected: boolean) => (
    <button
      key={key}
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={() => onSelect?.(key)}
      className="flex flex-col items-start gap-1 rounded-[var(--radius-card-warm)] px-3 py-2 text-left transition"
      style={{
        background: "var(--surface-paper)",
        border: `1px solid ${selected ? "var(--brand-navy)" : "var(--border-default)"}`,
      }}
    >
      <span className="text-lg font-bold tabular-nums" style={{ color: "var(--brand-navy)" }}>
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
      {tile("ALL", "All types", total, null, activeType === "ALL" || activeType === undefined)}
      {present.map((t) =>
        tile(t, HUB_CONTENT_TYPE_META[t].label, byType[t] ?? 0, isRuntimeType(t) ? "runtime" : "reference", activeType === t),
      )}
    </div>
  );
}

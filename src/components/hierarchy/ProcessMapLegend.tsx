"use client";

const LEGEND_ITEMS = [
  { label: "Not Started", color: "bg-slate-200" },
  { label: "In Progress", color: "bg-blue-400" },
  { label: "Complete", color: "bg-green-500" },
  { label: "Has GAPs", color: "bg-amber-400" },
] as const;

export function ProcessMapLegend() {
  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground">
      {LEGEND_ITEMS.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <span className={`w-2.5 h-2.5 rounded-sm ${item.color}`} />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

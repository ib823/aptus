"use client";

const LEGEND_ITEMS = [
  { label: "FIT", color: "bg-green-500", textColor: "text-green-700" },
  { label: "CONFIGURE", color: "bg-blue-500", textColor: "text-blue-700" },
  { label: "GAP", color: "bg-amber-500", textColor: "text-amber-700" },
  { label: "PENDING", color: "bg-gray-300", textColor: "text-gray-500" },
  { label: "N/A", color: "bg-gray-400", textColor: "text-gray-600" },
];

export function FlowLegend() {
  return (
    <div className="flex items-center gap-4 text-xs">
      {LEGEND_ITEMS.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <div className={`w-3 h-3 rounded-sm ${item.color}`} />
          <span className={`font-medium ${item.textColor}`}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

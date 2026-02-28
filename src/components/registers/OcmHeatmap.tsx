"use client";

import { useMemo } from "react";

interface HeatmapCell {
  role: string;
  area: string;
  severity: string;
  count: number;
}

interface OcmHeatmapProps {
  data: HeatmapCell[];
  onCellClick: (role: string, area: string) => void;
}

const severityColors: Record<string, { bg: string; text: string; border: string }> = {
  LOW: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" },
  MEDIUM: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  HIGH: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  TRANSFORMATIONAL: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
};

export function OcmHeatmap({ data, onCellClick }: OcmHeatmapProps) {
  const { roles, areas, cellMap } = useMemo(() => {
    const rolesSet = new Set<string>();
    const areasSet = new Set<string>();
    const map = new Map<string, HeatmapCell>();

    for (const cell of data) {
      rolesSet.add(cell.role);
      areasSet.add(cell.area);
      map.set(`${cell.role}::${cell.area}`, cell);
    }

    return {
      roles: Array.from(rolesSet).sort(),
      areas: Array.from(areasSet).sort(),
      cellMap: map,
    };
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-sm">No heatmap data available. Add OCM impacts to see the heatmap.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 text-xs">
        <span className="text-muted-foreground">Severity:</span>
        {Object.entries(severityColors).map(([key, colors]) => (
          <div key={key} className="flex items-center gap-1">
            <div className={`w-3 h-3 rounded ${colors.bg} ${colors.border} border`} />
            <span className="text-muted-foreground">{key}</span>
          </div>
        ))}
      </div>

      <div className="border rounded-lg overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground sticky left-0 bg-slate-50">
                Role / Area
              </th>
              {areas.map((area) => (
                <th key={area} className="px-4 py-3 text-center font-medium text-muted-foreground min-w-[120px]" title={area}>
                  {area}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {roles.map((role) => (
              <tr key={role} className="hover:bg-muted/20">
                <td className="px-4 py-3 font-medium sticky left-0 bg-white" title={role}>
                  {role}
                </td>
                {areas.map((area) => {
                  const cell = cellMap.get(`${role}::${area}`);
                  if (!cell) {
                    return (
                      <td key={area} className="px-4 py-3 text-center">
                        <span className="text-xs text-muted-foreground">-</span>
                      </td>
                    );
                  }

                  const defaultColors = { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-200" };
                  const colors = severityColors[cell.severity] ?? defaultColors;
                  return (
                    <td key={area} className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => onCellClick(role, area)}
                        className={`inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium border transition-colors hover:opacity-80 ${colors.bg} ${colors.text} ${colors.border}`}
                        aria-label={`${cell.count} ${cell.severity.toLowerCase()} impact${cell.count !== 1 ? "s" : ""} for ${role} in ${area}`}
                      >
                        {cell.count} impact{cell.count !== 1 ? "s" : ""}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

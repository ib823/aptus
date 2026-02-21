interface GapSummaryProps {
  total: number;
  resolved: number;
  pending: number;
  totalEffort: number;
  byType: Record<string, number>;
}

const TYPE_LABELS: Record<string, string> = {
  PENDING: "Pending",
  FIT: "Fits After All",
  CONFIGURE: "Configure",
  KEY_USER_EXT: "Key User Ext",
  BTP_EXT: "BTP Extension",
  ISV: "ISV Solution",
  CUSTOM_ABAP: "Custom ABAP",
  ADAPT_PROCESS: "Adapt Process",
  OUT_OF_SCOPE: "Out of Scope",
};

const TYPE_COLORS: Record<string, string> = {
  PENDING: "bg-gray-200",
  FIT: "bg-green-500",
  CONFIGURE: "bg-blue-500",
  KEY_USER_EXT: "bg-cyan-500",
  BTP_EXT: "bg-indigo-500",
  ISV: "bg-violet-500",
  CUSTOM_ABAP: "bg-red-500",
  ADAPT_PROCESS: "bg-amber-500",
  OUT_OF_SCOPE: "bg-gray-400",
};

export function GapSummary({ total, resolved, pending, totalEffort, byType }: GapSummaryProps) {
  const resolvedPercent = total > 0 ? Math.round((resolved / total) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Overview stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card rounded-lg border p-4">
          <p className="text-xs text-muted-foreground/60 uppercase tracking-wider">Total Gaps</p>
          <p className="text-2xl font-bold text-foreground mt-1">{total}</p>
        </div>
        <div className="bg-card rounded-lg border p-4">
          <p className="text-xs text-muted-foreground/60 uppercase tracking-wider">Resolved</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{resolved}</p>
          <p className="text-xs text-muted-foreground">{resolvedPercent}%</p>
        </div>
        <div className="bg-card rounded-lg border p-4">
          <p className="text-xs text-muted-foreground/60 uppercase tracking-wider">Pending</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{pending}</p>
        </div>
        <div className="bg-card rounded-lg border p-4">
          <p className="text-xs text-muted-foreground/60 uppercase tracking-wider">Total Effort</p>
          <p className="text-2xl font-bold text-foreground mt-1">{totalEffort}</p>
          <p className="text-xs text-muted-foreground">days</p>
        </div>
      </div>

      {/* Resolution breakdown */}
      <div>
        <h3 className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider mb-3">
          By Resolution Type
        </h3>
        <div className="space-y-2">
          {Object.entries(byType)
            .sort(([, a], [, b]) => b - a)
            .map(([type, count]) => (
              <div key={type} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${TYPE_COLORS[type] ?? "bg-gray-300"}`} />
                  <span className="text-muted-foreground">{TYPE_LABELS[type] ?? type}</span>
                </div>
                <span className="font-medium text-foreground">{count}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

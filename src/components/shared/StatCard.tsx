import { formatNumber } from "@/lib/format/number";

interface StatCardProps {
  label: string;
  value: string | number;
  valueClass?: string | undefined;
  sub?: string | undefined;
}

export function StatCard({ label, value, valueClass, sub }: StatCardProps) {
  // Auto-apply thousands separator when callers pass a raw number. Strings
  // are passed through verbatim so callers that pre-format (e.g. "12.3 days"
  // or "v2602") keep full control.
  const display = typeof value === "number" ? formatNumber(value) : value;
  return (
    <div className="bg-card border border-border rounded-lg p-4 text-center">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={`text-2xl font-bold ${valueClass ?? "text-foreground"}`}>
        {display}
      </div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

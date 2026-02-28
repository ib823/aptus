interface StatCardProps {
  label: string;
  value: string | number;
  valueClass?: string | undefined;
  sub?: string | undefined;
}

export function StatCard({ label, value, valueClass, sub }: StatCardProps) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 text-center">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={`text-2xl font-bold ${valueClass ?? "text-foreground"}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

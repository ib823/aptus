"use client";

const STATUS_STYLES: Record<string, { bg: string; bar: string; text: string }> = {
  not_started: { bg: "bg-gray-100 dark:bg-gray-800", bar: "bg-gray-300 dark:bg-gray-600", text: "text-gray-500" },
  in_progress: { bg: "bg-blue-50 dark:bg-blue-950", bar: "bg-blue-500", text: "text-blue-700 dark:text-blue-300" },
  completed: { bg: "bg-green-50 dark:bg-green-950", bar: "bg-green-500", text: "text-green-700 dark:text-green-300" },
  blocked: { bg: "bg-red-50 dark:bg-red-950", bar: "bg-red-500", text: "text-red-700 dark:text-red-300" },
};

interface PhaseProgressCardProps {
  label: string;
  status: string;
  completionPct: number;
  blockedReason: string | null;
}

export function PhaseProgressCard({
  label,
  status,
  completionPct,
  blockedReason,
}: PhaseProgressCardProps) {
  const styles = STATUS_STYLES[status] ?? STATUS_STYLES.not_started!;
  const bg = styles?.bg ?? "";
  const bar = styles?.bar ?? "";
  const text = styles?.text ?? "";

  return (
    <div className={`rounded-lg p-2 ${bg}`} title={blockedReason ?? undefined}>
      <p className={`text-xs font-medium truncate ${text}`}>{label}</p>
      <div className="mt-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${bar}`}
          style={{ width: `${completionPct}%` }}
        />
      </div>
      <p className={`text-[10px] mt-0.5 ${text}`}>{completionPct}%</p>
    </div>
  );
}

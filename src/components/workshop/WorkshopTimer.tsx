"use client";

import { useState, useEffect } from "react";

interface WorkshopTimerProps {
  startedAt: string | null;
  isActive: boolean;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [
    h.toString().padStart(2, "0"),
    m.toString().padStart(2, "0"),
    s.toString().padStart(2, "0"),
  ].join(":");
}

export function WorkshopTimer({ startedAt, isActive }: WorkshopTimerProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt || !isActive) return;

    const start = new Date(startedAt).getTime();

    function tick() {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt, isActive]);

  if (!startedAt) {
    return <span className="text-sm text-muted-foreground font-mono">--:--:--</span>;
  }

  return (
    <span className="text-sm font-mono font-medium tabular-nums">
      {formatDuration(elapsed)}
    </span>
  );
}

"use client";

import { useState, useCallback } from "react";
import { RefreshCwIcon, Loader2Icon, CircleCheckIcon, CircleXIcon, CircleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { HealthCheck } from "@/types/pwa";

export function HealthDashboard() {
  const [health, setHealth] = useState<HealthCheck | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/health");
      if (!res.ok) {
        const body = (await res.json()) as { error?: { message?: string } };
        setError(body.error?.message ?? "Failed to fetch health status");
        return;
      }
      const body = (await res.json()) as { data: HealthCheck };
      setHealth(body.data);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  function getStatusIcon(status: string) {
    switch (status) {
      case "healthy":
      case "up":
        return <CircleCheckIcon className="size-4 text-green-500" />;
      case "degraded":
        return <CircleAlertIcon className="size-4 text-yellow-500" />;
      default:
        return <CircleXIcon className="size-4 text-red-500" />;
    }
  }

  function getStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
    switch (status) {
      case "healthy":
      case "up":
        return "default";
      case "degraded":
        return "secondary";
      default:
        return "destructive";
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">System Health</h3>
        <Button onClick={refresh} variant="outline" size="sm" disabled={loading}>
          {loading ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <RefreshCwIcon className="size-4" />
          )}
          <span className="ml-1">Refresh</span>
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {!health && !error && (
        <p className="text-muted-foreground text-sm">Click Refresh to check system health.</p>
      )}

      {health && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {getStatusIcon(health.status)}
            <span className="text-sm font-medium capitalize">{health.status}</span>
            <Badge variant={getStatusVariant(health.status)} className="ml-auto">
              {health.status}
            </Badge>
          </div>

          <div className="rounded-md border">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                {getStatusIcon(health.checks.database.status)}
                <span className="text-sm">Database</span>
              </div>
              <span className="text-muted-foreground text-sm">
                {health.checks.database.latencyMs}ms
              </span>
            </div>
          </div>

          <p className="text-muted-foreground text-xs">
            Version {health.version} &middot; Last checked:{" "}
            {new Date(health.timestamp).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
}

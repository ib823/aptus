"use client";

import { useEffect, useState, useCallback } from "react";
import { SnapshotCard } from "./SnapshotCard";

interface Snapshot {
  id: string;
  version: number;
  label: string | null;
  dataHash: string;
  reason: string;
  createdAt: string;
}

interface DeltaSummary {
  scopeAdded: number;
  scopeRemoved: number;
  scopeModified: number;
  classificationChanged: number;
  gapsAdded: number;
  gapsRemoved: number;
  gapsModified: number;
  integrationsAdded: number;
  integrationsRemoved: number;
  integrationsModified: number;
  dmAdded: number;
  dmRemoved: number;
  dmModified: number;
  totalChanges: number;
}

interface SnapshotsClientProps {
  assessmentId: string;
}

export function SnapshotsClient({ assessmentId }: SnapshotsClientProps) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [compareResult, setCompareResult] = useState<{ summary: DeltaSummary } | null>(null);
  const [baseVersion, setBaseVersion] = useState<number | null>(null);
  const [compareVersion, setCompareVersion] = useState<number | null>(null);

  const fetchSnapshots = useCallback(async () => {
    try {
      const res = await fetch(`/api/assessments/${assessmentId}/snapshots`);
      if (res.ok) {
        const json = await res.json() as { data: Snapshot[] };
        setSnapshots(json.data);
      }
    } finally {
      setLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => {
    void fetchSnapshots();
  }, [fetchSnapshots]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await fetch(`/api/assessments/${assessmentId}/snapshots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "Manual snapshot",
          label: `Snapshot v${snapshots.length + 1}`,
        }),
      });
      if (res.ok) {
        await fetchSnapshots();
      }
    } finally {
      setCreating(false);
    }
  };

  const handleCompare = async () => {
    if (baseVersion === null || compareVersion === null) return;
    setComparing(true);
    setCompareResult(null);
    try {
      const res = await fetch(
        `/api/assessments/${assessmentId}/snapshots/compare?baseVersion=${baseVersion}&compareVersion=${compareVersion}`,
      );
      if (res.ok) {
        const json = await res.json() as { data: { summary: DeltaSummary } };
        setCompareResult(json.data);
      }
    } finally {
      setComparing(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="h-24 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Snapshots</h1>
        <button
          onClick={() => void handleCreate()}
          disabled={creating}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 text-sm"
        >
          {creating ? "Creating..." : "Create Snapshot"}
        </button>
      </div>

      {snapshots.length === 0 ? (
        <div className="border rounded-lg p-8 text-center text-muted-foreground">
          No snapshots yet. Create one to capture the current assessment state.
        </div>
      ) : (
        <>
          <div className="grid gap-4">
            {snapshots.map((s) => (
              <SnapshotCard
                key={s.id}
                version={s.version}
                label={s.label ?? undefined}
                dataHash={s.dataHash}
                createdAt={s.createdAt}
                reason={s.reason}
              />
            ))}
          </div>

          {/* Compare section */}
          {snapshots.length >= 2 && (
            <div className="border rounded-lg p-4">
              <h2 className="text-lg font-semibold mb-3">Compare Snapshots</h2>
              <div className="flex items-end gap-3">
                <div>
                  <label className="text-sm text-muted-foreground block mb-1">Base Version</label>
                  <select
                    value={baseVersion ?? ""}
                    onChange={(e) => setBaseVersion(Number(e.target.value))}
                    className="border rounded px-3 py-1.5 text-sm"
                  >
                    <option value="">Select...</option>
                    {snapshots.map((s) => (
                      <option key={s.id} value={s.version}>
                        v{s.version}{s.label ? ` — ${s.label}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground block mb-1">Compare Version</label>
                  <select
                    value={compareVersion ?? ""}
                    onChange={(e) => setCompareVersion(Number(e.target.value))}
                    className="border rounded px-3 py-1.5 text-sm"
                  >
                    <option value="">Select...</option>
                    {snapshots.map((s) => (
                      <option key={s.id} value={s.version}>
                        v{s.version}{s.label ? ` — ${s.label}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => void handleCompare()}
                  disabled={comparing || baseVersion === null || compareVersion === null || baseVersion === compareVersion}
                  className="px-4 py-1.5 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90 disabled:opacity-50"
                >
                  {comparing ? "Comparing..." : "Compare"}
                </button>
              </div>

              {compareResult && (
                <div className="mt-4 border rounded p-3">
                  <h3 className="font-medium mb-2">Delta Summary ({compareResult.summary.totalChanges} total changes)</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">Scope</p>
                      <p className="text-green-600">+{compareResult.summary.scopeAdded}</p>
                      <p className="text-red-600">-{compareResult.summary.scopeRemoved}</p>
                      <p className="text-amber-600">~{compareResult.summary.scopeModified}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Gaps</p>
                      <p className="text-green-600">+{compareResult.summary.gapsAdded}</p>
                      <p className="text-red-600">-{compareResult.summary.gapsRemoved}</p>
                      <p className="text-amber-600">~{compareResult.summary.gapsModified}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Integrations</p>
                      <p className="text-green-600">+{compareResult.summary.integrationsAdded}</p>
                      <p className="text-red-600">-{compareResult.summary.integrationsRemoved}</p>
                      <p className="text-amber-600">~{compareResult.summary.integrationsModified}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Data Migration</p>
                      <p className="text-green-600">+{compareResult.summary.dmAdded}</p>
                      <p className="text-red-600">-{compareResult.summary.dmRemoved}</p>
                      <p className="text-amber-600">~{compareResult.summary.dmModified}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

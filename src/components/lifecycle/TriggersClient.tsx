"use client";

import { useEffect, useState, useCallback } from "react";

interface Trigger {
  id: string;
  triggerType: string;
  title: string;
  description: string;
  status: string;
  sourceReference: string | null;
  changeRequestId: string | null;
  detectedAt: string;
  resolvedAt: string | null;
  resolution: string | null;
}

interface TriggersClientProps {
  assessmentId: string;
}

const TRIGGER_TYPE_LABELS: Record<string, string> = {
  SAP_UPDATE: "SAP Update",
  REGULATORY_CHANGE: "Regulatory Change",
  ORG_CHANGE: "Organization Change",
  SCOPE_DRIFT: "Scope Drift",
  MANUAL: "Manual",
};

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-red-100 text-red-800",
  ACKNOWLEDGED: "bg-amber-100 text-amber-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  RESOLVED: "bg-green-100 text-green-800",
  DISMISSED: "bg-gray-100 text-gray-800",
};

export function TriggersClient({ assessmentId }: TriggersClientProps) {
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchTriggers = useCallback(async () => {
    try {
      const res = await fetch(`/api/assessments/${assessmentId}/triggers`);
      if (res.ok) {
        const json = await res.json() as { data: Trigger[] };
        setTriggers(json.data);
      }
    } finally {
      setLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => {
    void fetchTriggers();
  }, [fetchTriggers]);

  const handleStatusUpdate = async (triggerId: string, status: string, resolution?: string) => {
    setActionLoading(triggerId);
    try {
      const body: Record<string, string> = { status };
      if (resolution) body.resolution = resolution;

      const res = await fetch(`/api/assessments/${assessmentId}/triggers/${triggerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        await fetchTriggers();
      }
    } finally {
      setActionLoading(null);
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
      <h1 className="text-2xl font-bold">Reassessment Triggers</h1>

      {triggers.length === 0 ? (
        <div className="border rounded-lg p-8 text-center text-muted-foreground">
          No reassessment triggers detected. Triggers are created when external changes may impact the assessment.
        </div>
      ) : (
        <div className="space-y-4">
          {triggers.map((trigger) => (
            <div key={trigger.id} className="border rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[trigger.status] ?? "bg-muted"}`}>
                      {trigger.status}
                    </span>
                    <span className="text-xs bg-muted px-2 py-0.5 rounded">
                      {TRIGGER_TYPE_LABELS[trigger.triggerType] ?? trigger.triggerType}
                    </span>
                  </div>
                  <p className="font-medium">{trigger.title}</p>
                  <p className="text-sm text-muted-foreground mt-1">{trigger.description}</p>
                  {trigger.sourceReference && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Source: {trigger.sourceReference}
                    </p>
                  )}
                </div>

                {/* Actions based on status */}
                <div className="flex gap-2">
                  {trigger.status === "OPEN" && (
                    <button
                      onClick={() => void handleStatusUpdate(trigger.id, "ACKNOWLEDGED")}
                      disabled={actionLoading === trigger.id}
                      className="px-3 py-1.5 text-sm bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50"
                    >
                      Acknowledge
                    </button>
                  )}
                  {(trigger.status === "OPEN" || trigger.status === "ACKNOWLEDGED") && (
                    <>
                      <button
                        onClick={() => void handleStatusUpdate(trigger.id, "RESOLVED", "Addressed in assessment")}
                        disabled={actionLoading === trigger.id}
                        className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                      >
                        Resolve
                      </button>
                      <button
                        onClick={() => void handleStatusUpdate(trigger.id, "DISMISSED", "Not applicable")}
                        disabled={actionLoading === trigger.id}
                        className="px-3 py-1.5 text-sm border rounded hover:bg-muted disabled:opacity-50"
                      >
                        Dismiss
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                <span>Detected: {new Date(trigger.detectedAt).toLocaleDateString()}</span>
                {trigger.resolvedAt && (
                  <span>Resolved: {new Date(trigger.resolvedAt).toLocaleDateString()}</span>
                )}
                {trigger.resolution && (
                  <span>Resolution: {trigger.resolution}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

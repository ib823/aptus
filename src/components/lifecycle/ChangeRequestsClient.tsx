"use client";

import { useEffect, useState, useCallback } from "react";

interface ChangeRequest {
  id: string;
  status: string;
  reason: string;
  requestedById: string;
  requestedByName: string | null;
  previousSnapshotId: string;
  impactSummary: {
    riskLevel?: string;
    estimatedReworkDays?: number;
    affectedFunctionalAreas?: string[];
  };
  unlockedEntities: Array<{
    entityType: string;
    entityId: string;
    reason: string;
  }>;
  approvedById: string | null;
  approvedByName: string | null;
  rejectedReason: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface ChangeRequestsClientProps {
  assessmentId: string;
}

export function ChangeRequestsClient({ assessmentId }: ChangeRequestsClientProps) {
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    try {
      const res = await fetch(`/api/assessments/${assessmentId}/change-requests`);
      if (res.ok) {
        const json = await res.json() as { data: ChangeRequest[] };
        setRequests(json.data);
      }
    } finally {
      setLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => {
    void fetchRequests();
  }, [fetchRequests]);

  const handleAction = async (crId: string, action: "APPROVED" | "REJECTED") => {
    setActionLoading(crId);
    try {
      const res = await fetch(`/api/assessments/${assessmentId}/change-requests/${crId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: action }),
      });
      if (res.ok) {
        await fetchRequests();
      }
    } finally {
      setActionLoading(null);
    }
  };

  const statusColors: Record<string, string> = {
    REQUESTED: "bg-blue-50 text-blue-700",
    APPROVED: "bg-green-50 text-green-700",
    REJECTED: "bg-red-50 text-red-700",
    IN_PROGRESS: "bg-amber-50 text-amber-700",
    COMPLETED: "bg-slate-50 text-slate-700",
  };

  const riskColors: Record<string, string> = {
    low: "text-green-600",
    medium: "text-amber-600",
    high: "text-red-600",
    critical: "text-red-800 font-bold",
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-48" />
          <div className="h-24 bg-slate-200 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Change Requests</h1>

      {requests.length === 0 ? (
        <div className="border rounded-lg p-8 text-center text-muted-foreground">
          No change requests. Changes to a signed-off assessment require a formal change request.
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((cr) => (
            <div key={cr.id} className="border rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[cr.status] ?? "bg-muted"}`}>
                      {cr.status}
                    </span>
                    {cr.impactSummary.riskLevel && (
                      <span className={`text-xs ${riskColors[cr.impactSummary.riskLevel] ?? ""}`}>
                        {cr.impactSummary.riskLevel.toUpperCase()} risk
                      </span>
                    )}
                  </div>
                  <p className="font-medium">{cr.reason}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Requested by {cr.requestedByName ?? cr.requestedById} on{" "}
                    {new Date(cr.createdAt).toLocaleDateString()}
                  </p>
                </div>

                {cr.status === "REQUESTED" && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => void handleAction(cr.id, "APPROVED")}
                      disabled={actionLoading === cr.id}
                      className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => void handleAction(cr.id, "REJECTED")}
                      disabled={actionLoading === cr.id}
                      className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>

              {/* Impact summary */}
              <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                {cr.impactSummary.estimatedReworkDays !== undefined && (
                  <div>
                    <span className="text-muted-foreground">Est. Rework:</span>{" "}
                    <span className="font-medium">{cr.impactSummary.estimatedReworkDays} days</span>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Unlocked Entities:</span>{" "}
                  <span className="font-medium">{cr.unlockedEntities.length}</span>
                </div>
                {cr.impactSummary.affectedFunctionalAreas && cr.impactSummary.affectedFunctionalAreas.length > 0 && (
                  <div>
                    <span className="text-muted-foreground">Affected Areas:</span>{" "}
                    <span className="font-medium">{cr.impactSummary.affectedFunctionalAreas.join(", ")}</span>
                  </div>
                )}
              </div>

              {cr.approvedByName && (
                <p className="text-xs text-muted-foreground mt-2">
                  {cr.status === "APPROVED" ? "Approved" : "Reviewed"} by {cr.approvedByName}
                </p>
              )}
              {cr.rejectedReason && (
                <p className="text-xs text-red-600 mt-1">Rejection reason: {cr.rejectedReason}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { FileText, RefreshCw } from "lucide-react";

interface WorkshopMinutesViewerProps {
  assessmentId: string;
  sessionId: string;
  isFacilitator: boolean;
}

export function WorkshopMinutesViewer({
  assessmentId,
  sessionId,
  isFacilitator,
}: WorkshopMinutesViewerProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMinutes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/assessments/${assessmentId}/workshops/${sessionId}/minutes`,
      );
      if (res.ok) {
        const json = await res.json() as { data: { content: string } };
        setContent(json.data.content);
      } else if (res.status === 404) {
        setContent(null);
      }
    } catch {
      setError("Failed to load minutes");
    } finally {
      setLoading(false);
    }
  }, [assessmentId, sessionId]);

  const generateMinutes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/assessments/${assessmentId}/workshops/${sessionId}/minutes`,
        { method: "POST" },
      );
      if (res.ok) {
        const json = await res.json() as { data: { content: string } };
        setContent(json.data.content);
      } else {
        const err = await res.json() as { error?: { message?: string } };
        setError(err.error?.message ?? "Failed to generate minutes");
      }
    } catch {
      setError("Failed to generate minutes");
    } finally {
      setLoading(false);
    }
  }, [assessmentId, sessionId]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <FileText className="w-4 h-4" />
          Workshop Minutes
        </h3>
        <div className="flex gap-1">
          {content && (
            <Button variant="ghost" size="sm" onClick={() => void fetchMinutes()} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          )}
          {isFacilitator && (
            <Button size="sm" onClick={() => void generateMinutes()} disabled={loading}>
              {loading ? "Generating..." : content ? "Regenerate" : "Generate Minutes"}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-600 bg-red-50 rounded p-2">{error}</div>
      )}

      {content ? (
        <div className="border rounded-lg p-4 bg-card prose prose-sm max-w-none max-h-96 overflow-y-auto">
          <pre className="whitespace-pre-wrap text-sm font-sans">{content}</pre>
        </div>
      ) : !loading && (
        <div className="text-sm text-muted-foreground text-center py-6">
          {isFacilitator
            ? "Click \"Generate Minutes\" to create workshop minutes."
            : "Minutes have not been generated yet."}
        </div>
      )}
    </div>
  );
}

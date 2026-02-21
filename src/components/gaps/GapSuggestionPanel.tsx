"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Suggestion {
  patternId: string;
  resolutionType: string;
  description: string;
  effortDays?: number;
  riskLevel?: string;
  matchScore: number;
}

interface GapSuggestionPanelProps {
  assessmentId: string;
  gapId: string;
  onApply: (suggestion: Suggestion) => void;
}

export function GapSuggestionPanel({ assessmentId, gapId, onApply }: GapSuggestionPanelProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  const fetchSuggestions = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/assessments/${assessmentId}/gaps/${gapId}/suggest`);
      if (res.ok) {
        const json = await res.json();
        setSuggestions(json.data ?? []);
        setFetched(true);
      }
    } finally {
      setLoading(false);
    }
  }, [assessmentId, gapId, loading]);

  if (!fetched) {
    return (
      <Button variant="outline" size="sm" onClick={fetchSuggestions} disabled={loading}>
        {loading ? "Finding suggestions..." : "View Suggestions"}
      </Button>
    );
  }

  if (suggestions.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        No matching patterns found for this gap description.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Suggested Patterns
      </p>
      {suggestions.map((s) => (
        <div key={s.patternId} className="p-3 border rounded-md bg-muted/40">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="text-xs">
                  {s.resolutionType}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {Math.round(s.matchScore * 100)}% match
                </span>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2">{s.description}</p>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground/60">
                {s.effortDays && <span>{s.effortDays} days</span>}
                {s.riskLevel && <span>{s.riskLevel} risk</span>}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => onApply(s)}>
              Apply
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { Map } from "lucide-react";
import { FunctionalAreaMap } from "@/components/flow/FunctionalAreaMap";
import { FlowViewerClient } from "@/components/flow/FlowViewerClient";
import { Button } from "@/components/ui/button";
import type { FunctionalAreaOverviewData, InteractiveFlowData, RiskOverlayEntry } from "@/types/flow";

interface ProcessMapClientProps {
  assessmentId: string;
  initialScopeItemId: string | null;
  initialAreas?: FunctionalAreaOverviewData[];
}

interface FlowDataResponse {
  id: string | null;
  processFlowName: string;
  interactiveData: InteractiveFlowData;
  riskOverlayData?: RiskOverlayEntry[];
  thumbnailSvg?: string;
}

export function ProcessMapClient({ assessmentId, initialScopeItemId, initialAreas }: ProcessMapClientProps) {
  const [areas, setAreas] = useState<FunctionalAreaOverviewData[]>(initialAreas ?? []);
  const [selectedScopeItemId, setSelectedScopeItemId] = useState<string | null>(initialScopeItemId);
  const [flowData, setFlowData] = useState<FlowDataResponse | null>(null);
  const [loading, setLoading] = useState(!initialAreas);
  const [flowLoading, setFlowLoading] = useState(false);

  // Load area overview (skip if server-provided initial data — REM-24)
  useEffect(() => {
    if (initialAreas) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/assessments/${assessmentId}/flows/overview`);
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setAreas(json.data ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [assessmentId, initialAreas]);

  // Load flow data when scope item is selected
  useEffect(() => {
    if (!selectedScopeItemId) {
      setFlowData(null);
      return;
    }

    let cancelled = false;
    async function load() {
      setFlowLoading(true);
      try {
        const res = await fetch(
          `/api/assessments/${assessmentId}/flows/scope/${selectedScopeItemId}`,
        );
        if (!res.ok) return;
        const json = await res.json();
        const firstFlow = json.data?.[0];
        if (!cancelled && firstFlow) setFlowData(firstFlow);
      } finally {
        if (!cancelled) setFlowLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [assessmentId, selectedScopeItemId]);

  if (loading) {
    return (
      <div className="py-12 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  // If a scope item flow is selected, show the interactive viewer
  if (selectedScopeItemId && flowData) {
    return (
      <div>
        <button
          onClick={() => setSelectedScopeItemId(null)}
          className="text-sm text-primary hover:text-primary/80 mb-4"
        >
          &larr; Back to process map
        </button>

        {flowLoading ? (
          <div className="py-12 space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-24 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          <FlowViewerClient
            interactiveData={flowData.interactiveData}
            riskOverlayData={flowData.riskOverlayData}
            assessmentId={assessmentId}
          />
        )}
      </div>
    );
  }

  // Empty state when no areas/scope items exist
  if (areas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Map className="w-12 h-12 text-muted-foreground/40 mb-4" />
        <h2 className="text-lg font-semibold text-foreground mb-2">
          No process areas to display
        </h2>
        <p className="text-sm text-muted-foreground mb-6 max-w-md">
          Select scope items first to generate the process map. Each selected scope item contributes functional areas to this view.
        </p>
        <a href={`/assessment/${assessmentId}/scope`}>
          <Button variant="outline">Go to Scope Selection</Button>
        </a>
      </div>
    );
  }

  return (
    <FunctionalAreaMap
      areas={areas}
      assessmentId={assessmentId}
    />
  );
}

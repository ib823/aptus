"use client";

import { useState, useEffect } from "react";
import { FunctionalAreaMap } from "@/components/flow/FunctionalAreaMap";
import { FlowViewerClient } from "@/components/flow/FlowViewerClient";
import type { FunctionalAreaOverviewData, InteractiveFlowData, RiskOverlayEntry } from "@/types/flow";

interface ProcessMapClientProps {
  assessmentId: string;
  initialScopeItemId: string | null;
}

interface FlowDataResponse {
  id: string | null;
  processFlowName: string;
  interactiveData: InteractiveFlowData;
  riskOverlayData?: RiskOverlayEntry[];
  thumbnailSvg?: string;
}

export function ProcessMapClient({ assessmentId, initialScopeItemId }: ProcessMapClientProps) {
  const [areas, setAreas] = useState<FunctionalAreaOverviewData[]>([]);
  const [selectedScopeItemId, setSelectedScopeItemId] = useState<string | null>(initialScopeItemId);
  const [flowData, setFlowData] = useState<FlowDataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [flowLoading, setFlowLoading] = useState(false);

  // Load area overview
  useEffect(() => {
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
  }, [assessmentId]);

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
    return <div className="py-12 text-center text-muted-foreground">Loading process map...</div>;
  }

  // If a scope item flow is selected, show the interactive viewer
  if (selectedScopeItemId && flowData) {
    return (
      <div>
        <button
          onClick={() => setSelectedScopeItemId(null)}
          className="text-sm text-blue-500 hover:text-blue-600 mb-4"
        >
          &larr; Back to process map
        </button>

        {flowLoading ? (
          <div className="py-12 text-center text-muted-foreground">Loading flow...</div>
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

  return (
    <FunctionalAreaMap
      areas={areas}
      assessmentId={assessmentId}
    />
  );
}

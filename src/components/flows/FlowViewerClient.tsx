"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, Download, RefreshCw, ChevronRight, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { sanitizeSvgContent } from "@/lib/security/sanitize";

interface DiagramInfo {
  id: string;
  scopeItemId: string;
  scopeItemName: string;
  processFlowName: string;
  stepCount: number;
  fitCount: number;
  configureCount: number;
  gapCount: number;
  naCount: number;
  pendingCount: number;
  generatedAt: string;
}

interface FlowViewerClientProps {
  assessmentId: string;
  diagrams: DiagramInfo[];
}

export function FlowViewerClient({ assessmentId, diagrams: initialDiagrams }: FlowViewerClientProps) {
  const [diagrams, setDiagrams] = useState(initialDiagrams);
  const [selectedId, setSelectedId] = useState<string | null>(initialDiagrams[0]?.id ?? null);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [loadingSvg, setLoadingSvg] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [scopeFilter, setScopeFilter] = useState<string>("all");

  // Group diagrams by scope item
  const scopeItems = useMemo(() => {
    const map = new Map<string, { id: string; name: string; diagrams: DiagramInfo[] }>();
    for (const d of diagrams) {
      const existing = map.get(d.scopeItemId);
      if (existing) {
        existing.diagrams.push(d);
      } else {
        map.set(d.scopeItemId, { id: d.scopeItemId, name: d.scopeItemName, diagrams: [d] });
      }
    }
    return [...map.values()];
  }, [diagrams]);

  const filteredScopeItems = useMemo(() => {
    if (scopeFilter === "all") return scopeItems;
    return scopeItems.filter((s) => s.id === scopeFilter);
  }, [scopeItems, scopeFilter]);

  const selectedDiagram = useMemo(
    () => diagrams.find((d) => d.id === selectedId) ?? null,
    [diagrams, selectedId],
  );

  const loadSvg = async (flowId: string) => {
    setSelectedId(flowId);
    setSvgContent(null);
    setLoadingSvg(true);
    try {
      const res = await fetch(`/api/assessments/${assessmentId}/flows/${flowId}`);
      if (res.ok) {
        const svg = await res.text();
        setSvgContent(svg);
      }
    } finally {
      setLoadingSvg(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/assessments/${assessmentId}/flows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate: false }),
      });
      if (res.ok) {
        // Refresh diagram list
        const listRes = await fetch(`/api/assessments/${assessmentId}/flows`);
        if (listRes.ok) {
          const data = await listRes.json() as { data: DiagramInfo[] };
          setDiagrams(data.data);
          if (data.data.length > 0 && !selectedId) {
            const first = data.data[0];
            if (first) {
              void loadSvg(first.id);
            }
          }
        }
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleRegenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/assessments/${assessmentId}/flows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate: true }),
      });
      if (res.ok) {
        const listRes = await fetch(`/api/assessments/${assessmentId}/flows`);
        if (listRes.ok) {
          const data = await listRes.json() as { data: DiagramInfo[] };
          setDiagrams(data.data);
          if (selectedId) {
            void loadSvg(selectedId);
          }
        }
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadPdf = (flowId: string) => {
    window.open(`/api/assessments/${assessmentId}/flows/${flowId}/pdf`, "_blank");
  };

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        title="Process Flow Diagrams"
        description="Visual representation of process flows with fit analysis status"
        actions={
          <div className="flex gap-2">
            {diagrams.length === 0 ? (
              <Button onClick={() => void handleGenerate()} disabled={generating}>
                {generating ? "Generating..." : "Generate Diagrams"}
              </Button>
            ) : (
              <Button variant="outline" onClick={() => void handleRegenerate()} disabled={generating}>
                <RefreshCw className={`w-4 h-4 mr-1.5 ${generating ? "animate-spin" : ""}`} />
                {generating ? "Regenerating..." : "Regenerate All"}
              </Button>
            )}
          </div>
        }
      />

      {diagrams.length === 0 ? (
        <EmptyState
          title="No Flow Diagrams"
          description="Generate flow diagrams from your assessed process steps to visualize the fit analysis."
        />
      ) : (
        <div className="flex gap-6">
          {/* Sidebar */}
          <div className="hidden sm:block w-72 shrink-0">
            <div className="mb-3">
              <select
                value={scopeFilter}
                onChange={(e) => setScopeFilter(e.target.value)}
                className="w-full border rounded-md px-2 py-1.5 text-sm"
              >
                <option value="all">All Scope Items ({diagrams.length})</option>
                {scopeItems.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.diagrams.length})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1 max-h-[calc(100vh-280px)] overflow-y-auto">
              {filteredScopeItems.map((scope) => (
                <div key={scope.id}>
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2 py-1.5 bg-muted/40 rounded">
                    {scope.name}
                  </div>
                  {scope.diagrams.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => void loadSvg(d.id)}
                      className={`w-full text-left px-2 py-2 rounded text-sm flex items-center gap-2 ${
                        selectedId === d.id
                          ? "bg-gray-950 text-white"
                          : "hover:bg-accent text-muted-foreground"
                      }`}
                    >
                      <ChevronRight className="w-3 h-3 shrink-0" />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{d.processFlowName}</p>
                        <p className={`text-xs ${selectedId === d.id ? "text-gray-400" : "text-muted-foreground"}`}>
                          {d.stepCount} steps
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Main area */}
          <div className="flex-1 min-w-0">
            {selectedDiagram && (
              <>
                {/* Diagram header */}
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">
                      {selectedDiagram.processFlowName}
                    </h3>
                    <p className="text-sm text-muted-foreground">{selectedDiagram.scopeItemName}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDownloadPdf(selectedDiagram.id)}
                    >
                      <Download className="w-3.5 h-3.5 mr-1" />
                      PDF
                    </Button>
                  </div>
                </div>

                {/* Status badges */}
                <div className="flex gap-2 mb-4">
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    FIT: {selectedDiagram.fitCount}
                  </Badge>
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                    CONFIGURE: {selectedDiagram.configureCount}
                  </Badge>
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                    GAP: {selectedDiagram.gapCount}
                  </Badge>
                  <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200">
                    N/A: {selectedDiagram.naCount}
                  </Badge>
                  {selectedDiagram.pendingCount > 0 && (
                    <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200">
                      PENDING: {selectedDiagram.pendingCount}
                    </Badge>
                  )}
                </div>

                {/* SVG viewer */}
                <div className="border rounded-lg bg-card overflow-auto max-h-[calc(100vh-380px)]">
                  {loadingSvg ? (
                    <div className="flex items-center justify-center h-64 text-muted-foreground/60">
                      <BarChart3 className="w-6 h-6 animate-pulse mr-2" />
                      Loading diagram...
                    </div>
                  ) : svgContent ? (
                    <div
                      className="p-4"
                      dangerouslySetInnerHTML={{ __html: sanitizeSvgContent(svgContent) }}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-64 text-muted-foreground/60 text-sm">
                      Select a flow to view its diagram
                    </div>
                  )}
                </div>

                <p className="text-xs text-muted-foreground/60 mt-2">
                  Generated: {new Date(selectedDiagram.generatedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-6 mt-8 border-t border">
        <Link href={`/assessment/${assessmentId}/config`}>
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Configuration Matrix
          </Button>
        </Link>
        <div className="flex gap-3">
          <Link href={`/assessment/${assessmentId}/remaining`}>
            <Button variant="outline">Remaining Items</Button>
          </Link>
          <Link href={`/assessment/${assessmentId}/report`}>
            <Button>Report &amp; Sign-Off</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

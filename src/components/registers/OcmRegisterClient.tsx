"use client";

import { useState, useMemo, useCallback } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { OcmFormDialog } from "@/components/registers/OcmFormDialog";
import { OcmSummary } from "@/components/registers/OcmSummary";
import { OcmHeatmap } from "@/components/registers/OcmHeatmap";
import {
  OCM_CHANGE_TYPE_OPTIONS,
  OCM_SEVERITY_OPTIONS,
  OCM_STATUS_OPTIONS,
} from "@/constants/register-options";

interface OcmData {
  id: string;
  impactedRole: string;
  impactedDepartment: string | null;
  functionalArea: string | null;
  changeType: string;
  severity: string;
  description: string;
  trainingRequired: boolean;
  trainingType: string | null;
  trainingDuration: number | null;
  communicationPlan: string | null;
  resistanceRisk: string | null;
  readinessScore: number | null;
  mitigationStrategy: string | null;
  priority: string | null;
  status: string;
  technicalNotes: string | null;
  scopeItemId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface SummaryData {
  total: number;
  byChangeType: Record<string, number>;
  bySeverity: Record<string, number>;
  byStatus: Record<string, number>;
  weightedReadiness: number;
  trainingCount: number;
}

interface HeatmapCell {
  role: string;
  area: string;
  severity: string;
  count: number;
}

interface OcmRegisterClientProps {
  assessmentId: string;
  assessmentStatus: string;
  initialData: OcmData[];
  initialSummary: SummaryData;
  initialHeatmap: HeatmapCell[];
}

export function OcmRegisterClient({
  assessmentId,
  assessmentStatus,
  initialData,
  initialSummary,
  initialHeatmap,
}: OcmRegisterClientProps) {
  const [items, setItems] = useState(initialData);
  const [summary, setSummary] = useState(initialSummary);
  const [heatmap, setHeatmap] = useState(initialHeatmap);
  const [changeTypeFilter, setChangeTypeFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<OcmData | undefined>(undefined);
  const [activeTab, setActiveTab] = useState("table");

  const isReadOnly = assessmentStatus === "signed_off" || assessmentStatus === "reviewed";

  const filteredItems = useMemo(() => {
    let result = items;
    if (changeTypeFilter !== "all") result = result.filter((i) => i.changeType === changeTypeFilter);
    if (severityFilter !== "all") result = result.filter((i) => i.severity === severityFilter);
    if (statusFilter !== "all") result = result.filter((i) => i.status === statusFilter);
    return result;
  }, [items, changeTypeFilter, severityFilter, statusFilter]);

  const refreshData = useCallback(async () => {
    try {
      const [listRes, summaryRes, heatmapRes] = await Promise.all([
        fetch(`/api/assessments/${assessmentId}/ocm?limit=200`),
        fetch(`/api/assessments/${assessmentId}/ocm/summary`),
        fetch(`/api/assessments/${assessmentId}/ocm/heatmap`),
      ]);
      if (listRes.ok) {
        const listData = await listRes.json();
        setItems(listData.data);
      }
      if (summaryRes.ok) {
        const summaryData = await summaryRes.json();
        setSummary(summaryData.data);
      }
      if (heatmapRes.ok) {
        const heatmapData = await heatmapRes.json();
        setHeatmap(heatmapData.data);
      }
    } catch {
      // silently fail
    }
  }, [assessmentId]);

  const handleSaved = useCallback(() => {
    setFormOpen(false);
    setEditingItem(undefined);
    refreshData();
  }, [refreshData]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await fetch(`/api/assessments/${assessmentId}/ocm/${id}`, { method: "DELETE" });
      refreshData();
    } catch {
      // silently fail
    }
  }, [assessmentId, refreshData]);

  const severityColor: Record<string, string> = {
    LOW: "bg-green-100 text-green-700",
    MEDIUM: "bg-amber-100 text-amber-700",
    HIGH: "bg-orange-100 text-orange-700",
    TRANSFORMATIONAL: "bg-red-100 text-red-700",
  };

  return (
    <div className="flex gap-8">
      <div className="hidden lg:block w-[280px] shrink-0">
        <div className="sticky top-8">
          <OcmSummary summary={summary} />
        </div>
      </div>

      <div className="flex-1 max-w-4xl">
        <PageHeader
          title="OCM Impact Register"
          description={`${summary.total} change impact${summary.total !== 1 ? "s" : ""} documented.`}
          actions={
            !isReadOnly ? (
              <Button onClick={() => { setEditingItem(undefined); setFormOpen(true); }}>
                <Plus className="w-4 h-4 mr-1.5" />
                Add Impact
              </Button>
            ) : undefined
          }
        />

        <div className="flex flex-wrap items-center gap-3 mb-6">
          <select value={changeTypeFilter} onChange={(e) => setChangeTypeFilter(e.target.value)} className="h-9 px-3 text-xs border border-gray-200 rounded-md bg-white text-gray-700">
            <option value="all">All Change Types</option>
            {OCM_CHANGE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} className="h-9 px-3 text-xs border border-gray-200 rounded-md bg-white text-gray-700">
            <option value="all">All Severities</option>
            {OCM_SEVERITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9 px-3 text-xs border border-gray-200 rounded-md bg-white text-gray-700">
            <option value="all">All Statuses</option>
            {OCM_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="table">Table View</TabsTrigger>
            <TabsTrigger value="heatmap">Heatmap View</TabsTrigger>
          </TabsList>

          <TabsContent value="table" className="mt-4">
            {filteredItems.length === 0 ? (
              <EmptyState
                title="No OCM impacts"
                description={items.length === 0
                  ? "No change impacts have been documented yet."
                  : "No impacts match your current filters."}
              />
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Role / Area</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Change Type</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Severity</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Readiness</th>
                      {!isReadOnly && <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredItems.map((item) => (
                      <tr key={item.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <div className="font-medium">{item.impactedRole}</div>
                          <div className="text-xs text-muted-foreground">{item.functionalArea ?? "Unassigned"}</div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">{item.changeType.replace(/_/g, " ")}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={severityColor[item.severity] ?? "bg-gray-100"}>{item.severity}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">{item.status}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          {item.readinessScore !== null ? (
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-600 rounded-full" style={{ width: `${item.readinessScore * 100}%` }} />
                              </div>
                              <span className="text-xs text-muted-foreground">{Math.round(item.readinessScore * 100)}%</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">N/A</span>
                          )}
                        </td>
                        {!isReadOnly && (
                          <td className="px-4 py-3 text-right space-x-2">
                            <Button variant="ghost" size="sm" onClick={() => { setEditingItem(item); setFormOpen(true); }}>Edit</Button>
                            <Button variant="ghost" size="sm" className="text-red-600" onClick={() => handleDelete(item.id)}>Delete</Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="heatmap" className="mt-4">
            <OcmHeatmap data={heatmap} onCellClick={() => {
              setChangeTypeFilter("all");
              setSeverityFilter("all");
              setStatusFilter("all");
              setActiveTab("table");
            }} />
          </TabsContent>
        </Tabs>
      </div>

      <OcmFormDialog
        assessmentId={assessmentId}
        impact={editingItem}
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditingItem(undefined); }}
        onSaved={handleSaved}
      />
    </div>
  );
}

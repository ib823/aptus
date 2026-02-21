"use client";

import { useState, useMemo, useCallback } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { IntegrationFormDialog } from "@/components/registers/IntegrationFormDialog";
import { IntegrationSummary } from "@/components/registers/IntegrationSummary";
import {
  INTEGRATION_DIRECTION_OPTIONS,
  INTERFACE_TYPE_OPTIONS,
  INTEGRATION_STATUS_OPTIONS,
  PRIORITY_OPTIONS,
} from "@/constants/register-options";

interface IntegrationData {
  id: string;
  name: string;
  description: string;
  direction: string;
  sourceSystem: string;
  targetSystem: string;
  interfaceType: string;
  frequency: string;
  middleware: string | null;
  complexity: string | null;
  priority: string | null;
  status: string;
  technicalNotes: string | null;
  scopeItemId: string | null;
  dataVolume: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface SummaryData {
  total: number;
  byDirection: Record<string, number>;
  byStatus: Record<string, number>;
  byComplexity: Record<string, number>;
  byInterfaceType: Record<string, number>;
}

interface IntegrationRegisterClientProps {
  assessmentId: string;
  assessmentStatus: string;
  initialData: IntegrationData[];
  initialSummary: SummaryData;
}

export function IntegrationRegisterClient({
  assessmentId,
  assessmentStatus,
  initialData,
  initialSummary,
}: IntegrationRegisterClientProps) {
  const [items, setItems] = useState(initialData);
  const [summary, setSummary] = useState(initialSummary);
  const [directionFilter, setDirectionFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<IntegrationData | undefined>(undefined);

  const isReadOnly = assessmentStatus === "signed_off" || assessmentStatus === "reviewed";

  const filteredItems = useMemo(() => {
    let result = items;
    if (directionFilter !== "all") result = result.filter((i) => i.direction === directionFilter);
    if (typeFilter !== "all") result = result.filter((i) => i.interfaceType === typeFilter);
    if (statusFilter !== "all") result = result.filter((i) => i.status === statusFilter);
    if (priorityFilter !== "all") result = result.filter((i) => i.priority === priorityFilter);
    return result;
  }, [items, directionFilter, typeFilter, statusFilter, priorityFilter]);

  const refreshData = useCallback(async () => {
    try {
      const [listRes, summaryRes] = await Promise.all([
        fetch(`/api/assessments/${assessmentId}/integrations?limit=200`),
        fetch(`/api/assessments/${assessmentId}/integrations/summary`),
      ]);
      if (listRes.ok) {
        const listData = await listRes.json();
        setItems(listData.data);
      }
      if (summaryRes.ok) {
        const summaryData = await summaryRes.json();
        setSummary(summaryData.data);
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
      await fetch(`/api/assessments/${assessmentId}/integrations/${id}`, { method: "DELETE" });
      refreshData();
    } catch {
      // silently fail
    }
  }, [assessmentId, refreshData]);

  const directionColor: Record<string, string> = {
    INBOUND: "bg-blue-100 text-blue-700",
    OUTBOUND: "bg-green-100 text-green-700",
    BIDIRECTIONAL: "bg-purple-100 text-purple-700",
  };

  const statusColor: Record<string, string> = {
    identified: "bg-gray-100 text-gray-700",
    analyzed: "bg-blue-100 text-blue-700",
    designed: "bg-amber-100 text-amber-700",
    approved: "bg-green-100 text-green-700",
  };

  return (
    <div className="flex gap-8">
      <div className="hidden lg:block w-[280px] shrink-0">
        <div className="sticky top-8">
          <IntegrationSummary summary={summary} />
        </div>
      </div>

      <div className="flex-1 max-w-4xl">
        <PageHeader
          title="Integration Register"
          description={`${summary.total} integration point${summary.total !== 1 ? "s" : ""} documented.`}
          actions={
            !isReadOnly ? (
              <Button onClick={() => { setEditingItem(undefined); setFormOpen(true); }}>
                <Plus className="w-4 h-4 mr-1.5" />
                Add Integration
              </Button>
            ) : undefined
          }
        />

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <select value={directionFilter} onChange={(e) => setDirectionFilter(e.target.value)} className="h-9 px-3 text-xs border border-gray-200 rounded-md bg-white text-gray-700">
            <option value="all">All Directions</option>
            {INTEGRATION_DIRECTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="h-9 px-3 text-xs border border-gray-200 rounded-md bg-white text-gray-700">
            <option value="all">All Types</option>
            {INTERFACE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9 px-3 text-xs border border-gray-200 rounded-md bg-white text-gray-700">
            <option value="all">All Statuses</option>
            {INTEGRATION_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="h-9 px-3 text-xs border border-gray-200 rounded-md bg-white text-gray-700">
            <option value="all">All Priorities</option>
            {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Table */}
        {filteredItems.length === 0 ? (
          <EmptyState
            title="No integration points"
            description={items.length === 0
              ? "No integration points have been documented yet."
              : "No integration points match your current filters."}
          />
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Direction</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Priority</th>
                  {!isReadOnly && <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-muted-foreground">{item.sourceSystem} &rarr; {item.targetSystem}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={directionColor[item.direction] ?? "bg-gray-100"}>{item.direction}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{item.interfaceType}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={statusColor[item.status] ?? "bg-gray-100"}>{item.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {item.priority && <Badge variant="outline">{item.priority}</Badge>}
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
      </div>

      <IntegrationFormDialog
        assessmentId={assessmentId}
        integration={editingItem}
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditingItem(undefined); }}
        onSaved={handleSaved}
      />
    </div>
  );
}

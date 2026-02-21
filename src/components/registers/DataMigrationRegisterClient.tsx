"use client";

import { useState, useMemo, useCallback } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { DataMigrationFormDialog } from "@/components/registers/DataMigrationFormDialog";
import { DataMigrationSummary } from "@/components/registers/DataMigrationSummary";
import {
  DATA_MIGRATION_OBJECT_TYPE_OPTIONS,
  DATA_MIGRATION_STATUS_OPTIONS,
  PRIORITY_OPTIONS,
} from "@/constants/register-options";

interface DataMigrationData {
  id: string;
  objectName: string;
  description: string;
  objectType: string;
  sourceSystem: string;
  sourceFormat: string | null;
  volumeEstimate: string | null;
  recordCount: number | null;
  cleansingRequired: boolean;
  cleansingNotes: string | null;
  mappingComplexity: string | null;
  migrationApproach: string | null;
  migrationTool: string | null;
  validationRules: string | null;
  priority: string | null;
  status: string;
  dependsOn: string[];
  technicalNotes: string | null;
  scopeItemId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface SummaryData {
  total: number;
  byObjectType: Record<string, number>;
  byStatus: Record<string, number>;
  byMappingComplexity: Record<string, number>;
  totalRecordCount: number;
}

interface DataMigrationRegisterClientProps {
  assessmentId: string;
  assessmentStatus: string;
  initialData: DataMigrationData[];
  initialSummary: SummaryData;
}

export function DataMigrationRegisterClient({
  assessmentId,
  assessmentStatus,
  initialData,
  initialSummary,
}: DataMigrationRegisterClientProps) {
  const [items, setItems] = useState(initialData);
  const [summary, setSummary] = useState(initialSummary);
  const [objectTypeFilter, setObjectTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DataMigrationData | undefined>(undefined);

  const isReadOnly = assessmentStatus === "signed_off" || assessmentStatus === "reviewed";

  const filteredItems = useMemo(() => {
    let result = items;
    if (objectTypeFilter !== "all") result = result.filter((i) => i.objectType === objectTypeFilter);
    if (statusFilter !== "all") result = result.filter((i) => i.status === statusFilter);
    if (priorityFilter !== "all") result = result.filter((i) => i.priority === priorityFilter);
    return result;
  }, [items, objectTypeFilter, statusFilter, priorityFilter]);

  const refreshData = useCallback(async () => {
    try {
      const [listRes, summaryRes] = await Promise.all([
        fetch(`/api/assessments/${assessmentId}/data-migration?limit=200`),
        fetch(`/api/assessments/${assessmentId}/data-migration/summary`),
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
      await fetch(`/api/assessments/${assessmentId}/data-migration/${id}`, { method: "DELETE" });
      refreshData();
    } catch {
      // silently fail
    }
  }, [assessmentId, refreshData]);

  const objectTypeColor: Record<string, string> = {
    MASTER_DATA: "bg-blue-100 text-blue-700",
    TRANSACTION_DATA: "bg-green-100 text-green-700",
    CONFIG_DATA: "bg-amber-100 text-amber-700",
    HISTORICAL: "bg-purple-100 text-purple-700",
    REFERENCE: "bg-gray-100 text-gray-700",
  };

  return (
    <div className="flex gap-8">
      <div className="hidden lg:block w-[280px] shrink-0">
        <div className="sticky top-8">
          <DataMigrationSummary summary={summary} />
        </div>
      </div>

      <div className="flex-1 max-w-4xl">
        <PageHeader
          title="Data Migration Register"
          description={`${summary.total} migration object${summary.total !== 1 ? "s" : ""} documented.`}
          actions={
            !isReadOnly ? (
              <Button onClick={() => { setEditingItem(undefined); setFormOpen(true); }}>
                <Plus className="w-4 h-4 mr-1.5" />
                Add Migration Object
              </Button>
            ) : undefined
          }
        />

        <div className="flex flex-wrap items-center gap-3 mb-6">
          <select value={objectTypeFilter} onChange={(e) => setObjectTypeFilter(e.target.value)} className="h-9 px-3 text-xs border border-gray-200 rounded-md bg-white text-gray-700">
            <option value="all">All Object Types</option>
            {DATA_MIGRATION_OBJECT_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9 px-3 text-xs border border-gray-200 rounded-md bg-white text-gray-700">
            <option value="all">All Statuses</option>
            {DATA_MIGRATION_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="h-9 px-3 text-xs border border-gray-200 rounded-md bg-white text-gray-700">
            <option value="all">All Priorities</option>
            {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {filteredItems.length === 0 ? (
          <EmptyState
            title="No migration objects"
            description={items.length === 0
              ? "No data migration objects have been documented yet."
              : "No objects match your current filters."}
          />
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Object Name</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Source</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Deps</th>
                  {!isReadOnly && <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="font-medium">{item.objectName}</div>
                      {item.cleansingRequired && <span className="text-xs text-amber-600">Cleansing required</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={objectTypeColor[item.objectType] ?? "bg-gray-100"}>{item.objectType.replace(/_/g, " ")}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{item.sourceSystem}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{item.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {item.dependsOn.length > 0 && <Badge variant="outline">{item.dependsOn.length}</Badge>}
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

      <DataMigrationFormDialog
        assessmentId={assessmentId}
        object={editingItem}
        allObjects={items.map((i) => ({ id: i.id, objectName: i.objectName }))}
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditingItem(undefined); }}
        onSaved={handleSaved}
      />
    </div>
  );
}

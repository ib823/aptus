"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DATA_MIGRATION_OBJECT_TYPE_OPTIONS,
  SOURCE_FORMAT_OPTIONS,
  VOLUME_ESTIMATE_OPTIONS,
  MAPPING_COMPLEXITY_OPTIONS,
  MIGRATION_APPROACH_OPTIONS,
  MIGRATION_TOOL_OPTIONS,
  DATA_MIGRATION_STATUS_OPTIONS,
  PRIORITY_OPTIONS,
} from "@/constants/register-options";

interface DataMigrationFormDialogProps {
  assessmentId: string;
  object?: { id: string; objectName: string; description: string; objectType: string; sourceSystem: string; sourceFormat: string | null; volumeEstimate: string | null; recordCount: number | null; cleansingRequired: boolean; cleansingNotes: string | null; mappingComplexity: string | null; migrationApproach: string | null; migrationTool: string | null; validationRules: string | null; priority: string | null; status: string; dependsOn: string[]; technicalNotes: string | null } | undefined;
  allObjects: { id: string; objectName: string }[];
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function DataMigrationFormDialog({
  assessmentId,
  object,
  allObjects,
  open,
  onClose,
  onSaved,
}: DataMigrationFormDialogProps) {
  const isEdit = !!object;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [objectName, setObjectName] = useState(object?.objectName ?? "");
  const [description, setDescription] = useState(object?.description ?? "");
  const [objectType, setObjectType] = useState(object?.objectType ?? "");
  const [sourceSystem, setSourceSystem] = useState(object?.sourceSystem ?? "");
  const [sourceFormat, setSourceFormat] = useState(object?.sourceFormat ?? "");
  const [volumeEstimate, setVolumeEstimate] = useState(object?.volumeEstimate ?? "");
  const [mappingComplexity, setMappingComplexity] = useState(object?.mappingComplexity ?? "");
  const [migrationApproach, setMigrationApproach] = useState(object?.migrationApproach ?? "");
  const [migrationTool, setMigrationTool] = useState(object?.migrationTool ?? "");
  const [priority, setPriority] = useState(object?.priority ?? "");
  const [status, setStatus] = useState(object?.status ?? "identified");
  const [technicalNotes, setTechnicalNotes] = useState(object?.technicalNotes ?? "");
  const [cleansingRequired, setCleansingRequired] = useState(object?.cleansingRequired ?? false);
  const [cleansingNotes, setCleansingNotes] = useState(object?.cleansingNotes ?? "");
  const [dependsOn, setDependsOn] = useState<string[]>(object?.dependsOn ?? []);

  // Filter out the current object from dependency candidates
  const dependencyCandidates = allObjects.filter((o) => o.id !== object?.id);

  const handleSubmit = async () => {
    if (!objectName || !description || !objectType || !sourceSystem) {
      setError("Please fill in all required fields.");
      return;
    }

    setSaving(true);
    setError(null);

    const body: Record<string, unknown> = {
      objectName,
      description,
      objectType,
      sourceSystem,
      cleansingRequired,
    };

    if (sourceFormat) body.sourceFormat = sourceFormat;
    if (volumeEstimate) body.volumeEstimate = volumeEstimate;
    if (mappingComplexity) body.mappingComplexity = mappingComplexity;
    if (migrationApproach) body.migrationApproach = migrationApproach;
    if (migrationTool) body.migrationTool = migrationTool;
    if (priority) body.priority = priority;
    if (technicalNotes) body.technicalNotes = technicalNotes;
    if (cleansingRequired && cleansingNotes) body.cleansingNotes = cleansingNotes;
    if (dependsOn.length > 0) body.dependsOn = dependsOn;
    if (isEdit) body.status = status;

    try {
      const url = isEdit
        ? `/api/assessments/${assessmentId}/data-migration/${object.id}`
        : `/api/assessments/${assessmentId}/data-migration`;

      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        setError("Failed to save migration object. Please try again.");
        setSaving(false);
        return;
      }

      setSaving(false);
      onSaved();
    } catch {
      setError("Network error");
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Migration Object" : "Add Migration Object"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>}

          <div>
            <Label>Object Name *</Label>
            <Input value={objectName} onChange={(e) => setObjectName(e.target.value)} placeholder="e.g., Customer Master" className="mt-1" />
          </div>

          <div>
            <Label>Description *</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the migration object..." className="mt-1 min-h-[72px]" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Object Type *</Label>
              <Select value={objectType} onValueChange={setObjectType}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {DATA_MIGRATION_OBJECT_TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Source System *</Label>
              <Input value={sourceSystem} onChange={(e) => setSourceSystem(e.target.value)} placeholder="e.g., SAP ECC" className="mt-1" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Source Format</Label>
              <Select value={sourceFormat} onValueChange={setSourceFormat}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Format" /></SelectTrigger>
                <SelectContent>
                  {SOURCE_FORMAT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Volume Estimate</Label>
              <Select value={volumeEstimate} onValueChange={setVolumeEstimate}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Volume" /></SelectTrigger>
                <SelectContent>
                  {VOLUME_ESTIMATE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Mapping Complexity</Label>
              <Select value={mappingComplexity} onValueChange={setMappingComplexity}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Complexity" /></SelectTrigger>
                <SelectContent>
                  {MAPPING_COMPLEXITY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Migration Approach</Label>
              <Select value={migrationApproach} onValueChange={setMigrationApproach}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Approach" /></SelectTrigger>
                <SelectContent>
                  {MIGRATION_APPROACH_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Migration Tool</Label>
              <Select value={migrationTool} onValueChange={setMigrationTool}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Tool" /></SelectTrigger>
                <SelectContent>
                  {MIGRATION_TOOL_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Priority" /></SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isEdit && (
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  {DATA_MIGRATION_STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input type="checkbox" checked={cleansingRequired} onChange={(e) => setCleansingRequired(e.target.checked)} id="cleansingRequired" className="rounded border-slate-300" />
            <Label htmlFor="cleansingRequired">Cleansing Required</Label>
          </div>

          {cleansingRequired && (
            <div>
              <Label>Cleansing Notes</Label>
              <Textarea value={cleansingNotes} onChange={(e) => setCleansingNotes(e.target.value)} placeholder="Describe cleansing requirements..." className="mt-1" />
            </div>
          )}

          {dependencyCandidates.length > 0 && (
            <div>
              <Label>Depends On</Label>
              <p className="text-xs text-muted-foreground mb-2">Select objects that must be migrated before this one</p>
              <div className="border rounded-md p-3 max-h-[160px] overflow-y-auto space-y-2">
                {dependencyCandidates.map((candidate) => (
                  <div key={candidate.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`dep-${candidate.id}`}
                      checked={dependsOn.includes(candidate.id)}
                      onCheckedChange={(checked) => {
                        setDependsOn((prev) =>
                          checked ? [...prev, candidate.id] : prev.filter((id) => id !== candidate.id),
                        );
                      }}
                    />
                    <label htmlFor={`dep-${candidate.id}`} className="text-sm cursor-pointer">
                      {candidate.objectName}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label>Technical Notes</Label>
            <Textarea value={technicalNotes} onChange={(e) => setTechnicalNotes(e.target.value)} placeholder="Optional notes..." className="mt-1" />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving ?? false}>
              {saving ? "Saving..." : isEdit ? "Update" : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  OCM_CHANGE_TYPE_OPTIONS,
  OCM_SEVERITY_OPTIONS,
  TRAINING_TYPE_OPTIONS,
  RESISTANCE_RISK_OPTIONS,
  OCM_STATUS_OPTIONS,
  PRIORITY_OPTIONS,
} from "@/constants/register-options";

interface OcmImpactData {
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
}

interface OcmFormDialogProps {
  assessmentId: string;
  impact?: OcmImpactData | undefined;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function OcmFormDialog({
  assessmentId,
  impact,
  open,
  onClose,
  onSaved,
}: OcmFormDialogProps) {
  const isEdit = !!impact;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [impactedRole, setImpactedRole] = useState(impact?.impactedRole ?? "");
  const [impactedDepartment, setImpactedDepartment] = useState(impact?.impactedDepartment ?? "");
  const [functionalArea, setFunctionalArea] = useState(impact?.functionalArea ?? "");
  const [changeType, setChangeType] = useState(impact?.changeType ?? "");
  const [severity, setSeverity] = useState(impact?.severity ?? "");
  const [description, setDescription] = useState(impact?.description ?? "");
  const [trainingRequired, setTrainingRequired] = useState(impact?.trainingRequired ?? false);
  const [trainingType, setTrainingType] = useState(impact?.trainingType ?? "");
  const [trainingDuration, setTrainingDuration] = useState<string>(
    impact?.trainingDuration !== null && impact?.trainingDuration !== undefined
      ? String(impact.trainingDuration)
      : "",
  );
  const [communicationPlan, setCommunicationPlan] = useState(impact?.communicationPlan ?? "");
  const [resistanceRisk, setResistanceRisk] = useState(impact?.resistanceRisk ?? "");
  const [readinessScore, setReadinessScore] = useState<string>(
    impact?.readinessScore !== null && impact?.readinessScore !== undefined
      ? String(Math.round(impact.readinessScore * 100))
      : "",
  );
  const [mitigationStrategy, setMitigationStrategy] = useState(impact?.mitigationStrategy ?? "");
  const [priority, setPriority] = useState(impact?.priority ?? "");
  const [status, setStatus] = useState(impact?.status ?? "identified");
  const [technicalNotes, setTechnicalNotes] = useState(impact?.technicalNotes ?? "");

  const handleSubmit = async () => {
    if (!impactedRole || !changeType || !severity || !description) {
      setError("Please fill in all required fields.");
      return;
    }

    if (trainingRequired && !trainingType) {
      setError("Training type is required when training is required.");
      return;
    }

    setSaving(true);
    setError(null);

    const body: Record<string, unknown> = {
      impactedRole,
      changeType,
      severity,
      description,
      trainingRequired,
    };

    if (impactedDepartment) body.impactedDepartment = impactedDepartment;
    if (functionalArea) body.functionalArea = functionalArea;
    if (trainingRequired) {
      body.trainingType = trainingType;
      if (trainingDuration) body.trainingDuration = Number(trainingDuration);
    }
    if (communicationPlan) body.communicationPlan = communicationPlan;
    if (resistanceRisk) body.resistanceRisk = resistanceRisk;
    if (readinessScore) body.readinessScore = Number(readinessScore) / 100;
    if (mitigationStrategy) body.mitigationStrategy = mitigationStrategy;
    if (priority) body.priority = priority;
    if (technicalNotes) body.technicalNotes = technicalNotes;
    if (isEdit) body.status = status;

    try {
      const url = isEdit
        ? `/api/assessments/${assessmentId}/ocm/${impact.id}`
        : `/api/assessments/${assessmentId}/ocm`;

      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Failed to save");
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
          <DialogTitle>{isEdit ? "Edit OCM Impact" : "Add OCM Impact"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Impacted Role *</Label>
              <Input value={impactedRole} onChange={(e) => setImpactedRole(e.target.value)} placeholder="e.g., AP Clerk" className="mt-1" />
            </div>
            <div>
              <Label>Impacted Department</Label>
              <Input value={impactedDepartment} onChange={(e) => setImpactedDepartment(e.target.value)} placeholder="e.g., Finance" className="mt-1" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Functional Area</Label>
              <Input value={functionalArea} onChange={(e) => setFunctionalArea(e.target.value)} placeholder="e.g., Accounts Payable" className="mt-1" />
            </div>
            <div>
              <Label>Change Type *</Label>
              <Select value={changeType} onValueChange={setChangeType}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {OCM_CHANGE_TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Description *</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the change impact..." className="mt-1 min-h-[72px]" />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Severity *</Label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Severity" /></SelectTrigger>
                <SelectContent>
                  {OCM_SEVERITY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Resistance Risk</Label>
              <Select value={resistanceRisk} onValueChange={setResistanceRisk}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Risk" /></SelectTrigger>
                <SelectContent>
                  {RESISTANCE_RISK_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Readiness (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={readinessScore}
                onChange={(e) => setReadinessScore(e.target.value)}
                placeholder="0-100"
                className="mt-1"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={trainingRequired}
              onChange={(e) => setTrainingRequired(e.target.checked)}
              id="trainingRequired"
              className="rounded border-gray-300"
            />
            <Label htmlFor="trainingRequired">Training Required</Label>
          </div>

          {trainingRequired && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Training Type *</Label>
                <Select value={trainingType} onValueChange={setTrainingType}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {TRAINING_TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Duration (hours)</Label>
                <Input
                  type="number"
                  min={0}
                  value={trainingDuration}
                  onChange={(e) => setTrainingDuration(e.target.value)}
                  placeholder="e.g., 8"
                  className="mt-1"
                />
              </div>
            </div>
          )}

          <div>
            <Label>Communication Plan</Label>
            <Textarea value={communicationPlan} onChange={(e) => setCommunicationPlan(e.target.value)} placeholder="Describe the communication plan..." className="mt-1" />
          </div>

          <div>
            <Label>Mitigation Strategy</Label>
            <Textarea value={mitigationStrategy} onChange={(e) => setMitigationStrategy(e.target.value)} placeholder="Describe mitigation approach..." className="mt-1" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Priority" /></SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {isEdit && (
              <div>
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    {OCM_STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

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

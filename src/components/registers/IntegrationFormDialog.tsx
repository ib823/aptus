"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  INTEGRATION_DIRECTION_OPTIONS,
  INTERFACE_TYPE_OPTIONS,
  INTEGRATION_FREQUENCY_OPTIONS,
  INTEGRATION_MIDDLEWARE_OPTIONS,
  INTEGRATION_COMPLEXITY_OPTIONS,
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
}

interface IntegrationFormDialogProps {
  assessmentId: string;
  integration?: IntegrationData | undefined;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function IntegrationFormDialog({
  assessmentId,
  integration,
  open,
  onClose,
  onSaved,
}: IntegrationFormDialogProps) {
  const isEdit = !!integration;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(integration?.name ?? "");
  const [description, setDescription] = useState(integration?.description ?? "");
  const [direction, setDirection] = useState(integration?.direction ?? "");
  const [sourceSystem, setSourceSystem] = useState(integration?.sourceSystem ?? "");
  const [targetSystem, setTargetSystem] = useState(integration?.targetSystem ?? "");
  const [interfaceType, setInterfaceType] = useState(integration?.interfaceType ?? "");
  const [frequency, setFrequency] = useState(integration?.frequency ?? "");
  const [middleware, setMiddleware] = useState(integration?.middleware ?? "");
  const [complexity, setComplexity] = useState(integration?.complexity ?? "");
  const [priority, setPriority] = useState(integration?.priority ?? "");
  const [status, setStatus] = useState(integration?.status ?? "identified");
  const [technicalNotes, setTechnicalNotes] = useState(integration?.technicalNotes ?? "");

  // Reset form when integration changes
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      onClose();
      return;
    }
  };

  const handleSubmit = async () => {
    if (!name || !description || !direction || !sourceSystem || !targetSystem || !interfaceType || !frequency) {
      setError("Please fill in all required fields.");
      return;
    }

    setSaving(true);
    setError(null);

    const body: Record<string, unknown> = {
      name,
      description,
      direction,
      sourceSystem,
      targetSystem,
      interfaceType,
      frequency,
    };

    if (middleware) body.middleware = middleware;
    if (complexity) body.complexity = complexity;
    if (priority) body.priority = priority;
    if (technicalNotes) body.technicalNotes = technicalNotes;
    if (isEdit) body.status = status;

    try {
      const url = isEdit
        ? `/api/assessments/${assessmentId}/integrations/${integration.id}`
        : `/api/assessments/${assessmentId}/integrations`;

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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Integration Point" : "Add Integration Point"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>}

          <div>
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Bank Statement Import" className="mt-1" />
          </div>

          <div>
            <Label>Description *</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the integration..." className="mt-1 min-h-[72px]" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Source System *</Label>
              <Input value={sourceSystem} onChange={(e) => setSourceSystem(e.target.value)} placeholder="e.g., SAP ECC" className="mt-1" />
            </div>
            <div>
              <Label>Target System *</Label>
              <Input value={targetSystem} onChange={(e) => setTargetSystem(e.target.value)} placeholder="e.g., S/4HANA Cloud" className="mt-1" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Direction *</Label>
              <Select value={direction} onValueChange={setDirection}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select direction" /></SelectTrigger>
                <SelectContent>
                  {INTEGRATION_DIRECTION_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Interface Type *</Label>
              <Select value={interfaceType} onValueChange={setInterfaceType}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {INTERFACE_TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Frequency *</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select frequency" /></SelectTrigger>
                <SelectContent>
                  {INTEGRATION_FREQUENCY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Middleware</Label>
              <Select value={middleware} onValueChange={setMiddleware}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select middleware" /></SelectTrigger>
                <SelectContent>
                  {INTEGRATION_MIDDLEWARE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Complexity</Label>
              <Select value={complexity} onValueChange={setComplexity}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Complexity" /></SelectTrigger>
                <SelectContent>
                  {INTEGRATION_COMPLEXITY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
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
            {isEdit && (
              <div>
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    {INTEGRATION_STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
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

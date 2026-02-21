"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface ClassificationEntry {
  userId: string;
  userName: string;
  classification: string;
}

interface ConflictResolutionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conflictId: string;
  assessmentId: string;
  entityType: string;
  entityId: string;
  classifications: ClassificationEntry[];
  onResolved?: (() => void) | undefined;
}

export function ConflictResolutionDialog({
  open,
  onOpenChange,
  conflictId,
  assessmentId,
  entityType,
  entityId,
  classifications,
  onResolved,
}: ConflictResolutionDialogProps) {
  const [selectedClassification, setSelectedClassification] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Collect unique classifications
  const uniqueClassifications = [...new Set(classifications.map((c) => c.classification))];

  const handleResolve = async () => {
    if (!selectedClassification) return;
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/assessments/${assessmentId}/conflicts/${conflictId}/resolve`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resolvedClassification: selectedClassification,
            resolutionNotes: notes || undefined,
          }),
        },
      );
      if (res.ok) {
        onOpenChange(false);
        onResolved?.();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Resolve Conflict</DialogTitle>
          <DialogDescription>
            Choose the correct classification for {entityType} {entityId}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-sm font-medium mb-2 block">Conflicting Classifications</Label>
            <div className="space-y-2 text-sm">
              {classifications.map((c, i) => (
                <div key={i} className="flex items-center justify-between p-2 border rounded">
                  <span className="font-medium">{c.userName}</span>
                  <span className="text-muted-foreground">{c.classification}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium mb-2 block">Select Resolution</Label>
            <RadioGroup value={selectedClassification} onValueChange={setSelectedClassification}>
              {uniqueClassifications.map((classification) => (
                <div key={classification} className="flex items-center space-x-2">
                  <RadioGroupItem value={classification} id={`class-${classification}`} />
                  <Label htmlFor={`class-${classification}`}>{classification}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div>
            <Label htmlFor="resolution-notes" className="text-sm font-medium mb-2 block">
              Resolution Notes (optional)
            </Label>
            <Textarea
              id="resolution-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Explain why this classification was chosen..."
              rows={3}
              className="text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleResolve}
            disabled={submitting || !selectedClassification}
          >
            {submitting ? "Resolving..." : "Resolve Conflict"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

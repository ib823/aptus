"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

interface CreateTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assessments: Array<{ id: string; companyName: string }>;
  onSubmit: (data: {
    assessmentId: string;
    name: string;
    description: string;
    includeGapPatterns: boolean;
    includeIntegrationPatterns: boolean;
    includeDmPatterns: boolean;
  }) => void;
  isSubmitting?: boolean | undefined;
}

export function CreateTemplateDialog({
  open,
  onOpenChange,
  assessments,
  onSubmit,
  isSubmitting,
}: CreateTemplateDialogProps) {
  const [assessmentId, setAssessmentId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [includeGapPatterns, setIncludeGapPatterns] = useState(true);
  const [includeIntegrationPatterns, setIncludeIntegrationPatterns] =
    useState(true);
  const [includeDmPatterns, setIncludeDmPatterns] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assessmentId || !name) return;
    onSubmit({
      assessmentId,
      name,
      description,
      includeGapPatterns,
      includeIntegrationPatterns,
      includeDmPatterns,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Template from Assessment</DialogTitle>
          <DialogDescription>
            Select a source assessment and configure template options.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="template-assessment">Source Assessment</Label>
            <select
              id="template-assessment"
              value={assessmentId}
              onChange={(e) => setAssessmentId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
            >
              <option value="">Select an assessment...</option>
              {assessments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.companyName}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="template-name">Template Name</Label>
            <Input
              id="template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Manufacturing Starter Template"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="template-description">Description</Label>
            <Input
              id="template-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
            />
          </div>

          <div className="space-y-3">
            <Label>Include in Template</Label>
            <div className="flex items-center gap-2">
              <Checkbox
                id="include-gaps"
                checked={includeGapPatterns}
                onCheckedChange={(val) =>
                  setIncludeGapPatterns(val === true)
                }
              />
              <Label htmlFor="include-gaps" className="font-normal">
                Gap Patterns (anonymized)
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="include-integrations"
                checked={includeIntegrationPatterns}
                onCheckedChange={(val) =>
                  setIncludeIntegrationPatterns(val === true)
                }
              />
              <Label htmlFor="include-integrations" className="font-normal">
                Integration Patterns
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="include-dm"
                checked={includeDmPatterns}
                onCheckedChange={(val) =>
                  setIncludeDmPatterns(val === true)
                }
              />
              <Label htmlFor="include-dm" className="font-normal">
                Data Migration Patterns
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!assessmentId || !name || (isSubmitting ?? false)}
            >
              {isSubmitting ? "Creating..." : "Create Template"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

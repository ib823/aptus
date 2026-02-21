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

interface UseTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateName: string;
  templateId: string;
  onSubmit: (data: {
    templateId: string;
    companyName: string;
    industry: string;
    country: string;
    companySize: string;
  }) => void;
  isSubmitting?: boolean | undefined;
}

export function UseTemplateDialog({
  open,
  onOpenChange,
  templateName,
  templateId,
  onSubmit,
  isSubmitting,
}: UseTemplateDialogProps) {
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [country, setCountry] = useState("");
  const [companySize, setCompanySize] = useState("midsize");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName) return;
    onSubmit({
      templateId,
      companyName,
      industry,
      country,
      companySize,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Assessment from Template</DialogTitle>
          <DialogDescription>
            Using template: {templateName}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="use-company-name">Company Name</Label>
            <Input
              id="use-company-name"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Enter company name..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="use-industry">Industry (optional)</Label>
            <Input
              id="use-industry"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="e.g., Manufacturing"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="use-country">Country (optional)</Label>
            <Input
              id="use-country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="e.g., US"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="use-company-size">Company Size</Label>
            <select
              id="use-company-size"
              value={companySize}
              onChange={(e) => setCompanySize(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
            >
              <option value="small">Small</option>
              <option value="midsize">Midsize</option>
              <option value="large">Large</option>
              <option value="enterprise">Enterprise</option>
            </select>
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
              disabled={!companyName || (isSubmitting ?? false)}
            >
              {isSubmitting ? "Creating..." : "Create Assessment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

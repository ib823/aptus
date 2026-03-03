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
import { PRESETS } from "@/constants/presets";

const preset = PRESETS.coreedge;

interface CoreEdgeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    companyName: string;
    industry: string;
    country: string;
    companySize: string;
  }) => void;
  isSubmitting?: boolean | undefined;
}

export function CoreEdgeDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
}: CoreEdgeDialogProps) {
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [country, setCountry] = useState("");
  const [companySize, setCompanySize] = useState("midsize");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName) return;
    onSubmit({ companyName, industry, country, companySize });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Quick Start — {preset.name}</DialogTitle>
          <DialogDescription>{preset.description}</DialogDescription>
        </DialogHeader>

        <div className="rounded-md border p-3 bg-muted/30">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            {preset.scopeItemIds.length} scope items will be pre-selected:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {preset.scopeItemIds.map((id) => (
              <span
                key={id}
                className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium bg-background"
              >
                {id}
              </span>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ce-company-name">Company Name</Label>
            <Input
              id="ce-company-name"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Enter company name..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ce-industry">Industry (optional)</Label>
            <Input
              id="ce-industry"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="e.g., Manufacturing"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ce-country">Country (optional)</Label>
            <Input
              id="ce-country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="e.g., US"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ce-company-size">Company Size</Label>
            <select
              id="ce-company-size"
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

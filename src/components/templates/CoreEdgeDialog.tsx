"use client";

import { useState } from "react";
import { Check, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { GatedButton } from "@/components/ui/gated-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PRESETS } from "@/constants/presets";

const preset = PRESETS.coreedge!;

interface CoreEdgeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    companyName: string;
    industry: string;
    country: string;
    companySize: string;
    scopeItemIds: string[];
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

  // Track selected scope items — defaults are pre-selected
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(preset.scopeItems.filter((s) => s.defaultSelected).map((s) => s.id)),
  );

  const toggleItem = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName || selectedIds.size === 0) return;
    onSubmit({
      companyName,
      industry,
      country,
      companySize,
      scopeItemIds: Array.from(selectedIds),
    });
  };

  const defaultItems = preset.scopeItems.filter((s) => s.defaultSelected);
  const optionalItems = preset.scopeItems.filter((s) => !s.defaultSelected);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{preset.name}</DialogTitle>
          <DialogDescription>{preset.description}</DialogDescription>
        </DialogHeader>

        {/* Scope Items Selection */}
        <div className="space-y-4">
          {/* Default scope items */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Core Scope ({defaultItems.length} items)
            </p>
            <div className="space-y-2">
              {defaultItems.map((item) => (
                <ScopeItemRow
                  key={item.id}
                  item={item}
                  selected={selectedIds.has(item.id)}
                  onToggle={() => toggleItem(item.id)}
                />
              ))}
            </div>
          </div>

          {/* Optional scope items */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Optional Add-ons ({optionalItems.length} items)
            </p>
            <div className="space-y-2">
              {optionalItems.map((item) => (
                <ScopeItemRow
                  key={item.id}
                  item={item}
                  selected={selectedIds.has(item.id)}
                  onToggle={() => toggleItem(item.id)}
                />
              ))}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {selectedIds.size} scope item{selectedIds.size !== 1 ? "s" : ""} selected
          </p>
        </div>

        {/* Company details form */}
        <form onSubmit={handleSubmit} className="space-y-4 border-t pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 col-span-2">
              <Label htmlFor="ce-company-name">Company Name *</Label>
              <Input
                id="ce-company-name"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Enter company name..."
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ce-industry">Industry</Label>
              <Input
                id="ce-industry"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="e.g., Manufacturing"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ce-country">Country</Label>
              <Input
                id="ce-country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="e.g., MY"
              />
            </div>
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
            <GatedButton
              type="submit"
              gated={!companyName || selectedIds.size === 0}
              gatedReason={
                !companyName && selectedIds.size === 0
                  ? "Enter a company name and select at least one scope item."
                  : !companyName
                    ? "Enter a company name to continue."
                    : "Select at least one scope item."
              }
              disabled={isSubmitting ?? false}
            >
              {isSubmitting ? "Creating..." : `Create Assessment (${selectedIds.size} items)`}
            </GatedButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ScopeItemRow({
  item,
  selected,
  onToggle,
}: {
  item: { id: string; name: string; description: string; totalSteps: number; effortTier: string; defaultSelected: boolean };
  selected: boolean;
  onToggle: () => void;
}) {
  const tierColors: Record<string, string> = {
    "Very High": "bg-red-100 text-red-700",
    "High": "bg-amber-100 text-amber-700",
    "Medium": "bg-blue-100 text-blue-700",
    "Low": "bg-green-100 text-green-700",
  };

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
        selected
          ? "border-primary/40 bg-primary/5"
          : "border-border hover:border-muted-foreground/30 hover:bg-muted/30"
      }`}
    >
      <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border mt-0.5 ${
        selected ? "bg-primary border-primary text-primary-foreground" : "border-input"
      }`}>
        {selected ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3 text-muted-foreground" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground">{item.id}</span>
          <span className="text-sm font-medium text-foreground">{item.name}</span>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${tierColors[item.effortTier] ?? "bg-muted text-muted-foreground"}`}>
            {item.effortTier}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{item.description}</p>
      </div>
      <span className="text-[10px] text-muted-foreground shrink-0 mt-1">{item.totalSteps} steps</span>
    </button>
  );
}

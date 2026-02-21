"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface ArtifactOption {
  id: string;
  label: string;
  description: string;
}

const DEFAULT_ARTIFACTS: ArtifactOption[] = [
  { id: "scope_report", label: "Scope Report", description: "Full scope selection summary with relevance ratings" },
  { id: "fit_gap_analysis", label: "Fit/Gap Analysis", description: "Complete fit/gap analysis with classifications" },
  { id: "gap_resolution_plan", label: "Gap Resolution Plan", description: "All gap resolutions with cost estimates" },
  { id: "integration_register", label: "Integration Register", description: "Integration points and middleware details" },
  { id: "data_migration_plan", label: "Data Migration Plan", description: "Migration objects, volumes, and approach" },
  { id: "ocm_assessment", label: "OCM Assessment", description: "Change impacts, training needs, and readiness" },
  { id: "risk_summary", label: "Risk Summary", description: "Consolidated risk assessment across all domains" },
  { id: "sign_off_certificate", label: "Sign-Off Certificate", description: "Digital signatures and verification chain" },
  { id: "process_flow_diagrams", label: "Process Flow Diagrams", description: "Visual process flows for selected scope" },
  { id: "decision_audit_trail", label: "Decision Audit Trail", description: "Complete audit log of all decisions" },
];

interface HandoffArtifactSelectorProps {
  onGenerate: (selectedArtifacts: string[]) => void;
  isGenerating?: boolean | undefined;
  artifacts?: ArtifactOption[] | undefined;
  className?: string | undefined;
}

export function HandoffArtifactSelector({
  onGenerate,
  isGenerating,
  artifacts,
  className,
}: HandoffArtifactSelectorProps) {
  const options = artifacts ?? DEFAULT_ARTIFACTS;
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleArtifact = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(options.map(a => a.id)));
  };

  return (
    <Card className={cn("", className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Handoff Package Contents</CardTitle>
          <Button variant="outline" size="sm" onClick={selectAll}>
            Select All
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {options.map((artifact) => (
          <div key={artifact.id} className="flex items-start gap-3 rounded-md border p-3">
            <Checkbox
              id={artifact.id}
              checked={selected.has(artifact.id)}
              onCheckedChange={() => toggleArtifact(artifact.id)}
            />
            <div className="flex-1">
              <Label htmlFor={artifact.id} className="text-sm font-medium cursor-pointer">
                {artifact.label}
              </Label>
              <p className="text-xs text-muted-foreground">{artifact.description}</p>
            </div>
          </div>
        ))}
        <Button
          className="w-full"
          onClick={() => onGenerate(Array.from(selected))}
          disabled={selected.size === 0 || (isGenerating ?? false)}
        >
          {(isGenerating ?? false) ? "Generating..." : `Generate Package (${selected.size} items)`}
        </Button>
      </CardContent>
    </Card>
  );
}

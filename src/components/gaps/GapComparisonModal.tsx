"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface AlternativeData {
  id: string;
  label: string;
  resolutionType: string;
  resolutionDescription: string;
  oneTimeCost: number | null;
  recurringCost: number | null;
  implementationDays: number | null;
  riskLevel: string | null;
  pros: string[];
  cons: string[];
}

interface GapComparisonModalProps {
  mainResolution: {
    resolutionType: string;
    resolutionDescription: string;
    oneTimeCost: number | null;
    recurringCost: number | null;
    implementationDays: number | null;
    riskLevel: string | null;
  };
  alternatives: AlternativeData[];
  onSelectAsPrimary: (alternativeId: string) => void;
  onClose: () => void;
}

function CostCell({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className="text-sm font-medium">{value != null ? `$${value.toLocaleString()}` : "—"}</p>
    </div>
  );
}

export function GapComparisonModal({
  mainResolution,
  alternatives,
  onSelectAsPrimary,
  onClose,
}: GapComparisonModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-lg border shadow-xl max-w-4xl w-full max-h-[80vh] overflow-y-auto">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">Compare Resolution Options</h3>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="p-6">
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${1 + alternatives.length}, 1fr)` }}>
            {/* Main resolution column */}
            <div className="border rounded-lg p-4 bg-blue-50/30">
              <Badge className="bg-blue-100 text-blue-700 mb-2">Current</Badge>
              <p className="text-sm font-semibold">{mainResolution.resolutionType}</p>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-3">
                {mainResolution.resolutionDescription}
              </p>
              <div className="mt-3 space-y-2">
                <CostCell label="One-Time" value={mainResolution.oneTimeCost} />
                <CostCell label="Recurring" value={mainResolution.recurringCost} />
                <div>
                  <span className="text-xs text-muted-foreground">Effort</span>
                  <p className="text-sm font-medium">
                    {mainResolution.implementationDays ? `${mainResolution.implementationDays} days` : "—"}
                  </p>
                </div>
                {mainResolution.riskLevel && (
                  <Badge variant="outline" className="text-xs">{mainResolution.riskLevel}</Badge>
                )}
              </div>
            </div>

            {/* Alternative columns */}
            {alternatives.map((alt) => (
              <div key={alt.id} className="border rounded-lg p-4">
                <Badge variant="outline" className="mb-2">Alternative</Badge>
                <p className="text-sm font-semibold">{alt.label}</p>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-3">
                  {alt.resolutionDescription}
                </p>
                <div className="mt-3 space-y-2">
                  <CostCell label="One-Time" value={alt.oneTimeCost} />
                  <CostCell label="Recurring" value={alt.recurringCost} />
                  <div>
                    <span className="text-xs text-muted-foreground">Effort</span>
                    <p className="text-sm font-medium">
                      {alt.implementationDays ? `${alt.implementationDays} days` : "—"}
                    </p>
                  </div>
                  {alt.riskLevel && (
                    <Badge variant="outline" className="text-xs">{alt.riskLevel}</Badge>
                  )}
                </div>
                {alt.pros.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-green-600">Pros</p>
                    <ul className="text-xs text-muted-foreground list-disc list-inside">
                      {alt.pros.map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                  </div>
                )}
                {alt.cons.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-red-600">Cons</p>
                    <ul className="text-xs text-muted-foreground list-disc list-inside">
                      {alt.cons.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                  </div>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 w-full"
                  onClick={() => onSelectAsPrimary(alt.id)}
                >
                  Select as Primary
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2 } from "lucide-react";
import type { DerivedClassification } from "@/types/conversation";

interface ClassificationPreviewProps {
  classifications: DerivedClassification[];
  onApply: () => void;
  isApplying?: boolean | undefined;
}

const CLASSIFICATION_STYLES = {
  FIT: { label: "Matches", className: "bg-green-50 text-green-700 border border-green-200" },
  CONFIGURE: { label: "Needs Adjustment", className: "bg-blue-50 text-blue-700 border border-blue-200" },
  GAP: { label: "Doesn\u2019t Match", className: "bg-amber-50 text-amber-700 border border-amber-200" },
  NA: { label: "Not Relevant", className: "bg-slate-50 text-slate-500 border border-slate-200" },
} as const;

export function ClassificationPreview({
  classifications,
  onApply,
  isApplying,
}: ClassificationPreviewProps) {
  if (classifications.length === 0) return null;

  return (
    <Card className="border-green-200 bg-green-50/50">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <CardTitle className="text-base">Classification Summary</CardTitle>
        </div>
        <p className="text-sm text-muted-foreground">
          Based on your answers, the following classifications have been derived:
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {classifications.map((dc) => {
            const style = CLASSIFICATION_STYLES[dc.classification];
            return (
              <div
                key={dc.processStepId}
                className="flex items-center justify-between p-3 bg-white rounded-lg border"
              >
                <div className="flex items-center gap-3">
                  <Badge className={style.className}>{style.label}</Badge>
                  <span className="text-sm text-muted-foreground">
                    Step {dc.processStepId}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  Confidence: {dc.confidence}
                </span>
              </div>
            );
          })}
        </div>
        <Button
          onClick={onApply}
          disabled={isApplying ?? false}
          className="mt-4 w-full"
        >
          {isApplying ? "Applying..." : "Apply Classifications"}
        </Button>
      </CardContent>
    </Card>
  );
}

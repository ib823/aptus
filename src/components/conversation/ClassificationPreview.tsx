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
  FIT: { label: "FIT", className: "bg-green-100 text-green-700" },
  CONFIGURE: { label: "CONFIGURE", className: "bg-blue-100 text-blue-700" },
  GAP: { label: "GAP", className: "bg-amber-100 text-amber-700" },
  NA: { label: "N/A", className: "bg-gray-100 text-gray-600" },
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

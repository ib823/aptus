"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { sanitizeHtmlContent } from "@/lib/security/sanitize";

interface ReferenceStepData {
  id: string;
  sequence: number;
  actionTitle: string;
  actionInstructionsHtml: string;
  stepType: string;
}

interface ReferenceStepRowProps {
  step: ReferenceStepData;
}

const STEP_TYPE_LABELS: Record<string, string> = {
  LOGON: "Logon",
  ACCESS_APP: "Access App",
  INFORMATION: "Information",
  NAVIGATION: "Navigation",
};

export function ReferenceStepRow({ step }: ReferenceStepRowProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b last:border-b-0">
      <div className="flex items-center gap-3 py-2 px-3">
        <span className="text-xs text-muted-foreground/60 w-8 shrink-0">
          {step.sequence + 1}
        </span>
        <span className="text-sm text-muted-foreground flex-1 truncate">
          {step.actionTitle}
        </span>
        <Badge variant="outline" className="text-xs shrink-0">
          {STEP_TYPE_LABELS[step.stepType] ?? step.stepType}
        </Badge>
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1 text-muted-foreground/60 hover:text-muted-foreground"
        >
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
      </div>
      {expanded && (
        <div className="px-11 pb-3">
          <div
            className="prose prose-sm max-w-none text-muted-foreground"
            dangerouslySetInnerHTML={{ __html: sanitizeHtmlContent(step.actionInstructionsHtml) }}
          />
        </div>
      )}
    </div>
  );
}

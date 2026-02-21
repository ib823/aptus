"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import type { TooltipRegistryEntry } from "@/types/onboarding";

interface ContextualTooltipProps {
  tooltip: TooltipRegistryEntry;
  onDismiss: (key: string) => void;
}

export function ContextualTooltip({ tooltip, onDismiss }: ContextualTooltipProps) {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  const handleDismiss = () => {
    setVisible(false);
    onDismiss(tooltip.key);
  };

  return (
    <Card className="border-blue-200 bg-blue-50/80 shadow-lg max-w-xs">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-blue-900">{tooltip.title}</p>
            <p className="text-xs text-blue-700 mt-1">{tooltip.content}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="h-6 w-6 p-0 shrink-0 text-blue-400 hover:text-blue-600"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

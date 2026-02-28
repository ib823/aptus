"use client";

import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface ConflictBannerProps {
  entityType: string;
  entityId: string;
  conflictId: string;
  status: string;
  onResolve?: (() => void) | undefined;
}

export function ConflictBanner({
  entityType,
  entityId,
  conflictId,
  status,
  onResolve,
}: ConflictBannerProps) {
  if (status === "RESOLVED") return null;

  return (
    <Alert variant="destructive" className="border-amber-500 bg-amber-50 text-amber-900">
      <AlertTriangle className="h-4 w-4 text-amber-600" />
      <AlertTitle className="text-amber-900">Classification Conflict</AlertTitle>
      <AlertDescription className="flex items-center justify-between">
        <span>
          There is a disagreement on the classification of this {entityType.toLowerCase()} ({entityId}).
          {status === "ESCALATED" && " This conflict has been escalated."}
        </span>
        {onResolve && (
          <Button
            variant="outline"
            size="sm"
            className="ml-2 shrink-0 border-amber-500 text-amber-900 hover:bg-amber-100"
            onClick={onResolve}
            data-conflict-id={conflictId}
          >
            Resolve
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}

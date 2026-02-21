"use client";

import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ReportStatus } from "@/types/report";

interface ReportGenerationStatusProps {
  status: ReportStatus;
  fileName?: string | null | undefined;
  fileSize?: number | null | undefined;
  errorMessage?: string | null | undefined;
  onRetry?: (() => void) | undefined;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ReportGenerationStatus({
  status,
  fileName,
  fileSize,
  errorMessage,
  onRetry,
}: ReportGenerationStatusProps) {
  return (
    <div className="flex items-center gap-3">
      {status === "generating" ? (
        <>
          <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
          <Badge variant="outline" className="text-blue-600 border-blue-300">
            Generating
          </Badge>
        </>
      ) : status === "completed" ? (
        <>
          <CheckCircle className="h-5 w-5 text-green-500" />
          <Badge variant="outline" className="text-green-600 border-green-300">
            Completed
          </Badge>
          {fileName ? (
            <span className="text-sm text-muted-foreground">{fileName}</span>
          ) : null}
          {fileSize != null ? (
            <span className="text-xs text-muted-foreground">
              ({formatFileSize(fileSize)})
            </span>
          ) : null}
        </>
      ) : (
        <>
          <XCircle className="h-5 w-5 text-destructive" />
          <Badge variant="destructive">Failed</Badge>
          {errorMessage ? (
            <span className="text-sm text-destructive">{errorMessage}</span>
          ) : null}
          {onRetry ? (
            <Button variant="outline" size="sm" onClick={onRetry}>
              Retry
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}

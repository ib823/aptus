"use client";

import { useState } from "react";
import { FileArchive, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface IngestClientProps {
  currentVersion: string;
  counts: {
    scopeItems: number;
    processSteps: number;
    configActivities: number;
  };
}

export function IngestClient({ currentVersion, counts }: IngestClientProps) {
  const [showWarning, setShowWarning] = useState(false);

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-bold text-foreground tracking-tight mb-1">ZIP Ingestion</h1>
      <p className="text-base text-muted-foreground mb-8">
        Upload a new SAP Best Practices ZIP to update the catalog data
      </p>

      {/* Current status */}
      <div className="bg-card rounded-lg border p-6 mb-6">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
          Current Status
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">SAP Version</p>
            <p className="text-lg font-bold text-foreground">{currentVersion}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Catalog Contents</p>
            <p className="text-sm text-foreground">
              {counts.scopeItems} scope items, {counts.processSteps.toLocaleString()} steps, {counts.configActivities.toLocaleString()} configs
            </p>
          </div>
        </div>
      </div>

      {/* Warning banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">Re-ingestion Warning</p>
            <p className="text-sm text-amber-700 mt-1">
              Re-ingestion will <strong>REPLACE</strong> all SAP catalog data (scope items, process steps, config activities).
              Assessment data will NOT be affected.
            </p>
          </div>
        </div>
      </div>

      {/* Upload area */}
      <div className="bg-card rounded-lg border p-8 text-center">
        <FileArchive className="w-12 h-12 text-muted-foreground/60 mx-auto mb-4" />
        <p className="text-sm text-muted-foreground mb-4">
          Upload SAP Best Practices ZIP file to re-ingest catalog data
        </p>
        {!showWarning ? (
          <Button onClick={() => setShowWarning(true)}>
            Select ZIP File
          </Button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-amber-700 font-medium">
              This feature requires running the ingestion script from the server terminal.
            </p>
            <code className="block bg-muted rounded px-3 py-2 text-xs text-foreground">
              npx tsx scripts/ingest-bpd.ts /path/to/SAP_Best_Practices.zip
            </code>
            <Button variant="outline" onClick={() => setShowWarning(false)}>
              Dismiss
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

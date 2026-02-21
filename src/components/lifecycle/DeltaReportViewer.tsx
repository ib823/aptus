"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DeltaReport } from "@/types/lifecycle";

interface DeltaReportViewerProps {
  delta: DeltaReport;
  className?: string | undefined;
}

function ChangeTypeBadge({ changeType }: { changeType: string }) {
  const styles: Record<string, string> = {
    added: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
    removed: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    modified: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  };
  return (
    <Badge variant="outline" className={cn("border-transparent text-xs", styles[changeType] ?? "")}>
      {changeType}
    </Badge>
  );
}

export function DeltaReportViewer({ delta, className }: DeltaReportViewerProps) {
  return (
    <Card className={cn("", className)}>
      <CardHeader>
        <CardTitle className="text-base">
          Delta Report: v{delta.baseVersion} → v{delta.compareVersion}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="scope">
          <TabsList>
            <TabsTrigger value="scope">
              Scope ({delta.scopeChanges.length})
            </TabsTrigger>
            <TabsTrigger value="classification">
              Classifications ({delta.classificationChanges.length})
            </TabsTrigger>
            <TabsTrigger value="gaps">
              Gap Resolutions ({delta.gapResolutionChanges.length})
            </TabsTrigger>
            <TabsTrigger value="integrations">
              Integrations ({delta.integrationChanges.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="scope" className="mt-4 space-y-2">
            {delta.scopeChanges.length === 0 ? (
              <p className="text-sm text-muted-foreground">No scope changes</p>
            ) : (
              delta.scopeChanges.map((change) => (
                <div key={change.scopeItemId} className="flex items-center justify-between rounded-md border p-2">
                  <span className="text-sm font-medium">{change.scopeItemId}</span>
                  <ChangeTypeBadge changeType={change.changeType} />
                </div>
              ))
            )}
          </TabsContent>

          <TabsContent value="classification" className="mt-4 space-y-2">
            {delta.classificationChanges.length === 0 ? (
              <p className="text-sm text-muted-foreground">No classification changes</p>
            ) : (
              delta.classificationChanges.map((change) => (
                <div key={change.processStepId} className="flex items-center justify-between rounded-md border p-2">
                  <div>
                    <span className="text-sm font-medium">{change.processStepId}</span>
                    {change.previousFitStatus && change.newFitStatus ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {change.previousFitStatus} → {change.newFitStatus}
                      </span>
                    ) : null}
                  </div>
                  <ChangeTypeBadge changeType={change.changeType} />
                </div>
              ))
            )}
          </TabsContent>

          <TabsContent value="gaps" className="mt-4 space-y-2">
            {delta.gapResolutionChanges.length === 0 ? (
              <p className="text-sm text-muted-foreground">No gap resolution changes</p>
            ) : (
              delta.gapResolutionChanges.map((change) => (
                <div key={change.gapResolutionId} className="flex items-center justify-between rounded-md border p-2">
                  <div>
                    <span className="text-sm font-medium">{change.gapResolutionId}</span>
                    {change.previousResolutionType && change.newResolutionType ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {change.previousResolutionType} → {change.newResolutionType}
                      </span>
                    ) : null}
                  </div>
                  <ChangeTypeBadge changeType={change.changeType} />
                </div>
              ))
            )}
          </TabsContent>

          <TabsContent value="integrations" className="mt-4 space-y-2">
            {delta.integrationChanges.length === 0 ? (
              <p className="text-sm text-muted-foreground">No integration changes</p>
            ) : (
              delta.integrationChanges.map((change) => (
                <div key={change.integrationId} className="flex items-center justify-between rounded-md border p-2">
                  <div>
                    <span className="text-sm font-medium">{change.name ?? change.integrationId}</span>
                  </div>
                  <ChangeTypeBadge changeType={change.changeType} />
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataIntegrityBadge } from "./DataIntegrityBadge";
import { cn } from "@/lib/utils";

interface SnapshotCardProps {
  version: number;
  label?: string | undefined;
  dataHash: string;
  createdAt: string;
  reason: string;
  isVerified?: boolean | undefined;
  className?: string | undefined;
}

export function SnapshotCard({
  version,
  label,
  dataHash,
  createdAt,
  reason,
  isVerified,
  className,
}: SnapshotCardProps) {
  return (
    <Card className={cn("", className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            v{version}{label ? ` — ${label}` : ""}
          </CardTitle>
          <DataIntegrityBadge isVerified={isVerified ?? true} hash={dataHash} />
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{reason}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Created: {new Date(createdAt).toLocaleString()}
        </p>
      </CardContent>
    </Card>
  );
}

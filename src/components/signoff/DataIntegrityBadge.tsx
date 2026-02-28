"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface DataIntegrityBadgeProps {
  isVerified: boolean;
  hash?: string | undefined;
  className?: string | undefined;
}

export function DataIntegrityBadge({ isVerified, hash, className }: DataIntegrityBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-transparent font-mono text-xs",
        isVerified
          ? "bg-green-50 text-green-700"
          : "bg-red-50 text-red-700",
        className,
      )}
      title={hash ?? "No hash available"}
    >
      {isVerified ? "Verified" : "Integrity Warning"}
      {hash ? ` (${hash.substring(0, 8)}...)` : ""}
    </Badge>
  );
}

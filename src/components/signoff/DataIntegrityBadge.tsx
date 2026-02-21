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
          ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
          : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
        className,
      )}
      title={hash ?? "No hash available"}
    >
      {isVerified ? "Verified" : "Integrity Warning"}
      {hash ? ` (${hash.substring(0, 8)}...)` : ""}
    </Badge>
  );
}

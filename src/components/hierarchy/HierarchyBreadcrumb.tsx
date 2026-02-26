"use client";

import { ChevronRight } from "lucide-react";

interface BreadcrumbItem {
  label: string;
  onClick?: (() => void) | undefined;
}

interface HierarchyBreadcrumbProps {
  scopeItemName: string;
  processName?: string;
  flowName?: string;
  activityTitle?: string;
  onScopeClick?: () => void;
  onProcessClick?: () => void;
  onFlowClick?: () => void;
  onActivityClick?: () => void;
}

export function HierarchyBreadcrumb({
  scopeItemName,
  processName,
  flowName,
  activityTitle,
  onScopeClick,
  onProcessClick,
  onFlowClick,
  onActivityClick,
}: HierarchyBreadcrumbProps) {
  const items: BreadcrumbItem[] = [
    { label: scopeItemName, onClick: onScopeClick },
  ];

  if (processName && processName !== "__main_process__") {
    items.push({ label: processName, onClick: onProcessClick });
  }
  if (flowName && flowName !== "__main_flow__") {
    items.push({ label: flowName, onClick: onFlowClick });
  }
  if (activityTitle && activityTitle !== "__main_activity__") {
    items.push({ label: activityTitle, onClick: onActivityClick });
  }

  return (
    <nav aria-label="Hierarchy breadcrumb" className="flex items-center gap-1 text-sm overflow-hidden">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1 min-w-0">
          {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />}
          {item.onClick ? (
            <button
              onClick={item.onClick}
              className="text-muted-foreground hover:text-foreground transition-colors truncate max-w-[160px]"
              title={item.label}
            >
              {item.label}
            </button>
          ) : (
            <span className="text-foreground font-medium truncate max-w-[160px]" title={item.label}>
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, AlertCircle, Info } from "lucide-react";
import type { AttentionItem, AttentionSeverity } from "@/types/dashboard";

interface AttentionWidgetProps {
  items: AttentionItem[];
  maxItems?: number | undefined;
}

const SEVERITY_CONFIG: Record<
  AttentionSeverity,
  { icon: typeof AlertTriangle; className: string; badgeClass: string }
> = {
  critical: {
    icon: AlertTriangle,
    className: "text-red-500",
    badgeClass: "bg-red-100 text-red-700",
  },
  warning: {
    icon: AlertCircle,
    className: "text-amber-500",
    badgeClass: "bg-amber-100 text-amber-700",
  },
  info: {
    icon: Info,
    className: "text-blue-500",
    badgeClass: "bg-blue-100 text-blue-700",
  },
};

export function AttentionWidget({ items, maxItems }: AttentionWidgetProps) {
  const displayItems = maxItems ? items.slice(0, maxItems) : items;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Needs Attention</CardTitle>
          {items.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {items.length}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {displayItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">All clear -- nothing requires attention.</p>
        ) : (
          <div className="space-y-3">
            {displayItems.map((item) => {
              const config = SEVERITY_CONFIG[item.severity];
              const Icon = config.icon;
              return (
                <div key={item.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-accent transition-colors">
                  <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${config.className}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{item.title}</span>
                      <Badge className={`text-xs shrink-0 ${config.badgeClass}`}>
                        {item.severity}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {item.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

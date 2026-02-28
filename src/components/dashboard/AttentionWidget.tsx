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
  { icon: typeof AlertTriangle; className: string; badgeClass: string; itemClass: string }
> = {
  critical: {
    icon: AlertTriangle,
    className: "text-red-500",
    badgeClass: "bg-red-50 text-red-700",
    itemClass: "bg-red-50 border-l-4 border-red-400",
  },
  warning: {
    icon: AlertCircle,
    className: "text-amber-500",
    badgeClass: "bg-amber-50 text-amber-700",
    itemClass: "bg-amber-50 border-l-4 border-amber-400",
  },
  info: {
    icon: Info,
    className: "text-blue-500",
    badgeClass: "bg-blue-50 text-blue-700",
    itemClass: "bg-blue-50 border-l-4 border-blue-400",
  },
};

export function AttentionWidget({ items, maxItems }: AttentionWidgetProps) {
  const displayItems = maxItems ? items.slice(0, maxItems) : items;

  return (
    <Card>
      <CardHeader className="pb-3 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Needs Attention</CardTitle>
          {items.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {items.length}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {displayItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">All clear — nothing requires attention.</p>
        ) : (
          <div className="space-y-3">
            {displayItems.map((item) => {
              const config = SEVERITY_CONFIG[item.severity];
              const Icon = config.icon;
              return (
                <div key={item.id} className={`flex items-start gap-3 p-2 rounded-lg transition-colors ${config.itemClass}`}>
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

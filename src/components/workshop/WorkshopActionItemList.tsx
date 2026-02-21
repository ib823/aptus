"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ActionItem {
  id: string;
  title: string;
  description?: string | null | undefined;
  assignedToName?: string | null | undefined;
  status: string;
  priority: string;
  dueDate?: string | null | undefined;
}

interface WorkshopActionItemListProps {
  items: ActionItem[];
  onStatusChange?: ((itemId: string, status: string) => void) | undefined;
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-yellow-100 text-yellow-700",
  low: "bg-gray-100 text-gray-600",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-gray-100 text-gray-500",
};

export function WorkshopActionItemList({
  items,
  onStatusChange,
}: WorkshopActionItemListProps) {
  if (items.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-4">
        No action items yet
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Action Items ({items.length})</h3>
      {items.map((item) => (
        <div key={item.id} className="border rounded-lg p-3 text-sm space-y-1">
          <div className="flex items-start justify-between gap-2">
            <span className={`font-medium ${item.status === "completed" ? "line-through text-muted-foreground" : ""}`}>
              {item.title}
            </span>
            <div className="flex gap-1 shrink-0">
              <Badge variant="outline" className={`text-[10px] ${PRIORITY_COLORS[item.priority] ?? ""}`}>
                {item.priority}
              </Badge>
              <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[item.status] ?? ""}`}>
                {item.status}
              </Badge>
            </div>
          </div>
          {item.assignedToName && (
            <p className="text-xs text-muted-foreground">Assigned: {item.assignedToName}</p>
          )}
          {item.description && (
            <p className="text-xs text-muted-foreground">{item.description}</p>
          )}
          {onStatusChange && item.status !== "completed" && item.status !== "cancelled" && (
            <div className="flex gap-1 pt-1">
              {item.status === "open" && (
                <Button variant="ghost" size="sm" className="text-xs h-6 px-2"
                  onClick={() => onStatusChange(item.id, "in_progress")}>
                  Start
                </Button>
              )}
              <Button variant="ghost" size="sm" className="text-xs h-6 px-2 text-green-700"
                onClick={() => onStatusChange(item.id, "completed")}>
                Complete
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

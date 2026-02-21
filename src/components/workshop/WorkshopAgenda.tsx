"use client";

import type { AgendaItem } from "@/types/workshop";

interface WorkshopAgendaProps {
  items: AgendaItem[];
  currentIndex?: number | undefined;
}

export function WorkshopAgenda({ items, currentIndex }: WorkshopAgendaProps) {
  if (items.length === 0) {
    return (
      <div className="text-xs text-muted-foreground py-2">
        No agenda items
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <h3 className="text-sm font-semibold mb-2">Agenda</h3>
      {items.map((item, idx) => {
        const isCurrent = currentIndex !== undefined && idx === currentIndex;
        const isCompleted = item.status === "completed";
        return (
          <div
            key={item.id}
            className={`flex items-center gap-2 text-sm py-1.5 px-2 rounded ${
              isCurrent ? "bg-blue-50 border border-blue-200" : ""
            }`}
          >
            <div className={`w-4 h-4 rounded-full border flex items-center justify-center text-[10px] shrink-0 ${
              isCompleted
                ? "bg-green-500 border-green-500 text-white"
                : isCurrent
                  ? "border-blue-500 text-blue-500"
                  : "border-gray-300 text-gray-400"
            }`}>
              {isCompleted ? "\u2713" : idx + 1}
            </div>
            <span className={`truncate ${isCompleted ? "line-through text-muted-foreground" : ""}`}>
              {item.title}
            </span>
            {item.duration && (
              <span className="text-xs text-muted-foreground shrink-0 ml-auto">
                {item.duration}m
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

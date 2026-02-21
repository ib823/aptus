"use client";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { MessageSquare } from "lucide-react";

interface ConversationModeToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  disabled?: boolean | undefined;
}

export function ConversationModeToggle({
  enabled,
  onToggle,
  disabled,
}: ConversationModeToggleProps) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
      <MessageSquare className="h-4 w-4 text-muted-foreground" />
      <Label htmlFor="conversation-mode" className="text-sm font-medium cursor-pointer flex-1">
        Conversation Mode
        <span className="block text-xs text-muted-foreground font-normal mt-0.5">
          Answer guided questions instead of classifying directly
        </span>
      </Label>
      <Switch
        id="conversation-mode"
        checked={enabled}
        onCheckedChange={onToggle}
        disabled={disabled ?? false}
      />
    </div>
  );
}

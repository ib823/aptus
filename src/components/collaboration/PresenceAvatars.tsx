"use client";

import { usePresence } from "@/hooks/usePresence";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface PresenceAvatarsProps {
  assessmentId: string;
}

export function PresenceAvatars({ assessmentId }: PresenceAvatarsProps) {
  const { activeUsers } = usePresence(assessmentId);

  if (activeUsers.length === 0) return null;

  return (
    <div className="flex items-center -space-x-2 overflow-hidden">
      <TooltipProvider>
        {activeUsers.map((user) => (
          <Tooltip key={user.userId}>
            <TooltipTrigger asChild>
              <div className="relative inline-block border-2 border-background rounded-full transition-transform hover:translate-y-[-2px] hover:z-10 cursor-default">
                <Avatar className="size-7">
                  {user.userImage && <AvatarImage src={user.userImage} alt={user.userName} />}
                  <AvatarFallback className="bg-blue-600 text-[10px] text-white font-bold">
                    {user.userName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {/* Active pulse dot */}
                <span className="absolute bottom-0 right-0 block size-2 rounded-full bg-green-500 ring-1 ring-background" />
              </div>
            </TooltipTrigger>
            <TooltipContent className="p-2 text-xs">
              <div className="font-bold">{user.userName}</div>
              <div className="text-muted-foreground uppercase text-[9px] tracking-wider">{user.userRole.replaceAll('_', ' ')}</div>
              {user.currentPage && (
                <div className="mt-1 pt-1 border-t border-border/50 italic opacity-80">
                  Viewing: {user.currentPage.split('/').pop()?.replaceAll('-', ' ')}
                </div>
              )}
            </TooltipContent>
          </Tooltip>
        ))}
      </TooltipProvider>
      
      {activeUsers.length > 5 && (
        <div className="flex items-center justify-center size-7 rounded-full bg-muted border-2 border-background text-[9px] font-medium text-muted-foreground z-0 ml-1">
          +{activeUsers.length - 5}
        </div>
      )}
    </div>
  );
}

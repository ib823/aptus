"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { TooltipRegistryEntry } from "@/types/onboarding";

interface TooltipContextValue {
  activeTooltips: TooltipRegistryEntry[];
  dismissTooltip: (key: string) => void;
  isTooltipActive: (key: string) => boolean;
}

const TooltipContext = createContext<TooltipContextValue>({
  activeTooltips: [],
  dismissTooltip: () => undefined,
  isTooltipActive: () => false,
});

export function useContextualTooltips(): TooltipContextValue {
  return useContext(TooltipContext);
}

interface ContextualTooltipProviderProps {
  initialTooltips: TooltipRegistryEntry[];
  onDismiss: (key: string) => Promise<void>;
  children: ReactNode;
}

export function ContextualTooltipProvider({
  initialTooltips,
  onDismiss,
  children,
}: ContextualTooltipProviderProps) {
  const [activeTooltips, setActiveTooltips] = useState<TooltipRegistryEntry[]>(initialTooltips);

  const dismissTooltip = useCallback(
    (key: string) => {
      setActiveTooltips((prev) => prev.filter((t) => t.key !== key));
      void onDismiss(key);
    },
    [onDismiss],
  );

  const isTooltipActive = useCallback(
    (key: string) => activeTooltips.some((t) => t.key === key),
    [activeTooltips],
  );

  return (
    <TooltipContext.Provider value={{ activeTooltips, dismissTooltip, isTooltipActive }}>
      {children}
    </TooltipContext.Provider>
  );
}

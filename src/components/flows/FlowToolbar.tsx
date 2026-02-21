"use client";

import { ZoomIn, ZoomOut, Maximize2, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FlowToolbarProps {
  zoom: number;
  riskOverlay: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToScreen: () => void;
  onToggleRiskOverlay: () => void;
}

export function FlowToolbar({
  zoom,
  riskOverlay,
  onZoomIn,
  onZoomOut,
  onFitToScreen,
  onToggleRiskOverlay,
}: FlowToolbarProps) {
  return (
    <div className="flex items-center gap-1 border rounded-lg p-1 bg-card shadow-sm">
      <Button variant="ghost" size="sm" onClick={onZoomOut} disabled={zoom <= 0.25}>
        <ZoomOut className="w-4 h-4" />
      </Button>
      <span className="text-xs text-muted-foreground px-2 min-w-[3rem] text-center">
        {Math.round(zoom * 100)}%
      </span>
      <Button variant="ghost" size="sm" onClick={onZoomIn} disabled={zoom >= 3}>
        <ZoomIn className="w-4 h-4" />
      </Button>
      <div className="w-px h-5 bg-border mx-1" />
      <Button variant="ghost" size="sm" onClick={onFitToScreen}>
        <Maximize2 className="w-4 h-4" />
      </Button>
      <div className="w-px h-5 bg-border mx-1" />
      <Button
        variant={riskOverlay ? "default" : "ghost"}
        size="sm"
        onClick={onToggleRiskOverlay}
      >
        <Layers className="w-4 h-4 mr-1" />
        <span className="text-xs">Risk</span>
      </Button>
    </div>
  );
}

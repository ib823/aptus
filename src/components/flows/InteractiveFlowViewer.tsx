"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { FlowToolbar } from "@/components/flows/FlowToolbar";
import { FlowLegend } from "@/components/flows/FlowLegend";
import type { InteractiveFlowData, FlowNode } from "@/types/flow";

interface InteractiveFlowViewerProps {
  data: InteractiveFlowData | null;
  loading?: boolean | undefined;
}

const STATUS_COLORS: Record<string, { fill: string; stroke: string; text: string }> = {
  FIT: { fill: "#dcfce7", stroke: "#22c55e", text: "#15803d" },
  CONFIGURE: { fill: "#dbeafe", stroke: "#3b82f6", text: "#1d4ed8" },
  GAP: { fill: "#fef3c7", stroke: "#f59e0b", text: "#b45309" },
  NA: { fill: "#f3f4f6", stroke: "#9ca3af", text: "#6b7280" },
  PENDING: { fill: "#f9fafb", stroke: "#d1d5db", text: "#9ca3af" },
};

export function InteractiveFlowViewer({ data, loading }: InteractiveFlowViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [riskOverlay, setRiskOverlay] = useState(false);
  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const handleZoomIn = useCallback(() => setZoom((z) => Math.min(z + 0.25, 3)), []);
  const handleZoomOut = useCallback(() => setZoom((z) => Math.max(z - 0.25, 0.25)), []);
  const handleFitToScreen = useCallback(() => setZoom(1), []);
  const handleToggleRiskOverlay = useCallback(() => setRiskOverlay((v) => !v), []);

  const handleNodeClick = useCallback((node: FlowNode, event: React.MouseEvent) => {
    if (selectedNode?.id === node.id) {
      setSelectedNode(null);
      setPopoverPos(null);
    } else {
      setSelectedNode(node);
      setPopoverPos({ x: event.clientX, y: event.clientY });
    }
  }, [selectedNode]);

  const viewBox = useMemo(() => {
    if (!data) return "0 0 800 400";
    return `0 0 ${data.viewBox.width} ${data.viewBox.height}`;
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground/60">
        Loading interactive view...
      </div>
    );
  }

  if (!data || data.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground/60 text-sm">
        No flow data available
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <FlowLegend />
        <FlowToolbar
          zoom={zoom}
          riskOverlay={riskOverlay}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onFitToScreen={handleFitToScreen}
          onToggleRiskOverlay={handleToggleRiskOverlay}
        />
      </div>

      <div className="border rounded-lg bg-card overflow-auto max-h-[calc(100vh-380px)] relative">
        <svg
          ref={svgRef}
          viewBox={viewBox}
          width={data.viewBox.width * zoom}
          height={data.viewBox.height * zoom}
          className="select-none"
        >
          <defs>
            <marker id="arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0,0 L10,5 L0,10 Z" fill="#d1d5db" />
            </marker>
          </defs>

          {/* Edges */}
          {data.edges.map((edge) => {
            const source = data.nodes.find((n) => n.id === edge.sourceId);
            const target = data.nodes.find((n) => n.id === edge.targetId);
            if (!source || !target) return null;
            const sx = source.position.x + source.width;
            const sy = source.position.y + source.height / 2;
            const tx = target.position.x;
            const ty = target.position.y + target.height / 2;

            if (Math.abs(sy - ty) < 5) {
              return (
                <line key={edge.id} x1={sx} y1={sy} x2={tx} y2={ty}
                  stroke="#d1d5db" strokeWidth={1.5} markerEnd="url(#arrowhead)" />
              );
            }
            const mx = sx + 20;
            return (
              <polyline key={edge.id}
                points={`${sx},${sy} ${mx},${sy} ${mx},${ty} ${tx},${ty}`}
                fill="none" stroke="#d1d5db" strokeWidth={1.5} markerEnd="url(#arrowhead)" />
            );
          })}

          {/* Nodes */}
          {data.nodes.map((node) => {
            const defaultColors = { fill: "#f9fafb", stroke: "#d1d5db", text: "#9ca3af" };
            const colors = STATUS_COLORS[node.fitStatus] ?? defaultColors;
            const isSelected = selectedNode?.id === node.id;
            const fillColor = riskOverlay && node.fitStatus === "GAP" ? "#fde68a" : colors.fill;

            return (
              <g key={node.id}
                onClick={(e) => handleNodeClick(node, e)}
                className="cursor-pointer"
              >
                <rect
                  x={node.position.x}
                  y={node.position.y}
                  width={node.width}
                  height={node.height}
                  rx={6}
                  fill={fillColor}
                  stroke={isSelected ? "#1d4ed8" : colors.stroke}
                  strokeWidth={isSelected ? 2.5 : 1.5}
                />
                <text
                  x={node.position.x + 8}
                  y={node.position.y + 22}
                  fontSize={10}
                  fill="#333"
                  className="pointer-events-none"
                >
                  {node.label.length > 22 ? node.label.slice(0, 21) + "\u2026" : node.label}
                </text>
                <text
                  x={node.position.x + 8}
                  y={node.position.y + 40}
                  fontSize={9}
                  fontWeight="bold"
                  fill={colors.text}
                  className="pointer-events-none"
                >
                  {node.fitStatus}
                </text>
                <text
                  x={node.position.x + node.width - 8}
                  y={node.position.y + 40}
                  fontSize={8}
                  fill="#9ca3af"
                  textAnchor="end"
                  className="pointer-events-none"
                >
                  #{node.stepSequence}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Popover for selected node */}
        {selectedNode && popoverPos && (
          <div
            className="fixed z-50 bg-card border rounded-lg shadow-lg p-4 max-w-xs"
            style={{ top: popoverPos.y + 10, left: popoverPos.x + 10 }}
          >
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold">{selectedNode.actionTitle}</h4>
              <button
                onClick={() => { setSelectedNode(null); setPopoverPos(null); }}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                Close
              </button>
            </div>
            <div className="space-y-1 text-xs">
              <p><span className="text-muted-foreground">Status:</span> <span className="font-medium">{selectedNode.fitStatus}</span></p>
              <p><span className="text-muted-foreground">Step:</span> #{selectedNode.stepSequence}</p>
              <p><span className="text-muted-foreground">Scope Item:</span> {selectedNode.scopeItemId}</p>
              {selectedNode.clientNote && (
                <p><span className="text-muted-foreground">Note:</span> {selectedNode.clientNote}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

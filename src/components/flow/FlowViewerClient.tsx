"use client";

import { useState, useRef, useCallback } from "react";
import { FlowNodePopover } from "./FlowNodePopover";
import type { InteractiveFlowData, FlowNode, RiskOverlayEntry } from "@/types/flow";

interface FlowViewerClientProps {
  interactiveData: InteractiveFlowData;
  riskOverlayData?: RiskOverlayEntry[] | undefined;
  assessmentId: string;
}

const STATUS_COLORS: Record<string, string> = {
  FIT: "#22c55e",
  CONFIGURE: "#3b82f6",
  GAP: "#f59e0b",
  NA: "#9ca3af",
  PENDING: "#d1d5db",
};

const RISK_BORDER_COLORS: Record<string, string> = {
  low: "#22c55e",
  medium: "#eab308",
  high: "#f97316",
  critical: "#ef4444",
};

function riskLevel(score: number): string {
  if (score < 0.3) return "low";
  if (score < 0.6) return "medium";
  if (score < 0.8) return "high";
  return "critical";
}

export function FlowViewerClient({
  interactiveData,
  riskOverlayData,
  assessmentId,
}: FlowViewerClientProps) {
  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null);
  const [showRiskOverlay, setShowRiskOverlay] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  const { nodes, edges, viewBox } = interactiveData;

  const riskMap = new Map(
    (riskOverlayData ?? []).map((r) => [r.nodeId, r]),
  );

  const handleNodeClick = useCallback((node: FlowNode) => {
    setSelectedNode((prev) => (prev?.id === node.id ? null : node));
  }, []);

  const handleZoomIn = () => setZoom((z) => Math.min(z * 1.25, 3));
  const handleZoomOut = () => setZoom((z) => Math.max(z / 1.25, 0.5));
  const handleZoomFit = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.min(Math.max(z * delta, 0.5), 3));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0 && (e.target as Element)?.tagName === "svg") {
      setIsPanning(true);
      panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    setPan({
      x: e.clientX - panStart.current.x,
      y: e.clientY - panStart.current.y,
    });
  }, [isPanning]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  if (nodes.length === 0) {
    return <div className="text-center text-muted-foreground py-12">No flow data available.</div>;
  }

  return (
    <div className="relative border rounded-lg bg-white overflow-hidden">
      {/* Controls */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
        <button onClick={handleZoomOut} className="px-2 py-1 bg-white border rounded text-sm shadow-sm hover:bg-slate-50" aria-label="Zoom out">−</button>
        <span className="text-xs text-muted-foreground w-12 text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={handleZoomIn} className="px-2 py-1 bg-white border rounded text-sm shadow-sm hover:bg-slate-50" aria-label="Zoom in">+</button>
        <button onClick={handleZoomFit} className="px-2 py-1 bg-white border rounded text-xs shadow-sm hover:bg-slate-50">Fit</button>
        {riskOverlayData && riskOverlayData.length > 0 && (
          <button
            onClick={() => setShowRiskOverlay(!showRiskOverlay)}
            className={`px-3 py-1 border rounded text-xs shadow-sm ${
              showRiskOverlay ? "bg-amber-50 border-amber-300 text-amber-700" : "bg-white hover:bg-slate-50"
            }`}
          >
            {showRiskOverlay ? "Hide Risk" : "Show Risk"}
          </button>
        )}
      </div>

      {/* Risk Legend */}
      {showRiskOverlay && (
        <div className="absolute top-3 left-3 z-10 bg-white border rounded p-2 shadow-sm text-xs space-y-1">
          <div className="font-medium">Risk Overlay</div>
          {(["low", "medium", "high", "critical"] as const).map((level) => (
            <div key={level} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded border-2"
                style={{ borderColor: RISK_BORDER_COLORS[level] }}
              />
              <span className="capitalize">{level}</span>
            </div>
          ))}
        </div>
      )}

      {/* SVG Canvas */}
      <div
        className="w-full overflow-hidden"
        style={{ height: Math.max(400, viewBox.height * zoom + 40) }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
          width={viewBox.width * zoom}
          height={viewBox.height * zoom}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px)`,
            cursor: isPanning ? "grabbing" : "grab",
          }}
        >
          <defs>
            <marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0,0 L10,5 L0,10 Z" fill="#888" />
            </marker>
          </defs>

          {/* Edges */}
          {edges.map((edge) => {
            const source = nodes.find((n) => n.id === edge.sourceId);
            const target = nodes.find((n) => n.id === edge.targetId);
            if (!source || !target) return null;
            const sx = source.position.x + source.width;
            const sy = source.position.y + source.height / 2;
            const tx = target.position.x;
            const ty = target.position.y + target.height / 2;

            if (Math.abs(sy - ty) < 5) {
              return <line key={edge.id} x1={sx} y1={sy} x2={tx} y2={ty} stroke="#999" strokeWidth={1.5} markerEnd="url(#flow-arrow)" />;
            }
            const mx = sx + 20;
            return (
              <polyline
                key={edge.id}
                points={`${sx},${sy} ${mx},${sy} ${mx},${ty} ${tx},${ty}`}
                fill="none"
                stroke="#999"
                strokeWidth={1.5}
                markerEnd="url(#flow-arrow)"
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const color = STATUS_COLORS[node.fitStatus] ?? STATUS_COLORS.PENDING;
            const riskEntry = riskMap.get(node.processStepId);
            const riskBorder = showRiskOverlay && riskEntry
              ? RISK_BORDER_COLORS[riskLevel(riskEntry.riskScore)]
              : undefined;
            const isSelected = selectedNode?.id === node.id;
            const { x, y } = node.position;

            return (
              <g
                key={node.id}
                onClick={() => handleNodeClick(node)}
                className="cursor-pointer"
                role="button"
                tabIndex={0}
              >
                <rect
                  x={x}
                  y={y}
                  width={node.width}
                  height={node.height}
                  rx={6}
                  fill={`${color}22`}
                  stroke={riskBorder ?? (isSelected ? "#000" : color)}
                  strokeWidth={riskBorder ? 3 : isSelected ? 2 : 1.5}
                />
                <text
                  x={x + 8}
                  y={y + 22}
                  fontSize={11}
                  fill="#333"
                  style={{ pointerEvents: "none" }}
                >
                  {node.label.length > 20 ? node.label.slice(0, 19) + "\u2026" : node.label}
                </text>
                <text
                  x={x + 8}
                  y={y + 40}
                  fontSize={9}
                  fill={color}
                  fontWeight="bold"
                  style={{ pointerEvents: "none" }}
                >
                  {node.fitStatus}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Node Popover */}
      {selectedNode && (
        <FlowNodePopover
          node={selectedNode}
          riskEntry={riskMap.get(selectedNode.processStepId)}
          onClose={() => setSelectedNode(null)}
          assessmentId={assessmentId}
        />
      )}
    </div>
  );
}

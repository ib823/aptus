"use client";

import { ProcessSwimlane } from "./ProcessSwimlane";
import { ActivityCluster } from "./ActivityCluster";
import type { HierarchyTree } from "@/types/hierarchy";

interface ProcessMapCanvasProps {
  tree: HierarchyTree;
  onActivitySelect: (activityId: string) => void;
}

const LANE_PADDING = 20;
const LANE_HEADER = 28;
const CLUSTER_WIDTH = 200;
const CLUSTER_HEIGHT = 60;
const CLUSTER_GAP_X = 20;
const CLUSTER_GAP_Y = 16;
const CLUSTERS_PER_ROW = 3;
const CANVAS_PADDING = 20;

export function ProcessMapCanvas({ tree, onActivitySelect }: ProcessMapCanvasProps) {
  let currentY = CANVAS_PADDING;
  const lanes: Array<{
    processName: string;
    laneX: number;
    laneY: number;
    laneWidth: number;
    laneHeight: number;
    activities: Array<{
      activityId: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }>;
  }> = [];

  for (const process of tree.processes) {
    const laneY = currentY;
    let activityY = laneY + LANE_HEADER;

    const allActivities: typeof lanes[number]["activities"] = [];

    for (const flow of process.flows) {
      for (let i = 0; i < flow.activities.length; i++) {
        const activity = flow.activities[i]!;
        const col = i % CLUSTERS_PER_ROW;
        const row = Math.floor(i / CLUSTERS_PER_ROW);

        const x = CANVAS_PADDING + LANE_PADDING + col * (CLUSTER_WIDTH + CLUSTER_GAP_X);
        const y = activityY + row * (CLUSTER_HEIGHT + CLUSTER_GAP_Y);

        allActivities.push({
          activityId: activity.id,
          x,
          y,
          width: CLUSTER_WIDTH,
          height: CLUSTER_HEIGHT,
        });
      }

      const flowRows = Math.ceil(flow.activities.length / CLUSTERS_PER_ROW);
      activityY += flowRows * (CLUSTER_HEIGHT + CLUSTER_GAP_Y);
    }

    const laneHeight = activityY - laneY + LANE_PADDING;
    const laneWidth = LANE_PADDING * 2 + CLUSTERS_PER_ROW * CLUSTER_WIDTH + (CLUSTERS_PER_ROW - 1) * CLUSTER_GAP_X;

    lanes.push({
      processName: process.name,
      laneX: CANVAS_PADDING,
      laneY,
      laneWidth,
      laneHeight,
      activities: allActivities,
    });

    currentY = laneY + laneHeight + 16;
  }

  const svgWidth = CANVAS_PADDING * 2 + LANE_PADDING * 2 + CLUSTERS_PER_ROW * CLUSTER_WIDTH + (CLUSTERS_PER_ROW - 1) * CLUSTER_GAP_X;
  const svgHeight = currentY + CANVAS_PADDING;

  // Build activity lookup for rendering
  const activityMap = new Map<string, (typeof tree.processes[number]["flows"][number]["activities"])[number]>();
  for (const p of tree.processes) {
    for (const f of p.flows) {
      for (const a of f.activities) {
        activityMap.set(a.id, a);
      }
    }
  }

  return (
    <svg
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      width="100%"
      height="100%"
      className="max-w-full"
      role="img"
      aria-label={`Process map for ${tree.scopeItemName}`}
    >
      <style>{`text { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }`}</style>

      {lanes.map((lane, i) => (
        <ProcessSwimlane
          key={i}
          name={lane.processName}
          x={lane.laneX}
          y={lane.laneY}
          width={lane.laneWidth}
          height={lane.laneHeight}
        >
          {/* Sequence arrows between activities — REM-20 */}
          {lane.activities.map((pos, idx) => {
            if (idx === 0) return null;
            const prev = lane.activities[idx - 1]!;
            const currCol = idx % CLUSTERS_PER_ROW;

            if (currCol > 0) {
              // Same row: horizontal arrow
              const x1 = prev.x + prev.width + 2;
              const y1 = prev.y + prev.height / 2;
              const x2 = pos.x - 2;
              const y2 = pos.y + pos.height / 2;
              return (
                <g key={`arrow-${idx}`}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#94a3b8" strokeWidth={1.5} />
                  <polygon
                    points={`${x2},${y2} ${x2 - 6},${y2 - 3} ${x2 - 6},${y2 + 3}`}
                    fill="#94a3b8"
                  />
                </g>
              );
            }

            // New row: vertical connector from end of previous row
            const x1 = prev.x + prev.width / 2;
            const y1 = prev.y + prev.height + 2;
            const x2 = pos.x + pos.width / 2;
            const y2 = pos.y - 2;
            const midY = (y1 + y2) / 2;
            return (
              <g key={`arrow-${idx}`}>
                <path
                  d={`M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`}
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth={1.5}
                />
                <polygon
                  points={`${x2},${y2} ${x2 - 3},${y2 - 6} ${x2 + 3},${y2 - 6}`}
                  fill="#94a3b8"
                />
              </g>
            );
          })}
          {lane.activities.map((pos) => {
            const activity = activityMap.get(pos.activityId);
            if (!activity) return null;
            return (
              <ActivityCluster
                key={pos.activityId}
                activity={activity}
                x={pos.x}
                y={pos.y}
                width={pos.width}
                height={pos.height}
                onSelect={onActivitySelect}
              />
            );
          })}
        </ProcessSwimlane>
      ))}
    </svg>
  );
}

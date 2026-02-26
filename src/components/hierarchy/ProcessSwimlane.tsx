"use client";

interface ProcessSwimlaneProps {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  children: React.ReactNode;
}

export function ProcessSwimlane({ name, x, y, width, height, children }: ProcessSwimlaneProps) {
  const displayName = name === "__main_process__" ? "Main Process" : name;

  return (
    <g>
      {/* Lane background */}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={6}
        fill="#fafafa"
        stroke="#e5e7eb"
        strokeWidth={1}
      />
      {/* Lane label */}
      <text
        x={x + 12}
        y={y + 18}
        fontSize={11}
        fontWeight="700"
        fill="#374151"
      >
        {displayName}
      </text>
      {children}
    </g>
  );
}

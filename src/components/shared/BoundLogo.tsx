"use client";

interface BoundLogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = {
  sm: "text-xl",
  md: "text-3xl",
  lg: "text-5xl",
} as const;

export function BoundLogo({ size = "md", className = "" }: BoundLogoProps) {
  return (
    <span
      className={`font-bold tracking-tight text-gray-950 ${sizeMap[size]} ${className}`}
      aria-label="Bound"
    >
      bound<span className="text-blue-500">&asymp;</span>
    </span>
  );
}

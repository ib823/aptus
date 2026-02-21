"use client";

interface BoundLogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = {
  sm: { height: 22 },
  md: { height: 34 },
  lg: { height: 46 },
} as const;

export function BoundLogo({ size = "md", className = "" }: BoundLogoProps) {
  const { height } = sizeMap[size];

  return (
    <span
      className={`inline-flex items-center ${className}`}
      aria-label="aptus"
    >
      <span
        className="text-foreground"
        style={{
          fontWeight: 500,
          letterSpacing: "-0.04em",
          fontSize: height * 0.95,
          lineHeight: 1,
        }}
      >
        aptus
      </span>
    </span>
  );
}

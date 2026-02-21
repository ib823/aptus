"use client";

interface BoundLogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = {
  sm: { height: 24 },
  md: { height: 36 },
  lg: { height: 48 },
} as const;

/**
 * Aptus logo — wordmark only (SF Pro Display).
 * The triple-bar mark is reserved for the favicon.
 */
export function BoundLogo({ size = "md", className = "" }: BoundLogoProps) {
  const { height } = sizeMap[size];

  return (
    <span
      className={`inline-flex items-center ${className}`}
      aria-label="Aptus"
    >
      <span
        className="text-gray-950"
        style={{
          fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif",
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

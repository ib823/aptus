"use client";

interface BoundLogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = {
  sm: { height: 24, wordmark: true },
  md: { height: 36, wordmark: true },
  lg: { height: 48, wordmark: true },
} as const;

/**
 * Aptus logo — uses the triple-bar mark + wordmark for md/lg,
 * and wordmark only for sm (nav bar).
 */
export function BoundLogo({ size = "md", className = "" }: BoundLogoProps) {
  const { height } = sizeMap[size];

  return (
    <span
      className={`inline-flex items-center gap-2 ${className}`}
      aria-label="Aptus"
    >
      {/* Triple-bar mark */}
      <svg
        viewBox="0 0 180 148"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        height={height}
        aria-hidden="true"
      >
        <rect x="0" y="0" width="180" height="28" rx="14" fill="currentColor" />
        <rect x="0" y="60" width="180" height="28" rx="14" fill="currentColor" />
        <rect x="0" y="120" width="180" height="28" rx="14" fill="currentColor" />
      </svg>
      {/* Wordmark */}
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

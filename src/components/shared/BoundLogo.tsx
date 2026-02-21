"use client";

interface BoundLogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = {
  sm: { icon: 20, text: 22 },
  md: { icon: 30, text: 34 },
  lg: { icon: 40, text: 46 },
} as const;

export function BoundLogo({ size = "md", className = "" }: BoundLogoProps) {
  const { icon, text } = sizeMap[size];

  return (
    <span
      className={`inline-flex items-center gap-2 ${className}`}
      aria-label="aptus"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 100 100"
        width={icon}
        height={icon}
        className="text-foreground shrink-0"
        aria-hidden="true"
      >
        <g fill="none" stroke="currentColor" strokeWidth="8.333" strokeLinecap="round" strokeLinejoin="round">
          <path d="M66.667 83.6A37.5 37.5 0 1 1 87.5 50v6.25a10.417 10.417 0 0 1-20.833 0V33.333m0 16.667a16.667 16.667 0 1 1-33.333 0 16.667 16.667 0 0 1 33.333 0Z" />
        </g>
      </svg>
      <span
        className="text-foreground"
        style={{
          fontWeight: 500,
          letterSpacing: "-0.04em",
          fontSize: text * 0.95,
          lineHeight: 1,
        }}
      >
        aptus
      </span>
    </span>
  );
}

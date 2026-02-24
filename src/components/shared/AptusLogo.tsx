interface AptusLogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  iconOnly?: boolean;
}

const sizeMap = {
  sm: { icon: 20, fontSize: 20 },
  md: { icon: 28, fontSize: 30 },
  lg: { icon: 36, fontSize: 40 },
} as const;

/** Aptus "a" logomark — derived from the app icon.svg */
function AptusIcon({ size }: { size: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden="true"
      className="shrink-0"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="8.333"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M66.667 83.6A37.5 37.5 0 1 1 87.5 50v6.25a10.417 10.417 0 0 1-20.833 0V33.333m0 16.667a16.667 16.667 0 1 1-33.333 0 16.667 16.667 0 0 1 33.333 0Z" />
      </g>
    </svg>
  );
}

export function AptusLogo({ size = "md", className = "", iconOnly = false }: AptusLogoProps) {
  const { icon, fontSize } = sizeMap[size];

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${className}`}
      aria-label="aptus"
    >
      <AptusIcon size={icon} />
      {!iconOnly && (
        <span
          className="text-foreground"
          style={{
            fontWeight: 500,
            letterSpacing: "-0.04em",
            fontSize,
            lineHeight: 1,
          }}
        >
          aptus
        </span>
      )}
    </span>
  );
}

import Image from "next/image";

import { APTUS_MARK_SVG_URL } from "@/lib/brand/assets";

interface ABeamLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizeMap = {
  sm: 24,
  md: 32,
  lg: 40,
  xl: 56,
} as const;

/**
 * Aptus logomark — geometric triangle SVG mark.
 * Component name kept as ABeamLogo for legacy import compatibility (~14 callers).
 * Asset resolved through `src/lib/brand/assets.ts` to keep all surfaces aligned.
 */
export function ABeamLogo({ size = "md", className = "" }: ABeamLogoProps) {
  const px = sizeMap[size];

  return (
    <span className={`inline-flex items-center ${className}`}>
      <Image
        src={APTUS_MARK_SVG_URL}
        alt="Aptus"
        width={px}
        height={px}
        className="shrink-0"
      />
    </span>
  );
}

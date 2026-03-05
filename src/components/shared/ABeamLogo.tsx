import Image from "next/image";

interface ABeamLogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = {
  sm: 24,
  md: 32,
  lg: 40,
} as const;

/** ABeam "ab" swoosh logomark */
export function ABeamLogo({ size = "md", className = "" }: ABeamLogoProps) {
  const px = sizeMap[size];

  return (
    <span className={`inline-flex items-center ${className}`}>
      <Image
        src="/icons/abeam-logo.png"
        alt="ABeam"
        width={px}
        height={px}
        className="shrink-0"
      />
    </span>
  );
}

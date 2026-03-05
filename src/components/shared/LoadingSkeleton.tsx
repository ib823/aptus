interface LoadingSkeletonProps {
  lines?: number;
  className?: string;
}

export function LoadingSkeleton({ lines = 3, className = "" }: LoadingSkeletonProps) {
  return (
    <div
      className={`space-y-3 ${className}`}
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-4 bg-[var(--sapContent_ImagePlaceholderBackground,#e0e0e0)] rounded animate-pulse"
          style={{ width: `${100 - i * 15}%` }}
        />
      ))}
    </div>
  );
}

export function CardSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`bg-card rounded-lg border p-5 ${className}`}
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      <div className="h-5 bg-[var(--sapContent_ImagePlaceholderBackground,#e0e0e0)] rounded animate-pulse w-2/3 mb-3" />
      <div className="h-4 bg-[var(--sapContent_ImagePlaceholderBackground,#e0e0e0)] rounded animate-pulse w-full mb-2" />
      <div className="h-4 bg-[var(--sapContent_ImagePlaceholderBackground,#e0e0e0)] rounded animate-pulse w-4/5" />
    </div>
  );
}

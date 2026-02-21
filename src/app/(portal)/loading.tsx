import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";

export default function PortalLoading() {
  return (
    <div className="max-w-5xl mx-auto py-8">
      <div className="h-8 bg-muted rounded animate-pulse w-48 mb-2" />
      <div className="h-4 bg-muted rounded animate-pulse w-80 mb-8" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card rounded-lg border p-4">
            <div className="h-3 bg-muted rounded animate-pulse w-20 mb-2" />
            <div className="h-6 bg-muted rounded animate-pulse w-12" />
          </div>
        ))}
      </div>
      <LoadingSkeleton lines={6} />
    </div>
  );
}

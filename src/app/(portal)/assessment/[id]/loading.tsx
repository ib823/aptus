import { CardSkeleton } from "@/components/shared/LoadingSkeleton";

export default function AssessmentLoading() {
  return (
    <div className="max-w-5xl mx-auto py-8">
      <div className="h-8 bg-muted rounded animate-pulse w-64 mb-2" />
      <div className="h-4 bg-muted rounded animate-pulse w-96 mb-8" />
      <div className="grid grid-cols-3 gap-4 mb-8">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-14 bg-muted rounded animate-pulse" />
        ))}
      </div>
    </div>
  );
}

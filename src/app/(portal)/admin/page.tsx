import { Suspense } from "react";
import { AdminStatsSection, StatsSkeleton } from "@/components/admin/AdminStatsSection";
import { AdminActivitySection, ActivitySkeleton } from "@/components/admin/AdminActivitySection";

export default function AdminPage() {
  return (
    <div className="max-w-5xl">
      <h1 className="text-3xl font-bold text-foreground tracking-tight mb-1">Admin Dashboard</h1>
      <p className="text-base text-muted-foreground mb-8">System overview and management</p>

      <Suspense fallback={<StatsSkeleton />}>
        <AdminStatsSection />
      </Suspense>

      <div className="mt-8">
        <Suspense fallback={<ActivitySkeleton />}>
          <AdminActivitySection />
        </Suspense>
      </div>
    </div>
  );
}

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { CrossPhaseAnalytics } from "@/components/analytics/CrossPhaseAnalytics";

interface CrossPhasePageProps {
  params: Promise<{ assessmentId: string }>;
}

export default async function CrossPhasePage({ params }: CrossPhasePageProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const { assessmentId } = await params;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Cross-Phase Analytics
        </h1>
        <p className="text-muted-foreground">
          Compare assessment phases and track changes over time.
        </p>
      </div>
      <CrossPhaseAnalytics assessmentId={assessmentId} />
    </div>
  );
}

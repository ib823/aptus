import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { BenchmarkComparison } from "@/components/analytics/BenchmarkComparison";

interface BenchmarkPageProps {
  params: Promise<{ assessmentId: string }>;
}

export default async function BenchmarkPage({ params }: BenchmarkPageProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const { assessmentId } = await params;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Engagement Comparison
        </h1>
        <p className="text-muted-foreground">
          Compare this assessment against other ABeam engagements recorded in
          Aptus, in the same industry and company size.
        </p>
      </div>
      <BenchmarkComparison assessmentId={assessmentId} />
    </div>
  );
}

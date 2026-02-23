import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { BenchmarkComparison } from "@/components/analytics/BenchmarkComparison";

interface BenchmarkPageProps {
  params: Promise<{ id: string }>;
}

export default async function AssessmentBenchmarksPage({ params }: BenchmarkPageProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const { id } = await params;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Benchmark Comparison
        </h1>
        <p className="text-muted-foreground">
          Compare this assessment against industry benchmarks.
        </p>
      </div>
      <BenchmarkComparison assessmentId={id} />
    </div>
  );
}

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { PortfolioDashboard } from "@/components/analytics/PortfolioDashboard";

export default async function AnalyticsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Portfolio Analytics
        </h1>
        <p className="text-muted-foreground">
          Overview of all assessments in your organization.
        </p>
      </div>
      <PortfolioDashboard />
    </div>
  );
}

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { IngestClient } from "@/components/admin/IngestClient";

export default async function IngestPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/dashboard");

  const scopeItemCount = await prisma.scopeItem.count();
  const processStepCount = await prisma.processStep.count();
  const configActivityCount = await prisma.configActivity.count();

  return (
    <IngestClient
      currentVersion="2508"
      counts={{
        scopeItems: scopeItemCount,
        processSteps: processStepCount,
        configActivities: configActivityCount,
      }}
    />
  );
}

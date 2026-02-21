import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { TemplatesManager } from "@/components/templates/TemplatesManager";

export default async function TemplatesPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (!user.organizationId) {
    redirect("/login");
  }

  // Load assessments for the create template dialog
  const assessments = await prisma.assessment.findMany({
    where: {
      organizationId: user.organizationId,
      deletedAt: null,
    },
    select: {
      id: true,
      companyName: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Assessment Templates
        </h1>
        <p className="text-muted-foreground">
          Create and manage reusable assessment templates.
        </p>
      </div>
      <TemplatesManager assessments={assessments} />
    </div>
  );
}

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { AdminCrudTable } from "@/components/admin/AdminCrudTable";

export default async function AdaptationPatternsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/dashboard");

  const patterns = await prisma.adaptationPattern.findMany({
    orderBy: { createdAt: "asc" },
  });

  return (
    <AdminCrudTable
      title="Adaptation Patterns"
      description="Common adaptation vs extension decision patterns with recommendations"
      apiPath="/api/admin/adaptation-patterns"
      columns={[
        { key: "commonGap", header: "Common Gap", format: "truncate" },
        { key: "recommendation", header: "Recommendation", width: "130px" },
        { key: "adaptEffort", header: "Adapt Effort", width: "120px" },
        { key: "extendEffort", header: "Extend Effort", width: "120px" },
      ]}
      initialData={patterns as unknown as Array<Record<string, unknown>>}
      formFields={[
        { key: "commonGap", label: "Common Gap", type: "textarea", required: true, placeholder: "Description of common gap scenario..." },
        { key: "sapApproach", label: "SAP Approach", type: "textarea", required: true, placeholder: "How SAP handles this..." },
        { key: "adaptEffort", label: "Adapt Effort", type: "textarea", required: true, placeholder: "Effort to adapt..." },
        { key: "extendEffort", label: "Extend Effort", type: "textarea", required: true, placeholder: "Effort to extend..." },
        { key: "recommendation", label: "Recommendation", type: "select", required: true, options: [
          { value: "ADAPT", label: "Adapt (Change Process)" },
          { value: "EXTEND", label: "Extend (Build)" },
        ]},
        { key: "rationale", label: "Rationale", type: "textarea", required: true, placeholder: "Why this recommendation..." },
      ]}
    />
  );
}

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { AdminCrudTable } from "@/components/admin/AdminCrudTable";

export default async function IndustriesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/dashboard");

  const profiles = await prisma.industryProfile.findMany({
    orderBy: { name: "asc" },
  });

  return (
    <AdminCrudTable
      title="Industry Profiles"
      description="Manage industry templates with pre-selected scope items"
      apiPath="/api/admin/industries"
      columns={[
        { key: "code", header: "Code", width: "120px" },
        { key: "name", header: "Name" },
        { key: "description", header: "Description", format: "truncate" },
        { key: "applicableScopeItems", header: "Scope Items", width: "100px" },
        { key: "typicalScopeCount", header: "Typical Count", width: "100px" },
      ]}
      initialData={profiles as unknown as Array<Record<string, unknown>>}
      formFields={[
        { key: "code", label: "Code", type: "text", required: true, placeholder: "e.g., manufacturing" },
        { key: "name", label: "Name", type: "text", required: true, placeholder: "e.g., Manufacturing" },
        { key: "description", label: "Description", type: "textarea", required: true, placeholder: "Industry profile description..." },
        { key: "typicalScopeCount", label: "Typical Scope Count", type: "number", min: 0 },
      ]}
    />
  );
}

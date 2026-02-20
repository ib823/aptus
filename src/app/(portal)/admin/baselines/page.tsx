import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { AdminCrudTable } from "@/components/admin/AdminCrudTable";

export default async function BaselinesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/dashboard");

  const baselines = await prisma.effortBaseline.findMany({
    orderBy: [{ scopeItemId: "asc" }, { complexity: "asc" }],
  });

  return (
    <AdminCrudTable
      title="Effort Baselines"
      description="Set implementation effort estimates per scope item and complexity level"
      apiPath="/api/admin/baselines"
      columns={[
        { key: "scopeItemId", header: "Scope Item", width: "120px" },
        { key: "complexity", header: "Complexity", width: "100px" },
        { key: "implementationDays", header: "Impl. Days", width: "90px" },
        { key: "configDays", header: "Config Days", width: "90px" },
        { key: "testDays", header: "Test Days", width: "80px" },
        { key: "confidence", header: "Confidence", width: "90px", render: (v) => <span>{typeof v === "number" ? `${Math.round(v * 100)}%` : "—"}</span> },
      ]}
      initialData={baselines as unknown as Array<Record<string, unknown>>}
      formFields={[
        { key: "scopeItemId", label: "Scope Item ID", type: "text", required: true, placeholder: "e.g., J60" },
        { key: "complexity", label: "Complexity", type: "select", required: true, options: [
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High" },
        ]},
        { key: "implementationDays", label: "Implementation Days", type: "number", min: 0, step: 0.5 },
        { key: "configDays", label: "Configuration Days", type: "number", min: 0, step: 0.5 },
        { key: "testDays", label: "Test Days", type: "number", min: 0, step: 0.5 },
        { key: "dataMigrationDays", label: "Data Migration Days", type: "number", min: 0, step: 0.5 },
        { key: "trainingDays", label: "Training Days", type: "number", min: 0, step: 0.5 },
        { key: "confidence", label: "Confidence (0-1)", type: "number", min: 0, max: 1, step: 0.1 },
        { key: "source", label: "Source", type: "text", placeholder: "e.g., Historical data" },
        { key: "notes", label: "Notes", type: "textarea", placeholder: "Additional notes..." },
      ]}
    />
  );
}

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { AdminCrudTable } from "@/components/admin/AdminCrudTable";

export default async function ExtensibilityPatternsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/dashboard");

  const patterns = await prisma.extensibilityPattern.findMany({
    orderBy: [{ resolutionType: "asc" }, { createdAt: "asc" }],
  });

  return (
    <AdminCrudTable
      title="Extensibility Patterns"
      description="Common gap patterns with resolution templates for different extensibility approaches"
      apiPath="/api/admin/extensibility-patterns"
      columns={[
        { key: "resolutionType", header: "Type", width: "130px" },
        { key: "gapPattern", header: "Gap Pattern", format: "truncate" },
        { key: "effortDays", header: "Effort", width: "80px" },
        { key: "riskLevel", header: "Risk", width: "80px" },
        { key: "sapSupported", header: "SAP", width: "60px" },
        { key: "upgradeSafe", header: "Upgrade Safe", width: "100px" },
      ]}
      initialData={patterns as unknown as Array<Record<string, unknown>>}
      formFields={[
        { key: "resolutionType", label: "Resolution Type", type: "select", required: true, options: [
          { value: "KEY_USER", label: "Key User Extensibility" },
          { value: "BTP", label: "SAP BTP Extension" },
          { value: "ISV", label: "ISV/Partner Solution" },
          { value: "CUSTOM_ABAP", label: "Custom ABAP (RAP)" },
          { value: "NOT_POSSIBLE", label: "Not Possible" },
        ]},
        { key: "gapPattern", label: "Gap Pattern", type: "textarea", required: true, placeholder: "Description of common gap..." },
        { key: "resolutionDescription", label: "Resolution Description", type: "textarea", required: true, placeholder: "How to resolve..." },
        { key: "effortDays", label: "Effort (days)", type: "number", min: 0, step: 0.5 },
        { key: "recurringCostAnnual", label: "Annual Recurring Cost", type: "number", min: 0 },
        { key: "riskLevel", label: "Risk Level", type: "select", required: true, options: [
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High" },
        ]},
        { key: "sapSupported", label: "SAP Supported", type: "boolean", placeholder: "Supported by SAP" },
        { key: "upgradeSafe", label: "Upgrade Safe", type: "boolean", placeholder: "Safe during upgrades" },
      ]}
    />
  );
}

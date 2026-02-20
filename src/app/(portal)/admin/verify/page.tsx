import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export default async function VerifyPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/dashboard");

  // Run verification checks
  const checks: Array<{ name: string; status: "pass" | "fail"; detail: string }> = [];

  const scopeItemCount = await prisma.scopeItem.count();
  checks.push({
    name: "Scope items loaded",
    status: scopeItemCount > 0 ? "pass" : "fail",
    detail: `${scopeItemCount} scope items`,
  });

  const processStepCount = await prisma.processStep.count();
  checks.push({
    name: "Process steps loaded",
    status: processStepCount > 0 ? "pass" : "fail",
    detail: `${processStepCount.toLocaleString()} steps`,
  });

  const configActivityCount = await prisma.configActivity.count();
  checks.push({
    name: "Config activities loaded",
    status: configActivityCount > 0 ? "pass" : "fail",
    detail: `${configActivityCount.toLocaleString()} activities`,
  });

  // Check scope items have functional areas
  const noAreaCount = await prisma.scopeItem.count({ where: { functionalArea: "" } });
  checks.push({
    name: "Scope items have functional areas",
    status: noAreaCount === 0 ? "pass" : "fail",
    detail: noAreaCount === 0 ? "All have areas" : `${noAreaCount} missing`,
  });

  // Check process steps have valid scope items
  const allStepScopeIds = await prisma.processStep.findMany({
    select: { scopeItemId: true },
    distinct: ["scopeItemId"],
  });
  const validScopeIds = new Set((await prisma.scopeItem.findMany({ select: { id: true } })).map((s) => s.id));
  const orphanStepScopes = allStepScopeIds.filter((s) => !validScopeIds.has(s.scopeItemId)).length;
  checks.push({
    name: "Process steps linked to scope items",
    status: orphanStepScopes === 0 ? "pass" : "fail",
    detail: orphanStepScopes === 0 ? "All linked" : `${orphanStepScopes} orphan scope IDs`,
  });

  // Check config activities have valid scope items
  const allConfigScopeIds = await prisma.configActivity.findMany({
    select: { scopeItemId: true },
    distinct: ["scopeItemId"],
  });
  const orphanConfigScopes = allConfigScopeIds.filter((s) => !validScopeIds.has(s.scopeItemId)).length;
  checks.push({
    name: "Config activities linked to scope items",
    status: orphanConfigScopes === 0 ? "pass" : "fail",
    detail: orphanConfigScopes === 0 ? "All linked" : `${orphanConfigScopes} orphan scope IDs`,
  });

  // Check for duplicate scope items
  const scopeIds = await prisma.scopeItem.findMany({ select: { id: true } });
  const uniqueIds = new Set(scopeIds.map((s) => s.id));
  checks.push({
    name: "No duplicate scope item IDs",
    status: uniqueIds.size === scopeIds.length ? "pass" : "fail",
    detail: `${uniqueIds.size} unique of ${scopeIds.length}`,
  });

  const passed = checks.filter((c) => c.status === "pass").length;

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-bold text-gray-950 tracking-tight mb-1">Data Verification</h1>
      <p className="text-base text-gray-600 mb-8">
        {passed}/{checks.length} checks passed
      </p>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-2 text-left font-medium text-gray-500 w-8">#</th>
              <th className="px-4 py-2 text-left font-medium text-gray-500">Check</th>
              <th className="px-4 py-2 text-left font-medium text-gray-500">Status</th>
              <th className="px-4 py-2 text-left font-medium text-gray-500">Detail</th>
            </tr>
          </thead>
          <tbody>
            {checks.map((check, idx) => (
              <tr key={check.name} className="border-b border-gray-100">
                <td className="px-4 py-2.5 text-gray-400">{idx + 1}</td>
                <td className="px-4 py-2.5 font-medium text-gray-900">{check.name}</td>
                <td className="px-4 py-2.5">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    check.status === "pass"
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}>
                    {check.status === "pass" ? "PASS" : "FAIL"}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-gray-500">{check.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

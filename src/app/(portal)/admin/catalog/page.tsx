import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export default async function CatalogPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/dashboard");

  const scopeItemCount = await prisma.scopeItem.count();
  const processStepCount = await prisma.processStep.count();
  const configActivityCount = await prisma.configActivity.count();

  // Get functional area distribution
  const areaGroups = await prisma.scopeItem.groupBy({
    by: ["functionalArea"],
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
  });

  return (
    <div className="max-w-5xl">
      <h1 className="text-3xl font-bold text-gray-950 tracking-tight mb-1">SAP Catalog</h1>
      <p className="text-base text-gray-600 mb-8">
        SAP Best Practices for S/4HANA Cloud Public Edition — Version 2508
      </p>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-lg border border-gray-200 p-6 text-center">
          <p className="text-3xl font-bold text-gray-950">{scopeItemCount.toLocaleString()}</p>
          <p className="text-sm text-gray-500 mt-1">Scope Items</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6 text-center">
          <p className="text-3xl font-bold text-gray-950">{processStepCount.toLocaleString()}</p>
          <p className="text-sm text-gray-500 mt-1">Process Steps</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6 text-center">
          <p className="text-3xl font-bold text-gray-950">{configActivityCount.toLocaleString()}</p>
          <p className="text-sm text-gray-500 mt-1">Config Activities</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">
          Scope Items by Functional Area
        </h3>
        <div className="space-y-2">
          {areaGroups.map((group) => (
            <div key={group.functionalArea} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
              <span className="text-sm text-gray-700">{group.functionalArea}</span>
              <span className="text-sm font-medium text-gray-950">{group._count.id}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

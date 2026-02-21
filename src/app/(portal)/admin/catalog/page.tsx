import { prisma } from "@/lib/db/prisma";
import { getCatalogStats } from "@/lib/db/cached-queries";

export default async function CatalogPage() {
  const [catalog, areaGroups] = await Promise.all([
    getCatalogStats(),
    prisma.scopeItem.groupBy({
      by: ["functionalArea"],
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    }),
  ]);
  const { scopeItems: scopeItemCount, processSteps: processStepCount, configActivities: configActivityCount } = catalog;

  return (
    <div className="max-w-5xl">
      <h1 className="text-3xl font-bold text-foreground tracking-tight mb-1">SAP Catalog</h1>
      <p className="text-base text-muted-foreground mb-8">
        SAP Best Practices for S/4HANA Cloud Public Edition — Version 2508
      </p>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-card rounded-lg border border-border p-6 text-center">
          <p className="text-3xl font-bold text-foreground">{scopeItemCount.toLocaleString()}</p>
          <p className="text-sm text-muted-foreground mt-1">Scope Items</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-6 text-center">
          <p className="text-3xl font-bold text-foreground">{processStepCount.toLocaleString()}</p>
          <p className="text-sm text-muted-foreground mt-1">Process Steps</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-6 text-center">
          <p className="text-3xl font-bold text-foreground">{configActivityCount.toLocaleString()}</p>
          <p className="text-sm text-muted-foreground mt-1">Config Activities</p>
        </div>
      </div>

      <div className="bg-card rounded-lg border border-border p-6">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
          Scope Items by Functional Area
        </h3>
        <div className="space-y-2">
          {areaGroups.map((group) => (
            <div key={group.functionalArea} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
              <span className="text-sm text-foreground">{group.functionalArea}</span>
              <span className="text-sm font-medium text-foreground">{group._count.id}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

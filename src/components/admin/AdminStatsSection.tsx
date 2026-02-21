import { prisma } from "@/lib/db/prisma";
import { getCatalogStats, getIntelligenceStats } from "@/lib/db/cached-queries";
import { Building2, BarChart3, Puzzle, ArrowLeftRight, Database, FileText, Settings, Activity } from "lucide-react";

export async function AdminStatsSection() {
  const [assessments, catalog, intelligence] = await Promise.all([
    prisma.assessment.findMany({ where: { deletedAt: null }, select: { status: true } }),
    getCatalogStats(),
    getIntelligenceStats(),
  ]);

  const totalAssessments = assessments.length;
  const activeAssessments = assessments.filter((a) => a.status === "in_progress" || a.status === "completed").length;
  const signedOffAssessments = assessments.filter((a) => a.status === "signed_off").length;
  const { scopeItems: scopeItemCount, processSteps: processStepCount, configActivities: configActivityCount } = catalog;
  const { industries: industryCount, baselines: baselineCount, extensibilityPatterns: extPatternCount, adaptationPatterns: adaptPatternCount } = intelligence;

  return (
    <>
      {/* Assessment metrics */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <MetricCard icon={FileText} label="Total Assessments" value={totalAssessments} />
        <MetricCard icon={Activity} label="Active" value={activeAssessments} color="text-blue-600" />
        <MetricCard icon={Settings} label="Signed Off" value={signedOffAssessments} color="text-green-600" />
        <MetricCard icon={Database} label="SAP Version" value="2508" />
      </div>

      {/* Data health */}
      <div className="bg-card rounded-lg border p-6 mb-8">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
          SAP Catalog Data
        </h3>
        <div className="grid grid-cols-3 gap-6">
          <div>
            <p className="text-2xl font-bold text-foreground">{scopeItemCount.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">Scope Items</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{processStepCount.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">Process Steps</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{configActivityCount.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">Config Activities</p>
          </div>
        </div>
      </div>

      {/* Intelligence layer */}
      <div className="bg-card rounded-lg border p-6">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
          Intelligence Layer
        </h3>
        <div className="grid grid-cols-4 gap-4">
          <a href="/admin/industries" className="block bg-muted/40 rounded-lg p-4 hover:bg-accent transition-colors">
            <Building2 className="w-5 h-5 text-muted-foreground/60 mb-2" />
            <p className="text-xl font-bold text-foreground">{industryCount}</p>
            <p className="text-xs text-muted-foreground">Industry Profiles</p>
          </a>
          <a href="/admin/baselines" className="block bg-muted/40 rounded-lg p-4 hover:bg-accent transition-colors">
            <BarChart3 className="w-5 h-5 text-muted-foreground/60 mb-2" />
            <p className="text-xl font-bold text-foreground">{baselineCount}</p>
            <p className="text-xs text-muted-foreground">Effort Baselines</p>
          </a>
          <a href="/admin/extensibility-patterns" className="block bg-muted/40 rounded-lg p-4 hover:bg-accent transition-colors">
            <Puzzle className="w-5 h-5 text-muted-foreground/60 mb-2" />
            <p className="text-xl font-bold text-foreground">{extPatternCount}</p>
            <p className="text-xs text-muted-foreground">Extensibility Patterns</p>
          </a>
          <a href="/admin/adaptation-patterns" className="block bg-muted/40 rounded-lg p-4 hover:bg-accent transition-colors">
            <ArrowLeftRight className="w-5 h-5 text-muted-foreground/60 mb-2" />
            <p className="text-xl font-bold text-foreground">{adaptPatternCount}</p>
            <p className="text-xs text-muted-foreground">Adaptation Patterns</p>
          </a>
        </div>
      </div>
    </>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string | undefined }>;
  label: string;
  value: number | string;
  color?: string | undefined;
}) {
  return (
    <div className="bg-card rounded-lg border p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-muted-foreground/60" />
        <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      </div>
      <p className={`text-2xl font-bold ${color ?? "text-foreground"}`}>{value}</p>
    </div>
  );
}

export function StatsSkeleton() {
  return (
    <>
      <div className="grid grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card rounded-lg border p-4">
            <div className="h-3 bg-muted rounded animate-pulse w-20 mb-2" />
            <div className="h-6 bg-muted rounded animate-pulse w-12" />
          </div>
        ))}
      </div>
      <div className="bg-card rounded-lg border p-6 mb-8">
        <div className="h-3 bg-muted rounded animate-pulse w-32 mb-4" />
        <div className="grid grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i}>
              <div className="h-7 bg-muted rounded animate-pulse w-16 mb-1" />
              <div className="h-4 bg-muted rounded animate-pulse w-24" />
            </div>
          ))}
        </div>
      </div>
      <div className="bg-card rounded-lg border p-6">
        <div className="h-3 bg-muted rounded animate-pulse w-36 mb-4" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-muted/40 rounded-lg p-4">
              <div className="h-5 bg-muted rounded animate-pulse w-5 mb-2" />
              <div className="h-6 bg-muted rounded animate-pulse w-8 mb-1" />
              <div className="h-3 bg-muted rounded animate-pulse w-24" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

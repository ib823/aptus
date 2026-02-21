"use client";

import { Building2, BarChart3, Puzzle, ArrowLeftRight, Database, FileText, Settings, Activity } from "lucide-react";

interface AdminStats {
  assessments: { total: number; active: number; signedOff: number };
  catalog: { scopeItems: number; processSteps: number; configActivities: number };
  intelligence: { industries: number; baselines: number; extensibilityPatterns: number; adaptationPatterns: number };
}

interface ActivityEntry {
  id: string;
  assessmentId: string;
  entityType: string;
  action: string;
  actor: string;
  actorRole: string;
  timestamp: string;
}

interface AdminOverviewClientProps {
  stats: AdminStats;
  recentActivity: ActivityEntry[];
}

export function AdminOverviewClient({ stats, recentActivity }: AdminOverviewClientProps) {
  return (
    <div className="max-w-5xl">
      <h1 className="text-3xl font-bold text-foreground tracking-tight mb-1">Admin Dashboard</h1>
      <p className="text-base text-muted-foreground mb-8">System overview and management</p>

      {/* Assessment metrics */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <MetricCard icon={FileText} label="Total Assessments" value={stats.assessments.total} />
        <MetricCard icon={Activity} label="Active" value={stats.assessments.active} color="text-blue-600" />
        <MetricCard icon={Settings} label="Signed Off" value={stats.assessments.signedOff} color="text-green-600" />
        <MetricCard icon={Database} label="SAP Version" value="2508" />
      </div>

      {/* Data health */}
      <div className="bg-card rounded-lg border p-6 mb-8">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
          SAP Catalog Data
        </h3>
        <div className="grid grid-cols-3 gap-6">
          <div>
            <p className="text-2xl font-bold text-foreground">{stats.catalog.scopeItems.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">Scope Items</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{stats.catalog.processSteps.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">Process Steps</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{stats.catalog.configActivities.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">Config Activities</p>
          </div>
        </div>
      </div>

      {/* Intelligence layer */}
      <div className="bg-card rounded-lg border p-6 mb-8">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
          Intelligence Layer
        </h3>
        <div className="grid grid-cols-4 gap-4">
          <IntCard icon={Building2} label="Industry Profiles" value={stats.intelligence.industries} href="/admin/industries" />
          <IntCard icon={BarChart3} label="Effort Baselines" value={stats.intelligence.baselines} href="/admin/baselines" />
          <IntCard icon={Puzzle} label="Extensibility Patterns" value={stats.intelligence.extensibilityPatterns} href="/admin/extensibility-patterns" />
          <IntCard icon={ArrowLeftRight} label="Adaptation Patterns" value={stats.intelligence.adaptationPatterns} href="/admin/adaptation-patterns" />
        </div>
      </div>

      {/* Recent activity */}
      <div className="bg-card rounded-lg border p-6">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
          Recent Activity
        </h3>
        {recentActivity.length === 0 ? (
          <p className="text-sm text-muted-foreground/60">No recent activity</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {recentActivity.map((entry) => (
              <div key={entry.id} className="flex items-center gap-3 text-sm py-1.5 border-b border-border/50 last:border-0">
                <span className="text-xs text-muted-foreground/60 w-36 shrink-0">
                  {new Date(entry.timestamp).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="text-muted-foreground truncate">{entry.actor}</span>
                <span className="text-foreground font-medium truncate">{entry.action}</span>
                <span className="text-xs text-muted-foreground/60">{entry.entityType}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
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

function IntCard({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: React.ComponentType<{ className?: string | undefined }>;
  label: string;
  value: number;
  href: string;
}) {
  return (
    <a href={href} className="block bg-muted/40 rounded-lg p-4 hover:bg-accent transition-colors">
      <Icon className="w-5 h-5 text-muted-foreground/60 mb-2" />
      <p className="text-xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </a>
  );
}

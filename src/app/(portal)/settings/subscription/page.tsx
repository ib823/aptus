"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/PageHeader";

interface SubscriptionData {
  plan: string;
  subscriptionStatus: string;
  trialEndsAt: string | null;
  usage: {
    assessments: { current: number; limit: number };
    users: { current: number; limit: number };
  };
}

const PLAN_LABELS: Record<string, string> = {
  TRIAL: "Trial",
  STARTER: "Starter",
  PROFESSIONAL: "Professional",
  ENTERPRISE: "Enterprise",
};

const STATUS_COLORS: Record<string, string> = {
  TRIALING: "bg-blue-100 text-blue-800",
  ACTIVE: "bg-green-100 text-green-800",
  PAST_DUE: "bg-amber-100 text-amber-800",
  CANCELED: "bg-red-100 text-red-800",
  TRIAL_EXPIRED: "bg-red-100 text-red-800",
};

export default function SubscriptionPage() {
  const [data, setData] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/partner/settings/subscription");
        if (res.ok) {
          const json = await res.json() as { data: SubscriptionData };
          setData(json.data ?? null);
        } else if (res.status === 403) {
          setError("You don't have permission to view subscription settings.");
        } else {
          setError(`Failed to load subscription data (${res.status}).`);
        }
      } catch {
        setError("Network error — please check your connection and try again.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return <div className="max-w-3xl mx-auto py-8"><p className="text-muted-foreground">Loading...</p></div>;
  }

  if (!data) {
    return <div className="max-w-3xl mx-auto py-8"><p className="text-muted-foreground">{error ?? "Unable to load subscription data."}</p></div>;
  }

  const daysRemaining = data.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(data.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        title="Subscription"
        description="Your organization's plan and usage"
      />

      {/* Current plan */}
      <div className="bg-card border rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">{PLAN_LABELS[data.plan] ?? data.plan} Plan</h3>
            <div className="flex items-center gap-2 mt-1">
              <Badge className={STATUS_COLORS[data.subscriptionStatus] ?? ""}>{data.subscriptionStatus}</Badge>
              {data.subscriptionStatus === "TRIALING" && daysRemaining > 0 && (
                <span className="text-sm text-muted-foreground">{daysRemaining} days remaining</span>
              )}
            </div>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Plan changes are managed by your account administrator. Contact your administrator
          if you need to update limits or upgrade.
        </p>
      </div>

      {/* Usage */}
      <div className="bg-card border rounded-lg p-6">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Usage</h3>
        <div className="grid grid-cols-2 gap-6">
          <UsageBar
            label="Active Assessments"
            current={data.usage.assessments.current}
            limit={data.usage.assessments.limit}
          />
          <UsageBar
            label="Team Members"
            current={data.usage.users.current}
            limit={data.usage.users.limit}
          />
        </div>
      </div>
    </div>
  );
}

function UsageBar({ label, current, limit }: { label: string; current: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((current / limit) * 100)) : 0;
  const isNearLimit = pct >= 80;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-foreground">{label}</span>
        <span className={`text-sm font-medium ${isNearLimit ? "text-amber-600" : "text-muted-foreground"}`}>
          {current} / {limit >= 999 ? "Unlimited" : limit}
        </span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isNearLimit ? "bg-amber-500" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

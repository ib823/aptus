"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";

interface SubscriptionData {
  plan: string;
  subscriptionStatus: string;
  trialEndsAt: string | null;
  billingEmail: string | null;
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
  const [upgrading, setUpgrading] = useState(false);

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

  const handleUpgrade = async (plan: string) => {
    setUpgrading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (res.ok) {
        const json = await res.json() as { data: { url: string } };
        window.location.href = json.data.url;
      }
    } finally {
      setUpgrading(false);
    }
  };

  const handleManageBilling = async () => {
    const res = await fetch("/api/stripe/portal", { method: "POST" });
    if (res.ok) {
      const json = await res.json() as { data: { url: string } };
      window.location.href = json.data.url;
    }
  };

  if (loading) {
    return <div className="max-w-3xl mx-auto py-8"><p className="text-muted-foreground">Loading...</p></div>;
  }

  if (!data) {
    return <div className="max-w-3xl mx-auto py-8"><p className="text-muted-foreground">{error ?? "Unable to load subscription data."}</p></div>;
  }

  const isActive = data.subscriptionStatus === "ACTIVE" || data.subscriptionStatus === "TRIALING";
  const daysRemaining = data.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(data.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        title="Subscription"
        description="Manage your organization's plan and billing"
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
          {isActive && data.subscriptionStatus !== "TRIALING" && (
            <Button variant="outline" onClick={handleManageBilling}>
              Manage Billing
            </Button>
          )}
        </div>

        {data.billingEmail && (
          <p className="text-sm text-muted-foreground">Billing email: {data.billingEmail}</p>
        )}
      </div>

      {/* Usage */}
      <div className="bg-card border rounded-lg p-6 mb-6">
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

      {/* Upgrade options */}
      {(data.plan === "TRIAL" || data.plan === "STARTER") && (
        <div className="bg-card border rounded-lg p-6">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Upgrade Plan</h3>
          <div className="grid grid-cols-2 gap-4">
            {data.plan === "TRIAL" && (
              <PlanCard
                name="Starter"
                price="$299/mo"
                features={["3 assessments", "10 users", "Standard reports"]}
                onSelect={() => handleUpgrade("STARTER")}
                loading={upgrading}
              />
            )}
            <PlanCard
              name="Professional"
              price="$799/mo"
              features={["10 assessments", "30 users", "Registers", "Workshops", "Analytics"]}
              onSelect={() => handleUpgrade("PROFESSIONAL")}
              loading={upgrading}
              highlighted
            />
            <PlanCard
              name="Enterprise"
              price="Custom"
              features={["Unlimited", "SSO/SCIM", "Custom branding", "API access", "Dedicated CSM"]}
              onSelect={() => handleUpgrade("ENTERPRISE")}
              loading={upgrading}
            />
          </div>
        </div>
      )}
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
          className={`h-full rounded-full transition-all ${isNearLimit ? "bg-amber-500" : "bg-blue-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function PlanCard({
  name,
  price,
  features,
  onSelect,
  loading,
  highlighted,
}: {
  name: string;
  price: string;
  features: string[];
  onSelect: () => void;
  loading: boolean;
  highlighted?: boolean | undefined;
}) {
  return (
    <div className={`border rounded-lg p-4 ${highlighted ? "border-blue-500 ring-1 ring-blue-500" : ""}`}>
      <h4 className="font-semibold">{name}</h4>
      <p className="text-2xl font-bold mt-1">{price}</p>
      <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
        {features.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      <Button
        className="w-full mt-4"
        variant={highlighted ? "default" : "outline"}
        onClick={onSelect}
        disabled={loading}
      >
        {loading ? "Processing..." : "Select"}
      </Button>
    </div>
  );
}

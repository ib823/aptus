"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lock } from "lucide-react";
import { PLAN_LIMITS, type PlanFeature, type PlanTier } from "@/types/commercial";

interface UpgradePromptProps {
  feature: PlanFeature;
  currentPlan: PlanTier;
}

const FEATURE_LABELS: Record<PlanFeature, string> = {
  core_assessment: "Core Assessment",
  standard_reports: "Standard Reports",
  registers: "Registers",
  workshop_mode: "Workshop Mode",
  analytics: "Analytics",
  sso_scim: "SSO / SCIM",
  custom_branding: "Custom Branding",
  api_access: "API Access",
  audit_export: "Audit Export",
  dedicated_csm: "Dedicated CSM",
};

const TIERS_ORDER: PlanTier[] = ["TRIAL", "STARTER", "PROFESSIONAL", "ENTERPRISE"];

function getRequiredPlan(feature: PlanFeature): PlanTier {
  for (const tier of TIERS_ORDER) {
    if (PLAN_LIMITS[tier].features.includes(feature)) {
      return tier;
    }
  }
  return "ENTERPRISE";
}

export function UpgradePrompt({ feature, currentPlan }: UpgradePromptProps) {
  const requiredPlan = getRequiredPlan(feature);

  return (
    <Card className="border-dashed">
      <CardContent className="pt-6 text-center">
        <Lock className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
        <p className="font-medium mb-1">
          {FEATURE_LABELS[feature]} is not available on your plan
        </p>
        <p className="text-sm text-muted-foreground mb-4">
          You are currently on{" "}
          <Badge variant="outline" className="mx-1">{currentPlan}</Badge>.
          Upgrade to{" "}
          <Badge variant="outline" className="mx-1">{requiredPlan}</Badge>{" "}
          or higher to access this feature.
        </p>
        <Button variant="default">View Plans</Button>
      </CardContent>
    </Card>
  );
}

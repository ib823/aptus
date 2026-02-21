"use client";

import type { PlanFeature, PlanTier } from "@/types/commercial";
import { hasFeature } from "@/lib/commercial/plan-engine";
import { UpgradePrompt } from "./UpgradePrompt";
import type { ReactNode } from "react";

interface FeatureGateProps {
  feature: PlanFeature;
  plan: PlanTier;
  children: ReactNode;
}

export function FeatureGate({ feature, plan, children }: FeatureGateProps) {
  if (hasFeature(plan, feature)) {
    return <>{children}</>;
  }

  return <UpgradePrompt feature={feature} currentPlan={plan} />;
}

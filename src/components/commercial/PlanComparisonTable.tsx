"use client";

import { Check, X } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PLAN_LIMITS, type PlanTier, type PlanFeature } from "@/types/commercial";

const TIERS: PlanTier[] = ["TRIAL", "STARTER", "PROFESSIONAL", "ENTERPRISE"];

const FEATURE_LABELS: Record<PlanFeature, string> = {
  core_assessment: "Core Assessment",
  standard_reports: "Standard Reports",
  registers: "Registers (Integration, DM, OCM)",
  workshop_mode: "Workshop Mode",
  analytics: "Analytics Dashboard",
  sso_scim: "SSO / SCIM Provisioning",
  custom_branding: "Custom Branding",
  api_access: "API Access",
  audit_export: "Audit Trail Export",
  dedicated_csm: "Dedicated CSM",
};

const ALL_FEATURES: PlanFeature[] = [
  "core_assessment", "standard_reports", "registers", "workshop_mode",
  "analytics", "sso_scim", "custom_branding", "api_access",
  "audit_export", "dedicated_csm",
];

function hasFeature(plan: PlanTier, feature: PlanFeature): boolean {
  return PLAN_LIMITS[plan].features.includes(feature);
}

function formatLimit(n: number): string {
  if (n === Infinity) return "Unlimited";
  return String(n);
}

export function PlanComparisonTable() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[200px]">Feature</TableHead>
          {TIERS.map((tier) => (
            <TableHead key={tier} className="text-center">
              {tier}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {/* Limits rows */}
        <TableRow>
          <TableCell className="font-medium">Active Assessments</TableCell>
          {TIERS.map((tier) => (
            <TableCell key={tier} className="text-center">
              {formatLimit(PLAN_LIMITS[tier].maxActiveAssessments)}
            </TableCell>
          ))}
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">Partner Users</TableCell>
          {TIERS.map((tier) => (
            <TableCell key={tier} className="text-center">
              {formatLimit(PLAN_LIMITS[tier].maxPartnerUsers)}
            </TableCell>
          ))}
        </TableRow>
        {/* Feature rows */}
        {ALL_FEATURES.map((feature) => (
          <TableRow key={feature}>
            <TableCell className="font-medium">{FEATURE_LABELS[feature]}</TableCell>
            {TIERS.map((tier) => (
              <TableCell key={tier} className="text-center">
                {hasFeature(tier, feature) ? (
                  <Check className="h-4 w-4 text-green-600 inline-block" />
                ) : (
                  <X className="h-4 w-4 text-muted-foreground/40 inline-block" />
                )}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export type OrganizationType = "PARTNER" | "DIRECT_CLIENT" | "PLATFORM";
export type PlanTier = "TRIAL" | "STARTER" | "PROFESSIONAL" | "ENTERPRISE";
export type SubscriptionStatus = "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "TRIAL_EXPIRED";
export type UsageEventType = "assessment_created" | "assessment_archived" | "partner_user_added" | "partner_user_removed";

export type PlanFeature =
  | "core_assessment" | "standard_reports" | "registers"
  | "workshop_mode" | "analytics" | "sso_scim"
  | "custom_branding" | "api_access" | "audit_export" | "dedicated_csm";

export interface PlanLimits {
  maxActiveAssessments: number;
  maxPartnerUsers: number;
  features: PlanFeature[];
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  TRIAL: { maxActiveAssessments: 1, maxPartnerUsers: 5, features: ["core_assessment"] },
  STARTER: { maxActiveAssessments: 3, maxPartnerUsers: 10, features: ["core_assessment", "standard_reports"] },
  PROFESSIONAL: { maxActiveAssessments: 10, maxPartnerUsers: 30, features: ["core_assessment", "standard_reports", "registers", "workshop_mode", "analytics"] },
  ENTERPRISE: { maxActiveAssessments: Infinity, maxPartnerUsers: Infinity, features: ["core_assessment", "standard_reports", "registers", "workshop_mode", "analytics", "sso_scim", "custom_branding", "api_access", "audit_export", "dedicated_csm"] },
};

export const SUBSCRIPTION_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  TRIALING: ["ACTIVE", "TRIAL_EXPIRED"],
  ACTIVE: ["PAST_DUE", "CANCELED"],
  PAST_DUE: ["ACTIVE", "CANCELED"],
  CANCELED: [],
  TRIAL_EXPIRED: ["ACTIVE"],
};

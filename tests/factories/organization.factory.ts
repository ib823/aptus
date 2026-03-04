import type { Organization } from "@prisma/client";

let counter = 0;
const nextId = () => `test-${++counter}`;

type OrganizationOverrides = Partial<Organization>;

function createBase(overrides: OrganizationOverrides = {}): Organization {
  const id = overrides.id ?? nextId();
  const now = new Date();
  return {
    id,
    name: overrides.name ?? `Test Organization ${id}`,
    slug: overrides.slug ?? `test-org-${id}`,
    type: overrides.type ?? "partner",
    orgType: overrides.orgType ?? "client",
    domain: overrides.domain ?? `${id}.example.com`,
    logoUrl: overrides.logoUrl ?? null,
    isActive: overrides.isActive ?? true,
    ssoEnabled: overrides.ssoEnabled ?? false,
    ssoProvider: overrides.ssoProvider ?? null,
    ssoDomain: overrides.ssoDomain ?? null,
    scimEnabled: overrides.scimEnabled ?? false,
    scimEndpoint: overrides.scimEndpoint ?? null,
    mfaPolicy: overrides.mfaPolicy ?? "optional",
    maxConcurrentSessions: overrides.maxConcurrentSessions ?? 3,
    viewerCanExport: overrides.viewerCanExport ?? false,
    dataRetentionDays: overrides.dataRetentionDays ?? null,
    ssoExclusive: overrides.ssoExclusive ?? false,
    ssoEntityId: overrides.ssoEntityId ?? null,
    brandPrimaryColor: overrides.brandPrimaryColor ?? null,
    brandLogoUrl: overrides.brandLogoUrl ?? null,
    reportLogoUrl: overrides.reportLogoUrl ?? null,
    plan: overrides.plan ?? "TRIAL",
    subscriptionStatus: overrides.subscriptionStatus ?? "TRIALING",
    trialEndsAt: overrides.trialEndsAt ?? new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
    stripeCustomerId: overrides.stripeCustomerId ?? null,
    stripeSubscriptionId: overrides.stripeSubscriptionId ?? null,
    billingEmail: overrides.billingEmail ?? null,
    ssoMetadataUrl: overrides.ssoMetadataUrl ?? null,
    ssoClientId: overrides.ssoClientId ?? null,
    ssoClientSecret: overrides.ssoClientSecret ?? null,
    scimBearerToken: overrides.scimBearerToken ?? null,
    maxActiveAssessments: overrides.maxActiveAssessments ?? 1,
    maxPartnerUsers: overrides.maxPartnerUsers ?? 5,
    primaryColor: overrides.primaryColor ?? "#1e40af",
    reportFooterText: overrides.reportFooterText ?? null,
    industryFocus: overrides.industryFocus ?? [],
    contactEmail: overrides.contactEmail ?? null,
    websiteUrl: overrides.websiteUrl ?? null,
    hasDemoAssessment: overrides.hasDemoAssessment ?? false,
    demoAssessmentId: overrides.demoAssessmentId ?? null,
    aiConfig: overrides.aiConfig ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

export function create(overrides: OrganizationOverrides = {}): Organization {
  return createBase(overrides);
}

export function createMany(count: number, overrides: OrganizationOverrides = {}): Organization[] {
  return Array.from({ length: count }, () => createBase(overrides));
}

export function createTrial(overrides: OrganizationOverrides = {}): Organization {
  return createBase({
    plan: "TRIAL",
    subscriptionStatus: "TRIALING",
    trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    maxActiveAssessments: 1,
    maxPartnerUsers: 5,
    ...overrides,
  });
}

export function createStarter(overrides: OrganizationOverrides = {}): Organization {
  return createBase({
    plan: "STARTER",
    subscriptionStatus: "ACTIVE",
    trialEndsAt: null,
    stripeCustomerId: `cus_starter_${nextId()}`,
    stripeSubscriptionId: `sub_starter_${nextId()}`,
    billingEmail: "billing@starter.example.com",
    maxActiveAssessments: 3,
    maxPartnerUsers: 10,
    ...overrides,
  });
}

export function createProfessional(overrides: OrganizationOverrides = {}): Organization {
  return createBase({
    plan: "PROFESSIONAL",
    subscriptionStatus: "ACTIVE",
    trialEndsAt: null,
    stripeCustomerId: `cus_pro_${nextId()}`,
    stripeSubscriptionId: `sub_pro_${nextId()}`,
    billingEmail: "billing@professional.example.com",
    maxActiveAssessments: 10,
    maxPartnerUsers: 25,
    ...overrides,
  });
}

export function createEnterprise(overrides: OrganizationOverrides = {}): Organization {
  return createBase({
    plan: "ENTERPRISE",
    subscriptionStatus: "ACTIVE",
    trialEndsAt: null,
    stripeCustomerId: `cus_ent_${nextId()}`,
    stripeSubscriptionId: `sub_ent_${nextId()}`,
    billingEmail: "billing@enterprise.example.com",
    maxActiveAssessments: 100,
    maxPartnerUsers: 100,
    mfaPolicy: "required",
    ...overrides,
  });
}

export function createExpired(overrides: OrganizationOverrides = {}): Organization {
  return createBase({
    plan: "TRIAL",
    subscriptionStatus: "TRIAL_EXPIRED",
    trialEndsAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    ...overrides,
  });
}

export function createCanceled(overrides: OrganizationOverrides = {}): Organization {
  return createBase({
    plan: "PROFESSIONAL",
    subscriptionStatus: "CANCELED",
    trialEndsAt: null,
    stripeCustomerId: `cus_canceled_${nextId()}`,
    stripeSubscriptionId: `sub_canceled_${nextId()}`,
    ...overrides,
  });
}

export function createWithSSO(overrides: OrganizationOverrides = {}): Organization {
  const domain = overrides.ssoDomain ?? "sso-corp.example.com";
  return createBase({
    plan: "ENTERPRISE",
    subscriptionStatus: "ACTIVE",
    ssoEnabled: true,
    ssoProvider: "azure-ad",
    ssoDomain: domain,
    ssoMetadataUrl: `https://${domain}/.well-known/openid-configuration`,
    ssoClientId: `client_${nextId()}`,
    ssoClientSecret: `secret_${nextId()}`,
    scimEnabled: true,
    scimEndpoint: `https://${domain}/scim/v2`,
    scimBearerToken: `scim_token_${nextId()}`,
    mfaPolicy: "required",
    maxActiveAssessments: 100,
    maxPartnerUsers: 100,
    ...overrides,
  });
}

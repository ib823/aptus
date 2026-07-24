import type { Organization } from "@prisma/client";

let counter = 0;
const nextId = () => `test-${++counter}`;

/**
 * Synthetic, deterministic SCIM bearer token for a given org, for the SCIM
 * tenant-isolation security specs. The real `scimBearerToken` column was dropped
 * (unused in production; SSO/SCIM login is not built) — the specs model the
 * intended per-org token logic without depending on a DB column. Distinct per
 * org id, stable for a given id, so cross-tenant vs same-tenant checks hold.
 */
export function scimTokenFor(orgId: string): string {
  return `scim_token_${orgId}`;
}

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
    ssoMetadataUrl: overrides.ssoMetadataUrl ?? null,
    ssoClientId: overrides.ssoClientId ?? null,
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
    scimEnabled: true,
    scimEndpoint: `https://${domain}/scim/v2`,
    mfaPolicy: "required",
    maxActiveAssessments: 100,
    maxPartnerUsers: 100,
    ...overrides,
  });
}

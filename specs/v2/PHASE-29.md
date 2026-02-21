# Phase 29: Platform Commercial & Self-Service

## 1. Overview

Build the commercial platform layer for Aptus, transforming it from an internally deployed tool into a self-service SaaS product. This phase introduces self-service signup with email verification, automated organization/tenant provisioning, subscription management via Stripe Billing, a partner admin dashboard for firm-level settings, demo/sandbox mode with a pre-loaded sample assessment, usage metering for plan limit enforcement, and plan tier feature gating.

**Source**: Addendum 2 Section 1 (Subsections 1.1 through 1.8)

### Two Customer Types

| Type | Label | Description |
|------|-------|-------------|
| A | **Consulting Partner** (primary) | SAP consulting firms purchasing Aptus to run Fit-to-Standard assessments for their clients |
| B | **Direct Enterprise Client** (secondary) | Companies self-assessing their SAP S/4HANA Cloud readiness without a consulting partner |

### Subscription Tiers

| Plan | Concurrent Assessments | Partner Users | Features |
|------|------------------------|---------------|----------|
| Trial | 1 | 5 | Core assessment only, 14-day limit, watermarked reports |
| Starter | 3 | 10 | Core assessment, standard reports (PDF/XLSX), email support |
| Professional | 10 | 30 | + Registers (gap, integration, DM, OCM), workshop mode, analytics dashboard, priority support |
| Enterprise | Unlimited | Unlimited | + SSO/SCIM, custom branding, API access, dedicated CSM, SLA guarantee, audit log export |

### Goals

- Enable frictionless self-service onboarding (signup to first assessment in under 5 minutes)
- Automate tenant provisioning with sensible defaults per plan tier
- Integrate Stripe Billing for subscription lifecycle management (trials, upgrades, downgrades, cancellations, dunning)
- Provide a partner admin dashboard for firm profile, branding, team management, and subscription management
- Ship a demo/sandbox mode with a realistic pre-loaded assessment for prospect evaluation
- Enforce usage limits (assessment count, user count) at the API layer with graceful degradation
- Meter usage events to Stripe for reporting and potential overage billing

**Size**: XL

---

## 2. Dependencies

| Dependency | Type | Notes |
|---|---|---|
| Phase 17 (Role System & Organization Model) | Phase | 11-role model, Organization entity, RBAC middleware |
| Phase 18 (Assessment Lifecycle) | Phase | Assessment status machine, `AssessmentPhaseProgress` |
| Prisma 6 + PostgreSQL | Infrastructure | Schema migration for subscription fields on Organization |
| Stripe Billing API | External Service | `stripe` npm package v17+; requires `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` env vars |
| NextAuth / custom session layer | Code | `src/lib/auth/session.ts` — extended for signup flow |
| Zod 3.x | Library | Validation schemas for signup, settings, subscription operations |
| `@react-email/components` | Library | Transactional email templates for verification, trial expiry warnings |
| Existing `Organization` model | Schema | Extended with subscription, SSO, limits, and branding fields |
| Existing report infrastructure | Code | `src/app/api/assessments/[id]/report/*` — watermark enforcement for Trial tier |

---

## 3. Data Model Changes

### Modified: `Organization` model

```prisma
model Organization {
  id                    String   @id @default(cuid())
  name                  String
  slug                  String?  @unique
  type                  String   @default("PARTNER") // "PARTNER" | "DIRECT_CLIENT" | "PLATFORM"
  domain                String?
  logoUrl               String?
  isActive              Boolean  @default(true)

  // Subscription
  plan                  String   @default("TRIAL")    // "TRIAL" | "STARTER" | "PROFESSIONAL" | "ENTERPRISE"
  subscriptionStatus    String   @default("TRIALING") // "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "TRIAL_EXPIRED"
  trialEndsAt           DateTime?
  stripeCustomerId      String?  @unique
  stripeSubscriptionId  String?  @unique
  billingEmail          String?

  // SSO (structural from Phase 17, operational here)
  ssoEnabled            Boolean  @default(false)
  ssoProvider           String?  // "SAML" | "OIDC"
  ssoMetadataUrl        String?
  ssoClientId           String?
  ssoClientSecret       String?  // encrypted at rest via application-level encryption
  scimEnabled           Boolean  @default(false)
  scimBearerToken       String?  // encrypted at rest

  // Limits (set per plan tier, overridable by platform_admin)
  maxActiveAssessments  Int      @default(1)
  maxPartnerUsers       Int      @default(5)

  // Branding (Enterprise tier)
  primaryColor          String?  @default("#1e40af")
  reportFooterText      String?
  industryFocus         String[] @default([])
  country               String?
  contactEmail          String?
  websiteUrl            String?

  // Demo
  hasDemoAssessment     Boolean  @default(false)
  demoAssessmentId      String?

  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  // Relations
  users                 User[]
  assessments           Assessment[]
  templates             AssessmentTemplate[]
  usageEvents           UsageEvent[]

  @@index([slug])
  @@index([plan])
  @@index([subscriptionStatus])
  @@index([stripeCustomerId])
}
```

### New: `AssessmentTemplate`

```prisma
model AssessmentTemplate {
  id              String   @id @default(cuid())
  organizationId  String
  name            String
  description     String?  @db.Text
  industry        String?
  country         String?
  scopeItemIds    String[] @default([])
  isDemo          Boolean  @default(false)
  isPublic        Boolean  @default(false)
  createdById     String
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id])

  @@index([organizationId])
  @@index([isDemo])
}
```

### New: `UsageEvent`

```prisma
model UsageEvent {
  id              String   @id @default(cuid())
  organizationId  String
  eventType       String   // "assessment_created" | "assessment_archived" | "partner_user_added" | "partner_user_removed"
  entityId        String?  // assessmentId or userId
  metadata        Json?    // additional context
  stripeSent      Boolean  @default(false) // whether usage record was sent to Stripe
  stripeError     String?
  createdAt       DateTime @default(now())

  organization Organization @relation(fields: [organizationId], references: [id])

  @@index([organizationId])
  @@index([organizationId, eventType])
  @@index([createdAt])
  @@index([stripeSent])
}
```

### New: `OnboardingProgress`

```prisma
model OnboardingProgress {
  id              String   @id @default(cuid())
  organizationId  String   @unique
  step            String   @default("PROFILE") // "PROFILE" | "INVITE_TEAM" | "EXPLORE_DEMO" | "COMPLETE"
  profileComplete Boolean  @default(false)
  teamInvited     Boolean  @default(false)
  demoExplored    Boolean  @default(false)
  completedAt     DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([organizationId])
}
```

### TypeScript Types (`src/types/commercial.ts`)

```typescript
export type OrganizationType = "PARTNER" | "DIRECT_CLIENT" | "PLATFORM";

export type PlanTier = "TRIAL" | "STARTER" | "PROFESSIONAL" | "ENTERPRISE";

export type SubscriptionStatus =
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | "TRIAL_EXPIRED";

export type UsageEventType =
  | "assessment_created"
  | "assessment_archived"
  | "partner_user_added"
  | "partner_user_removed";

export type OnboardingStep = "PROFILE" | "INVITE_TEAM" | "EXPLORE_DEMO" | "COMPLETE";

export interface PlanLimits {
  maxActiveAssessments: number;
  maxPartnerUsers: number;
  features: PlanFeature[];
}

export type PlanFeature =
  | "core_assessment"
  | "standard_reports"
  | "registers"
  | "workshop_mode"
  | "analytics"
  | "sso_scim"
  | "custom_branding"
  | "api_access"
  | "audit_export"
  | "dedicated_csm";

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  TRIAL: {
    maxActiveAssessments: 1,
    maxPartnerUsers: 5,
    features: ["core_assessment"],
  },
  STARTER: {
    maxActiveAssessments: 3,
    maxPartnerUsers: 10,
    features: ["core_assessment", "standard_reports"],
  },
  PROFESSIONAL: {
    maxActiveAssessments: 10,
    maxPartnerUsers: 30,
    features: [
      "core_assessment", "standard_reports", "registers",
      "workshop_mode", "analytics",
    ],
  },
  ENTERPRISE: {
    maxActiveAssessments: Infinity,
    maxPartnerUsers: Infinity,
    features: [
      "core_assessment", "standard_reports", "registers",
      "workshop_mode", "analytics", "sso_scim", "custom_branding",
      "api_access", "audit_export", "dedicated_csm",
    ],
  },
};
```

### Zod Schemas (`src/lib/validation/commercial.ts`)

```typescript
import { z } from "zod";

export const PlanTierSchema = z.enum(["TRIAL", "STARTER", "PROFESSIONAL", "ENTERPRISE"]);

export const SubscriptionStatusSchema = z.enum([
  "TRIALING", "ACTIVE", "PAST_DUE", "CANCELED", "TRIAL_EXPIRED",
]);

export const OrganizationTypeSchema = z.enum(["PARTNER", "DIRECT_CLIENT", "PLATFORM"]);

export const SignupSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(12).max(128)
    .regex(/[A-Z]/, "Must contain at least one uppercase letter")
    .regex(/[a-z]/, "Must contain at least one lowercase letter")
    .regex(/[0-9]/, "Must contain at least one digit")
    .regex(/[^A-Za-z0-9]/, "Must contain at least one special character"),
  name: z.string().min(1).max(100),
  companyName: z.string().min(2).max(200),
  country: z.string().length(2), // ISO 3166-1 alpha-2
  useCase: OrganizationTypeSchema,
});

export const PartnerProfileUpdateSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  industryFocus: z.array(z.string().max(50)).max(20).optional(),
  country: z.string().length(2).optional(),
  contactEmail: z.string().email().max(255).optional(),
  websiteUrl: z.string().url().max(500).optional(),
});

export const BrandingUpdateSchema = z.object({
  logoUrl: z.string().url().max(2048).optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  reportFooterText: z.string().max(500).optional(),
});

export const SsoConfigSchema = z.object({
  provider: z.enum(["SAML", "OIDC"]),
  metadataUrl: z.string().url().max(2048).optional(),
  clientId: z.string().max(500).optional(),
  clientSecret: z.string().max(500).optional(),
});

export const ScimConfigSchema = z.object({
  enabled: z.boolean(),
});

export const UpgradePlanSchema = z.object({
  plan: PlanTierSchema.refine((p) => p !== "TRIAL", {
    message: "Cannot upgrade to TRIAL plan",
  }),
  billingEmail: z.string().email().max(255).optional(),
});

export const CancelSubscriptionSchema = z.object({
  reason: z.string().max(2000).optional(),
  feedback: z.string().max(2000).optional(),
  cancelImmediately: z.boolean().default(false),
});

export const UsageEventSchema = z.object({
  eventType: z.enum([
    "assessment_created",
    "assessment_archived",
    "partner_user_added",
    "partner_user_removed",
  ]),
  entityId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});
```

---

## 4. API Routes

### Authentication & Signup

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/auth/signup` | Self-service signup: create user + organization (TRIAL) | Public |
| `POST` | `/api/auth/verify-email` | Verify email via magic link token | Public |

### Partner Settings

| Method | Path | Description | Auth |
|---|---|---|---|
| `GET` | `/api/partner/settings` | Get all partner settings (profile, branding, subscription, usage) | `partner_lead`, `client_admin` |
| `PUT` | `/api/partner/settings/profile` | Update firm profile (name, industry focus, country, contact) | `partner_lead`, `client_admin` |
| `PUT` | `/api/partner/settings/branding` | Update branding (logo, primary color, report footer) | `partner_lead`, `client_admin` (Enterprise only) |

### Subscription Management

| Method | Path | Description | Auth |
|---|---|---|---|
| `GET` | `/api/partner/settings/subscription` | Current plan, status, usage counts, limits | `partner_lead`, `client_admin` |
| `POST` | `/api/partner/settings/subscription/upgrade` | Initiate Stripe Checkout for plan upgrade | `partner_lead`, `client_admin` |
| `POST` | `/api/partner/settings/subscription/cancel` | Cancel subscription (end of billing period or immediate) | `partner_lead`, `client_admin` |
| `GET` | `/api/partner/settings/subscription/portal` | Generate Stripe Customer Portal URL for billing management | `partner_lead`, `client_admin` |

### Usage & Metering

| Method | Path | Description | Auth |
|---|---|---|---|
| `GET` | `/api/partner/settings/usage` | Usage metrics: active assessments, users, events timeline | `partner_lead`, `client_admin`, `platform_admin` |

### SSO & SCIM

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/partner/settings/sso` | Configure SSO (SAML or OIDC) | `partner_lead`, `client_admin` (Enterprise only) |
| `POST` | `/api/partner/settings/scim` | Enable/disable SCIM provisioning, regenerate bearer token | `partner_lead`, `client_admin` (Enterprise only) |

### Demo/Sandbox

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/partner/settings/demo/provision` | Provision demo assessment for organization | `partner_lead`, `client_admin`, `platform_admin` |
| `POST` | `/api/partner/settings/demo/reset` | Reset demo assessment to initial state | `partner_lead`, `client_admin`, `platform_admin` |

### Partner Assessments

| Method | Path | Description | Auth |
|---|---|---|---|
| `GET` | `/api/partner/assessments` | List all assessments for partner organization (paginated) | Any org member |

### Webhooks

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/webhooks/stripe` | Stripe webhook handler (signature-verified) | Stripe signature |

### Onboarding

| Method | Path | Description | Auth |
|---|---|---|---|
| `GET` | `/api/partner/onboarding` | Get onboarding progress | Any org member |
| `PUT` | `/api/partner/onboarding/step` | Mark onboarding step as complete | `partner_lead`, `client_admin` |

### Platform Admin (internal)

| Method | Path | Description | Auth |
|---|---|---|---|
| `GET` | `/api/admin/organizations` | List all organizations with subscription status | `platform_admin` |
| `PUT` | `/api/admin/organizations/[orgId]/plan` | Override plan/limits for an organization | `platform_admin` |
| `POST` | `/api/admin/organizations/[orgId]/extend-trial` | Extend trial period | `platform_admin` |

### Request/Response Examples

**POST `/api/auth/signup`**
```json
// Request
{
  "email": "sarah@acmeconsulting.com",
  "password": "Str0ng!P@ssw0rd#2026",
  "name": "Sarah Chen",
  "companyName": "Acme Consulting",
  "country": "US",
  "useCase": "PARTNER"
}

// Response 201
{
  "user": {
    "id": "clx_user_123",
    "email": "sarah@acmeconsulting.com",
    "name": "Sarah Chen",
    "role": "partner_lead"
  },
  "organization": {
    "id": "clx_org_456",
    "name": "Acme Consulting",
    "slug": "acme-consulting",
    "plan": "TRIAL",
    "subscriptionStatus": "TRIALING",
    "trialEndsAt": "2026-03-07T00:00:00Z"
  },
  "verificationEmailSent": true
}
```

**POST `/api/partner/settings/subscription/upgrade`**
```json
// Request
{
  "plan": "PROFESSIONAL",
  "billingEmail": "billing@acmeconsulting.com"
}

// Response 200
{
  "checkoutUrl": "https://checkout.stripe.com/c/pay/cs_live_...",
  "sessionId": "cs_live_..."
}
```

**POST `/api/webhooks/stripe`** (handled events)
```typescript
// Events handled:
// checkout.session.completed     → Activate subscription
// customer.subscription.updated  → Sync plan/status changes
// customer.subscription.deleted  → Mark canceled
// invoice.payment_failed         → Mark PAST_DUE
// invoice.payment_succeeded      → Clear PAST_DUE, mark ACTIVE
```

---

## 5. UI Components

### New Pages

| Page | Route | Description |
|---|---|---|
| `SignupPage` | `/signup` | Self-service signup form (email, password, company, country, use case) |
| `VerifyEmailPage` | `/verify-email/[token]` | Email verification landing page |
| `OnboardingWizard` | `/onboarding` | 3-step wizard: firm profile, invite team, explore demo |
| `PartnerSettingsPage` | `/partner/settings` | Tabbed settings: Profile, Branding, Subscription, SSO, Team |
| `PartnerDashboard` | `/partner` | Overview dashboard: active assessments, usage, team, quick actions |
| `PricingPage` | `/pricing` | Public pricing page with plan comparison table |

### New Components

| Component | Location | Description |
|---|---|---|
| `SignupForm` | `src/components/auth/SignupForm.tsx` | Multi-field signup form with real-time password strength indicator |
| `PlanComparisonTable` | `src/components/commercial/PlanComparisonTable.tsx` | Feature comparison table across all 4 tiers |
| `PlanBadge` | `src/components/commercial/PlanBadge.tsx` | Color-coded badge displaying current plan tier |
| `SubscriptionStatusBanner` | `src/components/commercial/SubscriptionStatusBanner.tsx` | Alert banner for trial expiry, past due, or canceled status |
| `UsageMeter` | `src/components/commercial/UsageMeter.tsx` | Progress bar showing current usage vs. limit (assessments, users) |
| `UsageTimelineChart` | `src/components/commercial/UsageTimelineChart.tsx` | Line chart showing usage events over time |
| `OnboardingStepCard` | `src/components/commercial/OnboardingStepCard.tsx` | Card for each onboarding step with status indicator |
| `PartnerProfileForm` | `src/components/commercial/PartnerProfileForm.tsx` | Form for updating firm profile fields |
| `BrandingConfigForm` | `src/components/commercial/BrandingConfigForm.tsx` | Form for logo upload, primary color picker, report footer text |
| `SsoConfigForm` | `src/components/commercial/SsoConfigForm.tsx` | Form for SSO provider configuration (SAML/OIDC) |
| `ScimConfigPanel` | `src/components/commercial/ScimConfigPanel.tsx` | Panel for SCIM enable/disable + bearer token display/regenerate |
| `DemoAssessmentCard` | `src/components/commercial/DemoAssessmentCard.tsx` | Card showing demo assessment status with explore/reset actions |
| `TrialExpiryCountdown` | `src/components/commercial/TrialExpiryCountdown.tsx` | Countdown timer showing days/hours remaining in trial |
| `UpgradePrompt` | `src/components/commercial/UpgradePrompt.tsx` | Contextual prompt shown when a feature requires a higher plan |
| `FeatureGate` | `src/components/commercial/FeatureGate.tsx` | Wrapper component that conditionally renders children based on plan features |

### Modified Components

| Component | Changes |
|---|---|
| Top navigation | Add partner settings link, plan badge, trial countdown for TRIALING orgs |
| Assessment list page | Show usage meter, block "New Assessment" when at limit |
| User invitation flow | Check `maxPartnerUsers` limit before sending invitations |
| Report generation routes | Add watermark overlay for TRIAL plan assessments |
| Dashboard | Add onboarding wizard for new organizations |

---

## 6. Business Logic

### Provisioning Flow

```typescript
async function provisionOrganization(signup: SignupInput): Promise<ProvisionResult> {
  return prisma.$transaction(async (tx) => {
    // 1. Check email uniqueness
    const existingUser = await tx.user.findUnique({ where: { email: signup.email } });
    if (existingUser) throw new ConflictError("Email already registered");

    // 2. Generate unique slug
    const slug = await generateUniqueSlug(tx, signup.companyName);

    // 3. Create Organization
    const org = await tx.organization.create({
      data: {
        name: signup.companyName,
        slug,
        type: signup.useCase,
        plan: "TRIAL",
        subscriptionStatus: "TRIALING",
        trialEndsAt: addDays(new Date(), 14),
        maxActiveAssessments: 1,
        maxPartnerUsers: 5,
        country: signup.country,
        contactEmail: signup.email,
      },
    });

    // 4. Create User with partner_lead role
    const hashedPassword = await hashPassword(signup.password);
    const user = await tx.user.create({
      data: {
        email: signup.email,
        name: signup.name,
        role: signup.useCase === "PARTNER" ? "partner_lead" : "client_admin",
        organizationId: org.id,
        // password stored via Account model or separate credential store
      },
    });

    // 5. Create OnboardingProgress
    await tx.onboardingProgress.create({
      data: { organizationId: org.id },
    });

    // 6. Send verification email
    await sendVerificationEmail(user.email, user.id);

    return { user, organization: org };
  });
}
```

### Slug Generation

```typescript
async function generateUniqueSlug(
  tx: PrismaTransaction,
  companyName: string
): Promise<string> {
  const base = companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);

  let slug = base;
  let counter = 0;

  while (await tx.organization.findUnique({ where: { slug } })) {
    counter++;
    slug = `${base}-${counter}`;
  }

  return slug;
}
```

### Subscription Lifecycle State Machine

```typescript
export const SUBSCRIPTION_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  TRIALING:       ["ACTIVE", "TRIAL_EXPIRED"],
  ACTIVE:         ["PAST_DUE", "CANCELED"],
  PAST_DUE:       ["ACTIVE", "CANCELED"],     // ACTIVE if payment succeeds
  CANCELED:       [],                          // Terminal (can re-subscribe via new checkout)
  TRIAL_EXPIRED:  ["ACTIVE"],                  // Can upgrade from expired trial
};
```

### Subscription Lifecycle Timelines

```
Trial (14 days) → Trial Expired (30-day read-only grace) → Data purge scheduled (day 44)
Trial → Upgrade to paid → ACTIVE
ACTIVE → Payment fails → PAST_DUE (14-day grace) → Read-only → CANCELED
ACTIVE → Cancel → End of billing period → CANCELED → 90 days read-only → 180 days data purge
```

### Usage Enforcement

```typescript
async function enforceAssessmentLimit(organizationId: string): Promise<void> {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { maxActiveAssessments: true, plan: true, subscriptionStatus: true },
  });

  if (org.subscriptionStatus === "TRIAL_EXPIRED" || org.subscriptionStatus === "CANCELED") {
    throw new ForbiddenError("Subscription is not active. Please upgrade to create assessments.");
  }

  const activeCount = await prisma.assessment.count({
    where: {
      organizationId,
      deletedAt: null,
      status: { notIn: ["archived"] },
    },
  });

  if (activeCount >= org.maxActiveAssessments) {
    throw new ForbiddenError(
      `Assessment limit reached (${activeCount}/${org.maxActiveAssessments}). ` +
      `Upgrade your plan or archive existing assessments.`
    );
  }
}

async function enforceUserLimit(organizationId: string): Promise<void> {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { maxPartnerUsers: true },
  });

  const userCount = await prisma.user.count({
    where: { organizationId, isActive: true },
  });

  if (userCount >= org.maxPartnerUsers) {
    throw new ForbiddenError(
      `User limit reached (${userCount}/${org.maxPartnerUsers}). ` +
      `Upgrade your plan to add more team members.`
    );
  }
}
```

### Feature Gating

```typescript
export function hasFeature(plan: PlanTier, feature: PlanFeature): boolean {
  return PLAN_LIMITS[plan].features.includes(feature);
}

export function requireFeature(plan: PlanTier, feature: PlanFeature): void {
  if (!hasFeature(plan, feature)) {
    throw new ForbiddenError(
      `Feature "${feature}" requires a higher plan. Current plan: ${plan}.`
    );
  }
}
```

### Stripe Webhook Handler

```typescript
async function handleStripeWebhook(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orgId = session.metadata?.organizationId;
      if (!orgId) throw new Error("Missing organizationId in checkout metadata");

      const subscription = await stripe.subscriptions.retrieve(
        session.subscription as string
      );
      const plan = mapStripePriceToPlan(subscription.items.data[0].price.id);

      await prisma.organization.update({
        where: { id: orgId },
        data: {
          plan,
          subscriptionStatus: "ACTIVE",
          stripeCustomerId: session.customer as string,
          stripeSubscriptionId: subscription.id,
          maxActiveAssessments: PLAN_LIMITS[plan].maxActiveAssessments,
          maxPartnerUsers: PLAN_LIMITS[plan].maxPartnerUsers,
          trialEndsAt: null,
        },
      });
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      await prisma.organization.update({
        where: { stripeCustomerId: invoice.customer as string },
        data: { subscriptionStatus: "PAST_DUE" },
      });
      break;
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      await prisma.organization.update({
        where: { stripeCustomerId: invoice.customer as string },
        data: { subscriptionStatus: "ACTIVE" },
      });
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      await prisma.organization.update({
        where: { stripeSubscriptionId: subscription.id },
        data: { subscriptionStatus: "CANCELED" },
      });
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const plan = mapStripePriceToPlan(subscription.items.data[0].price.id);
      await prisma.organization.update({
        where: { stripeSubscriptionId: subscription.id },
        data: {
          plan,
          maxActiveAssessments: PLAN_LIMITS[plan].maxActiveAssessments,
          maxPartnerUsers: PLAN_LIMITS[plan].maxPartnerUsers,
        },
      });
      break;
    }
  }
}
```

### Usage Metering (Stripe Usage Records)

```typescript
async function recordUsageEvent(
  organizationId: string,
  eventType: UsageEventType,
  entityId?: string
): Promise<void> {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { stripeSubscriptionId: true },
  });

  const usageEvent = await prisma.usageEvent.create({
    data: { organizationId, eventType, entityId },
  });

  // Send to Stripe if subscription is active
  if (org.stripeSubscriptionId) {
    try {
      await stripe.subscriptionItems.createUsageRecord(
        org.stripeSubscriptionId,
        {
          quantity: 1,
          timestamp: Math.floor(Date.now() / 1000),
          action: eventType === "assessment_archived" ? "decrement" : "increment",
        }
      );
      await prisma.usageEvent.update({
        where: { id: usageEvent.id },
        data: { stripeSent: true },
      });
    } catch (error) {
      await prisma.usageEvent.update({
        where: { id: usageEvent.id },
        data: { stripeError: String(error) },
      });
    }
  }
}
```

### Demo/Sandbox Assessment Provisioning

```typescript
async function provisionDemoAssessment(organizationId: string): Promise<string> {
  const demoData = {
    companyName: "GlobalTech Industries (Demo)",
    industry: "Manufacturing",
    country: "US",
    operatingCountries: ["US", "DE", "CN", "IN", "BR", "JP"],
    companySize: "large",
    revenueBand: "$1B-$5B",
    currentErp: "SAP ECC 6.0",
    sapVersion: "2508",
    status: "in_progress",
    // 6 functional areas, 50 scope items, ~500 steps
    // 30 FIT, 10 GAP, 10 CONFIGURE classifications
    // Sample integrations, DM objects, watermarked
  };

  const assessment = await prisma.assessment.create({
    data: {
      ...demoData,
      createdBy: "system",
      organizationId,
    },
  });

  await prisma.organization.update({
    where: { id: organizationId },
    data: { hasDemoAssessment: true, demoAssessmentId: assessment.id },
  });

  // Populate scope selections, step responses, gap resolutions
  await seedDemoScopeSelections(assessment.id);
  await seedDemoStepResponses(assessment.id);
  await seedDemoGapResolutions(assessment.id);

  return assessment.id;
}
```

### Trial Expiry Cron Job

```typescript
// Runs daily via cron (Phase 18 cron infrastructure or Vercel Cron)
async function processTrialExpirations(): Promise<void> {
  const now = new Date();

  // 1. Send 3-day warning emails
  const aboutToExpire = await prisma.organization.findMany({
    where: {
      subscriptionStatus: "TRIALING",
      trialEndsAt: {
        gte: now,
        lte: addDays(now, 3),
      },
    },
    include: { users: { where: { role: "partner_lead" } } },
  });

  for (const org of aboutToExpire) {
    for (const user of org.users) {
      await sendTrialExpiryWarning(user.email, org.name, org.trialEndsAt!);
    }
  }

  // 2. Expire trials past their end date
  await prisma.organization.updateMany({
    where: {
      subscriptionStatus: "TRIALING",
      trialEndsAt: { lt: now },
    },
    data: { subscriptionStatus: "TRIAL_EXPIRED" },
  });

  // 3. Schedule data purge for trials expired > 30 days ago
  const purgeCandidates = await prisma.organization.findMany({
    where: {
      subscriptionStatus: "TRIAL_EXPIRED",
      trialEndsAt: { lt: subDays(now, 30) },
    },
  });

  for (const org of purgeCandidates) {
    await queueDataPurge(org.id, "trial_expired_grace_period_ended");
  }
}
```

---

## 7. Permissions & Access Control

| Action | Allowed Roles | Conditions |
|---|---|---|
| Self-service signup | Public | No authentication required |
| View partner settings | `partner_lead`, `client_admin`, `platform_admin` | Must be member of the organization |
| Update firm profile | `partner_lead`, `client_admin` | Must be member of the organization |
| Update branding | `partner_lead`, `client_admin` | Enterprise plan only |
| View subscription details | `partner_lead`, `client_admin`, `platform_admin` | Must be member of the organization |
| Upgrade subscription | `partner_lead`, `client_admin` | Must be member of the organization |
| Cancel subscription | `partner_lead`, `client_admin` | Must be member of the organization |
| Configure SSO | `partner_lead`, `client_admin` | Enterprise plan only |
| Configure SCIM | `partner_lead`, `client_admin` | Enterprise plan only |
| Provision demo assessment | `partner_lead`, `client_admin`, `platform_admin` | One demo per organization |
| Reset demo assessment | `partner_lead`, `client_admin`, `platform_admin` | Demo must exist |
| View usage metrics | `partner_lead`, `client_admin`, `platform_admin` | Must be member of the organization |
| Override plan/limits | `platform_admin` | Platform admin only |
| Extend trial | `platform_admin` | Platform admin only |
| Create assessment | Any org member | Subject to `maxActiveAssessments` limit and active subscription |
| Invite user | `partner_lead`, `client_admin`, `consultant` | Subject to `maxPartnerUsers` limit |

### Read-Only Mode Enforcement

When `subscriptionStatus` is `TRIAL_EXPIRED`, `PAST_DUE` (after 14-day grace), or `CANCELED`:
- All GET endpoints remain accessible
- All POST/PUT/DELETE endpoints on assessments return `403 Forbidden` with `SUBSCRIPTION_INACTIVE` error code
- User invitation blocked
- Reports can be downloaded but are watermarked
- Demo assessment remains explorable

---

## 8. Notification Triggers

| Event | Recipients | Channel | Priority |
|---|---|---|---|
| Signup confirmation / email verification | Signing-up user | Email | High |
| Trial started | `partner_lead` | Email, in-app | Normal |
| Trial 3-day warning | `partner_lead`, `client_admin` | Email, in-app | High |
| Trial 1-day warning | `partner_lead`, `client_admin` | Email, in-app | High |
| Trial expired | All org members | Email, in-app | High |
| Subscription activated | `partner_lead`, `client_admin` | Email, in-app | Normal |
| Payment failed (PAST_DUE) | `partner_lead`, `client_admin` | Email, in-app | High |
| Payment recovered | `partner_lead`, `client_admin` | Email, in-app | Normal |
| Subscription canceled | All org members | Email, in-app | High |
| Assessment limit reached | User who triggered | In-app | Normal |
| User limit reached | `partner_lead`, `client_admin` | In-app | Normal |
| Data purge scheduled (30-day notice) | `partner_lead`, `client_admin` | Email | High |
| Plan upgraded | All org members | In-app | Normal |
| Demo assessment provisioned | `partner_lead` | In-app | Low |

---

## 9. Edge Cases & Error Handling

| Scenario | Handling |
|---|---|
| Signup with existing email | Return `409 Conflict` with generic message "An account with this email already exists" (do not reveal whether it is verified or not) |
| Signup with disposable email domain | Block known disposable domains; return `422 Unprocessable Entity` |
| Stripe webhook delivery failure | Stripe retries automatically (up to 3 days); idempotency key prevents duplicate processing |
| Stripe webhook signature invalid | Return `400 Bad Request`; log security event |
| Checkout session abandoned | No action; organization remains on TRIAL until trial expires |
| Double-click on upgrade button | Idempotent: if checkout session exists and is not expired, return the same URL |
| Organization slug collision | Auto-append numeric suffix (e.g., `acme-consulting-2`) |
| Trial expiry during active assessment workshop | Workshop remains accessible in read-only mode; facilitator notified |
| Platform admin overrides plan limits beyond Stripe plan | Store overrides in Organization; Stripe plan is source of truth for billing, Organization limits are source of truth for enforcement |
| User signs up, never verifies email | After 7 days, send reminder; after 30 days, purge unverified account |
| Race condition: two users hit assessment limit simultaneously | Use database transaction with `SELECT ... FOR UPDATE` on Organization row |
| Stripe customer deleted externally | Webhook `customer.deleted` marks org as CANCELED; logs alert for platform admin |
| Demo assessment data corrupted | Reset endpoint recreates from seed data |
| Currency handling | All Stripe prices in USD; display in user's locale format |

---

## 10. Performance Considerations

| Concern | Mitigation |
|---|---|
| Usage count queries on every assessment creation | Cache active assessment count in Organization row (`activeAssessmentCount` denormalized); update via DB trigger or application-level increment/decrement |
| Stripe API latency on upgrade flow | Redirect to Stripe Checkout (client-side); no server-side waiting for payment |
| Webhook processing latency | Process webhooks asynchronously with a queue; return `200` immediately to Stripe |
| Trial expiry cron for thousands of organizations | Batch process in pages of 100; indexed query on `subscriptionStatus` + `trialEndsAt` |
| Usage event table growth | Partition by `createdAt` month; archive events older than 12 months to cold storage |
| Demo assessment provisioning (seeding ~500 step responses) | Pre-compute seed data as JSON fixture; bulk insert via `createMany` |
| Partner dashboard queries (assessments, users, usage) | Aggregate queries with proper indexes; cache dashboard data with 5-minute TTL via `src/lib/db/cached-queries.ts` |
| Slug uniqueness check | Unique index on `slug`; O(1) lookup |

---

## 11. Testing Strategy

### Unit Tests

| Test | File |
|---|---|
| Signup validation (Zod schemas) | `__tests__/lib/validation/commercial.test.ts` |
| Plan limits enforcement logic | `__tests__/lib/commercial/plan-limits.test.ts` |
| Feature gating (`hasFeature`, `requireFeature`) | `__tests__/lib/commercial/feature-gate.test.ts` |
| Slug generation (uniqueness, sanitization) | `__tests__/lib/commercial/slug-generation.test.ts` |
| Subscription state machine transitions | `__tests__/lib/commercial/subscription-lifecycle.test.ts` |
| Stripe price-to-plan mapping | `__tests__/lib/commercial/stripe-mapping.test.ts` |
| Usage enforcement (assessment limit, user limit) | `__tests__/lib/commercial/usage-enforcement.test.ts` |
| Trial expiry logic | `__tests__/lib/commercial/trial-expiry.test.ts` |

### Integration Tests

| Test | File |
|---|---|
| Full signup flow (user + org creation) | `__tests__/api/auth/signup.test.ts` |
| Partner settings CRUD via API | `__tests__/api/partner/settings.test.ts` |
| Subscription upgrade via Stripe Checkout mock | `__tests__/api/partner/subscription-upgrade.test.ts` |
| Stripe webhook processing (all event types) | `__tests__/api/webhooks/stripe.test.ts` |
| Usage metering event recording | `__tests__/api/partner/usage-metering.test.ts` |
| Assessment creation blocked at limit | `__tests__/api/assessments/limit-enforcement.test.ts` |
| Demo assessment provisioning and reset | `__tests__/api/partner/demo-assessment.test.ts` |
| Read-only enforcement for expired subscriptions | `__tests__/api/partner/read-only-mode.test.ts` |

### E2E Tests

| Test | File |
|---|---|
| Full signup-to-assessment journey | `e2e/signup-onboarding.spec.ts` |
| Upgrade from trial to Professional | `e2e/subscription-upgrade.spec.ts` |
| Demo assessment exploration | `e2e/demo-assessment.spec.ts` |
| Feature gating (Enterprise-only features blocked on Starter) | `e2e/feature-gating.spec.ts` |

---

## 12. Migration & Seed Data

### Prisma Migration

```bash
# Migration adds:
# 1. New columns on Organization (slug, plan, subscriptionStatus, trialEndsAt, stripe*, sso*, limits, branding)
# 2. AssessmentTemplate table
# 3. UsageEvent table
# 4. OnboardingProgress table
# 5. Unique indexes on slug, stripeCustomerId, stripeSubscriptionId
pnpm prisma migrate dev --name add-commercial-platform-models
```

### Data Migration Script (`prisma/migrations/data/migrate-org-commercial.ts`)

```typescript
/**
 * Backfill existing organizations:
 * 1. Set plan = "ENTERPRISE" for existing orgs (grandfathered as internal)
 * 2. Set subscriptionStatus = "ACTIVE"
 * 3. Generate slugs from organization names
 * 4. Set type = "PARTNER" for orgs with type "internal", "DIRECT_CLIENT" for type "client"
 * 5. Set maxActiveAssessments = 9999, maxPartnerUsers = 9999 (grandfathered unlimited)
 */
async function migrateExistingOrganizations(): Promise<void> {
  const orgs = await prisma.organization.findMany();

  for (const org of orgs) {
    const slug = await generateUniqueSlug(prisma, org.name);
    const type = org.type === "client" ? "DIRECT_CLIENT" : "PARTNER";

    await prisma.organization.update({
      where: { id: org.id },
      data: {
        slug,
        type,
        plan: "ENTERPRISE",
        subscriptionStatus: "ACTIVE",
        maxActiveAssessments: 9999,
        maxPartnerUsers: 9999,
      },
    });
  }
}
```

### Seed Data

```typescript
// Seed demo organization for development
const demoOrg = await prisma.organization.create({
  data: {
    name: "Demo Partner Consulting",
    slug: "demo-partner",
    type: "PARTNER",
    plan: "PROFESSIONAL",
    subscriptionStatus: "ACTIVE",
    maxActiveAssessments: 10,
    maxPartnerUsers: 30,
    country: "US",
    contactEmail: "demo@demo-partner.com",
    industryFocus: ["Manufacturing", "Retail", "Utilities"],
  },
});

// Seed trial organization for testing trial flows
const trialOrg = await prisma.organization.create({
  data: {
    name: "Trial Corp",
    slug: "trial-corp",
    type: "DIRECT_CLIENT",
    plan: "TRIAL",
    subscriptionStatus: "TRIALING",
    trialEndsAt: addDays(new Date(), 14),
    maxActiveAssessments: 1,
    maxPartnerUsers: 5,
    country: "GB",
  },
});

// Seed demo assessment for the demo partner
await provisionDemoAssessment(demoOrg.id);
```

### Stripe Product & Price Setup (Manual / Terraform)

```
Products:
  - aptus_starter      → Price: $499/month or $4,990/year
  - aptus_professional → Price: $1,499/month or $14,990/year
  - aptus_enterprise   → Custom pricing (contact sales)

Metered Usage:
  - aptus_assessment_usage → Price: $0 (tracking only, overage pricing TBD)
```

---

## 13. Open Questions

| # | Question | Impact | Owner |
|---|---|---|---|
| 1 | Should Direct Enterprise Clients use the same plan tiers as Partners, or have a separate pricing model? | High -- affects pricing page and Stripe product setup | Product + Revenue |
| 2 | What is the exact Stripe price ID mapping for each plan tier? Pricing TBD. | High -- blocks Stripe integration implementation | Revenue |
| 3 | Should we support monthly and annual billing, or annual only? | Medium -- affects Stripe Checkout configuration | Product + Revenue |
| 4 | Is a 14-day trial sufficient, or should it be 30 days? | Medium -- affects trial expiry logic and marketing | Product + Marketing |
| 5 | Should the demo assessment be auto-provisioned on signup, or only on explicit request? | Low -- affects onboarding UX | Product |
| 6 | Should usage overage billing be enforced (hard cap vs. soft cap + notification)? | Medium -- affects enforcement logic | Product + Revenue |
| 7 | Should we offer a free-forever tier (e.g., 1 assessment, 3 users) for lead generation? | Medium -- affects plan tier definitions | Product + Marketing |
| 8 | What MFA requirements apply to Stripe Billing portal access? | Low -- affects Stripe Customer Portal configuration | Security |
| 9 | Should cancelled organizations be allowed to export their data before purge? | Medium -- GDPR/compliance requirement | Legal + Engineering |
| 10 | Should partner branding (logo, colors) apply to client-facing assessment views, or only reports? | Low -- UX decision | Product + Design |

---

## 14. Acceptance Criteria (Given/When/Then)

### AC-29.1: Self-Service Signup

```
Given a visitor on the /signup page
  And they provide a valid email, password (12+ chars, mixed case, digit, special), company name, country, and use case
When they submit the signup form
Then a new User record is created with role "partner_lead" (or "client_admin" for DIRECT_CLIENT)
  And a new Organization record is created with plan "TRIAL" and subscriptionStatus "TRIALING"
  And trialEndsAt is set to 14 days from now
  And a verification email is sent to the provided address
  And an OnboardingProgress record is created with step "PROFILE"
```

### AC-29.2: Email Verification

```
Given a user who has signed up but not verified their email
When they click the verification link in the email
Then their emailVerified timestamp is set
  And they are redirected to the /onboarding page
```

### AC-29.3: Assessment Limit Enforcement

```
Given an organization on the Starter plan (maxActiveAssessments = 3)
  And the organization already has 3 active (non-archived) assessments
When a user attempts to create a new assessment via POST /api/assessments
Then the API returns 403 Forbidden
  And the error message states: "Assessment limit reached (3/3). Upgrade your plan or archive existing assessments."
```

### AC-29.4: User Limit Enforcement

```
Given an organization on the Starter plan (maxPartnerUsers = 10)
  And the organization already has 10 active users
When a partner_lead attempts to invite a new user
Then the API returns 403 Forbidden
  And the error message states: "User limit reached (10/10). Upgrade your plan to add more team members."
```

### AC-29.5: Plan Upgrade via Stripe Checkout

```
Given a partner_lead on the TRIAL plan
When they select "Professional" on the subscription upgrade page
Then a Stripe Checkout session is created with the Professional price ID
  And the user is redirected to the Stripe Checkout page
When payment succeeds and Stripe sends checkout.session.completed webhook
Then the organization's plan is updated to "PROFESSIONAL"
  And subscriptionStatus is set to "ACTIVE"
  And maxActiveAssessments is set to 10
  And maxPartnerUsers is set to 30
```

### AC-29.6: Trial Expiry

```
Given an organization with subscriptionStatus "TRIALING"
  And trialEndsAt is in the past
When the trial expiry cron job runs
Then subscriptionStatus is updated to "TRIAL_EXPIRED"
  And the organization enters read-only mode (all write endpoints return 403)
  And a trial expiry email is sent to the partner_lead
```

### AC-29.7: Payment Failure Handling

```
Given an organization with subscriptionStatus "ACTIVE"
When Stripe sends an invoice.payment_failed webhook
Then subscriptionStatus is updated to "PAST_DUE"
  And a payment failure email is sent to the partner_lead and client_admin
  And the subscription status banner displays "Payment failed — update your payment method"
```

### AC-29.8: Feature Gating

```
Given an organization on the Starter plan
When a user navigates to the Analytics dashboard (Professional+ feature)
Then they see an UpgradePrompt component instead of the dashboard
  And the prompt explains that Analytics requires the Professional plan
  And a "View Plans" button links to the pricing page
```

### AC-29.9: Demo Assessment

```
Given an organization that has just completed signup
When the partner_lead clicks "Explore Demo Assessment" in the onboarding wizard
Then a demo assessment is provisioned with company "GlobalTech Industries (Demo)"
  And it contains 6 functional areas, 50 scope items, ~500 process steps
  And it has 30 FIT, 10 GAP, and 10 CONFIGURE classifications pre-filled
  And all generated reports are watermarked with "DEMO"
```

### AC-29.10: Subscription Cancellation

```
Given an organization with an active Professional subscription
When the partner_lead cancels via POST /api/partner/settings/subscription/cancel
Then the subscription is marked for cancellation at end of billing period
  And the organization retains full access until the billing period ends
  And a cancellation confirmation email is sent
When the billing period ends and Stripe sends customer.subscription.deleted webhook
Then subscriptionStatus is updated to "CANCELED"
  And the organization enters read-only mode
```

### AC-29.11: Stripe Webhook Idempotency

```
Given a Stripe checkout.session.completed webhook has already been processed for an organization
When Stripe retries the same webhook event (duplicate delivery)
Then the handler processes idempotently (no duplicate records, no errors)
  And the organization state remains unchanged
```

---

## 15. Size Estimate

**Size: XL (Extra Large)**

| Component | Effort |
|---|---|
| Prisma schema migration (Organization extensions, new tables) | 1 day |
| Signup flow (API + email verification) | 2 days |
| Organization provisioning logic | 1.5 days |
| Stripe integration (Checkout, Billing, Webhooks) | 4 days |
| Plan limits + feature gating enforcement | 2 days |
| Usage metering + event recording | 1.5 days |
| Partner settings API (profile, branding, SSO, SCIM) | 3 days |
| Demo/sandbox assessment provisioning | 2 days |
| Trial expiry cron job + data purge scheduling | 1.5 days |
| UI pages (signup, onboarding, partner settings, pricing) | 5 days |
| UI components (15 new components) | 4 days |
| Existing component modifications (nav, assessment list, reports) | 2 days |
| Data migration script (existing organizations) | 0.5 day |
| Unit tests | 2.5 days |
| Integration tests | 3 days |
| E2E tests | 2 days |
| **Total** | **~37.5 days** |

---

## 16. Phase Completion Checklist

- [ ] Prisma schema updated with Organization subscription fields, `AssessmentTemplate`, `UsageEvent`, `OnboardingProgress`
- [ ] Migration applied successfully in development and staging
- [ ] Existing organizations backfilled with plan, slug, type, limits
- [ ] `POST /api/auth/signup` creates User + Organization + OnboardingProgress in transaction
- [ ] Email verification flow sends magic link and sets `emailVerified`
- [ ] Slug generation produces unique, URL-safe slugs
- [ ] Onboarding wizard renders 3 steps: profile, invite team, explore demo
- [ ] Stripe Checkout integration creates session for plan upgrade
- [ ] Stripe Billing webhook handler processes all 5 event types idempotently
- [ ] `subscriptionStatus` transitions match the defined state machine
- [ ] Trial expiry cron job sends 3-day and 1-day warnings, expires trials, schedules purge
- [ ] `enforceAssessmentLimit()` blocks assessment creation at plan limit
- [ ] `enforceUserLimit()` blocks user invitation at plan limit
- [ ] `hasFeature()` / `requireFeature()` gates Enterprise-only features (SSO, branding, API)
- [ ] `FeatureGate` component shows `UpgradePrompt` for gated features
- [ ] Partner settings page has tabs for Profile, Branding, Subscription, SSO/SCIM, Team
- [ ] Partner dashboard shows active assessments, usage meters, team count, quick actions
- [ ] Usage events recorded to `UsageEvent` table and sent to Stripe
- [ ] Demo assessment provisions with 6 areas, 50 scope items, ~500 steps, realistic classifications
- [ ] Demo assessment reset endpoint recreates from seed data
- [ ] Reports watermarked for TRIAL plan organizations
- [ ] Read-only mode enforced for TRIAL_EXPIRED, PAST_DUE (after grace), and CANCELED orgs
- [ ] `PlanComparisonTable` renders all 4 tiers with feature comparison
- [ ] `SubscriptionStatusBanner` displays contextual alerts for non-ACTIVE statuses
- [ ] `TrialExpiryCountdown` shows remaining trial time
- [ ] Platform admin can override plan/limits and extend trials
- [ ] Stripe Customer Portal link generated for billing management
- [ ] All Zod schemas validate signup, profile, branding, SSO, subscription inputs
- [ ] Unit tests pass (validation, plan limits, feature gating, slug generation, subscription lifecycle)
- [ ] Integration tests pass (signup, settings, webhooks, usage, demo, read-only)
- [ ] E2E tests pass (signup-to-assessment, upgrade, demo exploration, feature gating)
- [ ] No TypeScript strict-mode errors introduced
- [ ] Environment variables documented: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_STARTER_PRICE_ID`, `STRIPE_PROFESSIONAL_PRICE_ID`
- [ ] PR reviewed and approved

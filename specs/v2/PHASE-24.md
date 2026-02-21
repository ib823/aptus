# Phase 24: Onboarding System

## 1. Overview

Role-specific onboarding flows that guide each user type through their first experience with Aptus. Different roles interact with fundamentally different parts of the platform, so a one-size-fits-all onboarding is inadequate.

**Problem**: Currently, all users land on the same dashboard page after login regardless of role. A process owner invited via magic link has no guidance on what they should do, an executive sponsor has no context on what to expect, and a new consultant must discover the assessment workflow themselves.

**Solution**: Multi-step onboarding wizards tailored to each role, contextual tooltips for first-time interactions with key features, and a sample assessment mode for consultants to explore safely.

### Per-Role Onboarding Flows

**Consultant (first login)**:
1. Welcome screen with platform overview
2. Create first assessment or explore sample assessment
3. Quick tour of assessment workflow (scope -> steps -> gaps -> report)
4. Team invitation prompt

**Process Owner (first login via magic link)**:
1. "You've been invited to [CompanyName]'s SAP Assessment"
2. MFA setup (required)
3. "Your assigned areas: Finance, Procurement"
4. Quick tour of step classification (try classifying one sample step)
5. Land on their area's first unreviewed step

**Executive Sponsor (first login)**:
1. "You've been invited as Executive Sponsor"
2. MFA setup (required)
3. Assessment summary dashboard overview
4. "When the assessment is complete, you'll be asked to review and sign off"

**IT Lead (first login)**:
1. Welcome + MFA setup
2. Tour of technical areas (integration register, data migration register, technical notes)
3. Land on integration register

**Project Manager (first login)**:
1. Welcome to Aptus portfolio management
2. Tour of PM dashboard (timeline, deadlines, resource allocation)
3. Set up first deadline

**Solution Architect (first login)**:
1. Welcome + overview of assessment architecture
2. Tour of heatmap, gap resolution, integration patterns
3. Land on assessment heatmap

**Data Migration Lead (first login)**:
1. Welcome + MFA setup
2. Tour of data migration register
3. Land on data migration register

**Client Admin (first login)**:
1. Welcome to your company's SAP assessment
2. Tour of user management and team view
3. Overview of assessment status

## 2. Dependencies

### Upstream (must exist before this phase)
- **Phase 1-4 (Core Assessment)**: Assessment workflow pages must exist for tour targets
- **Phase 5 (Gap Resolution)**: Gap pages exist for consultant tour
- **Phase 8 (MFA)**: MFA setup flow must exist for roles requiring MFA during onboarding
- **Phase 14-16 (Registers)**: Integration, DM, and OCM pages for IT Lead and Data Migration Lead tours
- **Phase 17 (Role System)**: Full role hierarchy for role-specific flow routing
- **Phase 23 (Intelligent Dashboard)**: Role-specific dashboard to land on after onboarding

### Downstream (phases that depend on this)
- **Phase 22 (Conversation Mode)**: Onboarding for process owners can highlight conversation mode

### External Dependencies
- None (tooltip and wizard components built with existing shadcn/ui primitives)

## 3. Data Model Changes

### New Models

```prisma
model OnboardingProgress {
  id             String    @id @default(cuid())
  userId         String    @unique
  role           String
  currentStep    Int       @default(0)
  completedSteps Int[]     @default([])
  skippedSteps   Int[]     @default([])
  isComplete     Boolean   @default(false)
  metadata       Json?     // Role-specific data: { sampleAssessmentId?, assessmentId? }
  startedAt      DateTime  @default(now())
  completedAt    DateTime?

  user User @relation(fields: [userId], references: [id])
}

model OnboardingTooltip {
  id          String   @id @default(cuid())
  userId      String
  tooltipKey  String   // e.g., "step_classification_first", "gap_card_first", "scope_selection_first"
  dismissedAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id])
  @@unique([userId, tooltipKey])
  @@index([userId])
}
```

### Zod Schemas

```typescript
import { z } from "zod";

export const onboardingRoleSchema = z.enum([
  "platform_admin",
  "partner_lead",
  "consultant",
  "project_manager",
  "solution_architect",
  "process_owner",
  "it_lead",
  "data_migration_lead",
  "executive_sponsor",
  "viewer",
  "client_admin",
]);

export const onboardingStepSchema = z.object({
  index: z.number().int().min(0),
  title: z.string(),
  description: z.string(),
  illustration: z.enum([
    "welcome",
    "assessment_workflow",
    "step_classification",
    "mfa_setup",
    "team_invite",
    "dashboard_overview",
    "sign_off",
    "integration_register",
    "dm_register",
    "heatmap",
    "deadline",
    "user_management",
    "gap_resolution",
  ]),
  action: z.enum([
    "continue",        // Simple next button
    "create_assessment", // CTA to create assessment
    "explore_sample",  // CTA to explore sample assessment
    "setup_mfa",       // Redirect to MFA setup
    "invite_team",     // Open team invitation dialog
    "try_classification", // Interactive step classification demo
    "set_deadline",    // Create a deadline
    "go_to_dashboard", // Navigate to role dashboard
    "go_to_area",      // Navigate to first assigned area
    "go_to_register",  // Navigate to integration/DM register
  ]),
  isRequired: z.boolean().default(false), // If true, cannot be skipped
});

export const onboardingFlowSchema = z.object({
  role: onboardingRoleSchema,
  steps: z.array(onboardingStepSchema),
  estimatedMinutes: z.number().int(),
});

export const updateOnboardingProgressSchema = z.object({
  stepIndex: z.number().int().min(0),
  action: z.enum(["complete", "skip"]),
});

export const dismissTooltipSchema = z.object({
  tooltipKey: z.string().min(1).max(100),
});

export const tooltipKeySchema = z.enum([
  "step_classification_first",
  "gap_card_first",
  "scope_selection_first",
  "config_matrix_first",
  "report_download_first",
  "conversation_mode_first",
  "heatmap_first",
  "deadline_first",
  "integration_register_first",
  "dm_register_first",
  "flow_diagram_first",
  "remaining_items_first",
  "sign_off_first",
]);
```

### Migration

```sql
-- CreateTable: OnboardingProgress
CREATE TABLE "OnboardingProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "completedSteps" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "skippedSteps" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "OnboardingProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OnboardingProgress_userId_key" ON "OnboardingProgress"("userId");

ALTER TABLE "OnboardingProgress"
  ADD CONSTRAINT "OnboardingProgress_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;

-- CreateTable: OnboardingTooltip
CREATE TABLE "OnboardingTooltip" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tooltipKey" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OnboardingTooltip_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OnboardingTooltip_userId_tooltipKey_key"
    ON "OnboardingTooltip"("userId", "tooltipKey");
CREATE INDEX "OnboardingTooltip_userId_idx" ON "OnboardingTooltip"("userId");

ALTER TABLE "OnboardingTooltip"
  ADD CONSTRAINT "OnboardingTooltip_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
```

## 4. API Routes

### `GET /api/onboarding`
Returns the current user's onboarding state and flow definition.

**Auth**: Requires authenticated session.

**Response** `200`:
```typescript
{
  progress: {
    currentStep: number;
    completedSteps: number[];
    skippedSteps: number[];
    isComplete: boolean;
    startedAt: string;
  } | null; // null if onboarding not started yet
  flow: {
    role: string;
    steps: OnboardingStep[];
    estimatedMinutes: number;
  };
  context: {
    userName: string;
    companyName: string | null; // From assessment invitation
    assignedAreas: string[];   // For process owners
    assessmentId: string | null; // If invited to specific assessment
    mfaRequired: boolean;
    mfaConfigured: boolean;
  };
}
```

### `POST /api/onboarding/start`
Initialize onboarding for the current user. Creates `OnboardingProgress` record.

**Auth**: Requires authenticated session.

**Response** `201`:
```typescript
{
  progressId: string;
  firstStep: OnboardingStep;
}
```

**Response** `409`: Onboarding already started (return existing progress).

### `PUT /api/onboarding/progress`
Update onboarding progress (complete or skip a step).

**Auth**: Requires authenticated session.

**Request Body**: `updateOnboardingProgressSchema`

**Response** `200`:
```typescript
{
  currentStep: number;
  completedSteps: number[];
  skippedSteps: number[];
  isComplete: boolean;
  nextStep: OnboardingStep | null; // null if this was the last step
  redirectUrl: string | null;      // Where to navigate after completion
}
```

**Response** `400`: Cannot skip a required step.

### `POST /api/onboarding/complete`
Mark onboarding as complete. Sets `isComplete: true` and `completedAt`.

**Auth**: Requires authenticated session.

**Response** `200`:
```typescript
{
  isComplete: true;
  redirectUrl: string; // Role-specific landing page
}
```

### `POST /api/onboarding/tooltips/dismiss`
Dismiss a contextual tooltip.

**Auth**: Requires authenticated session.

**Request Body**: `dismissTooltipSchema`

**Response** `200`: `{ dismissed: true }`

### `GET /api/onboarding/tooltips`
Get list of tooltips the user has NOT yet dismissed.

**Auth**: Requires authenticated session.

**Response** `200`:
```typescript
{
  activeTooltips: string[]; // Tooltip keys not yet dismissed
}
```

### `POST /api/onboarding/sample-assessment`
Create a sample assessment pre-populated with demo data for the consultant onboarding flow.

**Auth**: `consultant`, `partner_lead`, `platform_admin`.

**Response** `201`:
```typescript
{
  assessmentId: string;
  assessmentName: string; // "Sample: Acme Corp"
}
```

## 5. UI Components

### OnboardingWizard
Location: `src/components/onboarding/OnboardingWizard.tsx`

Full-screen overlay wizard that renders one step at a time. Slides horizontally between steps. Shows a "Skip" link for non-required steps and a progress indicator at the bottom.

```typescript
interface OnboardingWizardProps {
  flow: OnboardingFlow;
  progress: OnboardingProgress;
  context: OnboardingContext;
  onStepComplete: (stepIndex: number) => void;
  onStepSkip: (stepIndex: number) => void;
  onComplete: () => void;
}
```

Uses: Full-screen `div` with `fixed inset-0 z-50 bg-background`, `Button` (shadcn/ui), CSS transitions for slide animation, `ProgressDots` sub-component.

### OnboardingStep
Location: `src/components/onboarding/OnboardingStep.tsx`

Individual wizard step with an illustration area (left/top) and content area (right/bottom). Renders the step's title, description, and action button. Some steps have interactive elements (e.g., "try classifying a step").

```typescript
interface OnboardingStepProps {
  step: OnboardingStepConfig;
  context: OnboardingContext;
  onAction: (action: string) => void;
  isActive: boolean;
}
```

Uses: `Card` (shadcn/ui), `Button`, illustration SVGs, responsive layout (`flex flex-col lg:flex-row`).

### ProgressDots
Location: `src/components/onboarding/ProgressDots.tsx`

Horizontal dot progress indicator showing how many steps remain. Current step is filled, completed steps are solid, future steps are outlined.

```typescript
interface ProgressDotsProps {
  totalSteps: number;
  currentStep: number;
  completedSteps: number[];
  skippedSteps: number[];
}
```

Uses: `div` with dot elements, Tailwind classes (`bg-primary` for current, `bg-primary/30` for completed, `bg-muted` for future, `bg-amber-400` for skipped).

### ContextualTooltip
Location: `src/components/onboarding/ContextualTooltip.tsx`

First-time hint tooltip that appears on specific UI elements. Renders as a floating card with arrow pointing to the target element, a brief message, and a "Got it" dismiss button. Uses the existing `Tooltip` component from shadcn/ui as a base but with a richer content area.

```typescript
interface ContextualTooltipProps {
  tooltipKey: string;
  targetSelector: string; // CSS selector for positioning
  title: string;
  description: string;
  position?: "top" | "bottom" | "left" | "right";
  children: React.ReactNode; // The element to wrap
}
```

Uses: `Tooltip` (shadcn/ui extended), `Button` ("Got it"), `Card` styling, `z-40` positioning.

### SampleAssessmentBanner
Location: `src/components/onboarding/SampleAssessmentBanner.tsx`

A persistent banner shown at the top of the page when viewing a sample assessment. Displays "This is demo data" with a watermark effect, plus a button to delete the sample assessment.

```typescript
interface SampleAssessmentBannerProps {
  assessmentId: string;
  onDelete: () => void;
}
```

Uses: `div` with `bg-amber-50 border-amber-200`, `Badge` ("Sample Data"), `Button` ("Delete Sample").

### OnboardingGuard
Location: `src/components/onboarding/OnboardingGuard.tsx`

A wrapper component placed in the portal layout that checks if the user has completed onboarding. If not, redirects to the onboarding wizard. This is a server component that reads onboarding state.

```typescript
interface OnboardingGuardProps {
  children: React.ReactNode;
}
```

Logic:
```typescript
async function OnboardingGuard({ children }: OnboardingGuardProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const progress = await prisma.onboardingProgress.findUnique({
    where: { userId: user.id },
  });

  // If no progress record, user hasn't started onboarding
  // If progress exists but isComplete is false, resume onboarding
  if (!progress || !progress.isComplete) {
    redirect("/onboarding");
  }

  return <>{children}</>;
}
```

### ContextualTooltipProvider
Location: `src/components/onboarding/ContextualTooltipProvider.tsx`

Client-side context provider that loads the user's dismissed tooltips and makes them available to all `ContextualTooltip` instances via React Context.

```typescript
interface TooltipContextValue {
  dismissedTooltips: Set<string>;
  dismissTooltip: (key: string) => Promise<void>;
  isTooltipActive: (key: string) => boolean;
}
```

Uses: React Context, `useEffect` for initial load from `GET /api/onboarding/tooltips`.

## 6. Business Logic

### Onboarding Flow Definitions

```typescript
const ONBOARDING_FLOWS: Record<string, OnboardingFlow> = {
  consultant: {
    role: "consultant",
    estimatedMinutes: 3,
    steps: [
      {
        index: 0,
        title: "Welcome to Aptus",
        description: "Aptus helps you run SAP S/4HANA Cloud Fit-to-Standard assessments. Let's show you around.",
        illustration: "welcome",
        action: "continue",
        isRequired: false,
      },
      {
        index: 1,
        title: "Your First Assessment",
        description: "Create a new assessment for a client or explore a sample assessment with demo data to see how everything works.",
        illustration: "assessment_workflow",
        action: "create_assessment", // or "explore_sample"
        isRequired: false,
      },
      {
        index: 2,
        title: "The Assessment Workflow",
        description: "Every assessment follows: Scope Selection -> Step Classification -> Gap Resolution -> Configuration -> Report. Each step builds on the previous.",
        illustration: "assessment_workflow",
        action: "continue",
        isRequired: false,
      },
      {
        index: 3,
        title: "Invite Your Team",
        description: "Invite process owners, IT leads, and executive sponsors to collaborate on the assessment. Each role sees only what's relevant to them.",
        illustration: "team_invite",
        action: "invite_team",
        isRequired: false,
      },
    ],
  },

  process_owner: {
    role: "process_owner",
    estimatedMinutes: 4,
    steps: [
      {
        index: 0,
        title: "You've Been Invited",
        description: "Welcome! You've been invited to participate in {companyName}'s SAP S/4HANA assessment. Your expertise in {assignedAreas} is needed to evaluate how well SAP fits your current processes.",
        illustration: "welcome",
        action: "continue",
        isRequired: false,
      },
      {
        index: 1,
        title: "Secure Your Account",
        description: "For security, we require multi-factor authentication. Set up your authenticator app now.",
        illustration: "mfa_setup",
        action: "setup_mfa",
        isRequired: true, // Cannot skip MFA for process owners
      },
      {
        index: 2,
        title: "Your Assigned Areas",
        description: "You've been assigned to review: {assignedAreas}. You'll only see the process steps relevant to your areas.",
        illustration: "heatmap",
        action: "continue",
        isRequired: false,
      },
      {
        index: 3,
        title: "Classify Process Steps",
        description: "For each SAP process step, tell us: does it FIT your current process? Does it need CONFIGURATION? Is there a GAP? Or is it NOT APPLICABLE? Try one now.",
        illustration: "step_classification",
        action: "try_classification",
        isRequired: false,
      },
      {
        index: 4,
        title: "You're Ready",
        description: "Let's start with your first unreviewed step. You can always come back to the dashboard to see your progress.",
        illustration: "dashboard_overview",
        action: "go_to_area",
        isRequired: false,
      },
    ],
  },

  executive_sponsor: {
    role: "executive_sponsor",
    estimatedMinutes: 2,
    steps: [
      {
        index: 0,
        title: "Welcome, Executive Sponsor",
        description: "You've been invited as the Executive Sponsor for {companyName}'s SAP S/4HANA assessment. Your role is to review and sign off on the final assessment.",
        illustration: "welcome",
        action: "continue",
        isRequired: false,
      },
      {
        index: 1,
        title: "Secure Your Account",
        description: "For security, we require multi-factor authentication.",
        illustration: "mfa_setup",
        action: "setup_mfa",
        isRequired: true,
      },
      {
        index: 2,
        title: "Your Dashboard",
        description: "Your dashboard shows KPI metrics: FIT rate, gap count, effort estimates, and overall readiness. When the assessment is complete, you'll see a sign-off request here.",
        illustration: "dashboard_overview",
        action: "continue",
        isRequired: false,
      },
      {
        index: 3,
        title: "Sign-Off Process",
        description: "When the assessment is finalized, you'll be asked to review the executive summary and digitally sign off. You'll receive a notification when it's ready.",
        illustration: "sign_off",
        action: "go_to_dashboard",
        isRequired: false,
      },
    ],
  },

  it_lead: {
    role: "it_lead",
    estimatedMinutes: 3,
    steps: [
      {
        index: 0,
        title: "Welcome, IT Lead",
        description: "You've been invited to provide technical input on {companyName}'s SAP assessment.",
        illustration: "welcome",
        action: "continue",
        isRequired: false,
      },
      {
        index: 1,
        title: "Secure Your Account",
        description: "For security, we require multi-factor authentication.",
        illustration: "mfa_setup",
        action: "setup_mfa",
        isRequired: true,
      },
      {
        index: 2,
        title: "Technical Areas",
        description: "Your focus areas: Integration Register (system connections), Data Migration Register (data to move), and technical notes on process steps. You can add technical context that helps shape the implementation plan.",
        illustration: "integration_register",
        action: "continue",
        isRequired: false,
      },
      {
        index: 3,
        title: "Get Started",
        description: "Let's start with the integration register.",
        illustration: "integration_register",
        action: "go_to_register",
        isRequired: false,
      },
    ],
  },

  project_manager: {
    role: "project_manager",
    estimatedMinutes: 3,
    steps: [
      {
        index: 0,
        title: "Welcome to Aptus Portfolio",
        description: "As Project Manager, you can track assessment progress, manage deadlines, and oversee team activity across all assessments.",
        illustration: "welcome",
        action: "continue",
        isRequired: false,
      },
      {
        index: 1,
        title: "Your PM Dashboard",
        description: "Your dashboard shows a portfolio view with timeline, resource allocation, and deadline tracking. Assessment progress is visualized with heatmaps.",
        illustration: "dashboard_overview",
        action: "continue",
        isRequired: false,
      },
      {
        index: 2,
        title: "Set a Deadline",
        description: "Keep your team on track. Create deadlines for key milestones like scope completion, step review, and sign-off.",
        illustration: "deadline",
        action: "set_deadline",
        isRequired: false,
      },
    ],
  },

  solution_architect: {
    role: "solution_architect",
    estimatedMinutes: 2,
    steps: [
      {
        index: 0,
        title: "Welcome, Solution Architect",
        description: "Your role is to review the assessment from a technical architecture perspective, evaluate gap resolutions, and ensure integration patterns are sound.",
        illustration: "welcome",
        action: "continue",
        isRequired: false,
      },
      {
        index: 1,
        title: "Key Views",
        description: "Use the Heatmap to see assessment progress by area, the Gap Register to evaluate resolution approaches, and the Integration Register for system landscape planning.",
        illustration: "heatmap",
        action: "continue",
        isRequired: false,
      },
      {
        index: 2,
        title: "Get Started",
        description: "Let's go to the assessment heatmap.",
        illustration: "heatmap",
        action: "go_to_dashboard",
        isRequired: false,
      },
    ],
  },

  data_migration_lead: {
    role: "data_migration_lead",
    estimatedMinutes: 2,
    steps: [
      {
        index: 0,
        title: "Welcome, Data Migration Lead",
        description: "You'll manage the data migration register: cataloguing data objects to migrate, estimating volumes, and tracking readiness.",
        illustration: "welcome",
        action: "continue",
        isRequired: false,
      },
      {
        index: 1,
        title: "Secure Your Account",
        description: "For security, we require multi-factor authentication.",
        illustration: "mfa_setup",
        action: "setup_mfa",
        isRequired: true,
      },
      {
        index: 2,
        title: "Data Migration Register",
        description: "The register tracks every data object that needs migration. You'll define source systems, volumes, and migration approach for each object.",
        illustration: "dm_register",
        action: "go_to_register",
        isRequired: false,
      },
    ],
  },

  client_admin: {
    role: "client_admin",
    estimatedMinutes: 2,
    steps: [
      {
        index: 0,
        title: "Welcome to Aptus",
        description: "As Client Admin, you can manage your team's access and view overall assessment progress.",
        illustration: "welcome",
        action: "continue",
        isRequired: false,
      },
      {
        index: 1,
        title: "Team Management",
        description: "View and manage your organization's users. You can see who's been invited, their roles, and their progress.",
        illustration: "user_management",
        action: "continue",
        isRequired: false,
      },
      {
        index: 2,
        title: "Assessment Overview",
        description: "Your dashboard shows the status of all assessments in your organization.",
        illustration: "dashboard_overview",
        action: "go_to_dashboard",
        isRequired: false,
      },
    ],
  },

  // viewer and platform_admin/partner_lead have minimal onboarding
  viewer: {
    role: "viewer",
    estimatedMinutes: 1,
    steps: [
      {
        index: 0,
        title: "Welcome to Aptus",
        description: "You have view-only access to assessment data. You can browse scope items, review step classifications, and view reports.",
        illustration: "welcome",
        action: "go_to_dashboard",
        isRequired: false,
      },
    ],
  },

  platform_admin: {
    role: "platform_admin",
    estimatedMinutes: 1,
    steps: [
      {
        index: 0,
        title: "Welcome, Admin",
        description: "You have full platform access. Use the admin panel to manage catalog data, users, organizations, and system settings.",
        illustration: "welcome",
        action: "go_to_dashboard",
        isRequired: false,
      },
    ],
  },

  partner_lead: {
    role: "partner_lead",
    estimatedMinutes: 1,
    steps: [
      {
        index: 0,
        title: "Welcome, Partner Lead",
        description: "You can manage assessments, create conversation templates, and oversee your team's work across all client engagements.",
        illustration: "welcome",
        action: "go_to_dashboard",
        isRequired: false,
      },
    ],
  },
};
```

### Redirect After Completion

```typescript
function getPostOnboardingRedirect(role: string, context: OnboardingContext): string {
  switch (role) {
    case "consultant":
    case "partner_lead":
    case "platform_admin":
    case "project_manager":
    case "client_admin":
    case "solution_architect":
      return "/dashboard";
    case "process_owner":
      return context.assessmentId
        ? `/assessment/${context.assessmentId}/review`
        : "/dashboard";
    case "executive_sponsor":
      return "/dashboard";
    case "it_lead":
      return context.assessmentId
        ? `/assessment/${context.assessmentId}/integration`
        : "/dashboard";
    case "data_migration_lead":
      return context.assessmentId
        ? `/assessment/${context.assessmentId}/data-migration`
        : "/dashboard";
    case "viewer":
      return "/dashboard";
    default:
      return "/dashboard";
  }
}
```

### Contextual Tooltip Registry

```typescript
const TOOLTIP_REGISTRY: Record<string, { title: string; description: string; position: string }> = {
  step_classification_first: {
    title: "Classify This Step",
    description: "Read the SAP documentation on the left, then tell us how your company handles this today. Choose FIT if SAP matches, CONFIGURE if it needs setup, GAP if your process differs, or NA if it doesn't apply.",
    position: "bottom",
  },
  gap_card_first: {
    title: "Resolve This Gap",
    description: "For each gap, choose a resolution approach. SAP offers standard config, key user extensions, BTP extensions, ISV solutions, or you can adapt your process to match SAP.",
    position: "top",
  },
  scope_selection_first: {
    title: "Select Scope Items",
    description: "Choose which SAP modules are relevant to your business. Selected items will be reviewed in detail during step classification.",
    position: "bottom",
  },
  config_matrix_first: {
    title: "Configuration Activities",
    description: "These are the SAP configuration tasks needed for your selected scope items. Include or exclude each based on your requirements.",
    position: "bottom",
  },
  report_download_first: {
    title: "Download Reports",
    description: "Generate and download assessment reports in PDF and Excel format. The complete package includes all reports in a single ZIP file.",
    position: "left",
  },
  conversation_mode_first: {
    title: "Try Conversation Mode",
    description: "Conversation Mode transforms SAP process steps into plain-language questions. It's designed for business users who are unfamiliar with SAP terminology.",
    position: "bottom",
  },
  heatmap_first: {
    title: "Assessment Progress Heatmap",
    description: "Each cell shows completion for a scope item. Green means fully reviewed, red means not started. Click any cell to jump to that scope item's review.",
    position: "bottom",
  },
  sign_off_first: {
    title: "Digital Sign-Off",
    description: "Each stakeholder role signs off on the assessment. All three sign-offs are required to finalize the assessment.",
    position: "top",
  },
};
```

## 7. Permissions & Access Control

| Action | Roles Allowed |
|--------|---------------|
| View own onboarding flow | All authenticated roles |
| Complete/skip onboarding steps | All authenticated roles (own onboarding only) |
| Create sample assessment | `consultant`, `partner_lead`, `platform_admin` |
| Delete sample assessment | Owner of sample assessment, `platform_admin` |
| Dismiss tooltips | All authenticated roles (own tooltips only) |
| View other users' onboarding progress | `platform_admin` (for analytics) |
| Reset a user's onboarding | `platform_admin` |
| Skip MFA setup step | NOT allowed for `process_owner`, `executive_sponsor`, `it_lead`, `data_migration_lead` (step is `isRequired: true`) |

### Security Considerations
- Sample assessments are created in a sandboxed state: they are marked with `status: "sample"` and cannot be signed off.
- Sample assessments are auto-deleted after 30 days.
- Onboarding wizard cannot be bypassed for roles requiring MFA: the `OnboardingGuard` checks both `isComplete` and MFA status.

## 8. Notification Triggers

| Event | Recipients | Channel |
|-------|-----------|---------|
| User completes onboarding | PM + consultant on assessment | In-app notification |
| User skips onboarding entirely | PM + consultant | In-app notification (advisory) |
| Process owner has not started onboarding 48h after invitation | PM | Email reminder |
| Sample assessment approaching 30-day expiry | Assessment creator | In-app notification |

## 9. Edge Cases & Error Handling

| Edge Case | Handling |
|-----------|----------|
| User role changes after onboarding started | Restart onboarding with new role's flow; old progress preserved in metadata for audit |
| User invited to multiple assessments | Onboarding uses the first assessment's context; subsequent assessments skip onboarding |
| MFA already configured before onboarding | "Setup MFA" step auto-completes and advances to next step |
| User closes browser mid-onboarding | Progress saved after each step; wizard resumes from last completed step |
| Sample assessment created but user never explores it | Auto-deleted after 30 days via scheduled cleanup |
| User navigates directly to a portal page (bypassing wizard) | `OnboardingGuard` redirects to `/onboarding` |
| User has no assignedAreas (process owner) | Step 2 shows "No areas assigned yet. Contact your project manager." |
| Tooltip target element not visible on screen | Tooltip not rendered; `ContextualTooltipProvider` checks element visibility |
| User clicks "Skip All" | All non-required steps marked as skipped; required steps must still be completed |
| Onboarding flow definition updated after user started | User continues with the flow version they started; completed steps remain valid |

## 10. Performance Considerations

- **OnboardingGuard Check**: A single database query (`findUnique` on `userId` unique index) per page load. Result cached with React `cache()` within the RSC render pass, same pattern as `getCurrentUser`.
- **Tooltip Loading**: `GET /api/onboarding/tooltips` returns a small set of dismissed tooltip keys (typically <20 strings). Loaded once on app mount in `ContextualTooltipProvider` and cached in React state.
- **Sample Assessment Creation**: Sample assessment is created with minimal data: 3 scope items, ~20 process steps, 2 gap resolutions. Creation takes <1s.
- **Wizard Rendering**: Only the current step is rendered at a time. Illustration assets are lazy-loaded SVGs. Total wizard bundle size: <50KB.
- **No Polling**: Onboarding state does not change from external sources, so no polling or SSE needed.

## 11. Testing Strategy

### Unit Tests
- Onboarding flow definitions: verify all 11 roles have valid flows with correct step counts
- `getPostOnboardingRedirect`: verify correct redirect URLs for each role + context combination
- Required step enforcement: verify MFA steps cannot be skipped for roles requiring MFA
- Tooltip registry: verify all tooltip keys have valid entries

### Integration Tests
- `GET /api/onboarding`: returns correct flow for each role
- `POST /api/onboarding/start`: creates progress record, returns first step
- `PUT /api/onboarding/progress`: advances step, marks complete/skip correctly
- `POST /api/onboarding/complete`: sets `isComplete`, returns redirect URL
- `POST /api/onboarding/tooltips/dismiss`: creates tooltip record, subsequent GET excludes it
- `POST /api/onboarding/sample-assessment`: creates valid assessment with sample data
- Cannot skip required step: `PUT /api/onboarding/progress` with `action: "skip"` on MFA step returns 400

### E2E Tests
- Consultant: complete full onboarding wizard (welcome -> create assessment -> workflow tour -> invite team)
- Process owner: onboarding flow via magic link -> MFA setup -> area overview -> classification demo -> land on review page
- Executive sponsor: onboarding -> MFA -> dashboard -> sign-off explanation
- Skip onboarding: verify skipped steps recorded, user reaches dashboard
- Return after partial onboarding: verify wizard resumes from correct step
- `OnboardingGuard`: navigate directly to `/dashboard` without completing onboarding, verify redirect to `/onboarding`

## 12. Migration & Seed Data

### Migration Steps
1. Run `npx prisma migrate dev --name add_onboarding_system` to create `OnboardingProgress` and `OnboardingTooltip` tables.
2. For existing users who should skip onboarding, run a one-time script:

```typescript
// Mark existing users as onboarding-complete
async function backfillOnboarding() {
  const existingUsers = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, role: true },
  });

  await prisma.onboardingProgress.createMany({
    data: existingUsers.map((u) => ({
      userId: u.id,
      role: u.role,
      currentStep: 0,
      completedSteps: [],
      skippedSteps: [],
      isComplete: true, // Existing users skip onboarding
      completedAt: new Date(),
    })),
    skipDuplicates: true,
  });
}
```

### Seed Data
- Sample assessment template with 3 scope items (J60, J14, BD2), ~20 pre-classified steps, and 2 sample gap resolutions.
- No tooltip seed data needed (tooltips are dismissed dynamically).

## 13. Open Questions

1. **Illustration Assets**: Should onboarding step illustrations be custom SVGs, Lottie animations, or screenshots of the actual UI? Custom SVGs are cleanest but require design effort. Screenshots are easiest but may become stale. Recommended: simple SVG illustrations with Tailwind-styled placeholder shapes initially.
2. **"Try Classification" Step**: How interactive should the process owner demo be? Options: (a) fully interactive with a real sample step that saves to a sample assessment, (b) a static mockup with clickable buttons that show feedback but don't persist. Recommended: option (a) using the sample assessment.
3. **Forced vs. Optional Onboarding**: Should onboarding be mandatory (users cannot access the portal until complete) or optional (users can dismiss and access the portal immediately)? Recommended: mandatory for first login, but every non-MFA step can be skipped.
4. **Re-Onboarding**: If a user's role changes (e.g., from viewer to process_owner), should they go through the new role's onboarding? Recommended: yes, reset and show new flow.
5. **Analytics**: Should we track onboarding completion rates, drop-off steps, and time-to-complete per role? Recommended: yes, log to `DecisionLogEntry` with `entityType: "onboarding"`.
6. **Tooltip Frequency**: Should tooltips appear on every page visit until dismissed, or only on the first visit to each page? Recommended: only on first visit (check if element has been seen before, using the tooltip key).

## 14. Acceptance Criteria (Given/When/Then)

### AC-24.1: Consultant First Login
```
Given a consultant logs in for the first time
  And no OnboardingProgress record exists for their userId
When they access the portal
Then they are redirected to /onboarding
  And the OnboardingWizard shows step 1: "Welcome to Aptus"
  And ProgressDots shows 4 steps with step 1 highlighted
```

### AC-24.2: Process Owner MFA Required
```
Given a process owner is on onboarding step 2 (MFA setup)
  And MFA is not yet configured
When they click "Skip"
Then the skip is rejected
  And a message shows "Multi-factor authentication is required for your role"
  And the "Setup MFA" button remains prominent
```

### AC-24.3: Process Owner Lands on First Step
```
Given a process owner has completed all onboarding steps
  And they are assigned to areas ["Finance"]
  And the first unreviewed step in Finance is step 3 of scope item J60
When onboarding completes
Then they are redirected to /assessment/[id]/review?scopeItem=J60
  And the page scrolls to step 3
```

### AC-24.4: Sample Assessment Creation
```
Given a consultant is on onboarding step 2 "Your First Assessment"
When they click "Explore Sample Assessment"
Then a sample assessment is created with:
  - companyName: "Sample: Acme Corp"
  - 3 scope items (J60, J14, BD2)
  - ~20 pre-classified steps
  - 2 sample gap resolutions
  And the SampleAssessmentBanner is shown at the top
  And the assessment status is "sample"
```

### AC-24.5: Contextual Tooltip on First Visit
```
Given a process owner has completed onboarding
  And they have not dismissed the "step_classification_first" tooltip
When they navigate to the step review page for the first time
Then a ContextualTooltip appears pointing at the classification buttons
  With title "Classify This Step"
  And description explaining the four options
  And a "Got it" dismiss button
```

### AC-24.6: Tooltip Dismiss Persists
```
Given a process owner dismisses the "step_classification_first" tooltip
When they navigate away and return to the step review page
Then the tooltip does not appear again
  And the OnboardingTooltip record exists with tooltipKey "step_classification_first"
```

### AC-24.7: OnboardingGuard Redirect
```
Given a new user has not completed onboarding
When they navigate directly to /dashboard
Then the OnboardingGuard redirects them to /onboarding
  And the wizard shows their current step
```

### AC-24.8: Skip Non-Required Steps
```
Given a consultant is on onboarding step 3 "The Assessment Workflow"
  And the step has isRequired: false
When they click "Skip"
Then step 3 is added to skippedSteps
  And the wizard advances to step 4
  And ProgressDots shows step 3 with an amber dot (skipped)
```

### AC-24.9: Resume After Browser Close
```
Given a process owner completed steps 0 and 1, then closed the browser
When they log in again and navigate to the portal
Then OnboardingGuard redirects to /onboarding
  And the wizard resumes at step 2 (their current step)
  And steps 0 and 1 show as completed in ProgressDots
```

### AC-24.10: Existing User Backfill
```
Given 50 existing users in the database before Phase 24 migration
When the backfill script runs
Then 50 OnboardingProgress records are created with isComplete: true
  And those users can access the portal without onboarding
```

## 15. Size Estimate

**Size: M (Medium)**

| Component | Effort |
|-----------|--------|
| Data model + migration | 0.5 days |
| API routes (7 endpoints) | 1.5 days |
| Onboarding flow definitions (11 roles) | 1 day |
| OnboardingWizard + OnboardingStep + ProgressDots | 2 days |
| ContextualTooltip + ContextualTooltipProvider | 1 day |
| OnboardingGuard (server component) | 0.5 days |
| SampleAssessmentBanner + sample data generator | 0.5 days |
| Step illustrations (SVG placeholders) | 0.5 days |
| Backfill script for existing users | 0.25 days |
| Unit + integration tests | 1.5 days |
| E2E tests | 1 day |
| **Total** | **~10.25 days** |

## 16. Phase Completion Checklist

- [ ] `OnboardingProgress` and `OnboardingTooltip` tables created and migrated
- [ ] Zod schemas validated for all onboarding types
- [ ] Onboarding flow definitions created for all 11 roles
- [ ] `GET /api/onboarding` returns correct flow and context per role
- [ ] `POST /api/onboarding/start` initializes progress record
- [ ] `PUT /api/onboarding/progress` advances wizard, enforces required steps
- [ ] `POST /api/onboarding/complete` finalizes and returns role-appropriate redirect URL
- [ ] `POST /api/onboarding/tooltips/dismiss` persists tooltip dismissal
- [ ] `GET /api/onboarding/tooltips` returns undismissed tooltip keys
- [ ] `POST /api/onboarding/sample-assessment` creates valid sample with demo data
- [ ] `OnboardingWizard` renders full-screen with step-by-step navigation
- [ ] `OnboardingStep` renders illustration + content + action button
- [ ] `ProgressDots` shows completed, current, skipped, and future steps
- [ ] `ContextualTooltip` renders on first visit to targeted elements
- [ ] `ContextualTooltipProvider` loads dismissed state and provides context
- [ ] `OnboardingGuard` redirects incomplete users to `/onboarding`
- [ ] `SampleAssessmentBanner` renders on sample assessment pages
- [ ] Process owner MFA step cannot be skipped
- [ ] Correct post-onboarding redirect for each role
- [ ] Backfill script marks existing users as onboarding-complete
- [ ] Wizard resumes from last completed step on return visit
- [ ] Unit tests: flow definitions, redirect logic, required step enforcement
- [ ] Integration tests: all API routes with role permutations
- [ ] E2E tests: consultant, process owner, executive onboarding flows
- [ ] Mobile viewport tested (375px width for wizard)

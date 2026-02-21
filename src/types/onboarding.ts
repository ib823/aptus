/** Phase 24: Onboarding System Types */

import type { UserRole } from "@/types/assessment";

/** An action a user can take in an onboarding step */
export type OnboardingAction =
  | { type: "navigate"; url: string }
  | { type: "open_dialog"; dialogId: string }
  | { type: "highlight"; selector: string }
  | { type: "complete_profile" }
  | { type: "invite_team" }
  | { type: "create_assessment" }
  | { type: "review_scope" }
  | { type: "none" };

/** Keys for contextual tooltips */
export type TooltipKey =
  | "scope_selection_intro"
  | "fit_gap_classification"
  | "gap_resolution_flow"
  | "dashboard_widgets"
  | "collaboration_comments"
  | "workshop_mode"
  | "data_migration_intro"
  | "ocm_assessment"
  | "report_generation"
  | "deadline_management"
  | "conflict_resolution";

/** Configuration for a single onboarding step */
export interface OnboardingStepConfig {
  index: number;
  title: string;
  description: string;
  isRequired: boolean;
  action: OnboardingAction;
  estimatedMinutes?: number | undefined;
}

/** An entire onboarding flow for a role */
export interface OnboardingFlow {
  role: UserRole;
  title: string;
  description: string;
  steps: OnboardingStepConfig[];
}

/** Tooltip registry entry */
export interface TooltipRegistryEntry {
  key: TooltipKey;
  title: string;
  content: string;
  placement: "top" | "bottom" | "left" | "right";
  targetSelector: string;
}

/** Onboarding flows for all 11 roles */
export const ONBOARDING_FLOWS: Record<UserRole, OnboardingFlow> = {
  platform_admin: {
    role: "platform_admin",
    title: "Platform Admin Setup",
    description: "Set up and manage the FIT portal platform.",
    steps: [
      { index: 0, title: "Welcome", description: "Welcome to the FIT Portal administration.", isRequired: true, action: { type: "none" } },
      { index: 1, title: "Review Organization", description: "Review and configure your organization settings.", isRequired: true, action: { type: "navigate", url: "/admin/organizations" } },
      { index: 2, title: "Invite Team", description: "Invite team members and assign roles.", isRequired: true, action: { type: "invite_team" } },
      { index: 3, title: "Explore Dashboard", description: "Explore the admin dashboard and monitoring tools.", isRequired: false, action: { type: "navigate", url: "/admin" } },
    ],
  },
  partner_lead: {
    role: "partner_lead",
    title: "Partner Lead Onboarding",
    description: "Get started managing SAP implementation assessments.",
    steps: [
      { index: 0, title: "Welcome", description: "Welcome to the FIT Portal as a Partner Lead.", isRequired: true, action: { type: "none" } },
      { index: 1, title: "Create Assessment", description: "Create your first assessment for a client.", isRequired: true, action: { type: "create_assessment" } },
      { index: 2, title: "Invite Team", description: "Invite consultants and stakeholders.", isRequired: true, action: { type: "invite_team" } },
      { index: 3, title: "Review Dashboard", description: "Explore your role-specific dashboard.", isRequired: false, action: { type: "navigate", url: "/dashboard" } },
    ],
  },
  consultant: {
    role: "consultant",
    title: "Consultant Onboarding",
    description: "Learn how to guide clients through fit-gap analysis.",
    steps: [
      { index: 0, title: "Welcome", description: "Welcome to the FIT Portal as a Consultant.", isRequired: true, action: { type: "none" } },
      { index: 1, title: "Complete Profile", description: "Fill in your profile and expertise areas.", isRequired: true, action: { type: "complete_profile" } },
      { index: 2, title: "Understand Scope", description: "Learn how scope items and process steps work.", isRequired: true, action: { type: "highlight", selector: "[data-tour='scope-items']" } },
      { index: 3, title: "Classification Guide", description: "Understand FIT, CONFIGURE, GAP, and N/A classifications.", isRequired: true, action: { type: "highlight", selector: "[data-tour='classification']" } },
      { index: 4, title: "Explore Tools", description: "Discover collaboration and reporting tools.", isRequired: false, action: { type: "navigate", url: "/dashboard" } },
    ],
  },
  project_manager: {
    role: "project_manager",
    title: "Project Manager Onboarding",
    description: "Track progress and manage assessment timelines.",
    steps: [
      { index: 0, title: "Welcome", description: "Welcome to the FIT Portal as a Project Manager.", isRequired: true, action: { type: "none" } },
      { index: 1, title: "Dashboard Overview", description: "Learn to use your dashboard for project tracking.", isRequired: true, action: { type: "navigate", url: "/dashboard" } },
      { index: 2, title: "Set Deadlines", description: "Set up milestones and deadlines.", isRequired: true, action: { type: "navigate", url: "/dashboard" } },
      { index: 3, title: "Team Management", description: "Review team assignments and workload.", isRequired: false, action: { type: "invite_team" } },
    ],
  },
  solution_architect: {
    role: "solution_architect",
    title: "Solution Architect Onboarding",
    description: "Review technical gaps and integration points.",
    steps: [
      { index: 0, title: "Welcome", description: "Welcome to the FIT Portal as a Solution Architect.", isRequired: true, action: { type: "none" } },
      { index: 1, title: "Gap Analysis", description: "Learn how to review and resolve gaps.", isRequired: true, action: { type: "highlight", selector: "[data-tour='gaps']" } },
      { index: 2, title: "Integration Review", description: "Review integration requirements and patterns.", isRequired: true, action: { type: "navigate", url: "/dashboard" } },
      { index: 3, title: "Conflict Resolution", description: "Handle classification conflicts.", isRequired: false, action: { type: "navigate", url: "/dashboard" } },
    ],
  },
  process_owner: {
    role: "process_owner",
    title: "Process Owner Onboarding",
    description: "Classify process steps for your functional area.",
    steps: [
      { index: 0, title: "Welcome", description: "Welcome to the FIT Portal as a Process Owner.", isRequired: true, action: { type: "none" } },
      { index: 1, title: "Your Scope", description: "Review the scope items assigned to your area.", isRequired: true, action: { type: "review_scope" } },
      { index: 2, title: "Classification", description: "Learn how to classify each process step.", isRequired: true, action: { type: "highlight", selector: "[data-tour='classification']" } },
      { index: 3, title: "Notes & Comments", description: "Add notes and collaborate with the team.", isRequired: false, action: { type: "highlight", selector: "[data-tour='comments']" } },
    ],
  },
  it_lead: {
    role: "it_lead",
    title: "IT Lead Onboarding",
    description: "Provide technical notes and review data migration.",
    steps: [
      { index: 0, title: "Welcome", description: "Welcome to the FIT Portal as an IT Lead.", isRequired: true, action: { type: "none" } },
      { index: 1, title: "Technical Notes", description: "Learn how to add technical notes to process steps.", isRequired: true, action: { type: "highlight", selector: "[data-tour='notes']" } },
      { index: 2, title: "Data Migration", description: "Review data migration requirements.", isRequired: true, action: { type: "navigate", url: "/dashboard" } },
      { index: 3, title: "Integration Points", description: "Review integration requirements.", isRequired: false, action: { type: "navigate", url: "/dashboard" } },
    ],
  },
  data_migration_lead: {
    role: "data_migration_lead",
    title: "Data Migration Lead Onboarding",
    description: "Manage data migration planning and tracking.",
    steps: [
      { index: 0, title: "Welcome", description: "Welcome to the FIT Portal as a Data Migration Lead.", isRequired: true, action: { type: "none" } },
      { index: 1, title: "Migration Objects", description: "Review and manage data migration objects.", isRequired: true, action: { type: "navigate", url: "/dashboard" } },
      { index: 2, title: "Deadlines", description: "Set up migration milestones.", isRequired: true, action: { type: "navigate", url: "/dashboard" } },
    ],
  },
  executive_sponsor: {
    role: "executive_sponsor",
    title: "Executive Sponsor Onboarding",
    description: "Monitor assessment progress and KPIs.",
    steps: [
      { index: 0, title: "Welcome", description: "Welcome to the FIT Portal as an Executive Sponsor.", isRequired: true, action: { type: "none" } },
      { index: 1, title: "KPI Dashboard", description: "View key performance indicators for your assessment.", isRequired: true, action: { type: "navigate", url: "/dashboard" } },
      { index: 2, title: "Reports", description: "Access executive summary reports.", isRequired: false, action: { type: "navigate", url: "/dashboard" } },
    ],
  },
  viewer: {
    role: "viewer",
    title: "Viewer Onboarding",
    description: "View assessment progress and reports.",
    steps: [
      { index: 0, title: "Welcome", description: "Welcome to the FIT Portal.", isRequired: true, action: { type: "none" } },
      { index: 1, title: "Navigation", description: "Learn how to navigate the portal and view assessments.", isRequired: true, action: { type: "navigate", url: "/dashboard" } },
    ],
  },
  client_admin: {
    role: "client_admin",
    title: "Client Admin Onboarding",
    description: "Manage your organization's assessment team.",
    steps: [
      { index: 0, title: "Welcome", description: "Welcome to the FIT Portal as a Client Admin.", isRequired: true, action: { type: "none" } },
      { index: 1, title: "Team Setup", description: "Review and manage your team members.", isRequired: true, action: { type: "invite_team" } },
      { index: 2, title: "Dashboard", description: "Explore your dashboard and KPIs.", isRequired: true, action: { type: "navigate", url: "/dashboard" } },
      { index: 3, title: "Deadlines", description: "Set up important deadlines and milestones.", isRequired: false, action: { type: "navigate", url: "/dashboard" } },
    ],
  },
};

/** Registry of all contextual tooltips */
export const TOOLTIP_REGISTRY: TooltipRegistryEntry[] = [
  { key: "scope_selection_intro", title: "Scope Selection", content: "Select which SAP scope items apply to your business. Each item contains process steps you will classify.", placement: "bottom", targetSelector: "[data-tooltip='scope-selection']" },
  { key: "fit_gap_classification", title: "FIT/GAP Classification", content: "For each process step, indicate whether SAP's best practice fits your process (FIT), needs configuration (CONFIGURE), doesn't match (GAP), or doesn't apply (N/A).", placement: "right", targetSelector: "[data-tooltip='classification']" },
  { key: "gap_resolution_flow", title: "Gap Resolution", content: "When a step is marked as GAP, a resolution plan is created. Work with your consultant to define the resolution approach.", placement: "bottom", targetSelector: "[data-tooltip='gap-resolution']" },
  { key: "dashboard_widgets", title: "Dashboard Widgets", content: "Customize your dashboard by showing, hiding, or reordering widgets to focus on what matters to your role.", placement: "top", targetSelector: "[data-tooltip='dashboard-widgets']" },
  { key: "collaboration_comments", title: "Comments & Collaboration", content: "Add comments to any process step or scope item to collaborate with your team. Tag colleagues with @mentions.", placement: "left", targetSelector: "[data-tooltip='comments']" },
  { key: "workshop_mode", title: "Workshop Mode", content: "Workshop mode enables real-time collaborative classification with voting and live presence indicators.", placement: "bottom", targetSelector: "[data-tooltip='workshop']" },
  { key: "data_migration_intro", title: "Data Migration", content: "Track data migration objects, their complexity, and progress through the migration lifecycle.", placement: "right", targetSelector: "[data-tooltip='data-migration']" },
  { key: "ocm_assessment", title: "OCM Assessment", content: "Assess organizational change management impacts for each scope item to plan training and communication.", placement: "bottom", targetSelector: "[data-tooltip='ocm']" },
  { key: "report_generation", title: "Reports", content: "Generate comprehensive reports including executive summaries, gap analyses, and progress tracking.", placement: "left", targetSelector: "[data-tooltip='reports']" },
  { key: "deadline_management", title: "Deadlines", content: "Set and track milestones and deadlines. Get notified when deadlines are approaching or overdue.", placement: "top", targetSelector: "[data-tooltip='deadlines']" },
  { key: "conflict_resolution", title: "Conflict Resolution", content: "When stakeholders disagree on a classification, conflicts are created for resolution by senior roles.", placement: "right", targetSelector: "[data-tooltip='conflicts']" },
];

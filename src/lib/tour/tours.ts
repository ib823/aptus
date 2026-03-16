/** Tour definitions for all user roles and pages */

import type { UserRole } from "@/types/assessment";

export interface TourStep {
  /** CSS selector for the target element */
  element: string;
  /** Popover title */
  title: string;
  /** Popover description */
  description: string;
  /** Which side to show the popover */
  side?: "top" | "bottom" | "left" | "right";
}

export interface TourDefinition {
  id: string;
  title: string;
  description: string;
  /** Roles that should see this tour */
  roles: UserRole[] | "all";
  /** URL path prefix where this tour triggers (e.g., "/assessments") */
  pathMatch: string;
  /** Only show on exact path match (not prefix) */
  exactPath?: boolean;
  /** URL to navigate to when starting this tour from a different page. Use {assessmentId} as placeholder. */
  navigateTo?: string;
  steps: TourStep[];
}

export const TOURS: TourDefinition[] = [
  // ─── Portal Overview (all roles, first visit to assessments) ───
  {
    id: "portal-overview",
    title: "Welcome to ABeam",
    description: "A quick tour of the main interface",
    roles: "all",
    pathMatch: "/assessments",
    exactPath: true,
    navigateTo: "/assessments",
    steps: [
      {
        element: '[aria-label="Main navigation"]',
        title: "Navigation",
        description: "Use these tabs to switch between Dashboard, Assessments, Analytics, and Organization settings.",
        side: "bottom",
      },
      {
        element: '[aria-label="Search or run command"]',
        title: "Quick Search",
        description: "Press Cmd+K (or Ctrl+K) to instantly search scope items, assessments, or jump to any page.",
        side: "bottom",
      },
      {
        element: '[aria-label="User menu"]',
        title: "Your Account",
        description: "Access your profile, settings, and sign out from here.",
        side: "left",
      },
    ],
  },

  // ─── Assessment Profile (consultants + admins) ───
  {
    id: "assessment-profile",
    title: "Company Profile",
    description: "How to complete the company profile",
    roles: ["consultant", "solution_architect", "platform_admin", "partner_lead"],
    pathMatch: "/profile",
    navigateTo: "/assessment/{assessmentId}/profile",
    steps: [
      {
        element: '[data-tour="profile-progress"]',
        title: "Profile Completeness",
        description: "Fill in each section to reach 60%. This unlocks scope selection and the rest of the assessment workflow.",
        side: "bottom",
      },
      {
        element: '[data-tour="profile-sections"]',
        title: "Profile Sections",
        description: "Click each card to expand and fill in the details. Required fields are marked. Save happens automatically.",
        side: "top",
      },
    ],
  },

  // ─── Scope Selection ───
  {
    id: "scope-selection",
    title: "Scope Selection",
    description: "How to select SAP scope items",
    roles: ["consultant", "solution_architect", "platform_admin", "partner_lead"],
    pathMatch: "/scope",
    navigateTo: "/assessment/{assessmentId}/scope",
    steps: [
      {
        element: '[data-tour="scope-tree"]',
        title: "SAP Process Hierarchy",
        description: "Browse the SAP Best Practices catalog. Expand areas to see individual scope items. Check items to include them in your assessment.",
        side: "right",
      },
      {
        element: '[data-tour="scope-summary"]',
        title: "Selection Summary",
        description: "See your selected items here. The counter shows how many scope items are included across all areas.",
        side: "left",
      },
    ],
  },

  // ─── Step Review ───
  {
    id: "step-review",
    title: "Step Review",
    description: "How to review process steps",
    roles: ["consultant", "solution_architect", "process_owner", "it_lead", "platform_admin"],
    pathMatch: "/review",
    navigateTo: "/assessment/{assessmentId}/review",
    steps: [
      {
        element: '[data-tour="review-sidebar"]',
        title: "Scope Items",
        description: "Select a scope item from the left panel to review its process steps. Items are grouped by functional area.",
        side: "right",
      },
      {
        element: '[data-tour="review-steps"]',
        title: "Process Steps",
        description: "For each step, mark it as Fit (matches your business), Configure, or Gap. Add notes to explain your decisions.",
        side: "left",
      },
    ],
  },

  // ─── Gap Resolution ───
  {
    id: "gap-resolution",
    title: "Gap Resolution",
    description: "How to resolve identified gaps",
    roles: ["consultant", "solution_architect", "platform_admin"],
    pathMatch: "/gaps",
    navigateTo: "/assessment/{assessmentId}/gaps",
    steps: [
      {
        element: '[data-tour="gap-list"]',
        title: "Gap Items",
        description: "All gaps identified during the review are listed here. Each gap needs a resolution strategy before the assessment can proceed.",
        side: "right",
      },
      {
        element: '[data-tour="gap-resolution"]',
        title: "Resolution Options",
        description: "For each gap, choose: Extend (custom development), Configure (SAP config), Adapt (change business process), or Accept (live with it).",
        side: "left",
      },
    ],
  },

  // ─── Dashboard ───
  {
    id: "dashboard-overview",
    title: "Dashboard",
    description: "Understanding your dashboard",
    roles: ["consultant", "platform_admin", "partner_lead", "project_manager", "executive_sponsor"],
    pathMatch: "/dashboard",
    exactPath: true,
    navigateTo: "/dashboard",
    steps: [
      {
        element: '[data-tour="dashboard-kpis"]',
        title: "Key Metrics",
        description: "Top-level KPIs show your assessment progress: total steps reviewed, gap percentage, and scope coverage.",
        side: "bottom",
      },
      {
        element: '[data-tour="dashboard-assessments"]',
        title: "Active Assessments",
        description: "Quick access to your active assessments. Click any card to jump directly into the assessment.",
        side: "top",
      },
    ],
  },

  // ─── Admin Panel ───
  {
    id: "admin-panel",
    title: "Admin Panel",
    description: "Admin panel overview",
    roles: ["platform_admin"],
    pathMatch: "/admin",
    exactPath: true,
    navigateTo: "/admin",
    steps: [
      {
        element: '[aria-label="Admin navigation"]',
        title: "Admin Sidebar",
        description: "Navigate between Intelligence (industries, baselines), Data (SAP catalog, ingestion), and System (organizations, users, roles).",
        side: "right",
      },
      {
        element: '[data-tour="admin-stats"]',
        title: "Platform Statistics",
        description: "Overview of users, assessments, organizations, and catalog items across the entire platform.",
        side: "bottom",
      },
    ],
  },

  // ─── Admin User Management ───
  {
    id: "admin-users",
    title: "User Management",
    description: "How to manage users",
    roles: ["platform_admin"],
    pathMatch: "/admin/users",
    exactPath: true,
    navigateTo: "/admin/users",
    steps: [
      {
        element: '[data-tour="user-table"]',
        title: "User Table",
        description: "All registered users with their roles, MFA status, and activity. Use the role dropdown to change a user's role.",
        side: "bottom",
      },
      {
        element: '[data-tour="user-actions"]',
        title: "User Actions",
        description: "Reset MFA (shield icon), deactivate/reactivate (person icon), or delete (trash icon). Actions are disabled for your own account.",
        side: "left",
      },
    ],
  },

  // ─── Organization Settings ───
  {
    id: "organization-settings",
    title: "Organization",
    description: "Organization settings overview",
    roles: ["platform_admin", "partner_lead", "client_admin"],
    pathMatch: "/organization",
    exactPath: true,
    navigateTo: "/organization",
    steps: [
      {
        element: '[data-tour="org-info"]',
        title: "Organization Details",
        description: "View and edit your organization name, domain, and subscription details.",
        side: "bottom",
      },
      {
        element: '[data-tour="org-members"]',
        title: "Team Members",
        description: "Invite new team members, manage roles, and control access to assessments.",
        side: "top",
      },
    ],
  },

  // ─── Configuration Matrix (Results) ───
  {
    id: "config-matrix",
    title: "Configuration Matrix",
    description: "How to review SAP configuration activities",
    roles: ["consultant", "solution_architect", "platform_admin", "partner_lead"],
    pathMatch: "/config",
    navigateTo: "/assessment/{assessmentId}/config",
    steps: [
      {
        element: '[data-tour="config-summary"]',
        title: "Configuration Summary",
        description: "Overview of mandatory, recommended, and optional configuration activities across your selected scope items.",
        side: "bottom",
      },
      {
        element: '[data-tour="config-table"]',
        title: "Configuration Table",
        description: "Review each configuration activity. Toggle the Include checkbox to add or remove activities from your implementation plan.",
        side: "top",
      },
    ],
  },

  // ─── Process Flows ───
  {
    id: "process-flows",
    title: "Process Flows",
    description: "How to view process flow diagrams",
    roles: ["consultant", "solution_architect", "process_owner", "platform_admin"],
    pathMatch: "/flows",
    navigateTo: "/assessment/{assessmentId}/flows",
    steps: [
      {
        element: '[data-tour="flows-sidebar"]',
        title: "Scope Item List",
        description: "Select a scope item to view its process flow diagram. Items are grouped by functional area.",
        side: "right",
      },
      {
        element: '[data-tour="flows-viewer"]',
        title: "Flow Diagram",
        description: "Interactive process flow with color-coded status badges: green (Fit), blue (Configure), red (Gap), and gray (N/A).",
        side: "left",
      },
    ],
  },

  // ─── Process Map ───
  {
    id: "process-map",
    title: "Process Map",
    description: "How to navigate the process map",
    roles: ["consultant", "solution_architect", "process_owner", "platform_admin"],
    pathMatch: "/process-map",
    navigateTo: "/assessment/{assessmentId}/process-map",
    steps: [
      {
        element: '[data-tour="process-map-areas"]',
        title: "Functional Areas",
        description: "Click any functional area card to drill down into its process flows and see the fit analysis for each scope item.",
        side: "bottom",
      },
    ],
  },

  // ─── Integrations Register ───
  {
    id: "integrations-register",
    title: "System Connections",
    description: "How to document integration points",
    roles: ["consultant", "solution_architect", "it_lead", "platform_admin"],
    pathMatch: "/integrations",
    navigateTo: "/assessment/{assessmentId}/integrations",
    steps: [
      {
        element: '[data-tour="integrations-stats"]',
        title: "Integration Summary",
        description: "Overview of total integration points, broken down by direction: inbound, outbound, and bidirectional.",
        side: "bottom",
      },
      {
        element: '[data-tour="integrations-table"]',
        title: "Integration Points",
        description: "Document each system connection: name, direction, type, status, and priority. Click Add Integration to create new entries.",
        side: "top",
      },
    ],
  },

  // ─── Data Migration ───
  {
    id: "data-migration",
    title: "Data Transfer",
    description: "How to manage data migration objects",
    roles: ["consultant", "data_migration_lead", "it_lead", "platform_admin"],
    pathMatch: "/data-migration",
    navigateTo: "/assessment/{assessmentId}/data-migration",
    steps: [
      {
        element: '[data-tour="data-migration-stats"]',
        title: "Migration Summary",
        description: "Total data objects, record volumes, and cleansing requirements at a glance.",
        side: "bottom",
      },
      {
        element: '[data-tour="data-migration-table"]',
        title: "Migration Objects",
        description: "Catalog each data object: source system, volume, cleansing needs, mapping complexity, and dependencies.",
        side: "top",
      },
    ],
  },

  // ─── OCM (Change Management) ───
  {
    id: "ocm-register",
    title: "Change Impact",
    description: "How to assess organizational change impacts",
    roles: ["consultant", "project_manager", "platform_admin"],
    pathMatch: "/ocm",
    navigateTo: "/assessment/{assessmentId}/ocm",
    steps: [
      {
        element: '[data-tour="ocm-stats"]',
        title: "Impact Overview",
        description: "Total change impacts, overall readiness percentage, and number of areas requiring training.",
        side: "bottom",
      },
      {
        element: '[data-tour="ocm-table"]',
        title: "Impact Register",
        description: "Document change impacts per role and area. Track severity, training needs, and readiness status.",
        side: "top",
      },
    ],
  },

  // ─── Workshops ───
  {
    id: "workshops",
    title: "Workshops",
    description: "How to manage workshop sessions",
    roles: ["consultant", "project_manager", "platform_admin"],
    pathMatch: "/workshops",
    navigateTo: "/assessment/{assessmentId}/workshops",
    steps: [
      {
        element: '[data-tour="workshops-grid"]',
        title: "Workshop Sessions",
        description: "View all scheduled workshops with status, facilitator, attendees, and action items. Click a card to open the session details.",
        side: "bottom",
      },
    ],
  },

  // ─── Activity Feed ───
  {
    id: "activity-feed",
    title: "Activity Log",
    description: "How to track assessment changes",
    roles: ["consultant", "project_manager", "platform_admin", "partner_lead"],
    pathMatch: "/activity",
    navigateTo: "/assessment/{assessmentId}/activity",
    steps: [
      {
        element: '[data-tour="activity-filter"]',
        title: "Activity Filters",
        description: "Filter by action type: step classifications, gaps, comments, conflicts, or status changes.",
        side: "bottom",
      },
      {
        element: '[data-tour="activity-timeline"]',
        title: "Activity Timeline",
        description: "Chronological log of all assessment changes. Each entry shows who did what, when, and on which item.",
        side: "top",
      },
    ],
  },

  // ─── Settings & Security ───
  {
    id: "settings-security",
    title: "Security Settings",
    description: "How to manage your security settings",
    roles: "all",
    pathMatch: "/settings/security",
    exactPath: true,
    navigateTo: "/settings/security",
    steps: [
      {
        element: '[data-tour="passkey-section"]',
        title: "Passkeys",
        description: "Register passkeys for fast, secure sign-in. Use your fingerprint, face, or device PIN instead of email codes.",
        side: "bottom",
      },
      {
        element: '[data-tour="mfa-section"]',
        title: "Two-Factor Authentication",
        description: "Set up an authenticator app as an alternative MFA method. Either passkey or TOTP satisfies the security requirement.",
        side: "top",
      },
    ],
  },
];

/** Get tours available for a given role and path */
export function getAvailableTours(role: UserRole, path: string): TourDefinition[] {
  return TOURS.filter((tour) => {
    const roleMatch = tour.roles === "all" || tour.roles.includes(role);
    const pathMatch = tour.exactPath
      ? path === tour.pathMatch || path.endsWith(tour.pathMatch)
      : path.includes(tour.pathMatch);
    return roleMatch && pathMatch;
  });
}

/** Get all tours a role can access (for the help menu) */
export function getAllToursForRole(role: UserRole): TourDefinition[] {
  return TOURS.filter((tour) => tour.roles === "all" || tour.roles.includes(role));
}

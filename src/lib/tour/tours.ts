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

  // ─── Settings & Security ───
  {
    id: "settings-security",
    title: "Security Settings",
    description: "How to manage your security settings",
    roles: "all",
    pathMatch: "/settings/security",
    exactPath: true,
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

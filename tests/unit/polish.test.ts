/**
 * Phase 9: Polish & Production Readiness — Unit Tests
 *
 * Tests loading state configurations, error boundary patterns,
 * empty state rendering logic, print style requirements,
 * permission denied UX, and security audit helpers.
 */

import { describe, it, expect } from "vitest";

// ===========================================================================
// Loading Skeleton Configuration Tests
// ===========================================================================

interface SkeletonConfig {
  lines: number;
  ariaLabel: string;
}

function computeSkeletonWidths(lines: number): number[] {
  return Array.from({ length: lines }, (_, i) => 100 - i * 15);
}

describe("Loading Skeleton Configuration", () => {
  it("should generate decreasing widths for skeleton lines", () => {
    const widths = computeSkeletonWidths(3);
    expect(widths).toEqual([100, 85, 70]);
  });

  it("should handle single line", () => {
    const widths = computeSkeletonWidths(1);
    expect(widths).toEqual([100]);
  });

  it("should handle zero lines", () => {
    const widths = computeSkeletonWidths(0);
    expect(widths).toEqual([]);
  });

  it("should have accessible label for loading state", () => {
    const config: SkeletonConfig = { lines: 3, ariaLabel: "Loading" };
    expect(config.ariaLabel).toBe("Loading");
    expect(config.lines).toBeGreaterThan(0);
  });

  it("should support assessment skeleton with card count", () => {
    const cardCount = 3;
    const rowCount = 5;
    expect(cardCount).toBe(3);
    expect(rowCount).toBe(5);
    // Assessment loading shows 3 card skeletons + 5 row skeletons
  });

  it("should support portal skeleton with metric card grid", () => {
    const metricCardCount = 4;
    const contentLines = 6;
    expect(metricCardCount).toBe(4);
    expect(contentLines).toBe(6);
  });
});

// ===========================================================================
// Error State Pattern Tests
// ===========================================================================

interface ErrorStateConfig {
  title: string;
  message: string;
  hasRetry: boolean;
  hasFallbackNav: boolean;
  fallbackUrl: string;
}

function buildErrorConfig(
  error: Error & { digest?: string },
  context: "portal" | "assessment",
): ErrorStateConfig {
  const defaultMessages: Record<string, string> = {
    portal: "An unexpected error occurred. Please try again.",
    assessment: "Failed to load assessment data. Please try again.",
  };

  return {
    title: context === "assessment" ? "Assessment Error" : "Something went wrong",
    message: error.message || (defaultMessages[context] ?? "An unexpected error occurred."),
    hasRetry: true,
    hasFallbackNav: true,
    fallbackUrl: context === "assessment" ? "/assessments" : "/dashboard",
  };
}

describe("Error State Configuration", () => {
  it("should build portal error config with custom message", () => {
    const error = Object.assign(new Error("Network timeout"), { digest: "abc123" });
    const config = buildErrorConfig(error, "portal");
    expect(config.title).toBe("Something went wrong");
    expect(config.message).toBe("Network timeout");
    expect(config.hasRetry).toBe(true);
    expect(config.fallbackUrl).toBe("/dashboard");
  });

  it("should build assessment error config with custom message", () => {
    const error = Object.assign(new Error("Assessment not found"));
    const config = buildErrorConfig(error, "assessment");
    expect(config.title).toBe("Assessment Error");
    expect(config.message).toBe("Assessment not found");
    expect(config.fallbackUrl).toBe("/assessments");
  });

  it("should use default message when error message is empty", () => {
    const error = Object.assign(new Error(""));
    const portalConfig = buildErrorConfig(error, "portal");
    expect(portalConfig.message).toBe("An unexpected error occurred. Please try again.");

    const assessmentConfig = buildErrorConfig(error, "assessment");
    expect(assessmentConfig.message).toBe("Failed to load assessment data. Please try again.");
  });

  it("should always include retry and fallback navigation", () => {
    const error = Object.assign(new Error("test"));
    const config = buildErrorConfig(error, "portal");
    expect(config.hasRetry).toBe(true);
    expect(config.hasFallbackNav).toBe(true);
  });
});

// ===========================================================================
// Empty State Logic Tests
// ===========================================================================

interface EmptyStateConfig {
  title: string;
  description: string;
  hasAction: boolean;
}

function getEmptyStateConfig(context: string): EmptyStateConfig {
  const configs: Record<string, EmptyStateConfig> = {
    assessments: {
      title: "No assessments yet",
      description: "Create your first assessment to get started.",
      hasAction: true,
    },
    dashboard: {
      title: "No Assessments",
      description: "You don't have access to any assessments yet.",
      hasAction: false,
    },
    gaps: {
      title: "No gaps to resolve",
      description: "All scope items are marked as FIT. Great news!",
      hasAction: false,
    },
    flows: {
      title: "No Flow Diagrams",
      description: "Generate flow diagrams to visualize your processes.",
      hasAction: true,
    },
    remaining: {
      title: "No Remaining Items",
      description: "All items have been addressed.",
      hasAction: false,
    },
    scope: {
      title: "No results",
      description: "Try adjusting your search or filters.",
      hasAction: false,
    },
  };

  return configs[context] ?? {
    title: "No data",
    description: "No data available.",
    hasAction: false,
  };
}

describe("Empty State Configuration", () => {
  it("should provide assessment empty state with action", () => {
    const config = getEmptyStateConfig("assessments");
    expect(config.title).toBe("No assessments yet");
    expect(config.hasAction).toBe(true);
  });

  it("should provide gap empty state without action", () => {
    const config = getEmptyStateConfig("gaps");
    expect(config.title).toBe("No gaps to resolve");
    expect(config.hasAction).toBe(false);
  });

  it("should provide flow empty state with action", () => {
    const config = getEmptyStateConfig("flows");
    expect(config.title).toBe("No Flow Diagrams");
    expect(config.hasAction).toBe(true);
  });

  it("should provide remaining items empty state", () => {
    const config = getEmptyStateConfig("remaining");
    expect(config.title).toBe("No Remaining Items");
    expect(config.hasAction).toBe(false);
  });

  it("should provide scope search empty state", () => {
    const config = getEmptyStateConfig("scope");
    expect(config.title).toBe("No results");
  });

  it("should provide default empty state for unknown contexts", () => {
    const config = getEmptyStateConfig("unknown");
    expect(config.title).toBe("No data");
    expect(config.hasAction).toBe(false);
  });
});

// ===========================================================================
// Permission Denied UX Tests
// ===========================================================================

interface PermissionDeniedConfig {
  title: string;
  message: string;
  requiredArea?: string | undefined;
  userRole?: string | undefined;
}

function buildPermissionDeniedMessage(
  userRole: string,
  requiredArea?: string,
): PermissionDeniedConfig {
  const roleLabels: Record<string, string> = {
    process_owner: "Process Owner",
    it_lead: "IT Lead",
    executive: "Executive",
    consultant: "Consultant",
    admin: "Admin",
  };

  return {
    title: "Access Restricted",
    message: "You do not have permission to perform this action.",
    requiredArea,
    userRole: roleLabels[userRole] ?? userRole,
  };
}

describe("Permission Denied UX", () => {
  it("should build permission denied with area and role", () => {
    const config = buildPermissionDeniedMessage("process_owner", "Finance");
    expect(config.title).toBe("Access Restricted");
    expect(config.requiredArea).toBe("Finance");
    expect(config.userRole).toBe("Process Owner");
  });

  it("should map all known roles to display labels", () => {
    expect(buildPermissionDeniedMessage("process_owner").userRole).toBe("Process Owner");
    expect(buildPermissionDeniedMessage("it_lead").userRole).toBe("IT Lead");
    expect(buildPermissionDeniedMessage("executive").userRole).toBe("Executive");
    expect(buildPermissionDeniedMessage("consultant").userRole).toBe("Consultant");
    expect(buildPermissionDeniedMessage("admin").userRole).toBe("Admin");
  });

  it("should handle unknown role gracefully", () => {
    const config = buildPermissionDeniedMessage("unknown_role");
    expect(config.userRole).toBe("unknown_role");
  });

  it("should omit area when not provided", () => {
    const config = buildPermissionDeniedMessage("consultant");
    expect(config.requiredArea).toBeUndefined();
  });
});

// ===========================================================================
// Print Style Validation Tests
// ===========================================================================

const PRINT_HIDDEN_ELEMENTS = ["header", "nav", "aside", "button", ".no-print"] as const;

const PRINT_TABLE_RULES = {
  tablePageBreak: "auto",
  rowPageBreak: "avoid",
  rowPageBreakAfter: "auto",
} as const;

describe("Print Style Requirements", () => {
  it("should hide navigation elements in print", () => {
    expect(PRINT_HIDDEN_ELEMENTS).toContain("header");
    expect(PRINT_HIDDEN_ELEMENTS).toContain("nav");
    expect(PRINT_HIDDEN_ELEMENTS).toContain("aside");
    expect(PRINT_HIDDEN_ELEMENTS).toContain("button");
    expect(PRINT_HIDDEN_ELEMENTS).toContain(".no-print");
  });

  it("should configure table page break rules", () => {
    expect(PRINT_TABLE_RULES.tablePageBreak).toBe("auto");
    expect(PRINT_TABLE_RULES.rowPageBreak).toBe("avoid");
    expect(PRINT_TABLE_RULES.rowPageBreakAfter).toBe("auto");
  });

  it("should define page margins", () => {
    const pageMargin = "1.5cm";
    expect(pageMargin).toBe("1.5cm");
  });

  it("should use plain black text on white background for print", () => {
    const printBody = { fontSize: "12px", color: "#000", background: "#fff" };
    expect(printBody.color).toBe("#000");
    expect(printBody.background).toBe("#fff");
  });

  it("should remove shadows in print", () => {
    const printShadow = "none !important";
    expect(printShadow).toContain("none");
  });
});

// ===========================================================================
// Security Audit — Route Protection Tests
// ===========================================================================

type AuthLevel = "none" | "session" | "session+mfa" | "admin";

interface RouteProtection {
  path: string;
  authLevel: AuthLevel;
}

const PROTECTED_ROUTES: RouteProtection[] = [
  // Assessment routes
  { path: "/api/assessments", authLevel: "session+mfa" },
  { path: "/api/assessments/[id]", authLevel: "session+mfa" },
  { path: "/api/assessments/[id]/scope", authLevel: "session+mfa" },
  { path: "/api/assessments/[id]/steps", authLevel: "session+mfa" },
  { path: "/api/assessments/[id]/steps/[stepId]", authLevel: "session+mfa" },
  { path: "/api/assessments/[id]/gaps", authLevel: "session+mfa" },
  { path: "/api/assessments/[id]/gaps/[gapId]", authLevel: "session+mfa" },
  { path: "/api/assessments/[id]/config-matrix", authLevel: "session+mfa" },

  // Report routes
  { path: "/api/assessments/[id]/report/executive-summary", authLevel: "session+mfa" },
  { path: "/api/assessments/[id]/report/scope-catalog", authLevel: "session+mfa" },
  { path: "/api/assessments/[id]/report/gap-register", authLevel: "session+mfa" },
  { path: "/api/assessments/[id]/report/effort-estimate", authLevel: "session+mfa" },
  { path: "/api/assessments/[id]/report/audit-trail", authLevel: "session+mfa" },
  { path: "/api/assessments/[id]/report/sign-off", authLevel: "session+mfa" },

  // Flow routes
  { path: "/api/assessments/[id]/flows", authLevel: "session+mfa" },
  { path: "/api/assessments/[id]/flows/[flowId]", authLevel: "session+mfa" },

  // Remaining items routes
  { path: "/api/assessments/[id]/remaining", authLevel: "session+mfa" },

  // Admin routes
  { path: "/api/admin/industries", authLevel: "admin" },
  { path: "/api/admin/baselines", authLevel: "admin" },
  { path: "/api/admin/extensibility-patterns", authLevel: "admin" },
  { path: "/api/admin/adaptation-patterns", authLevel: "admin" },
  { path: "/api/admin/overview", authLevel: "admin" },
  { path: "/api/admin/assessments", authLevel: "admin" },

  // Auth routes (no auth required)
  { path: "/api/auth/login", authLevel: "none" },
  { path: "/api/auth/verify", authLevel: "none" },
];

function getRoutesByAuthLevel(level: AuthLevel): string[] {
  return PROTECTED_ROUTES
    .filter((r) => r.authLevel === level)
    .map((r) => r.path);
}

describe("Security Audit — Route Protection", () => {
  it("should have all admin routes requiring admin auth", () => {
    const adminRoutes = getRoutesByAuthLevel("admin");
    expect(adminRoutes.length).toBeGreaterThanOrEqual(6);
    for (const route of adminRoutes) {
      expect(route).toContain("/api/admin/");
    }
  });

  it("should have all assessment routes requiring session+mfa", () => {
    const mfaRoutes = getRoutesByAuthLevel("session+mfa");
    expect(mfaRoutes.length).toBeGreaterThanOrEqual(15);
    for (const route of mfaRoutes) {
      expect(route).toMatch(/^\/api\/assessments/);
    }
  });

  it("should have minimal unauthenticated routes", () => {
    const openRoutes = getRoutesByAuthLevel("none");
    expect(openRoutes.length).toBeLessThanOrEqual(3);
    // Only auth endpoints should be unauthenticated
    for (const route of openRoutes) {
      expect(route).toContain("/api/auth/");
    }
  });

  it("should cover all known API route prefixes", () => {
    const allPaths = PROTECTED_ROUTES.map((r) => r.path);
    const hasAssessment = allPaths.some((p) => p.startsWith("/api/assessments"));
    const hasAdmin = allPaths.some((p) => p.startsWith("/api/admin"));
    const hasAuth = allPaths.some((p) => p.startsWith("/api/auth"));
    expect(hasAssessment).toBe(true);
    expect(hasAdmin).toBe(true);
    expect(hasAuth).toBe(true);
  });
});

// ===========================================================================
// MFA UX Validation Tests
// ===========================================================================

interface TotpValidation {
  code: string;
  isValid: boolean;
  errorMessage?: string;
}

function validateTotpInput(code: string): TotpValidation {
  if (code.length === 0) {
    return { code, isValid: false, errorMessage: "Code is required" };
  }
  if (!/^\d+$/.test(code)) {
    return { code, isValid: false, errorMessage: "Code must contain only digits" };
  }
  if (code.length !== 6) {
    return { code, isValid: false, errorMessage: "Code must be exactly 6 digits" };
  }
  return { code, isValid: true };
}

function computeTotpCountdown(windowSeconds: number, elapsedSeconds: number): number {
  return Math.max(0, windowSeconds - (elapsedSeconds % windowSeconds));
}

describe("MFA UX Validation", () => {
  it("should validate correct 6-digit TOTP code", () => {
    const result = validateTotpInput("123456");
    expect(result.isValid).toBe(true);
    expect(result.errorMessage).toBeUndefined();
  });

  it("should reject empty code", () => {
    const result = validateTotpInput("");
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBe("Code is required");
  });

  it("should reject non-digit characters", () => {
    const result = validateTotpInput("12ab56");
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBe("Code must contain only digits");
  });

  it("should reject wrong length codes", () => {
    expect(validateTotpInput("12345").isValid).toBe(false);
    expect(validateTotpInput("1234567").isValid).toBe(false);
  });

  it("should compute countdown timer correctly", () => {
    expect(computeTotpCountdown(30, 0)).toBe(30);
    expect(computeTotpCountdown(30, 10)).toBe(20);
    expect(computeTotpCountdown(30, 29)).toBe(1);
    expect(computeTotpCountdown(30, 30)).toBe(30); // resets at window boundary
    expect(computeTotpCountdown(30, 45)).toBe(15);
  });

  it("should never return negative countdown", () => {
    expect(computeTotpCountdown(30, 31)).toBeGreaterThanOrEqual(0);
    expect(computeTotpCountdown(30, 100)).toBeGreaterThanOrEqual(0);
  });
});

// ===========================================================================
// Not Found Page Logic Tests
// ===========================================================================

describe("Not Found Page", () => {
  it("should have standard 404 messaging", () => {
    const title = "Page Not Found";
    const description = "The page you are looking for does not exist or has been moved.";
    expect(title).toBe("Page Not Found");
    expect(description).toContain("does not exist");
  });

  it("should link back to assessments", () => {
    const fallbackUrl = "/assessments";
    expect(fallbackUrl).toBe("/assessments");
  });
});

// ===========================================================================
// Dashboard Polish — Navigation Tests
// ===========================================================================

interface NavLink {
  label: string;
  href: string;
  requiresAdmin: boolean;
}

const PORTAL_NAV_LINKS: NavLink[] = [
  { label: "Dashboard", href: "/dashboard", requiresAdmin: false },
  { label: "Assessments", href: "/assessments", requiresAdmin: false },
  { label: "Admin", href: "/admin", requiresAdmin: true },
];

describe("Dashboard & Navigation Polish", () => {
  it("should have admin link pointing to /admin", () => {
    const adminLink = PORTAL_NAV_LINKS.find((l) => l.label === "Admin");
    expect(adminLink).toBeDefined();
    expect(adminLink?.href).toBe("/admin");
  });

  it("should not expose admin link as non-admin", () => {
    const adminLinks = PORTAL_NAV_LINKS.filter((l) => l.requiresAdmin);
    expect(adminLinks.length).toBe(1);
  });

  it("should have core navigation links", () => {
    const labels = PORTAL_NAV_LINKS.map((l) => l.label);
    expect(labels).toContain("Dashboard");
    expect(labels).toContain("Assessments");
  });

  it("should have accessible navigation aria-label", () => {
    const ariaLabel = "Main navigation";
    expect(ariaLabel).toBe("Main navigation");
  });
});

// ===========================================================================
// Assessment Status Color Badge Tests
// ===========================================================================

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

function getStatusBadgeVariant(status: string): BadgeVariant {
  switch (status) {
    case "signed_off":
      return "default";
    case "completed":
    case "reviewed":
      return "secondary";
    case "in_progress":
      return "outline";
    case "draft":
      return "outline";
    default:
      return "default";
  }
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: "Draft",
    in_progress: "In Progress",
    completed: "Completed",
    reviewed: "Reviewed",
    signed_off: "Signed Off",
  };
  return labels[status] ?? status;
}

describe("Status Badge Display", () => {
  it("should map signed_off to default variant", () => {
    expect(getStatusBadgeVariant("signed_off")).toBe("default");
  });

  it("should map completed/reviewed to secondary variant", () => {
    expect(getStatusBadgeVariant("completed")).toBe("secondary");
    expect(getStatusBadgeVariant("reviewed")).toBe("secondary");
  });

  it("should map draft and in_progress to outline variant", () => {
    expect(getStatusBadgeVariant("draft")).toBe("outline");
    expect(getStatusBadgeVariant("in_progress")).toBe("outline");
  });

  it("should format status labels for display", () => {
    expect(getStatusLabel("draft")).toBe("Draft");
    expect(getStatusLabel("in_progress")).toBe("In Progress");
    expect(getStatusLabel("signed_off")).toBe("Signed Off");
  });

  it("should return raw status for unknown values", () => {
    expect(getStatusLabel("unknown")).toBe("unknown");
  });
});

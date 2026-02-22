/**
 * STATUS: Self-contained specification test
 * REAL MODULE: src/lib/auth/role-permissions.ts
 * PRE-EXISTING COVERAGE: tests/unit/role-permissions.test.ts
 * WIRING BLOCKED BY: Incompatible granularity — real code has 14 boolean capabilities
 *   vs V2 spec's 25 fine-grained operations, and different role names
 *   (executive vs executive_sponsor, functional_head vs no equivalent)
 */
import { describe, it, expect, test } from "vitest";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Role =
  | "platform_admin"
  | "partner_lead"
  | "consultant"
  | "project_manager"
  | "executive"
  | "functional_head"
  | "process_owner"
  | "it_lead"
  | "data_migration_lead"
  | "change_manager"
  | "viewer";

type Operation =
  | "create_assessment"
  | "delete_assessment"
  | "edit_company_profile"
  | "classify_step_own_area"
  | "classify_step_other_area"
  | "override_classification"
  | "create_gap"
  | "add_integration_point"
  | "add_dm_object"
  | "add_ocm_impact"
  | "validate_area_sign_off"
  | "executive_sign_off"
  | "partner_countersign"
  | "export_to_alm"
  | "view_dashboard"
  | "view_reports"
  | "download_data_export"
  | "manage_team"
  | "configure_sso"
  | "manage_subscription"
  | "create_change_request"
  | "approve_change_request"
  | "clone_assessment"
  | "add_comment"
  | "acquire_editing_lock";

// ---------------------------------------------------------------------------
// Session / Request helpers
// ---------------------------------------------------------------------------

interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  organizationId: string;
  sessionExpiresAt: number; // epoch ms
  subscriptionStatus: "active" | "trial" | "expired_trial" | "cancelled";
}

interface PermissionContext {
  user: SessionUser | null; // null = unauthenticated
  targetOrganizationId: string;
}

interface PermissionResult {
  allowed: boolean;
  statusCode: 200 | 401 | 403;
  code?: string;
}

// ---------------------------------------------------------------------------
// 11-Role x 25-Operation Permission Matrix (V2 Master Brief)
// ---------------------------------------------------------------------------
// Legend based on the V2 Master Brief permission table:
//   platform_admin  – full R/W on everything
//   partner_lead    – R on own-org assessments, manage own team, no classification
//   consultant      – R/W on assessments (classification, gaps, all registers)
//   project_manager – R on assessments, initiate sign-off, manage team, NO classification
//   executive       – R on summary, approve high-cost gaps, sign-off, NO step review
//   functional_head – R/W on own area (steps, gaps), scope decisions for their area
//   process_owner   – R/W on own area (classification, current state), NO budget decisions
//   it_lead         – R/W on integration assessment, technical validation
//   data_migration_lead – R/W on DM register, DM validation
//   change_manager  – R/W on OCM register, NO process decisions
//   viewer          – Read-only on scoped areas, NO comments, NO edits
// ---------------------------------------------------------------------------

const PERMISSION_MATRIX: Record<string, Record<string, boolean>> = {
  platform_admin: {
    create_assessment: true,
    delete_assessment: true,
    edit_company_profile: true,
    classify_step_own_area: true,
    classify_step_other_area: true,
    override_classification: true,
    create_gap: true,
    add_integration_point: true,
    add_dm_object: true,
    add_ocm_impact: true,
    validate_area_sign_off: true,
    executive_sign_off: true,
    partner_countersign: true,
    export_to_alm: true,
    view_dashboard: true,
    view_reports: true,
    download_data_export: true,
    manage_team: true,
    configure_sso: true,
    manage_subscription: true,
    create_change_request: true,
    approve_change_request: true,
    clone_assessment: true,
    add_comment: true,
    acquire_editing_lock: true,
  },
  partner_lead: {
    create_assessment: true,
    delete_assessment: false,
    edit_company_profile: true,
    classify_step_own_area: false,
    classify_step_other_area: false,
    override_classification: false,
    create_gap: false,
    add_integration_point: false,
    add_dm_object: false,
    add_ocm_impact: false,
    validate_area_sign_off: true,
    executive_sign_off: false,
    partner_countersign: true,
    export_to_alm: true,
    view_dashboard: true,
    view_reports: true,
    download_data_export: true,
    manage_team: true,
    configure_sso: false,
    manage_subscription: true,
    create_change_request: true,
    approve_change_request: true,
    clone_assessment: true,
    add_comment: true,
    acquire_editing_lock: false,
  },
  consultant: {
    create_assessment: true,
    delete_assessment: false,
    edit_company_profile: true,
    classify_step_own_area: true,
    classify_step_other_area: true,
    override_classification: true,
    create_gap: true,
    add_integration_point: true,
    add_dm_object: true,
    add_ocm_impact: true,
    validate_area_sign_off: true,
    executive_sign_off: false,
    partner_countersign: false,
    export_to_alm: true,
    view_dashboard: true,
    view_reports: true,
    download_data_export: true,
    manage_team: false,
    configure_sso: false,
    manage_subscription: false,
    create_change_request: true,
    approve_change_request: false,
    clone_assessment: true,
    add_comment: true,
    acquire_editing_lock: true,
  },
  project_manager: {
    create_assessment: false,
    delete_assessment: false,
    edit_company_profile: true,
    classify_step_own_area: false,
    classify_step_other_area: false,
    override_classification: false,
    create_gap: false,
    add_integration_point: false,
    add_dm_object: false,
    add_ocm_impact: false,
    validate_area_sign_off: true,
    executive_sign_off: false,
    partner_countersign: false,
    export_to_alm: true,
    view_dashboard: true,
    view_reports: true,
    download_data_export: true,
    manage_team: true,
    configure_sso: false,
    manage_subscription: false,
    create_change_request: true,
    approve_change_request: false,
    clone_assessment: false,
    add_comment: true,
    acquire_editing_lock: false,
  },
  executive: {
    create_assessment: false,
    delete_assessment: false,
    edit_company_profile: false,
    classify_step_own_area: false,
    classify_step_other_area: false,
    override_classification: false,
    create_gap: false,
    add_integration_point: false,
    add_dm_object: false,
    add_ocm_impact: false,
    validate_area_sign_off: false,
    executive_sign_off: true,
    partner_countersign: false,
    export_to_alm: false,
    view_dashboard: true,
    view_reports: true,
    download_data_export: true,
    manage_team: false,
    configure_sso: false,
    manage_subscription: false,
    create_change_request: false,
    approve_change_request: true,
    clone_assessment: false,
    add_comment: true,
    acquire_editing_lock: false,
  },
  functional_head: {
    create_assessment: false,
    delete_assessment: false,
    edit_company_profile: false,
    classify_step_own_area: true,
    classify_step_other_area: false,
    override_classification: false,
    create_gap: true,
    add_integration_point: false,
    add_dm_object: false,
    add_ocm_impact: false,
    validate_area_sign_off: true,
    executive_sign_off: false,
    partner_countersign: false,
    export_to_alm: false,
    view_dashboard: true,
    view_reports: true,
    download_data_export: false,
    manage_team: false,
    configure_sso: false,
    manage_subscription: false,
    create_change_request: true,
    approve_change_request: false,
    clone_assessment: false,
    add_comment: true,
    acquire_editing_lock: true,
  },
  process_owner: {
    create_assessment: false,
    delete_assessment: false,
    edit_company_profile: false,
    classify_step_own_area: true,
    classify_step_other_area: false,
    override_classification: false,
    create_gap: true,
    add_integration_point: false,
    add_dm_object: false,
    add_ocm_impact: false,
    validate_area_sign_off: false,
    executive_sign_off: false,
    partner_countersign: false,
    export_to_alm: false,
    view_dashboard: true,
    view_reports: true,
    download_data_export: false,
    manage_team: false,
    configure_sso: false,
    manage_subscription: false,
    create_change_request: true,
    approve_change_request: false,
    clone_assessment: false,
    add_comment: true,
    acquire_editing_lock: true,
  },
  it_lead: {
    create_assessment: false,
    delete_assessment: false,
    edit_company_profile: false,
    classify_step_own_area: false,
    classify_step_other_area: false,
    override_classification: false,
    create_gap: false,
    add_integration_point: true,
    add_dm_object: false,
    add_ocm_impact: false,
    validate_area_sign_off: true,
    executive_sign_off: false,
    partner_countersign: false,
    export_to_alm: false,
    view_dashboard: true,
    view_reports: true,
    download_data_export: false,
    manage_team: false,
    configure_sso: false,
    manage_subscription: false,
    create_change_request: true,
    approve_change_request: false,
    clone_assessment: false,
    add_comment: true,
    acquire_editing_lock: true,
  },
  data_migration_lead: {
    create_assessment: false,
    delete_assessment: false,
    edit_company_profile: false,
    classify_step_own_area: false,
    classify_step_other_area: false,
    override_classification: false,
    create_gap: false,
    add_integration_point: false,
    add_dm_object: true,
    add_ocm_impact: false,
    validate_area_sign_off: true,
    executive_sign_off: false,
    partner_countersign: false,
    export_to_alm: false,
    view_dashboard: true,
    view_reports: true,
    download_data_export: false,
    manage_team: false,
    configure_sso: false,
    manage_subscription: false,
    create_change_request: true,
    approve_change_request: false,
    clone_assessment: false,
    add_comment: true,
    acquire_editing_lock: true,
  },
  change_manager: {
    create_assessment: false,
    delete_assessment: false,
    edit_company_profile: false,
    classify_step_own_area: false,
    classify_step_other_area: false,
    override_classification: false,
    create_gap: false,
    add_integration_point: false,
    add_dm_object: false,
    add_ocm_impact: true,
    validate_area_sign_off: false,
    executive_sign_off: false,
    partner_countersign: false,
    export_to_alm: false,
    view_dashboard: true,
    view_reports: true,
    download_data_export: false,
    manage_team: false,
    configure_sso: false,
    manage_subscription: false,
    create_change_request: true,
    approve_change_request: false,
    clone_assessment: false,
    add_comment: true,
    acquire_editing_lock: true,
  },
  viewer: {
    create_assessment: false,
    delete_assessment: false,
    edit_company_profile: false,
    classify_step_own_area: false,
    classify_step_other_area: false,
    override_classification: false,
    create_gap: false,
    add_integration_point: false,
    add_dm_object: false,
    add_ocm_impact: false,
    validate_area_sign_off: false,
    executive_sign_off: false,
    partner_countersign: false,
    export_to_alm: false,
    view_dashboard: true,
    view_reports: true,
    download_data_export: false,
    manage_team: false,
    configure_sso: false,
    manage_subscription: false,
    create_change_request: false,
    approve_change_request: false,
    clone_assessment: false,
    add_comment: false,
    acquire_editing_lock: false,
  },
};

// ---------------------------------------------------------------------------
// Pure permission-check function (self-contained, no external deps)
// ---------------------------------------------------------------------------

function checkPermission(role: string, operation: string): boolean {
  const rolePerms = PERMISSION_MATRIX[role];
  if (!rolePerms) return false;
  return rolePerms[operation] === true;
}

/**
 * Full permission check including authentication, tenant isolation,
 * and subscription status.
 */
function checkPermissionWithContext(ctx: PermissionContext, operation: string): PermissionResult {
  // Unauthenticated
  if (!ctx.user) {
    return { allowed: false, statusCode: 401, code: "UNAUTHORIZED" };
  }

  // Session expired
  if (ctx.user.sessionExpiresAt < Date.now()) {
    return { allowed: false, statusCode: 401, code: "SESSION_EXPIRED" };
  }

  // Cross-tenant isolation: user cannot operate on a different org
  if (ctx.user.organizationId !== ctx.targetOrganizationId) {
    return { allowed: false, statusCode: 403, code: "CROSS_TENANT_DENIED" };
  }

  // Subscription-based access control
  if (ctx.user.subscriptionStatus === "expired_trial" || ctx.user.subscriptionStatus === "cancelled") {
    // Expired/cancelled subscriptions: only read-only operations allowed
    const readOnlyOps = ["view_dashboard", "view_reports", "download_data_export"];
    if (!readOnlyOps.includes(operation)) {
      return { allowed: false, statusCode: 403, code: "SUBSCRIPTION_EXPIRED" };
    }
  }

  // Role-based check
  const allowed = checkPermission(ctx.user.role, operation);
  if (!allowed) {
    return { allowed: false, statusCode: 403, code: "FORBIDDEN" };
  }

  return { allowed: true, statusCode: 200 };
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: "user-001",
    email: "testuser@example.com",
    name: "Test User",
    role: "consultant" as Role,
    organizationId: "org-AAA",
    sessionExpiresAt: Date.now() + 3_600_000, // 1 hour from now
    subscriptionStatus: "active",
    ...overrides,
  };
}

function makeContext(
  user: SessionUser | null,
  targetOrganizationId = "org-AAA",
): PermissionContext {
  return { user, targetOrganizationId };
}

// ---------------------------------------------------------------------------
// Derived lists
// ---------------------------------------------------------------------------

const ALL_ROLES = Object.keys(PERMISSION_MATRIX) as Role[];
const ALL_OPERATIONS = Object.keys(PERMISSION_MATRIX[ALL_ROLES[0]!]!) as Operation[];

// ---------------------------------------------------------------------------
// Sanity checks on the matrix itself
// ---------------------------------------------------------------------------

describe("Permission Matrix — Structural Integrity", () => {
  it("should contain exactly 11 roles", () => {
    expect(ALL_ROLES).toHaveLength(11);
  });

  it("should contain the expected roles", () => {
    const expected: Role[] = [
      "platform_admin",
      "partner_lead",
      "consultant",
      "project_manager",
      "executive",
      "functional_head",
      "process_owner",
      "it_lead",
      "data_migration_lead",
      "change_manager",
      "viewer",
    ];
    for (const role of expected) {
      expect(ALL_ROLES).toContain(role);
    }
  });

  it("should contain exactly 25 operations per role", () => {
    for (const role of ALL_ROLES) {
      const ops = Object.keys(PERMISSION_MATRIX[role]!);
      expect(ops).toHaveLength(25);
    }
  });

  it("should contain the expected 25 operations", () => {
    const expected: Operation[] = [
      "create_assessment",
      "delete_assessment",
      "edit_company_profile",
      "classify_step_own_area",
      "classify_step_other_area",
      "override_classification",
      "create_gap",
      "add_integration_point",
      "add_dm_object",
      "add_ocm_impact",
      "validate_area_sign_off",
      "executive_sign_off",
      "partner_countersign",
      "export_to_alm",
      "view_dashboard",
      "view_reports",
      "download_data_export",
      "manage_team",
      "configure_sso",
      "manage_subscription",
      "create_change_request",
      "approve_change_request",
      "clone_assessment",
      "add_comment",
      "acquire_editing_lock",
    ];
    for (const op of expected) {
      expect(ALL_OPERATIONS).toContain(op);
    }
  });

  it("all matrix values should be booleans", () => {
    for (const role of ALL_ROLES) {
      for (const op of ALL_OPERATIONS) {
        expect(typeof PERMISSION_MATRIX[role]![op]).toBe("boolean");
      }
    }
  });

  it("every role should have the same set of operations (no missing keys)", () => {
    const referenceOps = ALL_OPERATIONS.slice().sort();
    for (const role of ALL_ROLES) {
      const roleOps = Object.keys(PERMISSION_MATRIX[role]!).sort();
      expect(roleOps).toEqual(referenceOps);
    }
  });
});

// ---------------------------------------------------------------------------
// Core truth table: 11 roles x 25 operations = 275 test cases
// ---------------------------------------------------------------------------

describe("Permission Matrix — Complete Role x Operation Truth Table", () => {
  describe.each(ALL_ROLES)("Role: %s", (role) => {
    test.each(ALL_OPERATIONS)("operation: %s", (operation) => {
      const expected = PERMISSION_MATRIX[role]![operation]!;
      const result = checkPermission(role, operation);
      expect(result).toBe(expected);
    });
  });
});

// ---------------------------------------------------------------------------
// Variant 1: Authorized role -> allowed (200)
// ---------------------------------------------------------------------------

describe("Variant 1 — Authorized role gets 200", () => {
  describe.each(ALL_ROLES)("Role: %s", (role) => {
    test.each(ALL_OPERATIONS)("operation: %s → expected status", (operation) => {
      const user = makeUser({ role: role as Role });
      const ctx = makeContext(user);
      const result = checkPermissionWithContext(ctx, operation);
      const expected = PERMISSION_MATRIX[role]![operation]!;
      if (expected) {
        expect(result.allowed).toBe(true);
        expect(result.statusCode).toBe(200);
      } else {
        expect(result.allowed).toBe(false);
        expect(result.statusCode).toBe(403);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Variant 2: Unauthorized role -> denied (403)
// ---------------------------------------------------------------------------

describe("Variant 2 — Unauthorized role gets 403", () => {
  // For each operation, find roles that are NOT allowed and assert 403.
  // Skip operations where all 11 roles are allowed (e.g. view_dashboard, view_reports).
  const opsWithDeniedRoles = ALL_OPERATIONS.filter(
    (op) => ALL_ROLES.some((role) => !PERMISSION_MATRIX[role]![op]),
  );

  describe.each(opsWithDeniedRoles)("Operation: %s", (operation) => {
    const deniedRoles = ALL_ROLES.filter(
      (role) => !PERMISSION_MATRIX[role]![operation],
    );

    test.each(deniedRoles)("role %s is denied with 403", (role) => {
      const user = makeUser({ role: role as Role });
      const ctx = makeContext(user);
      const result = checkPermissionWithContext(ctx, operation);
      expect(result.allowed).toBe(false);
      expect(result.statusCode).toBe(403);
      expect(result.code).toBe("FORBIDDEN");
    });
  });

  it("view_dashboard and view_reports are universally allowed (no denied roles)", () => {
    for (const op of ["view_dashboard", "view_reports"]) {
      const deniedRoles = ALL_ROLES.filter(
        (role) => !PERMISSION_MATRIX[role]![op],
      );
      expect(deniedRoles).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Variant 3: Unauthenticated request -> denied (401)
// ---------------------------------------------------------------------------

describe("Variant 3 — Unauthenticated request gets 401", () => {
  test.each(ALL_OPERATIONS)("operation: %s denied without session", (operation) => {
    const ctx = makeContext(null);
    const result = checkPermissionWithContext(ctx, operation);
    expect(result.allowed).toBe(false);
    expect(result.statusCode).toBe(401);
    expect(result.code).toBe("UNAUTHORIZED");
  });
});

// ---------------------------------------------------------------------------
// Cross-Tenant Isolation Tests
// ---------------------------------------------------------------------------

describe("Cross-Tenant Isolation", () => {
  const crossTenantCases = ALL_ROLES.flatMap((role) =>
    ALL_OPERATIONS.filter((op) => PERMISSION_MATRIX[role]![op]).map((op) => ({
      role,
      operation: op,
    })),
  );

  it("should deny every permitted operation when targeting a different org", () => {
    for (const { role, operation } of crossTenantCases) {
      const user = makeUser({ role: role as Role, organizationId: "org-AAA" });
      const ctx = makeContext(user, "org-BBB"); // different org
      const result = checkPermissionWithContext(ctx, operation);
      expect(result.allowed).toBe(false);
      expect(result.statusCode).toBe(403);
      expect(result.code).toBe("CROSS_TENANT_DENIED");
    }
  });

  describe.each(ALL_ROLES)("Role: %s — cross-tenant denied for allowed ops", (role) => {
    const allowedOps = ALL_OPERATIONS.filter(
      (op) => PERMISSION_MATRIX[role]![op],
    );

    if (allowedOps.length > 0) {
      test.each(allowedOps)("operation: %s denied for other org", (operation) => {
        const user = makeUser({ role: role as Role, organizationId: "org-ALPHA" });
        const ctx = makeContext(user, "org-BETA");
        const result = checkPermissionWithContext(ctx, operation);
        expect(result.allowed).toBe(false);
        expect(result.statusCode).toBe(403);
        expect(result.code).toBe("CROSS_TENANT_DENIED");
      });
    }
  });

  it("should allow operation when user org matches target org", () => {
    const user = makeUser({ role: "platform_admin", organizationId: "org-SAME" });
    const ctx = makeContext(user, "org-SAME");
    const result = checkPermissionWithContext(ctx, "create_assessment");
    expect(result.allowed).toBe(true);
    expect(result.statusCode).toBe(200);
  });

  it("should deny even platform_admin when orgs differ", () => {
    const user = makeUser({ role: "platform_admin", organizationId: "org-X" });
    const ctx = makeContext(user, "org-Y");
    const result = checkPermissionWithContext(ctx, "delete_assessment");
    expect(result.allowed).toBe(false);
    expect(result.statusCode).toBe(403);
    expect(result.code).toBe("CROSS_TENANT_DENIED");
  });

  it("should deny viewer cross-tenant even for read ops", () => {
    const user = makeUser({ role: "viewer", organizationId: "org-READ" });
    const ctx = makeContext(user, "org-OTHER");
    const result = checkPermissionWithContext(ctx, "view_dashboard");
    expect(result.allowed).toBe(false);
    expect(result.statusCode).toBe(403);
    expect(result.code).toBe("CROSS_TENANT_DENIED");
  });
});

// ---------------------------------------------------------------------------
// Expired Session Tests
// ---------------------------------------------------------------------------

describe("Expired Session Tests", () => {
  test.each(ALL_ROLES)("role %s with expired session is denied 401", (role) => {
    const user = makeUser({
      role: role as Role,
      sessionExpiresAt: Date.now() - 1_000, // expired 1 second ago
    });
    const ctx = makeContext(user);
    // Use an operation the role would normally have access to (view_dashboard is universally allowed except viewer on some)
    const result = checkPermissionWithContext(ctx, "view_dashboard");
    expect(result.allowed).toBe(false);
    expect(result.statusCode).toBe(401);
    expect(result.code).toBe("SESSION_EXPIRED");
  });

  it("should deny expired session even for platform_admin on all operations", () => {
    const user = makeUser({
      role: "platform_admin",
      sessionExpiresAt: Date.now() - 60_000, // expired 1 minute ago
    });

    for (const op of ALL_OPERATIONS) {
      const ctx = makeContext(user);
      const result = checkPermissionWithContext(ctx, op);
      expect(result.allowed).toBe(false);
      expect(result.statusCode).toBe(401);
      expect(result.code).toBe("SESSION_EXPIRED");
    }
  });

  it("should allow active session for platform_admin", () => {
    const user = makeUser({
      role: "platform_admin",
      sessionExpiresAt: Date.now() + 3_600_000,
    });
    const ctx = makeContext(user);
    const result = checkPermissionWithContext(ctx, "create_assessment");
    expect(result.allowed).toBe(true);
    expect(result.statusCode).toBe(200);
  });

  it("should deny session that expired exactly at current time", () => {
    const now = Date.now();
    const user = makeUser({
      role: "consultant",
      sessionExpiresAt: now - 1,
    });
    const ctx = makeContext(user);
    const result = checkPermissionWithContext(ctx, "create_assessment");
    expect(result.allowed).toBe(false);
    expect(result.statusCode).toBe(401);
  });

  it("should deny expired session before checking role permissions", () => {
    // viewer normally cannot create_assessment, but the denial reason should be session, not role
    const user = makeUser({
      role: "viewer",
      sessionExpiresAt: Date.now() - 5_000,
    });
    const ctx = makeContext(user);
    const result = checkPermissionWithContext(ctx, "create_assessment");
    expect(result.allowed).toBe(false);
    expect(result.statusCode).toBe(401);
    expect(result.code).toBe("SESSION_EXPIRED");
  });
});

// ---------------------------------------------------------------------------
// Subscription-Based Access Tests
// ---------------------------------------------------------------------------

describe("Subscription-Based Access Tests", () => {
  const writeOperations = ALL_OPERATIONS.filter(
    (op) => !["view_dashboard", "view_reports", "download_data_export"].includes(op),
  );

  const readOnlyOperations: Operation[] = [
    "view_dashboard",
    "view_reports",
    "download_data_export",
  ];

  describe("expired_trial subscription", () => {
    test.each(writeOperations)(
      "denies write operation %s for expired trial",
      (operation) => {
        const user = makeUser({
          role: "platform_admin",
          subscriptionStatus: "expired_trial",
        });
        const ctx = makeContext(user);
        const result = checkPermissionWithContext(ctx, operation);
        expect(result.allowed).toBe(false);
        expect(result.statusCode).toBe(403);
        expect(result.code).toBe("SUBSCRIPTION_EXPIRED");
      },
    );

    test.each(readOnlyOperations)(
      "allows read-only operation %s for expired trial when role permits",
      (operation) => {
        // platform_admin has all ops
        const user = makeUser({
          role: "platform_admin",
          subscriptionStatus: "expired_trial",
        });
        const ctx = makeContext(user);
        const result = checkPermissionWithContext(ctx, operation);
        expect(result.allowed).toBe(true);
        expect(result.statusCode).toBe(200);
      },
    );

    it("denies read-only op if role itself does not permit it (viewer + download_data_export)", () => {
      const user = makeUser({
        role: "viewer",
        subscriptionStatus: "expired_trial",
      });
      const ctx = makeContext(user);
      // viewer does NOT have download_data_export
      const result = checkPermissionWithContext(ctx, "download_data_export");
      expect(result.allowed).toBe(false);
      expect(result.statusCode).toBe(403);
    });
  });

  describe("cancelled subscription", () => {
    test.each(writeOperations)(
      "denies write operation %s for cancelled subscription",
      (operation) => {
        const user = makeUser({
          role: "platform_admin",
          subscriptionStatus: "cancelled",
        });
        const ctx = makeContext(user);
        const result = checkPermissionWithContext(ctx, operation);
        expect(result.allowed).toBe(false);
        expect(result.statusCode).toBe(403);
        expect(result.code).toBe("SUBSCRIPTION_EXPIRED");
      },
    );

    test.each(readOnlyOperations)(
      "allows read-only operation %s for cancelled subscription when role permits",
      (operation) => {
        const user = makeUser({
          role: "consultant",
          subscriptionStatus: "cancelled",
        });
        const ctx = makeContext(user);
        const result = checkPermissionWithContext(ctx, operation);
        expect(result.allowed).toBe(true);
        expect(result.statusCode).toBe(200);
      },
    );
  });

  describe("active subscription", () => {
    it("allows all permitted operations for active subscription", () => {
      const user = makeUser({
        role: "platform_admin",
        subscriptionStatus: "active",
      });
      for (const op of ALL_OPERATIONS) {
        const ctx = makeContext(user);
        const result = checkPermissionWithContext(ctx, op);
        expect(result.allowed).toBe(true);
        expect(result.statusCode).toBe(200);
      }
    });
  });

  describe("trial subscription", () => {
    it("allows all permitted operations for trial subscription", () => {
      const user = makeUser({
        role: "platform_admin",
        subscriptionStatus: "trial",
      });
      for (const op of ALL_OPERATIONS) {
        const ctx = makeContext(user);
        const result = checkPermissionWithContext(ctx, op);
        expect(result.allowed).toBe(true);
        expect(result.statusCode).toBe(200);
      }
    });
  });

  describe("subscription + role interaction for each role", () => {
    test.each(ALL_ROLES)(
      "role %s with expired_trial can still view_dashboard if role permits",
      (role) => {
        const user = makeUser({
          role: role as Role,
          subscriptionStatus: "expired_trial",
        });
        const ctx = makeContext(user);
        const result = checkPermissionWithContext(ctx, "view_dashboard");
        // view_dashboard is true for all roles except... let's check
        const rolePermits = PERMISSION_MATRIX[role]!["view_dashboard"];
        if (rolePermits) {
          expect(result.allowed).toBe(true);
          expect(result.statusCode).toBe(200);
        } else {
          expect(result.allowed).toBe(false);
          expect(result.statusCode).toBe(403);
        }
      },
    );
  });
});

// ---------------------------------------------------------------------------
// Role-Specific Invariant Tests
// ---------------------------------------------------------------------------

describe("Role-Specific Invariants", () => {
  describe("platform_admin has unrestricted access", () => {
    it("should be allowed on every operation", () => {
      for (const op of ALL_OPERATIONS) {
        expect(PERMISSION_MATRIX["platform_admin"]![op]).toBe(true);
      }
    });
  });

  describe("viewer is read-only", () => {
    it("should only have view_dashboard and view_reports", () => {
      const viewerPerms = PERMISSION_MATRIX["viewer"]!;
      const allowed = ALL_OPERATIONS.filter((op) => viewerPerms[op]);
      expect(allowed).toEqual(
        expect.arrayContaining(["view_dashboard", "view_reports"]),
      );
      // viewer must NOT have any write operations
      const writeOps = allowed.filter(
        (op) => !["view_dashboard", "view_reports"].includes(op),
      );
      expect(writeOps).toHaveLength(0);
    });

    it("should not be able to add_comment", () => {
      expect(PERMISSION_MATRIX["viewer"]!["add_comment"]).toBe(false);
    });

    it("should not be able to acquire_editing_lock", () => {
      expect(PERMISSION_MATRIX["viewer"]!["acquire_editing_lock"]).toBe(false);
    });
  });

  describe("consultant has classification access but no admin ops", () => {
    it("can classify in own and other areas", () => {
      expect(PERMISSION_MATRIX["consultant"]!["classify_step_own_area"]).toBe(true);
      expect(PERMISSION_MATRIX["consultant"]!["classify_step_other_area"]).toBe(true);
    });

    it("can override classification", () => {
      expect(PERMISSION_MATRIX["consultant"]!["override_classification"]).toBe(true);
    });

    it("cannot delete assessments", () => {
      expect(PERMISSION_MATRIX["consultant"]!["delete_assessment"]).toBe(false);
    });

    it("cannot manage_team", () => {
      expect(PERMISSION_MATRIX["consultant"]!["manage_team"]).toBe(false);
    });

    it("cannot configure_sso", () => {
      expect(PERMISSION_MATRIX["consultant"]!["configure_sso"]).toBe(false);
    });
  });

  describe("partner_lead cannot classify but can manage", () => {
    it("cannot classify steps", () => {
      expect(PERMISSION_MATRIX["partner_lead"]!["classify_step_own_area"]).toBe(false);
      expect(PERMISSION_MATRIX["partner_lead"]!["classify_step_other_area"]).toBe(false);
      expect(PERMISSION_MATRIX["partner_lead"]!["override_classification"]).toBe(false);
    });

    it("can manage_team", () => {
      expect(PERMISSION_MATRIX["partner_lead"]!["manage_team"]).toBe(true);
    });

    it("can partner_countersign", () => {
      expect(PERMISSION_MATRIX["partner_lead"]!["partner_countersign"]).toBe(true);
    });
  });

  describe("project_manager has no classification access", () => {
    it("cannot classify any steps", () => {
      expect(PERMISSION_MATRIX["project_manager"]!["classify_step_own_area"]).toBe(false);
      expect(PERMISSION_MATRIX["project_manager"]!["classify_step_other_area"]).toBe(false);
      expect(PERMISSION_MATRIX["project_manager"]!["override_classification"]).toBe(false);
    });

    it("can manage_team", () => {
      expect(PERMISSION_MATRIX["project_manager"]!["manage_team"]).toBe(true);
    });

    it("can validate_area_sign_off (initiate sign-off)", () => {
      expect(PERMISSION_MATRIX["project_manager"]!["validate_area_sign_off"]).toBe(true);
    });
  });

  describe("executive can only sign off and view", () => {
    it("can executive_sign_off", () => {
      expect(PERMISSION_MATRIX["executive"]!["executive_sign_off"]).toBe(true);
    });

    it("can approve_change_request (high-cost gap approval)", () => {
      expect(PERMISSION_MATRIX["executive"]!["approve_change_request"]).toBe(true);
    });

    it("cannot classify steps", () => {
      expect(PERMISSION_MATRIX["executive"]!["classify_step_own_area"]).toBe(false);
      expect(PERMISSION_MATRIX["executive"]!["classify_step_other_area"]).toBe(false);
    });

    it("cannot create or delete assessments", () => {
      expect(PERMISSION_MATRIX["executive"]!["create_assessment"]).toBe(false);
      expect(PERMISSION_MATRIX["executive"]!["delete_assessment"]).toBe(false);
    });
  });

  describe("functional_head is area-locked for own area only", () => {
    it("can classify own area but not other areas", () => {
      expect(PERMISSION_MATRIX["functional_head"]!["classify_step_own_area"]).toBe(true);
      expect(PERMISSION_MATRIX["functional_head"]!["classify_step_other_area"]).toBe(false);
    });

    it("can create gaps", () => {
      expect(PERMISSION_MATRIX["functional_head"]!["create_gap"]).toBe(true);
    });

    it("cannot override classification", () => {
      expect(PERMISSION_MATRIX["functional_head"]!["override_classification"]).toBe(false);
    });
  });

  describe("process_owner is area-locked with no budget authority", () => {
    it("can classify own area", () => {
      expect(PERMISSION_MATRIX["process_owner"]!["classify_step_own_area"]).toBe(true);
    });

    it("cannot classify other areas", () => {
      expect(PERMISSION_MATRIX["process_owner"]!["classify_step_other_area"]).toBe(false);
    });

    it("cannot approve change requests (no budget decisions)", () => {
      expect(PERMISSION_MATRIX["process_owner"]!["approve_change_request"]).toBe(false);
    });

    it("cannot export to ALM", () => {
      expect(PERMISSION_MATRIX["process_owner"]!["export_to_alm"]).toBe(false);
    });
  });

  describe("it_lead handles integration only", () => {
    it("can add_integration_point", () => {
      expect(PERMISSION_MATRIX["it_lead"]!["add_integration_point"]).toBe(true);
    });

    it("cannot add_dm_object (not their domain)", () => {
      expect(PERMISSION_MATRIX["it_lead"]!["add_dm_object"]).toBe(false);
    });

    it("cannot add_ocm_impact (not their domain)", () => {
      expect(PERMISSION_MATRIX["it_lead"]!["add_ocm_impact"]).toBe(false);
    });

    it("cannot classify steps (no business process decisions)", () => {
      expect(PERMISSION_MATRIX["it_lead"]!["classify_step_own_area"]).toBe(false);
      expect(PERMISSION_MATRIX["it_lead"]!["classify_step_other_area"]).toBe(false);
    });
  });

  describe("data_migration_lead handles DM register only", () => {
    it("can add_dm_object", () => {
      expect(PERMISSION_MATRIX["data_migration_lead"]!["add_dm_object"]).toBe(true);
    });

    it("cannot add_integration_point", () => {
      expect(PERMISSION_MATRIX["data_migration_lead"]!["add_integration_point"]).toBe(false);
    });

    it("cannot add_ocm_impact", () => {
      expect(PERMISSION_MATRIX["data_migration_lead"]!["add_ocm_impact"]).toBe(false);
    });

    it("cannot classify steps", () => {
      expect(PERMISSION_MATRIX["data_migration_lead"]!["classify_step_own_area"]).toBe(false);
    });
  });

  describe("change_manager handles OCM register only", () => {
    it("can add_ocm_impact", () => {
      expect(PERMISSION_MATRIX["change_manager"]!["add_ocm_impact"]).toBe(true);
    });

    it("cannot add_integration_point", () => {
      expect(PERMISSION_MATRIX["change_manager"]!["add_integration_point"]).toBe(false);
    });

    it("cannot add_dm_object", () => {
      expect(PERMISSION_MATRIX["change_manager"]!["add_dm_object"]).toBe(false);
    });

    it("cannot classify steps (no process decisions)", () => {
      expect(PERMISSION_MATRIX["change_manager"]!["classify_step_own_area"]).toBe(false);
      expect(PERMISSION_MATRIX["change_manager"]!["classify_step_other_area"]).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Edge Cases and Boundary Tests
// ---------------------------------------------------------------------------

describe("Edge Cases", () => {
  it("unknown role returns false for all operations", () => {
    for (const op of ALL_OPERATIONS) {
      expect(checkPermission("nonexistent_role", op)).toBe(false);
    }
  });

  it("valid role with unknown operation returns false", () => {
    for (const role of ALL_ROLES) {
      expect(checkPermission(role, "nonexistent_operation")).toBe(false);
    }
  });

  it("empty string role returns false", () => {
    expect(checkPermission("", "view_dashboard")).toBe(false);
  });

  it("empty string operation returns false", () => {
    expect(checkPermission("platform_admin", "")).toBe(false);
  });

  it("null user context returns 401 for every operation", () => {
    for (const op of ALL_OPERATIONS) {
      const ctx = makeContext(null);
      const result = checkPermissionWithContext(ctx, op);
      expect(result.statusCode).toBe(401);
    }
  });

  it("precedence: unauthenticated > expired session > cross-tenant > subscription > role", () => {
    // Unauthenticated check happens before everything
    const ctx1 = makeContext(null, "org-BBB");
    const r1 = checkPermissionWithContext(ctx1, "create_assessment");
    expect(r1.code).toBe("UNAUTHORIZED");

    // Expired session checked before cross-tenant
    const expiredUser = makeUser({
      role: "platform_admin",
      organizationId: "org-AAA",
      sessionExpiresAt: Date.now() - 1_000,
    });
    const ctx2 = makeContext(expiredUser, "org-BBB");
    const r2 = checkPermissionWithContext(ctx2, "create_assessment");
    expect(r2.code).toBe("SESSION_EXPIRED");

    // Cross-tenant checked before subscription
    const crossTenantUser = makeUser({
      role: "platform_admin",
      organizationId: "org-AAA",
      subscriptionStatus: "expired_trial",
    });
    const ctx3 = makeContext(crossTenantUser, "org-BBB");
    const r3 = checkPermissionWithContext(ctx3, "create_assessment");
    expect(r3.code).toBe("CROSS_TENANT_DENIED");

    // Subscription checked before role
    const expiredSubUser = makeUser({
      role: "platform_admin",
      subscriptionStatus: "expired_trial",
    });
    const ctx4 = makeContext(expiredSubUser);
    const r4 = checkPermissionWithContext(ctx4, "create_assessment");
    expect(r4.code).toBe("SUBSCRIPTION_EXPIRED");
  });
});

// ---------------------------------------------------------------------------
// Aggregate counts for validation
// ---------------------------------------------------------------------------

describe("Permission Count Validation", () => {
  it("platform_admin should have 25 allowed operations (all of them)", () => {
    const count = ALL_OPERATIONS.filter(
      (op) => PERMISSION_MATRIX["platform_admin"]![op],
    ).length;
    expect(count).toBe(25);
  });

  it("viewer should have exactly 2 allowed operations", () => {
    const count = ALL_OPERATIONS.filter(
      (op) => PERMISSION_MATRIX["viewer"]![op],
    ).length;
    expect(count).toBe(2);
  });

  it("total allowed cells in the matrix should be consistent", () => {
    let totalAllowed = 0;
    for (const role of ALL_ROLES) {
      for (const op of ALL_OPERATIONS) {
        if (PERMISSION_MATRIX[role]![op]) totalAllowed++;
      }
    }
    // This is a snapshot: if the matrix changes, update this number
    // platform_admin: 25, partner_lead: 14, consultant: 17, project_manager: 9,
    // executive: 5, functional_head: 8, process_owner: 6, it_lead: 6,
    // data_migration_lead: 5, change_manager: 5, viewer: 2
    // Add 7 more from: functional_head(acquire_editing_lock), process_owner(acquire_editing_lock,add_comment),
    //   it_lead(acquire_editing_lock,add_comment,validate_area_sign_off), dm_lead(validate_area_sign_off,
    //   acquire_editing_lock,add_comment,create_change_request), change_manager(acquire_editing_lock,add_comment,
    //   create_change_request)
    // Total = 109
    expect(totalAllowed).toBe(109);
  });

  it("delete_assessment should be allowed for only platform_admin", () => {
    const rolesWithDelete = ALL_ROLES.filter(
      (role) => PERMISSION_MATRIX[role]!["delete_assessment"],
    );
    expect(rolesWithDelete).toEqual(["platform_admin"]);
  });

  it("configure_sso should be allowed for only platform_admin", () => {
    const roles = ALL_ROLES.filter(
      (role) => PERMISSION_MATRIX[role]!["configure_sso"],
    );
    expect(roles).toEqual(["platform_admin"]);
  });

  it("executive_sign_off should be limited to platform_admin and executive", () => {
    const roles = ALL_ROLES.filter(
      (role) => PERMISSION_MATRIX[role]!["executive_sign_off"],
    );
    expect(roles).toEqual(
      expect.arrayContaining(["platform_admin", "executive"]),
    );
    expect(roles).toHaveLength(2);
  });

  it("partner_countersign should be limited to platform_admin and partner_lead", () => {
    const roles = ALL_ROLES.filter(
      (role) => PERMISSION_MATRIX[role]!["partner_countersign"],
    );
    expect(roles).toEqual(
      expect.arrayContaining(["platform_admin", "partner_lead"]),
    );
    expect(roles).toHaveLength(2);
  });

  it("view_dashboard should be allowed for all 11 roles", () => {
    const roles = ALL_ROLES.filter(
      (role) => PERMISSION_MATRIX[role]!["view_dashboard"],
    );
    expect(roles).toHaveLength(11);
  });

  it("view_reports should be allowed for all 11 roles", () => {
    const roles = ALL_ROLES.filter(
      (role) => PERMISSION_MATRIX[role]!["view_reports"],
    );
    expect(roles).toHaveLength(11);
  });
});

# Phase 17: Role System & Organization Model

## 1. Overview

Phase 17 is a **MAJOR** structural phase that replaces the current 5-role model (`admin`, `consultant`, `process_owner`, `it_lead`, `executive`) with an 11-role system derived from mapping 25 real-world actor types to platform roles. It also implements a multi-tenant organization model with partner/client separation, SSO/SCIM configuration structure (actual SSO authentication is Phase 29), per-role MFA policies, session management enhancements, and expanded area-locked permissions.

This phase is foundational -- nearly every subsequent V2 phase depends on the role and organization infrastructure established here. The migration path must be non-breaking: all existing users, assessments, and permissions must continue working during and after the transition.

**Source**: V2 Brief Section A6 + Addendum 1 Sections 1.1-1.7

### The 25 Real-World Actor Types (from Addendum 1 Section 1.1)

These map to 11 platform roles:

| # | Actor Type | Platform Role |
|---|---|---|
| 1 | Aptus platform operator | `platform_admin` |
| 2 | Aptus support engineer | `platform_admin` |
| 3 | Partner firm leader | `partner_lead` |
| 4 | Partner engagement manager | `partner_lead` |
| 5 | Senior SAP consultant | `consultant` |
| 6 | Junior SAP consultant | `consultant` |
| 7 | Functional consultant | `consultant` |
| 8 | Technical consultant | `consultant` |
| 9 | Client project manager | `project_manager` |
| 10 | Partner project manager | `project_manager` |
| 11 | SAP solution architect | `solution_architect` |
| 12 | Integration architect | `solution_architect` |
| 13 | Finance process owner | `process_owner` |
| 14 | Logistics process owner | `process_owner` |
| 15 | HR process owner | `process_owner` |
| 16 | Client IT director | `it_lead` |
| 17 | Client IT manager | `it_lead` |
| 18 | Data migration lead | `data_migration_lead` |
| 19 | Data migration analyst | `data_migration_lead` |
| 20 | Client CIO/CFO/CEO | `executive_sponsor` |
| 21 | Board representative | `executive_sponsor` |
| 22 | External auditor (read-only) | `viewer` |
| 23 | Steering committee member | `viewer` |
| 24 | Client IT admin | `client_admin` |
| 25 | Client HR admin (SCIM) | `client_admin` |

### The 11 Platform Roles

1. **platform_admin** -- Aptus platform operators. Full system access. Manages all orgs.
2. **partner_lead** -- Consulting firm leader. Manages partner org, sees all partner assessments.
3. **consultant** -- Runs assessments. Full access within assigned assessments.
4. **project_manager** -- PM role. Read-all within assessment + manage timeline/stakeholders.
5. **solution_architect** -- Cross-area technical oversight. Read-all + technical notes across areas.
6. **process_owner** -- Area-locked. Classifies steps within their assigned functional areas.
7. **it_lead** -- Technical notes, integration register, DM register access. Cross-area read.
8. **data_migration_lead** -- DM register owner. Full DM access, read-only elsewhere.
9. **executive_sponsor** -- Read-only + sign-off authority. Dashboard access.
10. **viewer** -- Read-only. No comments, no exports (optional export per org policy).
11. **client_admin** -- Client-side user management. Invites/deactivates users within client org.

## 2. Dependencies

| Dependency | Type | Detail |
|---|---|---|
| Prisma 6 | Runtime | Schema changes to `User`, `Organization`, new `RolePermission` lookup; migration required |
| All existing API routes | Runtime | Every route that checks `user.role` must be updated to recognize 11 roles |
| Auth system (`session.ts`, `permissions.ts`, `admin-guard.ts`) | Runtime | Refactor to support 11-role permission matrix |
| `SessionUser` type | TypeScript | Expand `UserRole` union type |
| `MFA_REQUIRED_ROLES` / `MFA_OPTIONAL_ROLES` constants | Config | Redefine per new role set |
| `STATUS_TRANSITION_ROLES` | Config | Expand for new roles |
| All V2 register phases (14, 15, 16) | Coordination | Their permission matrices reference Phase 17 roles. They work with V1 roles until this phase lands. |
| shadcn/ui | UI | Organization management UI components |
| Zod 3 | Validation | Role and org validation schemas |
| React 19 / Next.js 16 | Runtime | Updated admin pages, org management pages |

**Breaking change mitigation**: This phase includes a database migration script that maps existing 5 roles to their 11-role equivalents. No user loses access.

## 3. Data Model Changes (Prisma syntax)

### Updated Organization Model

```prisma
model Organization {
  id              String   @id @default(cuid())
  name            String
  slug            String?  @unique
  type            String   // "PARTNER" | "DIRECT_CLIENT" | "PLATFORM"
  domain          String?
  logoUrl         String?
  isActive        Boolean  @default(true)

  // SSO Configuration (structure only; actual SSO in Phase 29)
  ssoEnabled      Boolean  @default(false)
  ssoProvider     String?  // "SAML" | "OIDC"
  ssoMetadataUrl  String?
  ssoEntityId     String?
  ssoCertificate  String?  @db.Text
  scimEnabled     Boolean  @default(false)
  scimToken       String?  // hashed SCIM bearer token

  // Branding
  primaryColor    String?  // hex color e.g. "#1a73e8"
  secondaryColor  String?  // hex color
  reportFooterText String? @db.Text
  reportLogoUrl   String?

  // Policies
  mfaPolicy       String   @default("optional") // "required" | "optional" | "disabled"
  sessionMaxHours Int      @default(24)
  maxConcurrentSessions Int @default(1)
  allowedEmailDomains String[] @default([])

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  users           User[]
  assessments     Assessment[]
  invitations     OrgInvitation[]

  @@index([type])
  @@index([slug])
}
```

### Updated User Model

```prisma
model User {
  id              String    @id @default(cuid())
  email           String    @unique
  emailVerified   DateTime?
  name            String
  image           String?
  role            String    // expanded: 11 roles (see enum below)
  organizationId  String?
  isActive        Boolean   @default(true)
  avatarUrl       String?
  jobTitle        String?
  department      String?
  phone           String?

  // MFA fields (existing)
  totpSecret      String?
  totpVerified    Boolean   @default(false)
  totpVerifiedAt  DateTime?
  mfaEnabled      Boolean   @default(false)
  mfaMethod       String    @default("none")

  webauthnCredentials WebAuthnCredential[]

  // Login tracking (existing)
  lastLoginAt     DateTime?
  lastLoginIp     String?
  loginCount      Int       @default(0)
  invitedBy       String?
  invitedAt       DateTime?

  // New fields for V2
  deactivatedAt   DateTime?
  deactivatedBy   String?
  deactivationReason String?

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  organization      Organization?          @relation(fields: [organizationId], references: [id])
  sessions          Session[]
  mfaChallenges     MfaChallenge[]
  stakeholderEntries AssessmentStakeholder[]
  accounts          Account[]

  @@index([role])
  @@index([organizationId])
  @@index([email])
  @@index([organizationId, role])
  @@index([organizationId, isActive])
}
```

### New OrgInvitation Model

```prisma
model OrgInvitation {
  id              String   @id @default(cuid())
  organizationId  String
  email           String
  role            String   // one of the 11 roles
  invitedBy       String
  expiresAt       DateTime
  acceptedAt      DateTime?
  revokedAt       DateTime?
  token           String   @unique

  organization Organization @relation(fields: [organizationId], references: [id])

  @@index([organizationId])
  @@index([email])
  @@index([token])
  @@index([expiresAt])
}
```

### TypeScript Role Definitions

```typescript
// src/types/assessment.ts (updated)
export type UserRole =
  | "platform_admin"
  | "partner_lead"
  | "consultant"
  | "project_manager"
  | "solution_architect"
  | "process_owner"
  | "it_lead"
  | "data_migration_lead"
  | "executive_sponsor"
  | "viewer"
  | "client_admin";

// Role metadata for UI display
export const ROLE_METADATA: Record<UserRole, {
  label: string;
  description: string;
  orgTypes: Array<"PARTNER" | "DIRECT_CLIENT" | "PLATFORM">;
  isInternal: boolean; // partner/platform side
  mfaDefault: "required" | "optional";
  maxConcurrentSessions: number;
}> = {
  platform_admin: {
    label: "Platform Admin",
    description: "Aptus platform operator with full system access",
    orgTypes: ["PLATFORM"],
    isInternal: true,
    mfaDefault: "optional",
    maxConcurrentSessions: 3,
  },
  partner_lead: {
    label: "Partner Lead",
    description: "Consulting firm leader managing partner organization",
    orgTypes: ["PARTNER"],
    isInternal: true,
    mfaDefault: "optional",
    maxConcurrentSessions: 2,
  },
  consultant: {
    label: "Consultant",
    description: "Runs assessments with full access within assigned assessments",
    orgTypes: ["PARTNER"],
    isInternal: true,
    mfaDefault: "optional",
    maxConcurrentSessions: 2,
  },
  project_manager: {
    label: "Project Manager",
    description: "Read-all within assessment plus stakeholder and timeline management",
    orgTypes: ["PARTNER", "DIRECT_CLIENT"],
    isInternal: false,
    mfaDefault: "required",
    maxConcurrentSessions: 1,
  },
  solution_architect: {
    label: "Solution Architect",
    description: "Cross-area technical oversight with read-all and technical notes",
    orgTypes: ["PARTNER"],
    isInternal: true,
    mfaDefault: "optional",
    maxConcurrentSessions: 2,
  },
  process_owner: {
    label: "Process Owner",
    description: "Area-locked role for classifying steps within assigned functional areas",
    orgTypes: ["DIRECT_CLIENT"],
    isInternal: false,
    mfaDefault: "required",
    maxConcurrentSessions: 1,
  },
  it_lead: {
    label: "IT Lead",
    description: "Technical notes, integration and data migration register access",
    orgTypes: ["DIRECT_CLIENT"],
    isInternal: false,
    mfaDefault: "required",
    maxConcurrentSessions: 1,
  },
  data_migration_lead: {
    label: "Data Migration Lead",
    description: "Data migration register owner with full DM access",
    orgTypes: ["PARTNER", "DIRECT_CLIENT"],
    isInternal: false,
    mfaDefault: "required",
    maxConcurrentSessions: 1,
  },
  executive_sponsor: {
    label: "Executive Sponsor",
    description: "Read-only access with sign-off authority",
    orgTypes: ["DIRECT_CLIENT"],
    isInternal: false,
    mfaDefault: "required",
    maxConcurrentSessions: 1,
  },
  viewer: {
    label: "Viewer",
    description: "Read-only access without commenting or export capabilities",
    orgTypes: ["PARTNER", "DIRECT_CLIENT"],
    isInternal: false,
    mfaDefault: "required",
    maxConcurrentSessions: 1,
  },
  client_admin: {
    label: "Client Admin",
    description: "Client-side user management within their organization",
    orgTypes: ["DIRECT_CLIENT"],
    isInternal: false,
    mfaDefault: "required",
    maxConcurrentSessions: 1,
  },
};
```

## 4. API Routes (method, path, request/response with Zod schemas)

### Zod Schemas

```typescript
// src/lib/validation/roles.ts
import { z } from "zod";

export const UserRoleSchema = z.enum([
  "platform_admin", "partner_lead", "consultant", "project_manager",
  "solution_architect", "process_owner", "it_lead", "data_migration_lead",
  "executive_sponsor", "viewer", "client_admin",
]);

export const OrgTypeSchema = z.enum(["PARTNER", "DIRECT_CLIENT", "PLATFORM"]);

export const MfaPolicySchema = z.enum(["required", "optional", "disabled"]);

export const SsoProviderSchema = z.enum(["SAML", "OIDC"]);
```

```typescript
// src/lib/validation/organization.ts
import { z } from "zod";
import { OrgTypeSchema, MfaPolicySchema, SsoProviderSchema } from "./roles";

export const CreateOrganizationSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens").optional(),
  type: OrgTypeSchema,
  domain: z.string().max(200).optional(),
  logoUrl: z.string().url().optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  reportFooterText: z.string().max(1000).optional(),
  mfaPolicy: MfaPolicySchema.default("optional"),
  sessionMaxHours: z.number().int().min(1).max(720).default(24),
  maxConcurrentSessions: z.number().int().min(1).max(10).default(1),
  allowedEmailDomains: z.array(z.string().min(3).max(200)).max(20).default([]),
});

export const UpdateOrganizationSchema = CreateOrganizationSchema.partial();

export const ConfigureSsoSchema = z.object({
  ssoEnabled: z.boolean(),
  ssoProvider: SsoProviderSchema.optional(),
  ssoMetadataUrl: z.string().url().optional(),
  ssoEntityId: z.string().max(500).optional(),
  ssoCertificate: z.string().max(10000).optional(),
}).refine(
  (data) => !data.ssoEnabled || (data.ssoProvider && data.ssoMetadataUrl),
  { message: "SSO provider and metadata URL are required when SSO is enabled" }
);

export const ConfigureScimSchema = z.object({
  scimEnabled: z.boolean(),
});
```

```typescript
// src/lib/validation/user-management.ts
import { z } from "zod";
import { UserRoleSchema } from "./roles";

export const InviteUserSchema = z.object({
  email: z.string().email(),
  role: UserRoleSchema,
  name: z.string().min(1).max(200).optional(),
});

export const UpdateUserRoleSchema = z.object({
  role: UserRoleSchema,
});

export const DeactivateUserSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const BulkInviteSchema = z.object({
  invitations: z.array(z.object({
    email: z.string().email(),
    role: UserRoleSchema,
    name: z.string().min(1).max(200).optional(),
  })).min(1).max(50),
});
```

### 4.1 Organization Management Routes

#### GET /api/admin/organizations

List all organizations (platform_admin only).

**Query Parameters**:

```typescript
const OrgListParams = z.object({
  type: OrgTypeSchema.optional(),
  isActive: z.coerce.boolean().optional(),
  search: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
```

**Response** `200`:

```typescript
interface OrgListResponse {
  data: Array<Organization & { _count: { users: number; assessments: number } }>;
  nextCursor: string | null;
  hasMore: boolean;
}
```

#### POST /api/admin/organizations

Create a new organization (platform_admin only).

**Request Body**: `CreateOrganizationSchema`

**Response** `201`:

```typescript
interface CreateOrgResponse {
  data: Organization;
}
```

#### GET /api/admin/organizations/[orgId]

Get organization details.

**Response** `200`:

```typescript
interface OrgDetailResponse {
  data: Organization & {
    _count: { users: number; assessments: number };
    users: Array<{ id: string; name: string; email: string; role: string; isActive: boolean }>;
  };
}
```

#### PUT /api/admin/organizations/[orgId]

Update organization (platform_admin or partner_lead of that org).

**Request Body**: `UpdateOrganizationSchema`

**Response** `200`: Updated organization.

#### PUT /api/admin/organizations/[orgId]/sso

Configure SSO settings (platform_admin only).

**Request Body**: `ConfigureSsoSchema`

**Response** `200`: Updated organization with SSO fields.

#### PUT /api/admin/organizations/[orgId]/scim

Enable/disable SCIM provisioning (platform_admin only).

**Request Body**: `ConfigureScimSchema`

**Response** `200`: Updated organization. If enabling, returns generated SCIM token (shown once).

### 4.2 User Management Routes

#### GET /api/organizations/[orgId]/users

List users in an organization.

**Query Parameters**:

```typescript
const OrgUserListParams = z.object({
  role: UserRoleSchema.optional(),
  isActive: z.coerce.boolean().optional(),
  search: z.string().optional(), // search by name or email
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
```

**Response** `200`:

```typescript
interface OrgUserListResponse {
  data: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    isActive: boolean;
    lastLoginAt: string | null;
    mfaEnabled: boolean;
    createdAt: string;
  }>;
  nextCursor: string | null;
  hasMore: boolean;
}
```

**Access**: platform_admin (all orgs), partner_lead (own org), client_admin (own org).

#### POST /api/organizations/[orgId]/users/invite

Invite a user to the organization.

**Request Body**: `InviteUserSchema`

**Response** `201`:

```typescript
interface InviteResponse {
  data: {
    invitation: OrgInvitation;
    magicLinkSent: boolean;
  };
}
```

**Access**: platform_admin, partner_lead (own org, partner roles only), client_admin (own org, client roles only).

#### POST /api/organizations/[orgId]/users/invite/bulk

Bulk invite users.

**Request Body**: `BulkInviteSchema`

**Response** `201`:

```typescript
interface BulkInviteResponse {
  data: {
    successful: Array<{ email: string; role: string }>;
    failed: Array<{ email: string; reason: string }>;
  };
}
```

#### PUT /api/organizations/[orgId]/users/[userId]/role

Change a user's role.

**Request Body**: `UpdateUserRoleSchema`

**Response** `200`:

```typescript
interface UpdateRoleResponse {
  data: { id: string; role: string; previousRole: string };
}
```

**Access**: platform_admin (any role), partner_lead (partner roles in own org), client_admin (client roles in own org).

#### POST /api/organizations/[orgId]/users/[userId]/deactivate

Deactivate a user.

**Request Body**: `DeactivateUserSchema`

**Response** `200`:

```typescript
interface DeactivateResponse {
  data: { id: string; deactivatedAt: string; sessionsRevoked: number };
}
```

Side effects: revoke all active sessions, log decision.

#### POST /api/organizations/[orgId]/users/[userId]/reactivate

Reactivate a previously deactivated user.

**Response** `200`:

```typescript
interface ReactivateResponse {
  data: { id: string; reactivatedAt: string };
}
```

### 4.3 Role Information Routes

#### GET /api/roles

Returns metadata for all 11 roles. Public (authenticated).

**Response** `200`:

```typescript
interface RolesResponse {
  data: Array<{
    role: string;
    label: string;
    description: string;
    orgTypes: string[];
    isInternal: boolean;
    permissions: string[]; // list of permission keys
  }>;
}
```

#### GET /api/roles/[role]/permissions

Returns the detailed permission matrix for a single role.

**Response** `200`:

```typescript
interface RolePermissionsResponse {
  data: {
    role: string;
    permissions: Record<string, boolean>; // e.g., "assessment.create": true
  };
}
```

## 5. UI Components (component tree, props, state)

### Organization Management UI

```
AdminOrganizationsPage (RSC, platform_admin only)
  +-- OrgListClient (client boundary)
        +-- OrgSearchBar
        |     +-- Input (search)
        |     +-- Select (type filter)
        |     +-- Switch (showInactive)
        +-- OrgTable
        |     +-- TableRow (per org)
        |           +-- OrgTypeBadge
        |           +-- UserCount
        |           +-- AssessmentCount
        |           +-- SsoBadge (if enabled)
        |           +-- ActiveBadge
        |           +-- DropdownMenu (Edit, Users, SSO, Deactivate)
        +-- CreateOrgDialog
        |     +-- Input (name)
        |     +-- Input (slug)
        |     +-- Select (type)
        |     +-- Input (domain)
        |     +-- ColorPicker (primaryColor)
        |     +-- Select (mfaPolicy)
        |     +-- Input (sessionMaxHours)
        |     +-- TagInput (allowedEmailDomains)
        +-- OrgDetailSheet
              +-- OrgInfoSection
              +-- SsoConfigSection
              +-- ScimConfigSection
              +-- BrandingSection
              +-- PolicySection
```

### User Management UI

```
OrgUsersPage (RSC)
  +-- OrgUsersClient (client boundary)
        +-- UserSearchBar
        |     +-- Input (search by name/email)
        |     +-- Select (role filter)
        |     +-- Switch (showInactive)
        +-- UserTable
        |     +-- TableRow (per user)
        |           +-- RoleBadge (color per role)
        |           +-- MfaStatusIcon
        |           +-- ActiveBadge
        |           +-- LastLoginAt
        |           +-- DropdownMenu (Change Role, Deactivate/Reactivate, View Sessions)
        +-- InviteUserDialog
        |     +-- Input (email)
        |     +-- Input (name, optional)
        |     +-- Select (role -- filtered by org type)
        +-- BulkInviteDialog
        |     +-- Textarea (paste emails, one per line)
        |     +-- Select (default role)
        |     +-- ResultsSummary (successful/failed)
        +-- ChangeRoleDialog
              +-- Select (new role -- filtered by org type)
              +-- WarningText (if downgrading from admin-level role)
```

### Key Props & State

```typescript
// OrgListClient
interface OrgListClientProps {
  initialOrgs: Organization[];
}

// OrgUsersClient
interface OrgUsersClientProps {
  organizationId: string;
  orgType: "PARTNER" | "DIRECT_CLIENT" | "PLATFORM";
  currentUserRole: UserRole;
  canManageUsers: boolean;
}

// InviteUserDialog
interface InviteUserDialogProps {
  organizationId: string;
  orgType: string;
  open: boolean;
  onClose: () => void;
  onInvited: () => void;
}

// ChangeRoleDialog
interface ChangeRoleDialogProps {
  user: { id: string; name: string; email: string; role: string };
  orgType: string;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}
```

## 6. Business Logic (algorithms, state machines, validation rules)

### Role Hierarchy

```
platform_admin (highest)
  +-- partner_lead
  |     +-- consultant
  |     +-- solution_architect
  |     +-- project_manager (partner-side)
  +-- client_admin
  |     +-- project_manager (client-side)
  |     +-- process_owner
  |     +-- it_lead
  |     +-- data_migration_lead
  |     +-- executive_sponsor
  |     +-- viewer (lowest)
```

A user can only manage roles at or below their level within the same organization type.

### Permission Matrix (11 roles x key actions)

```typescript
// src/lib/auth/permission-matrix.ts
export const PERMISSION_MATRIX: Record<string, UserRole[]> = {
  // Platform administration
  "platform.manage_orgs":          ["platform_admin"],
  "platform.manage_all_users":     ["platform_admin"],
  "platform.view_system_stats":    ["platform_admin"],
  "platform.manage_catalog":       ["platform_admin"],

  // Organization management
  "org.manage_users":              ["platform_admin", "partner_lead", "client_admin"],
  "org.edit_settings":             ["platform_admin", "partner_lead", "client_admin"],
  "org.configure_sso":             ["platform_admin"],
  "org.configure_scim":            ["platform_admin"],
  "org.view_users":                ["platform_admin", "partner_lead", "client_admin", "consultant"],

  // Assessment lifecycle
  "assessment.create":             ["platform_admin", "partner_lead", "consultant"],
  "assessment.delete":             ["platform_admin", "partner_lead"],
  "assessment.view":               ["platform_admin", "partner_lead", "consultant", "project_manager", "solution_architect", "process_owner", "it_lead", "data_migration_lead", "executive_sponsor", "viewer", "client_admin"],
  "assessment.edit_settings":      ["platform_admin", "consultant"],
  "assessment.manage_stakeholders":["platform_admin", "partner_lead", "consultant", "project_manager"],

  // Status transitions
  "assessment.start":              ["platform_admin", "consultant"],
  "assessment.complete":           ["platform_admin", "consultant"],
  "assessment.review":             ["platform_admin", "consultant"],
  "assessment.sign_off":           ["platform_admin", "consultant", "executive_sponsor"],

  // Scope management
  "scope.edit":                    ["platform_admin", "consultant", "process_owner"],

  // Step responses
  "step.classify":                 ["platform_admin", "consultant", "process_owner"],
  "step.add_notes":                ["platform_admin", "consultant", "process_owner", "it_lead", "solution_architect"],
  "step.override_area":            ["platform_admin", "consultant"],

  // Gap resolutions
  "gap.create":                    ["platform_admin", "consultant"],
  "gap.edit":                      ["platform_admin", "consultant", "solution_architect"],
  "gap.approve":                   ["platform_admin", "consultant"],

  // Integration register (Phase 14)
  "integration.create":            ["platform_admin", "consultant", "it_lead"],
  "integration.edit":              ["platform_admin", "consultant", "it_lead"],
  "integration.delete":            ["platform_admin", "consultant"],
  "integration.approve":           ["platform_admin", "consultant"],

  // Data migration register (Phase 15)
  "dm.create":                     ["platform_admin", "consultant", "it_lead", "data_migration_lead"],
  "dm.edit":                       ["platform_admin", "consultant", "it_lead", "data_migration_lead"],
  "dm.delete":                     ["platform_admin", "consultant", "data_migration_lead"],
  "dm.approve":                    ["platform_admin", "consultant"],

  // OCM register (Phase 16)
  "ocm.create":                    ["platform_admin", "consultant", "project_manager", "process_owner"],
  "ocm.edit":                      ["platform_admin", "consultant", "project_manager", "process_owner"],
  "ocm.delete":                    ["platform_admin", "consultant"],
  "ocm.approve":                   ["platform_admin", "consultant"],

  // Reports
  "report.generate":               ["platform_admin", "partner_lead", "consultant", "project_manager", "solution_architect"],
  "report.view":                   ["platform_admin", "partner_lead", "consultant", "project_manager", "solution_architect", "process_owner", "it_lead", "data_migration_lead", "executive_sponsor", "viewer", "client_admin"],
  "report.export":                 ["platform_admin", "partner_lead", "consultant", "project_manager", "solution_architect", "it_lead", "data_migration_lead", "executive_sponsor"],

  // Sign-off
  "signoff.sign":                  ["platform_admin", "consultant", "executive_sponsor"],

  // Decision log
  "audit.view":                    ["platform_admin", "partner_lead", "consultant", "project_manager", "solution_architect"],
};
```

### Role-to-Org Type Validation

```typescript
function validateRoleForOrgType(role: UserRole, orgType: string): boolean {
  const allowed = ROLE_METADATA[role].orgTypes;
  return allowed.includes(orgType as "PARTNER" | "DIRECT_CLIENT" | "PLATFORM");
}
```

Roles are scoped to organization types:
- **PLATFORM** org: only `platform_admin`
- **PARTNER** org: `partner_lead`, `consultant`, `solution_architect`, `project_manager`, `data_migration_lead`, `viewer`
- **DIRECT_CLIENT** org: `client_admin`, `project_manager`, `process_owner`, `it_lead`, `data_migration_lead`, `executive_sponsor`, `viewer`

### MFA Policy Resolution

```typescript
function isMfaRequired(user: SessionUser, org: Organization | null): boolean {
  // 1. If org has mfaPolicy = "disabled", no MFA
  if (org?.mfaPolicy === "disabled") return false;

  // 2. If org has mfaPolicy = "required", everyone needs MFA
  if (org?.mfaPolicy === "required") return !user.mfaVerified;

  // 3. Default: use role-based policy
  const roleConfig = ROLE_METADATA[user.role];
  if (roleConfig.mfaDefault === "required") {
    return !user.mfaVerified;
  }

  // 4. Optional: only required if user has enabled it
  return user.mfaEnabled && !user.mfaVerified;
}
```

### Session Management

```typescript
function getSessionConfig(user: SessionUser, org: Organization | null) {
  const roleConfig = ROLE_METADATA[user.role];
  return {
    maxAge: (org?.sessionMaxHours ?? APP_CONFIG.sessionMaxAgeHours) * 60 * 60 * 1000,
    maxConcurrent: org?.maxConcurrentSessions ?? roleConfig.maxConcurrentSessions,
  };
}
```

### Area-Locked Permission Expansion

| Role | Area Access |
|---|---|
| `platform_admin` | All areas |
| `partner_lead` | All areas within partner assessments |
| `consultant` | All areas within assigned assessments |
| `project_manager` | Read-all areas; write stakeholder management only |
| `solution_architect` | Read-all areas; write technical notes across areas |
| `process_owner` | Read/write only assigned areas |
| `it_lead` | Read-all areas; write technical notes, integration register, DM register |
| `data_migration_lead` | Read-all areas (DM context); write DM register only |
| `executive_sponsor` | Read-all areas; write sign-off only |
| `viewer` | Read-only assigned areas (or all if no area restriction) |
| `client_admin` | Read-all areas (user management context); no assessment writes |

### Invitation Flow

1. Admin/lead invites user by email and role.
2. System creates `OrgInvitation` with 7-day expiry token.
3. Magic link email sent to invitee.
4. On click, if user exists, they are added to the org. If new, user record created.
5. Invitation marked as accepted.

## 7. Permissions & Access Control (role x action matrix)

See the full `PERMISSION_MATRIX` in Section 6. Summary of who can manage whom:

| Manager Role | Can Manage Roles |
|---|---|
| `platform_admin` | All 11 roles |
| `partner_lead` | `consultant`, `solution_architect`, `project_manager` (partner-side), `data_migration_lead`, `viewer` (within own org) |
| `client_admin` | `project_manager` (client-side), `process_owner`, `it_lead`, `data_migration_lead`, `executive_sponsor`, `viewer` (within own org) |
| All others | Cannot manage users |

### Role Change Restrictions

- Cannot change a user's role to a role that does not belong to the user's organization type.
- Cannot change own role (self-service role change is disallowed).
- Cannot promote to a role higher than your own in the hierarchy.
- Role changes revoke all active sessions for the affected user (security measure).
- Role changes are logged in the decision log.

## 8. Notification Triggers (event -> channel -> recipient matrix)

| Event | Channel | Recipients |
|---|---|---|
| User invited to organization | Email (magic link) | Invitee |
| Invitation accepted | In-app | Inviter |
| Invitation expired (7 days) | Email | Inviter (reminder to re-invite) |
| User role changed | Email + In-app | Affected user |
| User deactivated | Email | Affected user (account deactivated notice) |
| User reactivated | Email | Affected user (account restored notice) |
| SSO configured for org | In-app | All admins of that org |
| MFA policy changed for org | Email | All users of that org |
| Concurrent session limit reached | In-app toast | User (oldest session revoked) |
| New organization created | In-app | Platform admins |

## 9. Edge Cases & Error Handling

| # | Scenario | Handling |
|---|---|---|
| 1 | Existing user with role `admin` during migration | Map to `platform_admin`. Log migration in decision log. |
| 2 | Existing user with role `executive` during migration | Map to `executive_sponsor`. Update all stakeholder records. |
| 3 | User invited to org but already belongs to a different org | Return `400`: "User already belongs to another organization. Transfer is not supported." |
| 4 | Inviting user with role not valid for org type | Return `400`: "Role {role} is not valid for {orgType} organizations." |
| 5 | partner_lead tries to invite a `platform_admin` | Return `403`: "Cannot invite a role above your own level." |
| 6 | client_admin tries to change a user to `consultant` | Return `400`: "Role consultant is not valid for DIRECT_CLIENT organizations." |
| 7 | Deactivating the last platform_admin | Return `400`: "Cannot deactivate the last platform admin." |
| 8 | SSO enabled but metadata URL is unreachable | Store config but mark `ssoStatus: "pending_validation"`. Actual validation in Phase 29. |
| 9 | User accepted invitation but link expired | Return `400`: "Invitation has expired. Please request a new invitation." |
| 10 | Bulk invite with duplicate emails in request | Deduplicate; process each email once. Return count of deduped entries in response. |
| 11 | Changing role of user who has active assessment stakeholder records | Update `AssessmentStakeholder.role` to match new role. Recalculate area access. |
| 12 | Organization slug collision | Return `409`: "Organization slug already taken." |
| 13 | User with org MFA policy "required" but no MFA setup | Redirect to MFA setup page after login. Block access to assessment data until MFA is configured. |
| 14 | SCIM token rotation | Generate new token, invalidate old token, return new token once. Old token grace period of 1 hour. |

## 10. Performance Considerations

| Concern | Mitigation |
|---|---|
| Permission checks on every API call | In-memory permission matrix lookup is O(1). No DB query needed for static role-based checks. Stakeholder-based area checks use indexed queries. |
| Session management with variable concurrent limits | `Session` table indexed on `[userId, isRevoked]`. Concurrent session check is a simple `count` query. |
| Organization user list for large orgs (1000+ users) | Cursor-based pagination. Composite index `[organizationId, isActive]` covers primary query. |
| Role change cascade to stakeholder records | Single `updateMany` query. Indexed on `[userId]`. |
| Bulk invite (50 users) | Process sequentially within a transaction. Send emails in background via queue (or Promise.allSettled for MVP). |
| SessionUser type expansion | `validateSession` query remains a single indexed lookup. Adding `organization.mfaPolicy` to the select increases payload by ~20 bytes. |
| Slug uniqueness check | Unique index on `Organization.slug`. Single indexed query. |

## 11. Testing Strategy (unit, integration, e2e scenarios)

### Unit Tests

| Test | Location | Description |
|---|---|---|
| `UserRoleSchema` validation | `__tests__/lib/validation/roles.test.ts` | All 11 roles accepted; invalid strings rejected |
| `CreateOrganizationSchema` | `__tests__/lib/validation/organization.test.ts` | Valid org accepted; invalid slug format, invalid hex color rejected |
| `InviteUserSchema` | `__tests__/lib/validation/user-management.test.ts` | Valid invite accepted; invalid email, invalid role rejected |
| Role-org type validation | `__tests__/lib/auth/role-org-validation.test.ts` | Each role validated against correct org types |
| Permission matrix | `__tests__/lib/auth/permission-matrix.test.ts` | Every permission key tested for correct role inclusion/exclusion |
| MFA policy resolution | `__tests__/lib/auth/mfa-policy.test.ts` | Org required overrides role optional; org disabled overrides role required |
| Session config resolution | `__tests__/lib/auth/session-config.test.ts` | Org settings override defaults; role settings used as fallback |
| Role hierarchy | `__tests__/lib/auth/role-hierarchy.test.ts` | Cannot promote above own level; self-change blocked |
| `hasPermission` helper | `__tests__/lib/auth/has-permission.test.ts` | All 11 roles x key permissions matrix coverage |

### Integration Tests

| Test | Location | Description |
|---|---|---|
| Organization CRUD | `__tests__/api/organizations.test.ts` | Create, read, update org; slug uniqueness |
| User invitation flow | `__tests__/api/org-invitations.test.ts` | Invite, accept, verify user in org |
| Bulk invite | `__tests__/api/org-bulk-invite.test.ts` | 5 valid + 2 invalid; verify partial success |
| Role change | `__tests__/api/org-role-change.test.ts` | Change role, verify stakeholder update, session revocation |
| Role-org type guard | `__tests__/api/org-role-guard.test.ts` | Attempt to assign partner role to client org user; verify 400 |
| Deactivation | `__tests__/api/org-deactivation.test.ts` | Deactivate user, verify sessions revoked, login blocked |
| Reactivation | `__tests__/api/org-reactivation.test.ts` | Reactivate user, verify login works |
| Last admin protection | `__tests__/api/org-last-admin.test.ts` | Attempt to deactivate last platform_admin; verify 400 |
| SSO config | `__tests__/api/org-sso-config.test.ts` | Enable SSO, verify fields stored; disable SSO |
| Permission checks (all routes) | `__tests__/api/permission-integration.test.ts` | Test each existing API route with each of 11 roles |
| Migration script | `__tests__/migration/role-migration.test.ts` | Run migration on test data; verify all 5 old roles mapped correctly |

### E2E Tests (Playwright)

| Test | File | Description |
|---|---|---|
| Admin org list | `e2e/admin-organizations.spec.ts` | Platform admin sees org list, creates new org |
| Org user management | `e2e/org-users.spec.ts` | Navigate to org users, invite user, verify in list |
| Role change flow | `e2e/org-role-change.spec.ts` | Change user role via dropdown; verify badge updates |
| Deactivate/reactivate | `e2e/org-user-lifecycle.spec.ts` | Deactivate user, verify greyed out; reactivate |
| Permission enforcement | `e2e/role-permissions.spec.ts` | Login as each role type; verify correct UI elements shown/hidden |
| SSO config page | `e2e/org-sso-config.spec.ts` | Navigate to SSO settings; toggle on; fill fields; save |

## 12. Migration & Seed Data

### Database Migration

```bash
npx prisma migrate dev --name expand-role-system-and-org-model
```

### Data Migration Script

```typescript
// prisma/migrations/role-migration.ts
// Run AFTER schema migration, BEFORE application deployment

const ROLE_MAP: Record<string, string> = {
  admin: "platform_admin",
  consultant: "consultant",       // unchanged
  process_owner: "process_owner", // unchanged
  it_lead: "it_lead",             // unchanged
  executive: "executive_sponsor", // renamed
};

async function migrateRoles() {
  const users = await prisma.user.findMany({
    select: { id: true, role: true },
  });

  for (const user of users) {
    const newRole = ROLE_MAP[user.role];
    if (!newRole) {
      console.error(`Unknown role "${user.role}" for user ${user.id}. Skipping.`);
      continue;
    }
    if (newRole !== user.role) {
      await prisma.user.update({
        where: { id: user.id },
        data: { role: newRole },
      });

      // Update all stakeholder records for this user
      await prisma.assessmentStakeholder.updateMany({
        where: { userId: user.id },
        data: { role: newRole },
      });

      // Log the migration
      await prisma.decisionLogEntry.create({
        data: {
          assessmentId: "SYSTEM", // placeholder for system-level events
          entityType: "user",
          entityId: user.id,
          action: "ROLE_MIGRATED",
          oldValue: { role: user.role },
          newValue: { role: newRole },
          actor: "SYSTEM",
          actorRole: "platform_admin",
          reason: "V2 role system migration: 5-role to 11-role model",
        },
      });
    }
  }

  // Update Organization types
  await prisma.organization.updateMany({
    where: { type: "client" },
    data: { type: "DIRECT_CLIENT" },
  });
  await prisma.organization.updateMany({
    where: { type: "partner" },
    data: { type: "PARTNER" },
  });
  await prisma.organization.updateMany({
    where: { type: "platform" },
    data: { type: "PLATFORM" },
  });
}
```

### Constants Migration

Update `src/constants/config.ts`:

```typescript
// Before (V1):
export const MFA_REQUIRED_ROLES = ["process_owner", "it_lead", "executive"] as const;
export const MFA_OPTIONAL_ROLES = ["consultant", "admin"] as const;

// After (V2):
export const MFA_REQUIRED_ROLES = [
  "process_owner", "it_lead", "data_migration_lead",
  "executive_sponsor", "project_manager", "viewer", "client_admin",
] as const;

export const MFA_OPTIONAL_ROLES = [
  "platform_admin", "partner_lead", "consultant", "solution_architect",
] as const;
```

### Seed Data

```typescript
// prisma/seed-organizations.ts
const seedOrganizations = [
  {
    name: "Aptus Platform",
    slug: "aptus",
    type: "PLATFORM",
    mfaPolicy: "optional",
  },
  {
    name: "Meridian Consulting",
    slug: "meridian",
    type: "PARTNER",
    domain: "meridian-consulting.com",
    primaryColor: "#1a73e8",
    mfaPolicy: "optional",
  },
  {
    name: "Acme Manufacturing Sdn Bhd",
    slug: "acme-manufacturing",
    type: "DIRECT_CLIENT",
    domain: "acme-mfg.com.my",
    mfaPolicy: "required",
  },
];

const seedUsers = [
  { email: "admin@aptus.io", name: "System Admin", role: "platform_admin", org: "aptus" },
  { email: "lead@meridian-consulting.com", name: "Sarah Chen", role: "partner_lead", org: "meridian" },
  { email: "consultant@meridian-consulting.com", name: "James Tan", role: "consultant", org: "meridian" },
  { email: "architect@meridian-consulting.com", name: "Ravi Kumar", role: "solution_architect", org: "meridian" },
  { email: "pm@acme-mfg.com.my", name: "Ahmad Razak", role: "project_manager", org: "acme-manufacturing" },
  { email: "finance@acme-mfg.com.my", name: "Lim Wei Ling", role: "process_owner", org: "acme-manufacturing" },
  { email: "it@acme-mfg.com.my", name: "David Ooi", role: "it_lead", org: "acme-manufacturing" },
  { email: "dm@acme-mfg.com.my", name: "Nurul Huda", role: "data_migration_lead", org: "acme-manufacturing" },
  { email: "cfo@acme-mfg.com.my", name: "Tan Sri Lim", role: "executive_sponsor", org: "acme-manufacturing" },
  { email: "auditor@external.com", name: "External Auditor", role: "viewer", org: "acme-manufacturing" },
  { email: "itadmin@acme-mfg.com.my", name: "Wong Chee Keong", role: "client_admin", org: "acme-manufacturing" },
];
```

## 13. Open Questions (numbered, with recommended answers)

| # | Question | Recommended Answer |
|---|---|---|
| 1 | Should users be able to belong to multiple organizations simultaneously? | **No for MVP.** A user belongs to exactly one organization. For consultants who serve multiple clients, the partner org is their home org, and they access client assessments via stakeholder assignments. Revisit if this becomes a UX pain point. |
| 2 | Should we support custom roles beyond the 11 predefined ones? | **No.** Custom roles introduce permission management complexity. The 11 roles cover all identified actor types. If a role is missing, add it to the platform rather than allowing custom definitions. |
| 3 | Should role changes be retroactive to existing stakeholder records? | **Yes.** When a user's role changes, all their `AssessmentStakeholder.role` records should update to reflect the new role. This ensures consistent permission enforcement. |
| 4 | Should the `partner_lead` role be able to create assessments directly, or only through consultants? | **Yes, partner_lead can create assessments.** This allows senior partners to set up engagements before assigning consultants. |
| 5 | Should we implement organization hierarchy (parent/child orgs)? | **Defer.** A flat org model (PLATFORM, PARTNER, DIRECT_CLIENT) is sufficient. Hierarchical orgs (e.g., partner with sub-practices) can be addressed in Phase 30+. |
| 6 | Should SSO be enforced at the org level (no password fallback)? | **Configurable per org.** Add `ssoExclusive: Boolean` field. When true, only SSO login is allowed. When false, magic link is still available as fallback. Default: false. |
| 7 | How should we handle the `admin` guard in existing routes during migration? | **Dual support during transition.** Update `requireAdmin()` to accept both `"admin"` and `"platform_admin"` for a 1-release transition period. After migration is confirmed complete, remove `"admin"` support. |
| 8 | Should the SCIM token be rotatable by the client_admin? | **No.** SCIM token management is platform_admin only. Client admins manage users through the UI, not through SCIM directly. |
| 9 | Should deactivated users' data (assessment responses, decisions) be preserved? | **Yes, absolutely.** Deactivation only prevents future login. All historical data remains intact and attributable to the deactivated user. |
| 10 | How do we handle session limits when org policy differs from role default? | **Org policy takes precedence.** If the org sets `maxConcurrentSessions: 3`, that overrides the role default of 1. This allows partner orgs to be more permissive for their consultants. |
| 11 | Should the `viewer` role be able to export reports? | **Configurable per org.** Default: no export for viewers. Org-level `viewerCanExport: Boolean` field controls this. |

## 14. Acceptance Criteria (Given/When/Then)

### AC-17.1: Role Migration

```
Given the database contains users with V1 roles: admin, consultant, process_owner, it_lead, executive
When the role migration script runs
Then all "admin" users are updated to "platform_admin"
And all "executive" users are updated to "executive_sponsor"
And "consultant", "process_owner", "it_lead" users remain unchanged
And AssessmentStakeholder records are updated to match
And a DecisionLogEntry is created for each role change
```

### AC-17.2: Create Organization

```
Given a platform_admin user is on the Organizations admin page
When they click "Create Organization" and fill in:
  - name: "TechVision Consulting"
  - slug: "techvision"
  - type: "PARTNER"
  - domain: "techvision.com"
  - mfaPolicy: "optional"
And click "Save"
Then a new organization is created
And the org list refreshes to show the new row
```

### AC-17.3: Invite User with Role Validation

```
Given a client_admin user manages organization "Acme Manufacturing" (type: DIRECT_CLIENT)
When they try to invite a user with role "consultant"
Then the API returns 400: "Role consultant is not valid for DIRECT_CLIENT organizations"
And the invitation is not created
```

### AC-17.4: Invite User Successfully

```
Given a partner_lead manages organization "Meridian Consulting" (type: PARTNER)
When they invite user "new@meridian-consulting.com" with role "consultant"
Then an OrgInvitation is created with 7-day expiry
And a magic link email is sent to the invitee
And the invitation appears in the pending invitations list
```

### AC-17.5: Accept Invitation

```
Given user "new@meridian-consulting.com" has a pending invitation for org "Meridian Consulting"
When they click the magic link in their email
Then a new User record is created with role "consultant" and organizationId set
And the OrgInvitation is marked as accepted
And the user is redirected to the dashboard
```

### AC-17.6: Change User Role

```
Given user "James Tan" has role "consultant" in org "Meridian Consulting"
When the partner_lead changes their role to "solution_architect"
Then the user's role is updated to "solution_architect"
And all their AssessmentStakeholder records are updated
And all their active sessions are revoked
And a DecisionLogEntry records the role change
```

### AC-17.7: Role Hierarchy Enforcement

```
Given a partner_lead user manages "Meridian Consulting"
When they attempt to invite a user with role "platform_admin"
Then the API returns 403: "Cannot invite a role above your own level"
```

### AC-17.8: Deactivate User

```
Given user "David Ooi" (it_lead) has 2 active sessions
When the client_admin deactivates "David Ooi" with reason "Left company"
Then the user's isActive is set to false
And deactivatedAt and deactivatedBy are recorded
And all 2 sessions are revoked
And the user cannot log in
And their historical assessment data is preserved
```

### AC-17.9: Last Platform Admin Protection

```
Given there is only 1 active platform_admin user
When someone attempts to deactivate that user
Then the API returns 400: "Cannot deactivate the last platform admin"
```

### AC-17.10: MFA Policy Override

```
Given organization "Acme Manufacturing" has mfaPolicy "required"
And user "Ahmad Razak" (project_manager) has not set up MFA
When "Ahmad Razak" logs in and authenticates via magic link
Then they are redirected to the MFA setup page
And they cannot access any assessment data until MFA is configured
```

### AC-17.11: Session Concurrent Limit (Org Override)

```
Given organization "Meridian Consulting" has maxConcurrentSessions = 2
And user "James Tan" has 2 active sessions
When "James Tan" logs in from a third device
Then the oldest session is revoked
And the new session is created
And a notification is shown: "Your oldest session was ended due to concurrent session limits"
```

### AC-17.12: Permission Matrix Enforcement

```
Given a user with role "data_migration_lead" is a stakeholder on assessment "A1"
When they attempt to create a gap resolution (POST /api/assessments/A1/gaps)
Then the API returns 403: "Insufficient permissions"
But when they create a data migration object (POST /api/assessments/A1/data-migration)
Then the object is created successfully
```

### AC-17.13: Organization Slug Uniqueness

```
Given organization "Meridian Consulting" has slug "meridian"
When a platform_admin tries to create another org with slug "meridian"
Then the API returns 409: "Organization slug already taken"
```

### AC-17.14: Backward Compatibility During Transition

```
Given the migration has run and "admin" role no longer exists
When existing API routes that use requireAdmin() are called
Then they correctly accept "platform_admin" users
And the application functions without errors
```

## 15. Size Estimate

| Component | Estimate |
|---|---|
| Prisma schema changes + migration | 1 day |
| Role migration script (5-role to 11-role) | 1 day |
| TypeScript type updates (`UserRole`, `SessionUser`, etc.) | 1 day |
| Permission matrix implementation | 2 days |
| `hasPermission` / `requirePermission` helpers | 1 day |
| Refactor all existing API routes for 11-role support | 3 days |
| Refactor `permissions.ts`, `admin-guard.ts`, `session.ts` | 2 days |
| MFA policy resolution (org-level override) | 1 day |
| Session management (org-level concurrent limits) | 1 day |
| Zod validation schemas (roles, org, invitations) | 1 day |
| Organization management API routes (6 endpoints) | 2 days |
| User management API routes (7 endpoints) | 2.5 days |
| Role information API routes (2 endpoints) | 0.5 day |
| Organization management UI (OrgList, CreateOrg, OrgDetail, SSO config) | 3 days |
| User management UI (UserList, Invite, BulkInvite, ChangeRole, Deactivate) | 3 days |
| Seed data (orgs, users) | 0.5 day |
| Unit tests (schemas, permissions, hierarchy, MFA policy) | 3 days |
| Integration tests (all new endpoints, migration, permission enforcement) | 3 days |
| E2E tests (org management, user management, permissions) | 2 days |
| **Total** | **~33 days (Size L)** |

## 16. Phase Completion Checklist

- [ ] `UserRole` type updated to 11-role union
- [ ] `ROLE_METADATA` constant defined with all role properties
- [ ] `Organization` model updated with SSO, branding, and policy fields
- [ ] `User` model updated with deactivation fields, `jobTitle`, `department`, `phone`
- [ ] `OrgInvitation` model created
- [ ] Prisma migration applied to dev and staging
- [ ] Role migration script tested and executed
- [ ] All existing `admin` users mapped to `platform_admin`
- [ ] All existing `executive` users mapped to `executive_sponsor`
- [ ] `AssessmentStakeholder` records updated to match new roles
- [ ] `DecisionLogEntry` created for every migrated user
- [ ] `PERMISSION_MATRIX` implemented with all actions x 11 roles
- [ ] `hasPermission(user, action)` helper function created
- [ ] `requirePermission(user, action)` guard function created
- [ ] `requireAdmin()` updated to accept `platform_admin`
- [ ] `canEditStepResponse()` updated for 11 roles
- [ ] `canEditScopeSelection()` updated for 11 roles
- [ ] `canManageStakeholders()` updated for 11 roles
- [ ] `canTransitionStatus()` updated for 11 roles
- [ ] `isMfaRequired()` updated with org-level policy override
- [ ] Session creation respects org-level concurrent session limit
- [ ] All existing API routes updated to check 11-role permissions
- [ ] Zod schemas created for organizations, invitations, user management
- [ ] Organization CRUD API routes implemented
- [ ] SSO configuration API route implemented (structure only)
- [ ] SCIM configuration API route implemented (structure only)
- [ ] User list/invite/bulk-invite API routes implemented
- [ ] Role change API route with cascade and session revocation
- [ ] Deactivate/reactivate API routes with session cleanup
- [ ] Role information API routes implemented
- [ ] Role-org type validation enforced on invite and role change
- [ ] Role hierarchy enforcement prevents privilege escalation
- [ ] Last platform_admin protection implemented
- [ ] Organization management UI renders for platform_admin
- [ ] User management UI renders for platform_admin, partner_lead, client_admin
- [ ] Invite flow works end-to-end (invite -> magic link -> accept -> user created)
- [ ] Bulk invite handles partial success correctly
- [ ] Role change dialog shows only valid roles for org type
- [ ] Deactivation/reactivation flow works with confirmation dialog
- [ ] `MFA_REQUIRED_ROLES` and `MFA_OPTIONAL_ROLES` constants updated
- [ ] `STATUS_TRANSITION_ROLES` updated for new role names
- [ ] Seed data for 3 organizations and 11 users loads correctly
- [ ] Unit tests pass for all Zod schemas
- [ ] Unit tests pass for permission matrix (100% action coverage)
- [ ] Unit tests pass for role hierarchy and MFA policy
- [ ] Integration tests pass for all new API endpoints
- [ ] Integration tests confirm migration script correctness
- [ ] Integration tests confirm permission enforcement on existing routes
- [ ] E2E tests pass for org management, user management, permission enforcement
- [ ] No TypeScript `strict` mode errors
- [ ] No ESLint warnings in new or modified files
- [ ] All existing tests still pass (backward compatibility)

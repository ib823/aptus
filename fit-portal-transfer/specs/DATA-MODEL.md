# Data Model — Complete Prisma Schema

All tables, columns, types, relations, indices, and constraints.

---

## Layer 1: SAP Catalog (Ingested from ZIP)

```prisma
model ScopeItem {
  id                String   @id                          // e.g., "J60" — from BPD filename
  name              String                                // from BPD XLSX column 1, first data row (e.g., "Accounts Payable   (J60)")
  nameClean         String                                // cleaned: "Accounts Payable" (parenthetical code removed)
  purposeHtml       String   @db.Text                     // from BPD DOCX "Purpose" section, raw HTML
  overviewHtml      String   @db.Text                     // from BPD DOCX "Overview" section, raw HTML
  prerequisitesHtml String   @db.Text                     // from BPD DOCX "Prerequisites" section, raw HTML
  country           String                                // "MY" or "XX" — from filename suffix
  language          String   @default("EN")               // always "EN" in this dataset
  version           String   @default("2508")             // SAP release version
  totalSteps        Int                                   // verified count of process steps
  functionalArea    String                                // from config XLSM: Application Area
  subArea           String                                // from config XLSM: Application Subarea
  tutorialUrl       String?                               // from links.xlsx SolutionProcess sheet
  docxStored        Boolean  @default(false)              // true after DOCX blob stored
  xlsxStored        Boolean  @default(false)              // true after XLSX blob stored
  setupPdfStored    Boolean  @default(false)              // true after Setup PDF blob stored
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  // Relations
  processSteps      ProcessStep[]
  configActivities  ConfigActivity[]
  setupGuide        SetupGuide?
  expertConfigs     ExpertConfig[]

  @@index([functionalArea])
  @@index([subArea])
  @@index([country])
}

model ProcessStep {
  id                      String   @id @default(cuid())
  scopeItemId             String
  sequence                Int                              // order within the scope item (0-based)

  // From BPD XLSX columns
  testCaseGuid            String?                          // col 0
  testCaseName            String?                          // col 1
  scopeGuid               String?                          // col 2
  scopeName               String?                          // col 3
  solutionProcessGuid     String?                          // col 4
  solutionProcessName     String?                          // col 5
  solutionProcessFlowGuid String?                          // col 6
  solutionProcessFlowName String?                          // col 7
  flowDiagramGuid         String?                          // col 8
  flowDiagramName         String?                          // col 9
  testCasePriority        String?                          // col 10
  testCaseOwner           String?                          // col 11
  testCaseStatus          String?                          // col 12
  activityGuid            String?                          // col 13
  activityTitle           String?                          // col 14
  activityTargetName      String?                          // col 15
  activityTargetUrl       String?                          // col 16
  actionGuid              String?                          // col 17
  actionTitle             String                           // col 18 — NEVER null (this defines a step)
  actionInstructionsHtml  String   @db.Text                // col 19 — raw HTML preserved
  actionExpectedResult    String?  @db.Text                // col 20 — raw HTML preserved

  // Derived fields
  stepType                String                           // normalized: LOGON, ACCESS_APP, INFORMATION, DATA_ENTRY, ACTION, VERIFICATION, NAVIGATION, PROCESS_STEP
  processFlowGroup        String?                          // derived from solutionProcessFlowName — groups steps into visual flows

  createdAt               DateTime @default(now())

  // Relations
  scopeItem               ScopeItem @relation(fields: [scopeItemId], references: [id])
  stepResponses           StepResponse[]

  @@index([scopeItemId])
  @@index([scopeItemId, sequence])
  @@index([stepType])
  @@index([solutionProcessName])
}

model ConfigActivity {
  id                    String   @id @default(cuid())
  scopeItemId           String                             // col 9: Main Scope Item ID
  scopeItemDescription  String?                            // col 10

  // From XLSM main sheet columns
  applicationArea       String                             // col 0
  applicationSubarea    String                             // col 1
  configItemName        String                             // col 2
  configItemId          String                             // col 3
  activityDescription   String   @db.Text                  // col 4
  selfService           Boolean                            // col 5: "Yes" → true
  configApproach        String?  @db.Text                  // col 6
  category              String                             // col 7: "Mandatory" | "Recommended" | "Optional" | ""
  activityId            String                             // col 8
  localizationScope     String?                            // col 11
  countrySpecific       String?                            // col 12
  alternateActivityId   String?                            // col 13
  componentId           String?                            // col 14
  redoInProduction      String?                            // col 15
  deleteCustomerRecords String?                            // col 16
  additionalInfo        String?  @db.Text                  // col 17
  fileUploadEnabled     String?                            // col 18

  createdAt             DateTime @default(now())

  // Relations
  scopeItem             ScopeItem @relation(fields: [scopeItemId], references: [id])

  @@index([scopeItemId])
  @@index([applicationArea])
  @@index([category])
  @@index([selfService])
}

model ImgActivity {
  id                      String   @id @default(cuid())
  businessCatalogId       String                           // col 0
  description             String                           // col 1
  transactionCode         String?                          // col 2
  iamAppId                String?                          // col 3
  imgActivity             String?                          // col 4
  explanatoryText         String?  @db.Text                // col 5
  sscuiId                 String?                          // col 6
  businessCatalogComponentId String?                       // col 7
  imgActivityAch          String?                          // col 8

  createdAt               DateTime @default(now())

  @@index([sscuiId])
  @@index([businessCatalogId])
}

model SetupGuide {
  id              String   @id @default(cuid())
  scopeItemId     String   @unique
  filename        String                                   // original filename
  fileSize        Int                                      // bytes
  pdfBlob         Bytes    @db.ByteA                       // stored PDF binary
  pageCount       Int?                                     // extracted via PDF parser
  createdAt       DateTime @default(now())

  scopeItem       ScopeItem @relation(fields: [scopeItemId], references: [id])
}

model GeneralFile {
  id              String   @id @default(cuid())
  filename        String
  fileType        String                                   // "upload_template" | "brd" | "template" | "other"
  fileSize        Int
  blob            Bytes    @db.ByteA
  relatedScopeIds String[]                                 // scope items this file relates to
  createdAt       DateTime @default(now())

  @@index([fileType])
}

model SolutionLink {
  id              String   @id @default(cuid())
  bomId           String                                   // e.g., "BOM.170"
  title           String
  entityId        String                                   // scope item ID or entity ID
  country         String                                   // "XX" or country code
  language        String                                   // "EN"
  url             String
  type            String                                   // "scenario" | "process"
  createdAt       DateTime @default(now())

  @@index([entityId])
  @@index([type])
}

model ExpertConfig {
  id              String   @id @default(cuid())
  scopeItemId     String
  sheetName       String                                   // original sheet name in XLSM
  rowCount        Int
  content         Json                                     // full sheet content as JSON array of rows
  createdAt       DateTime @default(now())

  scopeItem       ScopeItem @relation(fields: [scopeItemId], references: [id])

  @@index([scopeItemId])
}

model OtherFile {
  id              String   @id @default(cuid())
  filename        String
  path            String                                   // full path within ZIP
  fileSize        Int
  blob            Bytes    @db.ByteA
  createdAt       DateTime @default(now())
}

model ReadmeFile {
  id              String   @id @default(cuid())
  filename        String                                   // "README.rtf"
  content         String   @db.Text                        // extracted text content
  blob            Bytes    @db.ByteA                       // original binary
  createdAt       DateTime @default(now())
}
```

---

## Layer 2: Intelligence Layer (Manually Populated)

```prisma
model IndustryProfile {
  id                    String   @id @default(cuid())
  code                  String   @unique                   // e.g., "manufacturing"
  name                  String                             // e.g., "Manufacturing"
  description           String   @db.Text
  applicableScopeItems  String[]                           // array of scope item IDs
  typicalScopeCount     Int
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
}

model EffortBaseline {
  id                    String   @id @default(cuid())
  scopeItemId           String
  complexity            String                             // "low" | "medium" | "high"
  implementationDays    Float                              // total effort in person-days
  configDays            Float
  testDays              Float
  dataMigrationDays     Float
  trainingDays          Float
  notes                 String?  @db.Text
  source                String?                            // e.g., "Average of 12 past implementations"
  confidence            Float                              // 0.0 to 1.0
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  @@unique([scopeItemId, complexity])
  @@index([scopeItemId])
}

model ExtensibilityPattern {
  id                    String   @id @default(cuid())
  gapPattern            String   @db.Text                  // description of the common gap
  resolutionType        String                             // KEY_USER | BTP | ISV | CUSTOM_ABAP | NOT_POSSIBLE
  resolutionDescription String   @db.Text
  effortDays            Float
  recurringCostAnnual   Float    @default(0)
  riskLevel             String                             // "low" | "medium" | "high"
  sapSupported          Boolean
  upgradeSafe           Boolean
  examples              String[] @db.Text
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  @@index([resolutionType])
}

model AdaptationPattern {
  id                    String   @id @default(cuid())
  commonGap             String   @db.Text
  sapApproach           String   @db.Text
  adaptEffort           String   @db.Text
  extendEffort          String   @db.Text
  recommendation        String                             // "ADAPT" | "EXTEND"
  rationale             String   @db.Text
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
}
```

---

## Layer 3: Assessment Data (Client-Facing)

```prisma
model Assessment {
  id                    String   @id @default(cuid())
  companyName           String
  industry              String                             // links to IndustryProfile.code
  country               String                             // primary country
  operatingCountries    String[]                           // all countries
  companySize           String                             // "small" | "midsize" | "large" | "enterprise"
  revenueBand           String?
  currentErp            String?                            // "sap_ecc" | "oracle" | "none" | "other"
  sapVersion            String   @default("2508")          // SAP Best Practices version used
  status                String   @default("draft")         // "draft" | "in_progress" | "completed" | "reviewed" | "signed_off"
  createdBy             String                             // user ID
  organizationId        String                             // links to Organization.id — scopes all access
  deletedAt             DateTime?                          // soft delete
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  // Relations
  organization          Organization @relation(fields: [organizationId], references: [id])
  stakeholders          AssessmentStakeholder[]
  scopeSelections       ScopeSelection[]
  stepResponses         StepResponse[]
  gapResolutions        GapResolution[]
  decisionLog           DecisionLogEntry[]
  signOffs              AssessmentSignOff[]
  flowDiagrams          ProcessFlowDiagram[]
  remainingItems        RemainingItem[]

  @@index([status])
  @@index([createdBy])
  @@index([organizationId])
  @@index([deletedAt])
}

model AssessmentStakeholder {
  id                    String   @id @default(cuid())
  assessmentId          String
  userId                String                             // links to User.id
  name                  String
  email                 String
  role                  String                             // "process_owner" | "it_lead" | "executive" | "consultant"
  assignedAreas         String[]                           // functional areas this person owns (e.g., ["Finance", "Procurement"])
  canEdit               Boolean  @default(true)            // false for read-only roles (executive, it_lead)
  lastActiveAt          DateTime?
  invitedAt             DateTime @default(now())
  invitedBy             String                             // user ID of who invited them
  acceptedAt            DateTime?                          // when they first logged in via magic link
  createdAt             DateTime @default(now())

  assessment            Assessment @relation(fields: [assessmentId], references: [id])
  user                  User @relation(fields: [userId], references: [id])

  @@unique([assessmentId, email])
  @@index([assessmentId])
  @@index([userId])
}

model ScopeSelection {
  id                    String   @id @default(cuid())
  assessmentId          String
  scopeItemId           String
  selected              Boolean                            // true = in scope
  relevance             String                             // "YES" | "NO" | "MAYBE"
  currentState          String?                            // "MANUAL" | "SYSTEM" | "OUTSOURCED" | "NA"
  notes                 String?  @db.Text
  respondent            String?                            // stakeholder email
  respondedAt           DateTime?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  assessment            Assessment @relation(fields: [assessmentId], references: [id])

  @@unique([assessmentId, scopeItemId])
  @@index([assessmentId])
  @@index([assessmentId, selected])
}

model StepResponse {
  id                    String   @id @default(cuid())
  assessmentId          String
  processStepId         String
  fitStatus             String                             // "FIT" | "CONFIGURE" | "GAP" | "NA" | "PENDING"
  clientNote            String?  @db.Text                  // free-text description of current process
  currentProcess        String?  @db.Text                  // how they do it today
  respondent            String?                            // stakeholder email
  respondedAt           DateTime?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  assessment            Assessment @relation(fields: [assessmentId], references: [id])
  processStep           ProcessStep @relation(fields: [processStepId], references: [id])

  @@unique([assessmentId, processStepId])
  @@index([assessmentId])
  @@index([assessmentId, fitStatus])
}

model GapResolution {
  id                    String   @id @default(cuid())
  assessmentId          String
  processStepId         String                             // which step has the gap
  scopeItemId           String                             // denormalized for querying
  gapDescription        String   @db.Text                  // what the client needs that SAP doesn't do
  resolutionType        String                             // "FIT" | "CONFIGURE" | "KEY_USER_EXT" | "BTP_EXT" | "ISV" | "CUSTOM_ABAP" | "ADAPT_PROCESS" | "OUT_OF_SCOPE"
  resolutionDescription String   @db.Text
  effortDays            Float?
  costEstimate          Json?                              // { onetime: number, recurring: number }
  riskLevel             String?                            // "low" | "medium" | "high"
  upgradeImpact         String?  @db.Text
  decidedBy             String?                            // user email
  decidedAt             DateTime?
  clientApproved        Boolean  @default(false)
  rationale             String?  @db.Text                  // required — why this resolution was chosen
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  assessment            Assessment @relation(fields: [assessmentId], references: [id])

  @@index([assessmentId])
  @@index([assessmentId, resolutionType])
  @@index([scopeItemId])
}

model DecisionLogEntry {
  id                    String   @id @default(cuid())
  assessmentId          String
  entityType            String                             // "scope_item" | "process_step" | "gap" | "config_activity" | "assessment" | "stakeholder" | "sign_off" | "remaining_item"
  entityId              String
  action                String                             // "MARKED_FIT" | "MARKED_GAP" | "RESOLUTION_SELECTED" | "RESOLUTION_CHANGED" | "SCOPE_INCLUDED" | "SCOPE_EXCLUDED" | "NOTE_ADDED" | "APPROVED" | "SIGNED_OFF" | "STAKEHOLDER_ADDED" | "STAKEHOLDER_REMOVED" | "MFA_ENROLLED" | "SESSION_REVOKED" | "PERMISSION_OVERRIDE" | "REMAINING_ITEM_ADDED" | "FLOW_DIAGRAM_GENERATED"
  oldValue              Json?
  newValue              Json
  actor                 String                             // user email
  actorRole             String                             // "process_owner" | "it_lead" | "executive" | "consultant" | "admin"
  timestamp             DateTime @default(now())
  reason                String?  @db.Text

  assessment            Assessment @relation(fields: [assessmentId], references: [id])

  // APPEND-ONLY: No @@updatedAt, no soft-delete
  // This table MUST NOT have UPDATE or DELETE operations in any query

  @@index([assessmentId])
  @@index([assessmentId, entityType])
  @@index([assessmentId, actor])
  @@index([timestamp])
}

model AssessmentSignOff {
  id                    String   @id @default(cuid())
  assessmentId          String
  signatoryName         String
  signatoryEmail        String
  signatoryRole         String                             // "client_representative" | "bound_consultant" | "bound_pm"
  signatoryTitle        String?                            // job title
  acknowledgement       Boolean  @default(true)            // explicit acknowledgement captured
  signedAt              DateTime @default(now())
  ipAddress             String?                            // IP at time of signing
  userAgent             String?                            // browser UA at time of signing

  assessment            Assessment @relation(fields: [assessmentId], references: [id])

  @@unique([assessmentId, signatoryRole])                  // one signature per role per assessment
  @@index([assessmentId])
}

model ProcessFlowDiagram {
  id                    String   @id @default(cuid())
  assessmentId          String
  scopeItemId           String                             // which scope item this diagram represents
  processFlowName       String                             // the solutionProcessFlowName grouping
  svgContent            String   @db.Text                  // generated SVG markup
  pdfBlob               Bytes?   @db.ByteA                 // optional pre-rendered PDF binary
  diagramType           String   @default("sequential")    // "sequential" — sequential annotated flow (NOT BPMN)
  stepCount             Int                                // total steps in this flow
  fitCount              Int                                // steps marked FIT
  configureCount        Int                                // steps marked CONFIGURE
  gapCount              Int                                // steps marked GAP
  naCount               Int                                // steps marked N/A
  pendingCount           Int                               // steps not yet reviewed
  generatedAt           DateTime @default(now())
  generatedBy           String                             // user who triggered generation

  assessment            Assessment @relation(fields: [assessmentId], references: [id])

  @@unique([assessmentId, scopeItemId, processFlowName])
  @@index([assessmentId])
  @@index([assessmentId, scopeItemId])
}

model RemainingItem {
  id                    String   @id @default(cuid())
  assessmentId          String
  category              String                             // "unreviewed_step" | "maybe_scope" | "excluded_recommended_config" | "out_of_scope_gap" | "integration_point" | "data_migration" | "custom_requirement"
  title                 String                             // short descriptive title
  description           String   @db.Text                  // detailed description of what remains
  severity              String                             // "critical" | "high" | "medium" | "low"
  sourceEntityType      String?                            // "scope_item" | "process_step" | "gap" | "config_activity"
  sourceEntityId        String?                            // ID of the entity this item came from
  scopeItemId           String?                            // scope item context (if applicable)
  functionalArea        String?                            // functional area context
  assignedTo            String?                            // stakeholder email or team
  resolution            String?  @db.Text                  // how this item was eventually resolved (post-assessment)
  resolvedAt            DateTime?
  resolvedBy            String?                            // user email
  autoGenerated         Boolean  @default(false)           // true if system-generated from assessment data
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  assessment            Assessment @relation(fields: [assessmentId], references: [id])

  @@index([assessmentId])
  @@index([assessmentId, category])
  @@index([assessmentId, severity])
  @@index([scopeItemId])
}
```

---

## Layer 4: Authentication & Authorization

```prisma
model User {
  id                    String   @id @default(cuid())
  email                 String   @unique
  name                  String
  role                  String                             // "process_owner" | "it_lead" | "executive" | "consultant" | "admin"
  organizationId        String?                            // null for internal users (consultant, admin) who aren't org-bound
  isActive              Boolean  @default(true)            // can be deactivated without deletion
  avatarUrl             String?

  // MFA (TOTP-based, mandatory for external users)
  totpSecret            String?                            // encrypted TOTP secret (base32)
  totpVerified          Boolean  @default(false)           // true after first successful TOTP verification
  totpVerifiedAt        DateTime?                          // when TOTP was first verified
  mfaEnabled            Boolean  @default(false)           // true when MFA setup is complete
  mfaMethod             String   @default("none")          // "none" | "totp" | "webauthn" — totp is mandatory for external

  // WebAuthn (optional, upgrade path)
  webauthnCredentials   WebAuthnCredential[]

  // Tracking
  lastLoginAt           DateTime?
  lastLoginIp           String?
  loginCount            Int      @default(0)
  invitedBy             String?                            // user ID who created this account
  invitedAt             DateTime?

  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  // Relations
  organization          Organization? @relation(fields: [organizationId], references: [id])
  sessions              Session[]
  mfaChallenges         MfaChallenge[]
  stakeholderEntries    AssessmentStakeholder[]

  @@index([role])
  @@index([organizationId])
  @@index([email])
}

model Organization {
  id                    String   @id @default(cuid())
  name                  String
  type                  String                             // "client" | "internal"
  domain                String?                            // e.g., "acme.com" — for email domain validation
  logoUrl               String?
  isActive              Boolean  @default(true)
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  // Relations
  users                 User[]
  assessments           Assessment[]
}

model Session {
  id                    String   @id @default(cuid())
  userId                String
  token                 String   @unique                   // session token (httpOnly cookie value)
  expiresAt             DateTime                           // session expiry
  mfaVerified           Boolean  @default(false)           // true after TOTP verified in this session
  mfaVerifiedAt         DateTime?

  // Device/context tracking for concurrent session detection
  ipAddress             String?
  userAgent             String?
  deviceFingerprint     String?                            // hashed device fingerprint
  lastActiveAt          DateTime @default(now())

  // Concurrent session control
  isRevoked             Boolean  @default(false)           // true when session forcibly invalidated
  revokedAt             DateTime?
  revokedReason         String?                            // "concurrent_login" | "admin_action" | "mfa_reset" | "user_logout"

  createdAt             DateTime @default(now())

  user                  User @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([token])
  @@index([userId, isRevoked])
  @@index([expiresAt])
}

model MfaChallenge {
  id                    String   @id @default(cuid())
  userId                String
  challengeType         String                             // "totp_setup" | "totp_verify" | "webauthn_verify"
  code                  String?                            // for TOTP: the expected code (hashed)
  attempts              Int      @default(0)               // failed attempts counter
  maxAttempts           Int      @default(5)               // lockout threshold
  expiresAt             DateTime                           // challenge expiry (5 minutes for TOTP)
  completedAt           DateTime?                          // when successfully completed
  ipAddress             String?

  createdAt             DateTime @default(now())

  user                  User @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([expiresAt])
}

model WebAuthnCredential {
  id                    String   @id @default(cuid())
  userId                String
  credentialId          String   @unique                   // base64url-encoded credential ID
  publicKey             Bytes    @db.ByteA                 // COSE public key
  counter               Int      @default(0)               // signature counter for clone detection
  deviceType            String?                            // "platform" | "cross-platform"
  deviceName            String?                            // user-provided name: "MacBook Pro", "YubiKey"
  backedUp              Boolean  @default(false)           // multi-device credential
  transports            String[]                           // "usb" | "ble" | "nfc" | "internal"
  lastUsedAt            DateTime?
  createdAt             DateTime @default(now())

  user                  User @relation(fields: [userId], references: [id])

  @@index([userId])
}

model MagicLinkToken {
  id                    String   @id @default(cuid())
  email                 String
  token                 String   @unique                   // opaque random token
  expiresAt             DateTime                           // 15 minutes from creation
  usedAt                DateTime?                          // null until redeemed
  ipAddress             String?                            // IP that requested the link
  assessmentId          String?                            // optional: pre-link to a specific assessment for onboarding
  createdAt             DateTime @default(now())

  @@index([email])
  @@index([token])
  @@index([expiresAt])
}
```

---

## Permission Model — Area-Locked Editing

The permission model is enforced at the API middleware layer, not in the database. The database stores the facts; the middleware interprets them.

### Role Capabilities

| Role | View All | Edit Own Area | Edit Any Area | Manage Stakeholders | Generate Reports | Admin Actions |
|------|----------|---------------|---------------|--------------------|--------------------|---------------|
| `process_owner` | Yes | Yes | No | No | No | No |
| `it_lead` | Yes | No (read + technical notes only) | No | No | No | No |
| `executive` | Yes (dashboard only) | No | No | No | Yes (download) | No |
| `consultant` | Yes | Yes (override, audit-logged) | Yes (override, audit-logged) | Yes | Yes | No |
| `admin` | Yes | Yes | Yes | Yes | Yes | Yes |

### Area-Lock Enforcement Rules

1. **Process owners** can only create/update `StepResponse` records for `ProcessStep` records whose parent `ScopeItem.functionalArea` is in their `AssessmentStakeholder.assignedAreas`.
2. **Process owners** can only create/update `ScopeSelection` records for `ScopeItem` records whose `functionalArea` is in their `assignedAreas`.
3. **IT leads** can add technical notes (`clientNote`) to any step but cannot change `fitStatus`.
4. **Executives** have read-only access to all assessment data plus report downloads.
5. **Consultants** can override area locks — every override is logged to DecisionLogEntry with action `"PERMISSION_OVERRIDE"` and the `reason` field is **required**.
6. **Admins** have unrestricted access. All admin mutations are logged.

### Concurrent Session Rules

1. Each user may have at most **one active session** at a time.
2. When a new login occurs for a user with an existing active session:
   - The existing session is revoked (`isRevoked = true`, `revokedReason = "concurrent_login"`).
   - A DecisionLogEntry is created with action `"SESSION_REVOKED"`.
3. This prevents credential sharing — if two people try to use the same account, one gets logged out.
4. Session revocation is immediate; the revoked session's next API call returns 401.

### MFA Enforcement Rules

1. **External users** (process_owner, it_lead, executive): TOTP MFA is **mandatory**.
   - On first login after account creation, user is redirected to `/mfa/setup`.
   - MFA setup shows QR code (TOTP secret), requires entering a valid code to confirm.
   - Subsequent logins: after magic link verification, user must enter TOTP code.
   - Session is only fully authenticated (`mfaVerified = true`) after TOTP check.
   - All API calls check `session.mfaVerified` — unauthenticated MFA returns 403 `MFA_REQUIRED`.
2. **Internal users** (consultant, admin): TOTP MFA is **recommended** but optional.
   - If `mfaEnabled = true`, TOTP is required at login.
   - If `mfaEnabled = false`, magic link alone is sufficient.
3. **WebAuthn** is an optional upgrade for any user.
   - Available after TOTP is set up.
   - Replaces TOTP for the verification step (not the initial setup).

---

## Indices Rationale

Every index serves a specific query pattern:
- `scopeItemId` on ProcessStep, ConfigActivity: filtered listing of steps/configs per scope item
- `assessmentId` on all assessment tables: all data for one assessment
- `organizationId` on Assessment: all assessments for one client company
- `fitStatus`, `resolutionType`, `category`: aggregation queries for dashboards and reports
- `timestamp` on DecisionLogEntry: chronological audit trail export
- `actor` on DecisionLogEntry: "who changed what" queries
- `userId` on Session: concurrent session lookup
- `token` on Session, MagicLinkToken: fast token-based authentication
- `expiresAt` on Session, MfaChallenge, MagicLinkToken: cleanup of expired records
- `assessmentId, scopeItemId` on ProcessFlowDiagram: flow diagram lookup per scope item
- `assessmentId, category` on RemainingItem: remaining items by type
- `assessmentId, severity` on RemainingItem: remaining items by priority

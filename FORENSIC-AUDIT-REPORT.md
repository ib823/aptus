# ABEAM V2 — FORENSIC CODEBASE AUDIT & SYNERGY VALIDATION

> **Generated**: 2026-03-01 | **Mode**: Static analysis only (read-only) | **Scope**: Every layer from database to browser

> **Reconciliation (2026-05-16):** Several inventory entries below are
> stale after the security/scope changes on branch
> `claude/codebase-assessment-F0dPB`. The original content is preserved
> for historical reference; the most important corrections:
>
> - **Stripe / Phase 29 removed.** `src/lib/commercial/stripe-client.ts`,
>   `src/app/api/stripe/*`, `src/app/api/webhooks/stripe/*`, the
>   `StripeWebhookEvent` table, `Organization.stripeCustomerId /
>   stripeSubscriptionId / billingEmail`, `UsageEvent.stripeSent /
>   stripeError`, `tests/helpers/stripe.ts`, `tests/unit/billing/
>   stripe-webhooks.test.ts`, and `tests/unit/state-machines/
>   subscription-lifecycle.test.ts` are gone. Plan / limits / trial /
>   usage scaffolding stays for internal feature gating.
> - **`Session.token` → `Session.tokenHash`** (SHA-256). The DB never
>   sees the unhashed token after the migration
>   `20260516220000_session_token_hashing`.
> - **Phase 17 SSO is scaffolded but NOT wired.** `auth-options.ts`
>   still only registers `EmailProvider`; SSO config UI / DB fields
>   exist but no NextAuth OAuth/SAML provider is registered.
> - **Hierarchy tables (`SolutionProcess` / `ProcessFlow` / `Activity`)
>   are populated by `scripts/extract-hierarchy-entities.ts`** — see
>   `docs/runbooks/hierarchy-extraction.md`. Until this runs in a given
>   environment they ship empty by design.
> - **ConversationTemplate** is now seeded by `prisma/seed.ts`.

---

## TABLE OF CONTENTS

1. [Executive Summary](#1-executive-summary)
2. [Database Schema — Complete Model Inventory](#2-database-schema--complete-model-inventory)
3. [Route Tree — Complete Map](#3-route-tree--complete-map)
4. [Assessment Flow — Head to Tail](#4-assessment-flow--head-to-tail)
5. [Data Relationships](#5-data-relationships)
6. [SAP Content Pipeline](#6-sap-content-pipeline)
7. [Insertion Points for UX Enhancements](#7-insertion-points-for-ux-enhancements)
8. [Spec vs. Reality — Gap Analysis](#8-spec-vs-reality--gap-analysis)
9. [Test Coverage](#9-test-coverage)
10. [Deployment State](#10-deployment-state)
11. [Critical Findings](#11-critical-findings)
12. [Recommended Sequence](#12-recommended-sequence)

---

## 1. EXECUTIVE SUMMARY

ABEAM V2 is a Next.js 15 / React 19 SAP readiness assessment platform. It guides organizations through scoping SAP business processes, reviewing individual process steps against current operations, resolving gaps, and producing handoff deliverables.

### Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 15.5.12 |
| UI | React + shadcn/ui + Tailwind | 19 |
| ORM | Prisma | 6.19.2 |
| Database | PostgreSQL | — |
| Auth | NextAuth v4 + custom session layer | — |
| Payments | _(removed 2026-05-16 — no paid billing)_ | — |
| Validation | Zod | 4.3.6 |
| Testing | Vitest + Playwright | 4.0.18 / 1.58.2 |
| Animation | Motion | — |
| Reports | jsPDF + ExcelJS | — |
| PWA | Service Worker + idb-keyval | — |

### Build Status

- **V1 Phases 0–9**: ALL COMPLETE (197 tests, 69 routes)
- **V2 Phases 10–31**: ALL 22 PHASES MARKED COMPLETE in `BUILD-PHASES-STATUS.md`
- **TypeScript strict mode**: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`
- **Quality gate**: 0 TS errors, 0 lint warnings per `HANDOFF.md`

### Scale

| Metric | Count |
|--------|-------|
| Prisma models | 67 |
| API route files | 166 |
| Page routes | 62 |
| Components (`.tsx`) | 233 across 32 domains |
| Lib files (`.ts`) | 104 |
| Test files | 107 (64 unit, 10 integration, 25 e2e, 4 security, 3 perf, 1 a11y) |
| Scripts | 13 |
| Migrations | 11 |

### Context for This Audit

Three planned UX enhancements require precise knowledge of the existing system:

1. **Business Process Area grouping** — A layer above activities/steps
2. **Business question abstraction** — Collapsing hundreds of SAP test script steps into 20–40 meaningful decisions
3. **Implications panel** — Showing modules, configuration, master data, and dependencies per classification choice

This audit maps every layer to identify exactly where those enhancements insert.

---

## 2. DATABASE SCHEMA — COMPLETE MODEL INVENTORY

**File**: `prisma/schema.prisma` (1994 lines, 67 models)

### Layer 1: SAP Catalog (Ingested from ZIP)

| Model | PK | Key Fields | Purpose |
|-------|-----|-----------|---------|
| `ScopeItem` | `id` (e.g. "J60") | `name`, `nameClean`, `functionalArea`, `subArea`, `country`, `totalSteps`, `purposeHtml`, `overviewHtml` | Top-level SAP business process package |
| `SolutionProcess` | cuid | `scopeItemId` FK, `guid`, `name`, `sequence` | Hierarchy L2: groups ProcessFlows within a ScopeItem |
| `ProcessFlow` | cuid | `solutionProcessId` FK, `guid`, `name`, `flowDiagramGuid`, `flowDiagramName`, `sequence` | Hierarchy L3: groups Activities |
| `Activity` | cuid | `processFlowId` FK, `guid`, `title`, `targetName`, `targetUrl`, `sequence` | Hierarchy L4: groups ProcessSteps |
| `ProcessStep` | cuid | `scopeItemId` FK, `activityId` FK, `sequence`, `actionTitle`, `actionInstructionsHtml`, `actionExpectedResult`, `stepType`, `stepCategory`, `parsedContent` (Json), `isClassifiable`, `groupKey`, `groupLabel` | Individual test step. 13 deprecated flat-hierarchy columns retained for rollback safety (planned removal May 2026) |
| `ConfigActivity` | cuid | `scopeItemId`, `applicationArea`, `applicationSubarea`, `configItemName`, `category` (Mandatory/Recommended/Optional), `selfService`, `activityDescription` | SAP configuration activity. `scopeItemId` can be "All" or comma-separated — no FK |
| `ImgActivity` | cuid | `businessCatalogId`, `sscuiId`, `transactionCode` | IMG (Implementation Guide) activity metadata |
| `SetupGuide` | cuid | `scopeItemId` (unique FK), `filename`, `pdfBlob`, `pageCount` | PDF setup guide stored as bytea |
| `GeneralFile` | cuid | `filename`, `fileType`, `blob`, `relatedScopeIds[]` | General reference files from SAP ZIP |
| `SolutionLink` | cuid | `bomId`, `entityId`, `url`, `type` | SAP learning/reference links |
| `ExpertConfig` | cuid | `scopeItemId`, `sheetName`, `content` (Json) | Expert configuration sheets. No FK (IDs are config activity IDs) |
| `OtherFile` | cuid | `filename`, `path`, `blob` | Miscellaneous files |
| `ReadmeFile` | cuid | `filename`, `content` | README.rtf content |

**Hierarchy**: `ScopeItem` → `SolutionProcess` → `ProcessFlow` → `Activity` → `ProcessStep`

Each level uses a FK chain. ProcessStep has both `scopeItemId` (direct) and `activityId` (hierarchy FK). The 13 deprecated flat columns (`solutionProcessGuid`, `solutionProcessName`, `solutionProcessFlowGuid`, etc.) on ProcessStep are retained for rollback safety.

### Layer 2: Intelligence (Admin-Populated)

| Model | Key Fields | Purpose |
|-------|-----------|---------|
| `IndustryProfile` | `code` (unique), `name`, `applicableScopeItems[]`, `typicalScopeCount` | Industry-specific scope suggestions |
| `EffortBaseline` | `scopeItemId`, `complexity`, `implementationDays`, `configDays`, `testDays`, `dataMigrationDays`, `trainingDays` | Effort estimation baselines. Unique on `[scopeItemId, complexity]` |
| `ExtensibilityPattern` | `gapPattern`, `resolutionType`, `effortDays`, `riskLevel`, `sapSupported`, `upgradeSafe` | Reusable gap resolution patterns |
| `AdaptationPattern` | `commonGap`, `sapApproach`, `adaptEffort`, `extendEffort`, `recommendation` | Adapt vs. extend comparison patterns |

### Layer 3: Assessment Data (Client-Facing)

| Model | Key Fields | Purpose |
|-------|-----------|---------|
| `Assessment` | `companyName`, `industry`, `country`, `companySize`, `status` (default "draft"), `organizationId` FK, `createdBy` + 20 Phase 10 enrichment fields + Phase 31 versioning fields (`parentAssessmentId`, `phaseNumber`, `currentSnapshotId`, `carryForwardConfig`) | Central assessment entity. 30+ fields |
| `AssessmentStakeholder` | `assessmentId` FK, `userId` FK, `role`, `assignedAreas[]`, `canEdit` | Team member assignment with area-locking |
| `ScopeSelection` | `assessmentId` + `scopeItemId` (unique), `selected`, `relevance`, `currentState`, `notes` + Phase 11 fields (`priority`, `businessJustification`, `estimatedComplexity`, `dependsOnScopeItems[]`) | Scope item inclusion/exclusion per assessment |
| `StepResponse` | `assessmentId` + `processStepId` (unique), `fitStatus`, `clientNote`, `currentProcess`, `confidence`, `evidenceUrls[]`, `reviewedBy`, `reviewedAt` | Per-step classification response |
| `GapResolution` | `assessmentId`, `processStepId`, `scopeItemId`, `gapDescription`, `resolutionType`, `priority`, `oneTimeCost`, `recurringCost`, `implementationDays`, `riskCategory`, `upgradeStrategy`, `clientApproved` | Gap analysis with Phase 13 cost model |
| `GapAlternative` | `gapResolutionId` FK, `label`, `resolutionType`, `pros[]`, `cons[]`, costs | Alternative resolution options (cascade delete) |
| `ConfigSelection` | `assessmentId` + `configActivityId` (unique), `included`, `excludeReason` | Config activity inclusion/exclusion |
| `DecisionLogEntry` | `assessmentId`, `entityType`, `entityId`, `action`, `oldValue`, `newValue`, `actor`, `actorRole`, `reason` | Immutable audit trail. 55+ action types |
| `AssessmentSignOff` | `assessmentId` + `signatoryRole` (unique), `signatoryName`, `signatoryEmail`, `acknowledgement`, `ipAddress`, `userAgent` | Legacy sign-off records |
| `ProcessFlowDiagram` | `assessmentId` + `scopeItemId` + `processFlowName` (unique), `svgContent`, `pdfBlob`, `interactiveData` (Json), `thumbnailSvg`, `riskOverlayData` (Json) | Generated flow diagrams |
| `FunctionalAreaOverview` | `assessmentId` + `functionalArea` (unique), `fitCount`, `configureCount`, `gapCount`, `riskScore`, `completionPct`, `crossAreaDeps` (Json) | Aggregated area stats |
| `RemainingItem` | `assessmentId`, `category`, `title`, `severity`, `sourceEntityType`, `sourceEntityId`, `assignedTo`, `resolution` | Outstanding items register |

### Layer 3b: Register Data

| Model | Key Fields | Purpose |
|-------|-----------|---------|
| `IntegrationPoint` | `assessmentId` FK, `name`, `direction` (INBOUND/OUTBOUND/BIDIRECTIONAL), `sourceSystem`, `targetSystem`, `interfaceType`, `frequency`, `middleware`, `complexity`, `estimatedEffortDays` | Integration register entries |
| `DataMigrationObject` | `assessmentId` FK, `objectName`, `objectType`, `sourceSystem`, `sourceFormat`, `volumeEstimate`, `cleansingRequired`, `mappingComplexity`, `migrationApproach`, `migrationTool`, `dependsOn[]` | Data migration register entries |
| `OcmImpact` | `assessmentId` FK, `impactedRole`, `changeType`, `severity`, `trainingRequired`, `trainingType`, `resistanceRisk`, `readinessScore`, `mitigationStrategy` | Change management impacts |

### Layer 4: Auth & Authorization

| Model | Key Fields | Purpose |
|-------|-----------|---------|
| `User` | `email` (unique), `role`, `organizationId` FK, `mfaEnabled`, `mfaMethod`, `totpSecret` (encrypted), `isActive`, `loginCount` + Phase 17 fields (`displayRole`, `jobTitle`, `department`, `phone`) | 30+ fields including collaboration relations |
| `Account` | `userId` FK, `provider`, `providerAccountId` | NextAuth adapter requirement |
| `VerificationToken` | `identifier`, `token`, `expires` | Magic link email flow |
| `Session` | `userId` FK, `tokenHash` (unique SHA-256; was `token` plaintext before 2026-05-16), `expiresAt`, `mfaVerified`, `isRevoked`, `revokedReason`, `ipAddress`, `deviceFingerprint` | Custom session with MFA tracking |
| `MfaChallenge` | `userId` FK, `challengeType`, `code`, `attempts`, `maxAttempts` (5), `expiresAt` | TOTP verification challenges |
| `WebAuthnCredential` | `userId` FK, `credentialId` (unique), `publicKey` (bytea), `counter`, `transports[]` | Passkey/WebAuthn credentials |
| `MagicLinkToken` | `email`, `token` (unique), `expiresAt`, `assessmentId` | Magic link with optional assessment context |
| `Organization` | `name`, `slug` (unique), `orgType`, `plan` (TRIAL/STARTER/PROFESSIONAL/ENTERPRISE), `subscriptionStatus`, `mfaPolicy`, `maxActiveAssessments`, `maxPartnerUsers` + SSO/SCIM fields _(stripeCustomerId / stripeSubscriptionId / billingEmail dropped 2026-05-16)_ | Multi-tenant org; plan is internal-only (no payment processor) |

### Layer 5: Organization Invitations

| Model | Key Fields | Purpose |
|-------|-----------|---------|
| `OrgInvitation` | `organizationId` FK, `email`, `role`, `token` (unique), `status`, `expiresAt` | Invitation workflow |

### Layer 6: Assessment Lifecycle (Phase 18)

| Model | Key Fields | Purpose |
|-------|-----------|---------|
| `AssessmentPhaseProgress` | `assessmentId` + `phase` (unique), `status`, `completionPct`, `blockedReason` | 8-phase progress tracking |
| `WorkshopSession` | `assessmentId` FK, `sessionCode` (unique, 6-char), `title`, `status`, `facilitatorId`, `agenda` (Json), `currentStepId` | Facilitated workshop sessions |
| `WorkshopAttendee` | `sessionId` + `userId` (unique), `role`, `isFollowing`, `isPresenter`, `connectionStatus` | Workshop participant tracking |
| `WorkshopVote` | `sessionId` + `processStepId` + `userId` (unique), `classification`, `confidence` | Per-step classification votes |
| `WorkshopActionItem` | `sessionId` FK, `title`, `assignedTo`, `status`, `priority`, `dueDate` | Workshop follow-up actions |
| `WorkshopMinutes` | `sessionId` (unique FK), `content`, `attendeesSummary`, `decisionsSummary`, `agendaSummary`, `statisticsSummary` | Auto-generated minutes |
| `StatusTransitionLog` | `assessmentId` FK, `fromStatus`, `toStatus`, `triggeredBy`, `triggeredByRole`, `reason` | Immutable transition audit trail |

### Layer 7: Collaboration & Notifications (Phases 19+28)

| Model | Key Fields | Purpose |
|-------|-----------|---------|
| `Notification` | `userId` FK, `type`, `title`, `body`, `channel`, `status`, `deepLink` | In-app + push + email notifications |
| `NotificationPreference` | `userId` + `notificationType` (unique), `channelEmail`, `channelInApp`, `channelPush` | Per-type channel preferences |
| `Comment` | `assessmentId`, `targetType`, `targetId`, `authorId` FK, `content`, `mentions[]`, `parentCommentId` (self-ref), `status` (OPEN), `isDeleted` | Threaded comments with @mentions |
| `Conflict` | `assessmentId`, `entityType`, `entityId`, `classifications` (Json), `status` (OPEN), `resolvedClassification` | Concurrent edit conflict detection |
| `ActivityFeedEntry` | `assessmentId`, `actorId`, `actionType`, `summary`, `entityType`, `entityId`, `areaCode` | Real-time activity stream |
| `PushSubscription` | `userId` FK, `endpoint`, `p256dh`, `auth` | Web push VAPID subscriptions |
| `EditingLock` | `assessmentId` + `entityType` + `entityId` (unique), `lockedById` FK, `expiresAt`, `isActive` | Field-level editing locks (5-min expiry) |
| `PresenceRecord` | `assessmentId` + `userId` (unique), `userName`, `currentPage`, `lastSeenAt` | Who's online and where |

### Phase 22: Conversation Mode

| Model | Key Fields | Purpose |
|-------|-----------|---------|
| `ConversationTemplate` | `scopeItemId` + `processStepId` + `language` (unique), `questionFlow` (Json), `version`, `isActive` | Decision tree templates |
| `ConversationSession` | `assessmentId`, `userId`, `scopeItemId`, `currentQuestionId`, `responses` (Json), `derivedClassifications` (Json), `status` | Active conversation sessions |

### Phase 23: Dashboard

| Model | Key Fields | Purpose |
|-------|-----------|---------|
| `DashboardWidget` | `userId` FK, `widgetType`, `position`, `settings` (Json), `isVisible` | Customizable dashboard widgets |
| `DashboardDeadline` | `assessmentId`, `title`, `dueDate`, `assignedRole`, `status` | Assessment deadlines |

### Phase 24: Onboarding

| Model | Key Fields | Purpose |
|-------|-----------|---------|
| `OnboardingProgress` | `userId` (unique FK), `role`, `currentStep`, `completedSteps[]`, `isComplete` | Per-user onboarding state |
| `OnboardingTooltip` | `userId` + `tooltipKey` (unique), `dismissedAt` | Dismissed tooltip tracking |

### Phase 25: Reports & Branding

| Model | Key Fields | Purpose |
|-------|-----------|---------|
| `ReportGeneration` | `assessmentId` FK, `reportType`, `status` (generating/completed/failed), `fileUrl`, `fileName` | Report generation tracking |
| `ReportBranding` | `organizationId` (unique FK), `logoUrl`, `primaryColor`, `secondaryColor`, `footerText` | Org-level report branding |

### Phase 29: Commercial & Templates

| Model | Key Fields | Purpose |
|-------|-----------|---------|
| `AssessmentTemplate` | `organizationId` FK, `name`, `industry`, `scopeItemIds[]`, `isDemo`, `isPublished`, `timesUsed` + Phase 26 pattern fields | Reusable assessment templates |
| `UsageEvent` | `organizationId` FK, `eventType`, `entityId` _(stripeSent / stripeError dropped 2026-05-16)_ | Internal usage metering (no payment processor) |

### Phase 30: Sign-Off & Handoff

| Model | Key Fields | Purpose |
|-------|-----------|---------|
| `AssessmentSnapshot` | `assessmentId` + `version` (unique), `snapshotData` (Json), `dataHash`, `reason` | Immutable versioned snapshots |
| `SignOffProcess` | `assessmentId` (unique FK), `snapshotId` (unique FK), `status`, `certificatePdfUrl`, `certificateHash`, `verificationToken` | 5-layer sign-off workflow |
| `AreaValidation` | `signOffId` + `functionalArea` (unique), `validatedById`, `status` (PENDING/APPROVED/REJECTED) | Per-area sign-off |
| `TechnicalValidation` | `signOffId` (unique FK), `itLeadStatus`, `dmLeadStatus` | IT + DM lead validation |
| `CrossFunctionalValidation` | `signOffId` (unique FK), `status`, `conflictsReviewed`, `conflictCount` | Cross-area conflict review |
| `SignatureRecord` | `signOffId` FK, `signatureType` (EXECUTIVE/PARTNER), `documentHash`, `mfaVerified`, `ipAddress`, `authMethod` | Cryptographic signature records |
| `AlmExportRecord` | `assessmentId` FK, `targetSystem` (JIRA/AZURE_DEVOPS/SAP_SOLMAN/CSV), `status`, `exportConfig`, `resultSummary` | ALM system exports |
| `HandoffPackage` | `assessmentId` FK, `snapshotVersion`, `packageType`, `contents[]`, `blobUrl` | Handoff deliverable packages |

### Phase 31: Lifecycle Continuity

| Model | Key Fields | Purpose |
|-------|-----------|---------|
| `ChangeRequest` | `assessmentId` FK, `title`, `reason`, `impactSummary` (Json), `status`, `unlockedEntities` (Json), `previousSnapshotId` FK, `expeditedSignOff` | Post-sign-off change control |
| `ReassessmentTrigger` | `assessmentId` FK, `triggerType` (SAP_UPDATE/REGULATORY_CHANGE/ORG_CHANGE/SCOPE_DRIFT/MANUAL), `title`, `status`, `changeRequestId` | Trigger reassessment workflows |
| `SnapshotComparison` | `baseSnapshotId` + `compareSnapshotId` (unique), `deltaReport` (Json), `summary` (Json) | Version comparison results |

### Phase 26: Analytics & Benchmarking

| Model | Key Fields | Purpose |
|-------|-----------|---------|
| `BenchmarkSnapshot` | `industry` + `companySize` (unique), `avgFitRate`, `avgGapRate`, `commonGaps` (Json), `sampleSize` | Industry benchmarks |
| `PortfolioMetric` | `organizationId` + `metricType` + `period` (unique), `metricValue` (Json) | Partner portfolio metrics |
| `AssessmentPhaseLink` | `phase1AssessmentId` + `phase2AssessmentId` (unique), `clientIdentifier`, `scopeDelta` (Json) | Cross-phase assessment linking |

### Phase 27: Production Hardening

| Model | Key Fields | Purpose |
|-------|-----------|---------|
| `OfflineSyncQueue` | `userId` FK, `assessmentId` FK, `action`, `payload` (Json), `clientId` (unique), `status`, `attempts` | Offline-first sync queue |
| `PerformanceBaseline` | `route` + `metric` + `period` (unique), `p50`, `p75`, `p95`, `sampleSize` | Web Vitals baselines |

### Migration History

| Migration | Scope |
|-----------|-------|
| `20250222000000_wave2_register_enhancements` | IntegrationPoint, DataMigrationObject, OcmImpact |
| `20250222100000_phase17_role_org_enhancements` | Role system, Organization SSO, OrgInvitation |
| `20250222200000_wave4_notifications_collaboration` | Notifications, Comments, Conflicts, Locks, Presence |
| `20250222210000_comment_soft_delete` | Comment `isDeleted`/`deletedAt` fields |
| `20250222300000_wave5_process_visualization` | FunctionalAreaOverview enrichment, ProcessFlowDiagram |
| `20250222400000_wave6_conversation_dashboard_onboarding` | ConversationTemplate, DashboardWidget, OnboardingProgress |
| `20250223100000_wave7_reports_commercial` | ReportGeneration, ReportBranding, AssessmentTemplate, UsageEvent |
| `20250223200000_wave8_signoff_lifecycle` | SignOffProcess, AreaValidation, TechnicalValidation, SignatureRecord, AlmExportRecord, HandoffPackage, ChangeRequest, ReassessmentTrigger |
| `20250223300000_wave9_analytics_benchmarking` | BenchmarkSnapshot, PortfolioMetric, AssessmentPhaseLink |
| `20250223400000_wave10_production_hardening_pwa` | OfflineSyncQueue, PerformanceBaseline |
| `20250224000000_add_step_response_process_step_id_index` | Index on StepResponse.processStepId |

**Seed file**: NOT FOUND (`prisma/seed.ts` does not exist). Data seeded via `scripts/ingest-sap-zip.ts`.

---

## 3. ROUTE TREE — COMPLETE MAP

### API Routes (166 route files)

#### Auth (`/api/auth/`)

| Route | Methods | Purpose |
|-------|---------|---------|
| `[...nextauth]/route.ts` | GET, POST | NextAuth handler (magic link, JWT) |
| `bridge/route.ts` | — | JWT → custom session conversion |
| `logout/route.ts` | POST | Session revocation |
| `signup/route.ts` | POST | Self-service signup (Phase 29) |
| `test-login/route.ts` | POST | Dev-only test login |
| `mfa/setup/route.ts` | GET, POST | TOTP enrollment |
| `mfa/verify/route.ts` | POST | TOTP verification |
| `mfa/status/route.ts` | GET | MFA enrollment status |
| `webauthn/register/options/route.ts` | POST | WebAuthn registration challenge |
| `webauthn/register/verify/route.ts` | POST | WebAuthn registration verify |
| `webauthn/authenticate/options/route.ts` | POST | WebAuthn auth challenge |
| `webauthn/authenticate/verify/route.ts` | POST | WebAuthn auth verify |
| `webauthn/credentials/route.ts` | GET | List passkeys |
| `webauthn/credentials/[credentialId]/route.ts` | DELETE | Remove passkey |

#### Assessment CRUD (`/api/assessments/`)

| Route | Methods | Purpose |
|-------|---------|---------|
| `route.ts` | GET, POST | List/create assessments |
| `[id]/route.ts` | GET, PUT, DELETE | Single assessment CRUD |
| `[id]/profile/route.ts` | PUT | Company profile update |
| `[id]/stakeholders/route.ts` | GET, POST, DELETE | Team member management |
| `[id]/transitions/route.ts` | POST | Status transitions |
| `[id]/transitions/history/route.ts` | GET | Transition audit log |
| `from-template/[templateId]/route.ts` | POST | Create from template |
| `[id]/clone/route.ts` | POST | Clone assessment |

#### Scope Selection (`/api/assessments/[id]/scope/`)

| Route | Methods | Purpose |
|-------|---------|---------|
| `route.ts` | GET | Get all scope selections |
| `[scopeItemId]/route.ts` | PUT | Toggle scope item |
| `bulk/route.ts` | POST | Bulk select/deselect by area |
| `pre-select/route.ts` | POST | Industry-based pre-selection |
| `impact/route.ts` | GET | Scope change impact analysis |

#### Step Review (`/api/assessments/[id]/steps/`)

| Route | Methods | Purpose |
|-------|---------|---------|
| `route.ts` | GET | Get steps (paginated, filterable) |
| `[stepId]/route.ts` | PUT | Classify step (FIT/CONFIGURE/GAP/NA) |
| `bulk/route.ts` | POST | Bulk classify steps |
| `bulk-all/route.ts` | POST | Classify all steps for scope item |

#### Gap Resolution (`/api/assessments/[id]/gaps/`)

| Route | Methods | Purpose |
|-------|---------|---------|
| `route.ts` | GET | List all gaps |
| `[gapId]/route.ts` | PUT | Update gap resolution |
| `[gapId]/alternatives/route.ts` | POST | Add alternative resolution |
| `[gapId]/alternatives/[altId]/route.ts` | PUT, DELETE | Update/delete alternative |
| `[gapId]/approve/route.ts` | POST | Client approval toggle |
| `[gapId]/suggest/route.ts` | POST | AI-powered suggestions |
| `suggest/route.ts` | POST | Bulk gap suggestions |
| `rollup/route.ts` | GET | Cost/effort rollup |

#### Config Matrix (`/api/assessments/[id]/config/`)

| Route | Methods | Purpose |
|-------|---------|---------|
| `[configActivityId]/route.ts` | PUT | Include/exclude config activity |

#### Registers (`/api/assessments/[id]/`)

| Route | Methods | Purpose |
|-------|---------|---------|
| `integrations/route.ts` | GET, POST | Integration points CRUD |
| `integrations/[integrationId]/route.ts` | PUT, DELETE | Single integration |
| `integrations/summary/route.ts` | GET | Integration stats |
| `data-migration/route.ts` | GET, POST | DM objects CRUD |
| `data-migration/[objectId]/route.ts` | PUT, DELETE | Single DM object |
| `data-migration/summary/route.ts` | GET | DM stats |
| `data-migration/dependency-graph/route.ts` | GET | DM dependency graph |
| `ocm/route.ts` | GET, POST | OCM impacts CRUD |
| `ocm/[impactId]/route.ts` | PUT, DELETE | Single OCM impact |
| `ocm/summary/route.ts` | GET | OCM stats |
| `ocm/heatmap/route.ts` | GET | Change impact heatmap |

#### Process Visualization (`/api/assessments/[id]/flows/`)

| Route | Methods | Purpose |
|-------|---------|---------|
| `route.ts` | GET | List flow diagrams |
| `[flowId]/route.ts` | GET | Get single diagram |
| `[flowId]/interactive/route.ts` | GET | Interactive flow data |
| `[flowId]/pdf/route.ts` | GET | Flow PDF export |
| `scope/[scopeItemId]/route.ts` | GET | Flows for scope item |
| `scope/[scopeItemId]/regenerate/route.ts` | POST | Regenerate diagrams |
| `export/[scopeItemId]/route.ts` | GET | Export (SVG/PNG/PDF) |
| `overview/route.ts` | GET | Functional area overview |
| `overview/regenerate/route.ts` | POST | Regenerate overview |

#### Hierarchy (`/api/assessments/[id]/hierarchy/`)

| Route | Methods | Purpose |
|-------|---------|---------|
| `progress/route.ts` | GET | Activity-level progress |

#### Collaboration (`/api/assessments/[id]/`)

| Route | Methods | Purpose |
|-------|---------|---------|
| `comments/route.ts` | GET, POST | Threaded comments |
| `comments/[commentId]/route.ts` | PUT, DELETE | Edit/delete comment |
| `comments/[commentId]/resolve/route.ts` | POST | Resolve comment |
| `conflicts/route.ts` | GET | List conflicts |
| `conflicts/[conflictId]/resolve/route.ts` | POST | Resolve conflict |
| `conflicts/[conflictId]/escalate/route.ts` | POST | Escalate conflict |
| `locks/route.ts` | GET | Active editing locks |
| `locks/acquire/route.ts` | POST | Acquire lock |
| `locks/release/route.ts` | POST | Release lock |
| `locks/refresh/route.ts` | POST | Refresh lock TTL |
| `presence/route.ts` | GET | Online users |
| `presence/heartbeat/route.ts` | POST | Presence heartbeat |
| `activity/route.ts` | GET | Activity feed |

#### Conversation Mode (`/api/assessments/[id]/conversation/`)

| Route | Methods | Purpose |
|-------|---------|---------|
| `[scopeItemId]/route.ts` | GET | Get/create conversation session |
| `[scopeItemId]/respond/route.ts` | POST | Submit answer |
| `[scopeItemId]/complete/route.ts` | POST | Complete and apply classifications |
| `sessions/route.ts` | GET | List all sessions |

#### Workshop (`/api/assessments/[id]/workshops/`)

| Route | Methods | Purpose |
|-------|---------|---------|
| `route.ts` | GET, POST | List/create workshops |
| `[sessionId]/route.ts` | GET, PUT | Session details |
| `[sessionId]/start/route.ts` | POST | Start session |
| `[sessionId]/end/route.ts` | POST | End session |
| `[sessionId]/cancel/route.ts` | POST | Cancel session |
| `[sessionId]/navigate/route.ts` | POST | Sync navigation |
| `[sessionId]/stream/route.ts` | GET | SSE real-time stream |
| `[sessionId]/attendees/route.ts` | GET, POST | Attendee management |
| `[sessionId]/attendees/heartbeat/route.ts` | POST | Attendee heartbeat |
| `[sessionId]/attendees/follow/route.ts` | POST | Toggle follow presenter |
| `[sessionId]/votes/route.ts` | GET, POST | Cast votes |
| `[sessionId]/votes/[processStepId]/route.ts` | GET | Step vote tally |
| `[sessionId]/votes/[processStepId]/finalize/route.ts` | POST | Lock classification |
| `[sessionId]/action-items/route.ts` | GET, POST | Action items |
| `[sessionId]/action-items/[itemId]/route.ts` | PUT, DELETE | Update action item |
| `[sessionId]/minutes/route.ts` | GET, PUT | Workshop minutes |

#### Lifecycle (`/api/assessments/[id]/`)

| Route | Methods | Purpose |
|-------|---------|---------|
| `phases/route.ts` | GET | All phase progress |
| `phases/[phase]/route.ts` | PUT | Update phase progress |
| `phases/recalculate/route.ts` | POST | Recalculate completions |
| `snapshots/route.ts` | GET, POST | List/create snapshots |
| `snapshots/compare/route.ts` | POST | Compare two snapshots |
| `change-requests/route.ts` | GET, POST | Change requests |
| `change-requests/[crId]/route.ts` | PUT | Update change request |
| `triggers/route.ts` | GET, POST | Reassessment triggers |
| `triggers/[triggerId]/route.ts` | PUT | Update trigger |

#### Sign-Off (`/api/assessments/[id]/sign-off/`)

| Route | Methods | Purpose |
|-------|---------|---------|
| `route.ts` | GET, PUT | Sign-off status |
| `start/route.ts` | POST | Initiate sign-off process |
| `area-validation/route.ts` | POST | Functional area validation |
| `technical-validation/route.ts` | POST | Technical validation |
| `cross-functional/route.ts` | POST | Cross-functional validation |
| `executive/route.ts` | POST | Executive signature |
| `partner/route.ts` | POST | Partner signature |

#### Handoff (`/api/assessments/[id]/handoff/`)

| Route | Methods | Purpose |
|-------|---------|---------|
| `packages/route.ts` | POST | Generate handoff package |
| `alm-exports/route.ts` | POST | ALM system export (Jira/Azure DevOps/SAP) |

#### Report Generation (`/api/assessments/[id]/report/`)

| Route | Methods | Purpose |
|-------|---------|---------|
| `executive-summary/route.ts` | GET | Executive summary PDF |
| `step-detail/route.ts` | GET | Step detail XLSX |
| `gap-register/route.ts` | GET | Gap register XLSX |
| `config-workbook/route.ts` | GET | Config workbook XLSX |
| `integration-register/route.ts` | GET | Integration register XLSX |
| `dm-register/route.ts` | GET | DM register XLSX |
| `ocm-report/route.ts` | GET | OCM report XLSX |
| `readiness-scorecard/route.ts` | GET | Readiness scorecard PDF |
| `effort-estimate/route.ts` | GET | Effort estimate PDF |
| `flow-atlas/route.ts` | GET | Flow atlas PDF |
| `scope-catalog/route.ts` | GET | Scope catalog XLSX |
| `remaining-register/route.ts` | GET | Remaining items XLSX |
| `audit-trail/route.ts` | GET | Decision audit trail XLSX |
| `sign-off/route.ts` | GET | Sign-off certificate PDF |
| `complete-package/route.ts` | GET | ZIP with all 13 reports |
| `branding/route.ts` | GET, PUT | Report branding config |
| `branding/logo/route.ts` | POST | Logo upload (500KB max) |
| `history/route.ts` | GET | Report generation history |
| `remaining/route.ts` | GET, POST | Remaining items |
| `remaining/auto-generate/route.ts` | POST | Auto-generate remaining items |

#### Admin (`/api/admin/`)

| Route | Methods | Purpose |
|-------|---------|---------|
| `overview/route.ts` | GET | Platform stats |
| `industries/route.ts` | GET, POST | Industry profile CRUD |
| `industries/[industryId]/route.ts` | GET, PUT, DELETE | Single industry |
| `baselines/route.ts` | GET, POST | Effort baselines CRUD |
| `baselines/[baselineId]/route.ts` | GET, PUT, DELETE | Single baseline |
| `extensibility-patterns/route.ts` | GET, POST | Extensibility patterns |
| `extensibility-patterns/[patternId]/route.ts` | GET, PUT, DELETE | Single pattern |
| `adaptation-patterns/route.ts` | GET, POST | Adaptation patterns |
| `adaptation-patterns/[patternId]/route.ts` | GET, PUT, DELETE | Single pattern |
| `assessments/route.ts` | GET | All assessments (admin view) |
| `conversation-templates/route.ts` | GET, POST | Conversation templates |
| `conversation-templates/[templateId]/route.ts` | GET, PUT, DELETE | Single template |
| `organizations/route.ts` | GET | All organizations |
| `organizations/[orgId]/plan/route.ts` | PUT | Change org plan |

#### Other API Routes

| Route | Methods | Purpose |
|-------|---------|---------|
| `catalog/scope-items/[scopeItemId]/steps/route.ts` | GET | Raw SAP steps |
| `catalog/scope-items/[scopeItemId]/configs/route.ts` | GET | Raw SAP configs |
| `catalog/scope-items/[scopeItemId]/hierarchy/route.ts` | GET | Hierarchy tree |
| `catalog/scope-items/[scopeItemId]/html/route.ts` | GET | Raw HTML content |
| `catalog/scope-items/[scopeItemId]/activities/[activityId]/steps/route.ts` | GET | Steps by activity |
| `catalog/setup-guide/[scopeItemId]/route.ts` | GET | Setup guide PDF |
| `catalog/config-activities/route.ts` | GET | All config activities |
| `dashboard/route.ts` | GET | Dashboard data |
| `dashboard/widgets/route.ts` | GET, PUT | Widget customization |
| `dashboard/activity/route.ts` | GET | Activity feed |
| `dashboard/attention/route.ts` | GET | "What needs attention" |
| `dashboard/conflicts/route.ts` | GET | Open conflicts |
| `dashboard/heatmap/[assessmentId]/route.ts` | GET | Progress heatmap |
| `dashboard/kpi/[assessmentId]/route.ts` | GET | KPI panel |
| `dashboard/deadlines/route.ts` | GET, POST | Deadlines |
| `dashboard/deadlines/[deadlineId]/route.ts` | PUT, DELETE | Manage deadline |
| `notifications/route.ts` | GET | List notifications |
| `notifications/[id]/read/route.ts` | POST | Mark read |
| `notifications/[id]/dismiss/route.ts` | POST | Dismiss |
| `notifications/read-all/route.ts` | POST | Mark all read |
| `notifications/unread-count/route.ts` | GET | Unread count |
| `notifications/stream/route.ts` | GET | SSE notification stream |
| `notifications/preferences/route.ts` | GET, PUT | Notification prefs |
| `notifications/push-subscription/route.ts` | POST | Push subscription |
| `onboarding/route.ts` | GET | Onboarding state |
| `onboarding/start/route.ts` | POST | Start onboarding |
| `onboarding/progress/route.ts` | PUT | Update progress |
| `onboarding/complete/route.ts` | POST | Complete onboarding |
| `onboarding/sample-assessment/route.ts` | POST | Create demo assessment |
| `onboarding/tooltips/route.ts` | GET | Tooltip state |
| `onboarding/tooltips/dismiss/route.ts` | POST | Dismiss tooltip |
| `organizations/[orgId]/route.ts` | GET, PUT | Org details |
| `organizations/[orgId]/users/route.ts` | GET | Org users |
| `organizations/[orgId]/users/[userId]/route.ts` | PUT, DELETE | Manage user |
| `organizations/[orgId]/invitations/route.ts` | GET, POST | Org invitations |
| `organizations/[orgId]/sso/route.ts` | GET, PUT | SSO config |
| `invitations/[token]/accept/route.ts` | POST | Accept invitation |
| `roles/route.ts` | GET | Available roles |
| `templates/route.ts` | GET, POST | Assessment templates |
| `templates/[templateId]/route.ts` | GET, PUT, DELETE | Single template |
| `analytics/portfolio/route.ts` | GET | Partner portfolio |
| `analytics/benchmarks/[assessmentId]/route.ts` | GET | Assessment benchmarks |
| `analytics/cross-phase/route.ts` | GET | Cross-phase analytics |
| `analytics/cross-phase/[assessmentId]/route.ts` | GET | Assessment cross-phase |
| `partner/settings/route.ts` | GET | Partner settings |
| `partner/settings/profile/route.ts` | PUT | Partner profile |
| `partner/settings/subscription/route.ts` | GET | Subscription details |
| `partner/settings/usage/route.ts` | GET | Usage metrics |
| ~~`stripe/checkout/route.ts`~~ | — | _removed 2026-05-16_ |
| ~~`stripe/portal/route.ts`~~ | — | _removed 2026-05-16_ |
| ~~`webhooks/stripe/route.ts`~~ | — | _removed 2026-05-16_ |
| `workshops/join/route.ts` | POST | Join workshop by code |
| `sync/route.ts` | POST | Offline sync queue processor |
| `push/subscribe/route.ts` | POST | Push notification subscribe |
| `health/route.ts` | GET | Health check |
| `cron/analytics/route.ts` | POST | Analytics cron job |
| `performance/report/route.ts` | GET | Performance baselines |

### Page Routes (62 pages)

#### Auth Pages (`(auth)/`)

| Route | Component | Purpose |
|-------|-----------|---------|
| `/login` | LoginPage | Magic link sign-in |
| `/mfa/setup` | MfaSetupPage | TOTP enrollment |
| `/mfa/verify` | MfaVerifyPage | TOTP verification |

#### Public Pages (`(public)/`)

| Route | Component | Purpose |
|-------|-----------|---------|
| `/pricing` | PricingPage | Plan comparison |
| `/signup` | SignupPage | Self-service registration |
| `/verify/[token]` | VerifyPage | Email verification |

#### Portal Pages (`(portal)/`)

| Route | Component | Purpose |
|-------|-----------|---------|
| `/assessments` | AssessmentListPage | Assessment list |
| `/assessments/new` | NewAssessmentPage | Create assessment |
| `/assessment` | AssessmentRedirect | Assessment index redirect |
| `/dashboard` | DashboardPage | Role-aware dashboard |
| `/onboarding` | OnboardingPage | Onboarding wizard |
| `/organization` | OrgPage | Organization settings |
| `/organization/users` | OrgUsersPage | User management |
| `/settings` | SettingsPage | User settings |
| `/settings/security` | SecurityPage | MFA/passkey management |
| `/settings/notifications` | NotificationsPage | Notification preferences |
| `/settings/subscription` | SubscriptionPage | Billing management |
| `/templates` | TemplatesPage | Assessment templates |
| `/workshops/[sessionId]` | WorkshopDirectPage | Direct workshop join |
| `/workshops/join` | WorkshopJoinPage | Join via code |

#### Assessment Pages (`(portal)/assessment/[id]/`)

| Route | Component | Purpose |
|-------|-----------|---------|
| `/profile` | ProfilePage | Company profile form |
| `/scope` | ScopePage | Scope selection |
| `/review` | ReviewPage | Step review (hierarchy shell) |
| `/review/[scopeItemId]` | ScopedReviewPage | Scope-item-specific review |
| `/gaps` | GapsPage | Gap resolution |
| `/config` | ConfigPage | Configuration matrix |
| `/integrations` | IntegrationsPage | Integration register |
| `/data-migration` | DataMigrationPage | DM register |
| `/ocm` | OcmPage | OCM register |
| `/flows` | FlowsPage | Process flow diagrams |
| `/flows/overview` | FlowOverviewPage | Functional area overview |
| `/process-map` | ProcessMapPage | Process landscape map |
| `/conversation` | ConversationPage | Conversation mode |
| `/workshops` | WorkshopsPage | Workshop list |
| `/workshops/[sessionId]` | WorkshopSessionPage | Active workshop |
| `/report` | ReportPage | Report generation |
| `/sign-off` | SignOffPage | Sign-off dashboard |
| `/snapshots` | SnapshotsPage | Snapshot management |
| `/stakeholders` | StakeholdersPage | Team management |
| `/activity` | ActivityPage | Activity feed |
| `/remaining` | RemainingPage | Remaining items |
| `/change-requests` | ChangeRequestsPage | Change control |
| `/triggers` | TriggersPage | Reassessment triggers |
| `/benchmarks` | BenchmarksPage | Assessment benchmarks |
| `/cross-phase` | CrossPhasePage | Cross-phase analytics |

#### Analytics Pages (`(portal)/analytics/`)

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | AnalyticsPage | Analytics dashboard |
| `/benchmarks/[assessmentId]` | BenchmarkDetailPage | Benchmark detail |
| `/cross-phase/[assessmentId]` | CrossPhaseDetailPage | Cross-phase detail |

#### Admin Pages (`(portal)/admin/`)

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | AdminPage | Admin dashboard |
| `/industries` | IndustriesPage | Industry profile management |
| `/baselines` | BaselinesPage | Effort baselines |
| `/extensibility-patterns` | ExtensibilityPage | Extensibility patterns |
| `/adaptation-patterns` | AdaptationPage | Adaptation patterns |
| `/assessments` | AdminAssessmentsPage | All assessments |
| `/catalog` | CatalogPage | SAP catalog browser |
| `/ingest` | IngestPage | Data ingestion |
| `/verify` | VerifyPage | Data verification |
| `/users` | UsersPage | User management |
| `/organizations` | OrgsPage | Organization management |
| `/organizations/[orgId]` | OrgDetailPage | Organization detail |

#### Other Pages

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | LandingPage | Root page |
| `/offline` | OfflinePage | PWA offline fallback |

---

## 4. ASSESSMENT FLOW — HEAD TO TAIL

### 4.1 Creation

1. **Page**: `/assessments/new` → `NewAssessmentForm` component
   - **File**: `src/components/assessment/NewAssessmentForm.tsx`
2. **API**: `POST /api/assessments`
   - **File**: `src/app/api/assessments/route.ts`
   - **Validation**: `companyName` (1–200 chars), `industry` (min 1), `country` (2–10 chars), `companySize` (enum)
   - **Creates**: Assessment (status: "draft"), Organization (if user has none), AssessmentStakeholder (creator as consultant)
   - **Records**: UsageEvent, checks `checkAssessmentLimit()`
3. **Redirect**: → `/assessment/{id}/profile`

### 4.2 Company Profile

1. **Page**: `/assessment/{id}/profile` → `CompanyProfileForm`
   - **File**: `src/components/profile/CompanyProfileForm.tsx`
2. **API**: `PUT /api/assessments/{id}/profile`
3. **Fields**: 20+ fields across 5 sections (Basic, Scale, Target, Context, Landscape)
4. **Gate**: Profile must reach `PROFILE_COMPLETENESS_GATE` (60%) to unlock scope selection
   - **File**: `src/types/assessment.ts:133` — `export const PROFILE_COMPLETENESS_GATE = 60`
   - **Calculator**: `src/lib/assessment/profile-completeness.ts`

### 4.3 Scope Selection

1. **Page**: `/assessment/{id}/scope` → `ScopeSelectionClient`
   - **File**: `src/components/scope/ScopeSelectionClient.tsx`
2. **Data loading**: `getScopeItemsWithSelections()` + `getIndustryPreSelections()`
   - **File**: `src/lib/db/scope-items.ts`
3. **Views**: List View + Process Landscape Map (toggle via `ProcessLandscapeMap` component)
4. **Selection**: Individual toggle or bulk by functional area or process chain
5. **API**: `PUT /api/assessments/{id}/scope/{scopeItemId}` (individual) or `POST /api/assessments/{id}/scope/bulk` (batch)
6. **Process chains**: `src/constants/process-chains.ts` — 7 functional areas, 19 chains, maps scope items into business workflows

### 4.4 Process Review — THE CORE UX

1. **Page**: `/assessment/{id}/review` → `ReviewShell` (current) or `ReviewClient` (deprecated)
   - **File**: `src/components/review/ReviewShell.tsx` — Uses hierarchy-based navigation
   - **File**: `src/components/review/ReviewClient.tsx` — DEPRECATED, flat/string-based grouping

2. **Hierarchy Navigation**: `HierarchyProvider` → `HierarchyTreeSidebar` + `HierarchyBreadcrumb`
   - **File**: `src/components/hierarchy/HierarchyContext.tsx`
   - **Tree structure**: ScopeItem → SolutionProcess → ProcessFlow → Activity → Steps

3. **Step Data Loading**: `getStepsForScopeItem()` — paginated with cursor, supports `activityId` filter, `hideRepetitive`
   - **File**: `src/lib/db/process-steps.ts`

4. **Step Classification Pipeline**:
   - `classifyStep(stepType)` → `StepCategory` — Maps 8 step types to 7 categories
     - **File**: `src/lib/assessment/step-classifier.ts`
   - `isStepClassifiable(category)` → boolean — BUSINESS_PROCESS, CONFIGURATION, REPORTING, MASTER_DATA = classifiable
   - `parseStepContent(html)` → `ParsedStepContent` — Extracts purpose, prerequisites, systemAccess, roles, masterData, procedure
     - **File**: `src/lib/assessment/content-parser.ts`
   - `getBusinessContextHint(actionTitle, stepCategory)` → plain-English guidance
     - **File**: `src/lib/assessment/business-context.ts`
   - `groupStepsByActivity(steps)` → groups by `activityId` FK
     - **File**: `src/lib/assessment/step-grouper.ts`

5. **StepReviewCard** — THE CORE REVIEW COMPONENT (494 lines)
   - **File**: `src/components/review/StepReviewCard.tsx`
   - **Layout** (decision-first):
     1. Classification grid: 4 buttons (Matches/Needs Adjustment/Doesn't Match/Not Relevant)
     2. "What this step does" — business context hint or parsed purpose
     3. Confidence selector (High/Medium/Low)
     4. Gap detail textarea (min 10 chars required for GAP)
     5. Configure detail textarea
     6. IT Lead notes-only mode
     7. Collapsible "Technical Details for Implementation Team" (collapsed by default unless PENDING)
     8. Related configuration activities with category badges
     9. Activity context with "Open in SAP" link
     10. Comment panel (threaded)
     11. Collaboration: StepConflictBanner + ActiveEditors

6. **API**: `PUT /api/assessments/{id}/steps/{stepId}`
   - **File**: `src/app/api/assessments/[id]/steps/[stepId]/route.ts`
   - **Validation**: If `fitStatus="GAP"`, `clientNote` must be ≥ 10 chars
   - **Post-actions**: DecisionLogEntry, conflict detection, activity feed, auto-create GapResolution for GAP

### 4.5 Gap Resolution

1. **Page**: `/assessment/{id}/gaps` → `GapResolutionClient`
   - **File**: `src/components/gaps/GapResolutionClient.tsx`
2. **Components**: GapCard, GapAlternativeForm, GapSuggestionPanel, GapCostSummary, GapRollupDashboard
3. **Auto-created** when step marked as GAP (resolutionType: "PENDING")
4. **Cost model**: `oneTimeCost` + `recurringCost` + `costCurrency` + `implementationDays` (Phase 13)
5. **Risk scoring**: 4 categories × 4 priority levels
6. **Client approval**: `clientApproved` toggle with audit trail

### 4.6 Configuration Matrix

1. **Page**: `/assessment/{id}/config` → `ConfigMatrixClient`
2. **Categories**: Mandatory / Recommended / Optional
3. **API**: `PUT /api/assessments/{id}/config/{configActivityId}` — include/exclude with reason

### 4.7 Registers

1. **Integration Register**: `/assessment/{id}/integrations` — IntegrationPoint CRUD
2. **Data Migration Register**: `/assessment/{id}/data-migration` — DataMigrationObject CRUD with dependency graph
3. **OCM Register**: `/assessment/{id}/ocm` — OcmImpact CRUD with heatmap

### 4.8 Report Generation

1. **Page**: `/assessment/{id}/report` → `ReportClient`
2. **13 report types**: Executive Summary PDF, Scope Catalog XLSX, Step Detail XLSX, Gap Register XLSX, Config Workbook XLSX, Integration Register XLSX, DM Register XLSX, OCM Report XLSX, Readiness Scorecard PDF, Effort Estimate PDF, Flow Atlas PDF, Remaining Items XLSX, Audit Trail XLSX
3. **Complete package**: ZIP with all 13 numbered files + README.txt
4. **Branding**: Org-level logo, colors, footer text

### 4.9 Sign-Off & Handoff

1. **Page**: `/assessment/{id}/sign-off` → `SignOffDashboardClient`
2. **5-layer validation**:
   - Area validation (per functional area, by process owners)
   - Technical validation (IT Lead + DM Lead)
   - Cross-functional validation (consultant, reviews conflicts)
   - Executive signature (with MFA, document hash, authority statement)
   - Partner signature (final)
3. **Certificate**: PDF with cryptographic hash + verification token
4. **Handoff**: ALM exports (Jira, Azure DevOps, SAP Cloud ALM), Universal Assessment Package (JSON)

### 4.10 Status Machine

**File**: `src/lib/assessment/status-machine.ts`

V2 lifecycle (12 states):
```
draft → scoping → in_progress → workshop_active → review_cycle → gap_resolution
                                                                      ↓
                                                            pending_validation
                                                                      ↓
                                                                 validated
                                                                      ↓
                                                            pending_sign_off
                                                                      ↓
                                                                signed_off
                                                                      ↓
                                                                handed_off
                                                                      ↓
                                                                  archived
```

Transitions are role-gated via `TRANSITION_ROLES_V2` and prerequisite-gated via `PHASE_PREREQUISITES`.

---

## 5. DATA RELATIONSHIPS

### Entity Relationship Summary

```
Organization ──1:N──→ User
Organization ──1:N──→ Assessment
Organization ──1:1──→ ReportBranding
Organization ──1:N──→ AssessmentTemplate

User ──1:N──→ Session
User ──1:N──→ WebAuthnCredential
User ──1:N──→ AssessmentStakeholder
User ──1:N──→ Notification

Assessment ──1:N──→ AssessmentStakeholder
Assessment ──1:N──→ ScopeSelection
Assessment ──1:N──→ StepResponse
Assessment ──1:N──→ GapResolution
Assessment ──1:N──→ ConfigSelection
Assessment ──1:N──→ IntegrationPoint
Assessment ──1:N──→ DataMigrationObject
Assessment ──1:N──→ OcmImpact
Assessment ──1:N──→ DecisionLogEntry
Assessment ──1:N──→ Comment
Assessment ──1:N──→ Conflict
Assessment ──1:N──→ WorkshopSession
Assessment ──1:N──→ AssessmentPhaseProgress
Assessment ──1:N──→ ProcessFlowDiagram
Assessment ──1:N──→ FunctionalAreaOverview
Assessment ──1:N──→ ReportGeneration
Assessment ──1:N──→ AssessmentSnapshot
Assessment ──1:1──→ SignOffProcess
Assessment ──1:N──→ HandoffPackage
Assessment ──N:1──→ Assessment (parent/child via parentAssessmentId)

ScopeItem ──1:N──→ SolutionProcess
SolutionProcess ──1:N──→ ProcessFlow
ProcessFlow ──1:N──→ Activity
Activity ──1:N──→ ProcessStep
ProcessStep ──1:N──→ StepResponse

StepResponse → GapResolution (auto-created when fitStatus=GAP)
GapResolution ──1:N──→ GapAlternative

SignOffProcess ──1:N──→ AreaValidation
SignOffProcess ──1:1──→ TechnicalValidation
SignOffProcess ──1:1──→ CrossFunctionalValidation
SignOffProcess ──1:N──→ SignatureRecord
SignOffProcess ──1:1──→ AssessmentSnapshot

WorkshopSession ──1:N──→ WorkshopAttendee
WorkshopSession ──1:N──→ WorkshopVote
WorkshopSession ──1:N──→ WorkshopActionItem
WorkshopSession ──1:1──→ WorkshopMinutes
```

### Key Composite Unique Constraints

| Model | Unique On | Purpose |
|-------|-----------|---------|
| `ScopeSelection` | `[assessmentId, scopeItemId]` | One selection per scope item per assessment |
| `StepResponse` | `[assessmentId, processStepId]` | One response per step per assessment |
| `ConfigSelection` | `[assessmentId, configActivityId]` | One decision per config per assessment |
| `AssessmentSignOff` | `[assessmentId, signatoryRole]` | One sign-off per role per assessment |
| `AssessmentPhaseProgress` | `[assessmentId, phase]` | One progress record per phase |
| `WorkshopVote` | `[sessionId, processStepId, userId]` | One vote per user per step per session |
| `EditingLock` | `[assessmentId, entityType, entityId]` | One lock per entity |
| `PresenceRecord` | `[assessmentId, userId]` | One presence per user per assessment |

### FitStatus Value Flow

```
ProcessStep created → (no StepResponse exists yet, defaults to PENDING in UI)
    ↓
User classifies → StepResponse upserted with fitStatus = FIT | CONFIGURE | GAP | NA
    ↓
If GAP → GapResolution auto-created (resolutionType: PENDING)
    ↓
Gap resolved → GapResolution updated with cost, priority, risk
    ↓
Client approves → GapResolution.clientApproved = true
    ↓
All approved → Assessment can transition to pending_validation
    ↓
Report queries aggregate fitStatus counts across StepResponses
```

---

## 6. SAP CONTENT PIPELINE

### Ingestion Flow

```
SAP ZIP (Best Practices 2508)
    ↓
scripts/ingest-sap-zip.ts
    ↓
├── BPD XLSX files → ScopeItem + ProcessStep (flat columns)
├── BPD DOCX files → ScopeItem HTML fields
├── Config XLSM → ConfigActivity
├── Links XLSX → SolutionLink
├── Setup PDFs → SetupGuide (bytea)
├── General files → GeneralFile
├── Other files → OtherFile
├── README.rtf → ReadmeFile
└── Cross-reference: functionalArea, subArea, tutorialUrl
```

### Hierarchy Extraction

```
scripts/extract-hierarchy-entities.ts
    ↓
ProcessStep flat columns → SolutionProcess + ProcessFlow + Activity entities
    ↓
ProcessStep.activityId FK populated
```

### Step Classification

```
scripts/classify-steps.ts
    ↓
ProcessStep.stepType → classifyStep() → stepCategory
    ↓
isStepClassifiable() → isClassifiable boolean
    ↓
deriveGroupKey(), deriveGroupLabel() → groupKey, groupLabel
```

### Content Parsing

```
scripts/parse-step-content.ts
    ↓
ProcessStep.actionInstructionsHtml → parseStepContent()
    ↓
Structured JSON → ProcessStep.parsedContent
    ↓
Sections: purpose, prerequisites, systemAccess, roles,
          masterData, expectedResult, procedure, mainInstructions
```

### Verification

```
scripts/verify-data.ts — Validates data integrity
scripts/verify-hierarchy.ts — Validates hierarchy FK chain
scripts/verify-db.ts — Database connectivity
```

### Other Scripts

| Script | Purpose |
|--------|---------|
| `migrate-roles.ts` | Legacy 5-role → 11-role migration |
| `migrate-statuses.ts` | V1 → V2 status migration |
| `backfill-onboarding.ts` | Create OnboardingProgress for existing users |
| `migrate-blobs-to-vercel.ts` | Blob migration to Vercel Blob Storage |
| `check-indexes.ts` | Validate database indexes |
| `check-production-env.js` | Verify production environment variables |

---

## 7. INSERTION POINTS FOR UX ENHANCEMENTS

### Enhancement A: Business Process Area Grouping Layer

**What it is**: A semantic layer above activities/steps that groups them by business process area (e.g., "Invoice Processing", "Payment Run", "Month-End Close").

**Current state**:
- `ScopeItem.functionalArea` and `ScopeItem.subArea` provide top-level grouping
- `PROCESS_LANDSCAPES` in `src/constants/process-chains.ts` defines 7 functional areas with 19 process chains
- The hierarchy `ScopeItem → SolutionProcess → ProcessFlow → Activity → ProcessStep` already provides multi-level grouping
- `ProcessFlow.name` effectively serves as a process area name within a solution process

**Insertion points**:

1. **Schema**: No new model needed — `ProcessFlow.name` + `SolutionProcess.name` already provide the grouping semantics. If a custom business-facing label is needed, add `businessLabel` to `ProcessFlow` or `SolutionProcess`.
   - **File**: `prisma/schema.prisma:61-78` (ProcessFlow model)

2. **Hierarchy context**: `HierarchyContext.tsx` already provides `HierarchyTree` with `ProcessNode` (SolutionProcess) and `FlowNode` (ProcessFlow) levels.
   - **File**: `src/components/hierarchy/HierarchyContext.tsx`
   - **Type**: `src/types/hierarchy.ts` — `HierarchyTree`, `ProcessNode`, `FlowNode`, `ActivityNode`

3. **Sidebar navigation**: `HierarchyTreeSidebar` already renders the full tree. Business Process Area would be an additional presentation layer or renaming of ProcessFlow/SolutionProcess labels.
   - **File**: `src/components/hierarchy/HierarchyTreeSidebar.tsx`

4. **Process chains constant**: `PROCESS_LANDSCAPES` provides business-friendly chain names (e.g., "Record to Report", "Procure to Pay") that map scope items into connected workflows.
   - **File**: `src/constants/process-chains.ts:36-422`
   - **Helpers**: `getLandscape()`, `getChainScopeItemIds()`, `getAreaScopeItemIds()`

5. **Progress API**: `getSelectedScopeItemsWithProgress()` returns per-scope-item progress. Grouping by process area would aggregate at the ProcessFlow or SolutionProcess level.
   - **File**: `src/lib/db/process-steps.ts`

6. **Scope selection**: `ScopeSelectionClient` already supports bulk chain selection via `PROCESS_LANDSCAPES`.
   - **File**: `src/components/scope/ScopeSelectionClient.tsx`

### Enhancement B: Business Question Abstraction

**What it is**: Collapse hundreds of SAP test script steps into 20–40 meaningful business decisions (e.g., "Do you process vendor invoices with PO matching?" instead of showing 15 individual SAP test steps).

**Current state**:
- Steps are already classified by `stepCategory` (7 types, 4 classifiable)
- `isClassifiable` filters out LOGON, NAVIGATION, INFORMATION steps
- `groupStepsByActivity()` groups steps by their parent Activity
- `getBusinessContextHint()` provides plain-English guidance per step
- Conversation Mode (Phase 22) already implements decision tree → classification derivation via `tree-engine.ts`

**Insertion points**:

1. **Question definition**: ConversationTemplate model already stores `questionFlow` (Json) keyed by `scopeItemId` + `processStepId`.
   - **File**: `prisma/schema.prisma:1415-1430`
   - **For abstraction**: Create templates keyed at the Activity level (batch multiple steps into one question)

2. **Tree engine**: `getNextQuestion()`, `validateQuestionFlow()`, `estimateRemainingQuestions()` already handle decision tree traversal.
   - **File**: `src/lib/conversation/tree-engine.ts`

3. **Classification applier**: `applyClassifications()` already applies derived classifications to StepResponse records in a transaction.
   - **File**: `src/lib/conversation/classification-applier.ts`

4. **Step grouping**: `groupStepsByActivity()` groups steps by `activityId` — the natural unit for a business question.
   - **File**: `src/lib/assessment/step-grouper.ts`

5. **Review shell**: `ReviewShell` renders at the activity level. The business question would replace individual step cards with a single activity-level question card.
   - **File**: `src/components/review/ReviewShell.tsx`

6. **StepReviewCard**: Currently renders one card per step. A new `BusinessQuestionCard` component would render one card per activity, with classification applying to all steps in that activity.
   - **File**: `src/components/review/StepReviewCard.tsx` (494 lines — the component to either extend or replace)

7. **Content parser**: `parseStepContent()` extracts structured sections that could be aggregated across steps in an activity to generate a single business-level summary.
   - **File**: `src/lib/assessment/content-parser.ts`

8. **Business context hints**: `getBusinessContextHint()` already provides step-level guidance. Needs an activity-level variant.
   - **File**: `src/lib/assessment/business-context.ts`

### Enhancement C: Implications Panel

**What it is**: Show what modules, configuration, master data, and dependencies are affected by each classification choice.

**Current state**:
- `ConfigActivity` records are already linked to scope items (via `scopeItemId`)
- StepReviewCard already shows "Related Configuration Activities" section
- `parsedContent` contains `masterData`, `prerequisites`, `roles`, `systemAccess` sections
- `IntegrationPoint` records link to scope items
- `DataMigrationObject` records link to scope items
- `PROCESS_LANDSCAPES` chains show cross-process dependencies

**Insertion points**:

1. **Config activities already shown**: StepReviewCard lines 424-456 render related configs with category badges.
   - **File**: `src/components/review/StepReviewCard.tsx:424-456`

2. **Parsed content fields**: `parsedContent.masterData`, `parsedContent.prerequisites`, `parsedContent.roles` already extracted per step.
   - **File**: `src/lib/assessment/content-parser.ts:75-153`
   - **Type**: `ParsedStepContent` interface

3. **Process chain cross-references**: `PROCESS_LANDSCAPES` with `getChainScopeItemIds()` can identify downstream/upstream scope items in the same chain.
   - **File**: `src/constants/process-chains.ts`

4. **Integration points API**: `GET /api/assessments/{id}/integrations` returns all integration points, filterable by scope item.
   - **File**: `src/app/api/assessments/[id]/integrations/route.ts`

5. **Cross-area dependencies**: `FunctionalAreaOverview.crossAreaDeps` (Json) stores cross-area dependency data.
   - **File**: `prisma/schema.prisma:694-714`

6. **Scope dependencies**: `ScopeSelection.dependsOnScopeItems[]` (Phase 11) tracks scope item dependencies.
   - **File**: `prisma/schema.prisma:497`

7. **New component needed**: An `ImplicationsPanel` component that aggregates:
   - Config activities for the step/activity (from `ConfigActivity` via `scopeItemId`)
   - Master data requirements (from `parsedContent.masterData`)
   - Integration points (from `IntegrationPoint` via `scopeItemId`)
   - Upstream/downstream process chain dependencies (from `PROCESS_LANDSCAPES`)
   - Affected functional areas (from `ScopeItem.functionalArea`)

---

## 8. SPEC VS. REALITY — GAP ANALYSIS

### Methodology

Cross-referenced every task in `BUILD-PHASES-STATUS.md` (all marked COMPLETE) against actual code presence.

### V1 Phases 0–9: FULLY IMPLEMENTED

All V1 phases confirmed implemented with 197 tests passing and 69 routes building successfully per `HANDOFF.md`.

### V2 Phases 10–31: STATUS

| Phase | Spec | Code Evidence | Status |
|-------|------|---------------|--------|
| 10: Company Profile | 7 tasks | Assessment model has 20+ Phase 10 fields, CompanyProfileForm exists, profile-completeness.ts exists | **IMPLEMENTED** |
| 11: Scope Enhancement | 7 tasks | ScopeSelection has Phase 11 fields, bulk/pre-select APIs exist, scope dependencies tracked | **IMPLEMENTED** |
| 12: Step Response V2 | 9 tasks | stepCategory, parsedContent, isClassifiable, groupKey, groupLabel on ProcessStep; content-parser.ts, step-classifier.ts, step-grouper.ts, business-context.ts all exist | **IMPLEMENTED** |
| 13: Gap Resolution V2 | 7 tasks | GapResolution has Phase 13 fields (oneTimeCost, recurringCost, riskCategory, upgradeStrategy), GapAlternative model, client approval | **IMPLEMENTED** |
| 14: Integration Register | 7 tasks | IntegrationPoint model, CRUD APIs, register UI components | **IMPLEMENTED** |
| 15: DM Register | 7 tasks | DataMigrationObject model, CRUD APIs, dependency graph API | **IMPLEMENTED** |
| 16: OCM Register | 7 tasks | OcmImpact model, CRUD APIs, heatmap API, OCM scoring | **IMPLEMENTED** |
| 17: Role System | 9 tasks | 11-role system in types/assessment.ts, permission-matrix.ts (46 permissions), role-metadata.ts, migrate-roles.ts | **IMPLEMENTED** |
| 18: Lifecycle | 8 tasks | 12-state status machine, AssessmentPhaseProgress, StatusTransitionLog, WorkshopSession, migrate-statuses.ts | **IMPLEMENTED** |
| 19: Notifications | 7 tasks | Notification model, SSE stream, push subscriptions, notification preferences | **IMPLEMENTED** |
| 20: Process Viz | 5 tasks | ProcessFlowDiagram with interactiveData, FunctionalAreaOverview, flow API routes | **IMPLEMENTED** |
| 21: Workshop | 8 tasks | WorkshopSession/Attendee/Vote/ActionItem/Minutes models, QR code, SSE stream, navigate API | **IMPLEMENTED** |
| 22: Conversation | 7 tasks | ConversationTemplate, ConversationSession, tree-engine.ts, classification-applier.ts | **IMPLEMENTED** |
| 23: Dashboard | 8 tasks | DashboardWidget, DashboardDeadline, attention-engine, heatmap/KPI APIs | **IMPLEMENTED** |
| 24: Onboarding | 7 tasks | OnboardingProgress, OnboardingTooltip, flow-engine, sample-assessment API | **IMPLEMENTED** |
| 25: Report V2 | 11 tasks | ReportGeneration, ReportBranding, 13 report types, complete-package ZIP, logo upload | **IMPLEMENTED** |
| 26: Analytics | 7 tasks | BenchmarkSnapshot, PortfolioMetric, AssessmentPhaseLink, templates, cross-phase APIs | **IMPLEMENTED** |
| 27: PWA | 12 tasks | OfflineSyncQueue, PerformanceBaseline, service worker, offline page, rate limiting, CSP headers, Sentry | **IMPLEMENTED** |
| 28: Collaboration | 7 tasks | Comment (threaded), EditingLock, Conflict, PresenceRecord, ActivityFeedEntry, SSE | **IMPLEMENTED** |
| 29: Commercial | DESCOPED 2026-05-16 | Plan/subscription fields, feature-gate.ts, trial-manager.ts retained for internal feature gating; Stripe SDK, webhook, checkout/portal routes, StripeWebhookEvent table, and Stripe DB columns removed | **PARTIAL — billing surface removed** |
| 30: Sign-Off | 12 tasks | SignOffProcess, AreaValidation, TechnicalValidation, CrossFunctionalValidation, SignatureRecord, AlmExportRecord, HandoffPackage | **IMPLEMENTED** |
| 31: Lifecycle Continuity | 9 tasks | ChangeRequest, ReassessmentTrigger, SnapshotComparison, Assessment parent/child, carryForwardConfig | **IMPLEMENTED** |

### Known Gaps / Spec'd But Not Fully Wired

1. **Seed file**: `prisma/seed.ts` — NOT FOUND. Seeding handled by `scripts/ingest-sap-zip.ts` for SAP data. Test data via `tests/seed/` directory (12 seed scenarios). No Prisma-native seed.

2. **CLAUDE.md**: NOT FOUND at project root. Only `.claude/` directory exists.

3. **Deprecated ProcessStep columns**: 13 flat hierarchy columns marked `@deprecated` with "Planned removal: May 2026". Still present in schema for rollback safety. Not blocking.

4. **ConfigActivity FK**: No FK relation to ScopeItem because `scopeItemId` can be "All" or comma-separated (e.g., "J14, J13, 22Z"). Uses string-based lookups. See `prisma/schema.prisma:196-198`.

5. **ExpertConfig FK**: No FK to ScopeItem because sheet names are config activity IDs, not scope item IDs. See `prisma/schema.prisma:273-274`.

6. **Coverage thresholds**: `vitest.config.ts` has minimum thresholds set to 1% lines / 0% branches / 1% functions — effectively no enforcement. The `V2-TEST-INDEX.md` references higher targets (85% lines, 80% branches) but these are aspirational, not enforced.

---

## 9. TEST COVERAGE

### Framework

| Tool | Purpose | Config File |
|------|---------|-------------|
| Vitest 4.0.18 | Unit + integration + security + performance | `vitest.config.ts` |
| Playwright 1.58.2 | E2E + accessibility | `playwright.config.ts` |
| axe-core | WCAG compliance | via `@axe-core/playwright` |
| Testing Library | Component testing | `@testing-library/react` |

### Test File Inventory

| Category | Count | Framework |
|----------|-------|-----------|
| Unit | 64 | Vitest |
| Integration | 10 | Vitest |
| E2E | 25 | Playwright |
| Security | 4 | Vitest |
| Performance | 3 | Vitest |
| Accessibility | 1 | Playwright + axe-core |
| **Total** | **107** | — |

### Unit Tests (64 files in `tests/unit/`)

**Core business logic**: activity-aggregator, activity-steps, admin, anonymization-engine, benchmark-engine, config-matrix, content-parser, dashboard-widgets, delta-engine, dependency-graph, flow-layout, gap-analytics, gap-comparison, gap-rollups, gap-suggest, hash-engine, hierarchical-layout, hierarchy-grouper, hierarchy-tree, mention-parser, minutes-renderer, notification-dispatch, ocm-scoring, onboarding-flows, performance-utils, permissions, plan-engine, polish, portfolio-engine, profile-completeness, pwa-types, readiness-calculator, register-helpers, register-validation, report-generation, risk-score, role-permissions, scope-delta, scope-selection (v1 + v2), security-headers, security, session-code, setup, signoff-state-machine, status-machine, step-classifier, step-response, sync-engine, tree-engine, vote-tally

**Subdirectories**:
- `billing/` (1): plan-enforcement _(stripe-webhooks.test.ts removed 2026-05-16)_
- `crypto/` (2): certificate-generation, snapshot-hashing
- `parsers/` (3): content-section-parser, step-grouping, step-type-classifier
- `permissions/` (1): permission-matrix (993 test cases — 11 roles × 25+ operations)
- `state-machines/` (3): assessment-lifecycle, sign-off-lifecycle, subscription-lifecycle
- `validation/` (1): api-schema-validation

### Integration Tests (10 files in `tests/integration/`)

- assessment-crud, multi-tenant-isolation
- `collaboration/`: comments, conflict-detection, editing-locks, presence
- `exports/`: azure-devops, cloud-alm, confluence, jira

### E2E Tests (25 files in `tests/e2e/`)

- Core flows: login, portal, edge-cases, ui-consistency
- Accessibility: auth + unauth
- Responsive: auth + unauth + responsive-views (30 views × 3 sizes)
- Role-specific: admin, consultant, exec, it-lead, process-owner
- Security: admin, unauth, security-roles
- **8 User Journey tests** (`tests/e2e/journeys/`):
  - j01: Partner first assessment
  - j02: Multi-role workshop
  - j03: Client invitation
  - j04: Trial to paid
  - j05: Phase 2 carry-forward
  - j06: Change control
  - j07: Enterprise SSO/SCIM
  - j08: Offline PWA

### Test Infrastructure

| Directory | Files | Purpose |
|-----------|-------|---------|
| `tests/helpers/` | 3 | auth.ts (11-role mocks), db.ts (tx isolation), websocket.ts (WS mocks) _(stripe.ts removed 2026-05-16)_ |
| `tests/factories/` | 13 | Typed factories: assessment (7 variants), change-request (4), comment (4), data-migration (3), gap (4), integration-point (3), ocm-impact (2), organization (8), sign-off (4), snapshot (3), step (4), template (3), user (6) |
| `tests/seed/` | 13 | Deterministic scenarios: empty-trial, setup-assessment, scope-locked, process-review, gap-resolution, pending-sign-off, signed-off, phase2, enterprise (50 users/10 assessments), expired-trial, past-due, active-workshop |
| `tests/e2e/pages/` | 7 | Page objects: base, assessment, auth, dashboard, settings, sign-off, workshop |

### Test Scripts (package.json)

```
test           — vitest run (all unit + integration)
test:unit      — vitest run tests/unit
test:integration — vitest run tests/integration
test:e2e       — playwright test (all browsers)
test:e2e:chromium — playwright test --project=chromium
test:e2e:journeys — playwright test --project=journeys
test:security  — vitest run tests/security
test:perf      — vitest run tests/performance
test:a11y      — playwright test tests/accessibility
test:ci        — vitest run && playwright test --project=chromium
test:full      — vitest run && playwright test
test:coverage  — vitest run --coverage
```

---

## 10. DEPLOYMENT STATE

### Configuration

- **Platform**: Vercel (per `vercel.json` — minimal config, just schema reference)
- **Database**: PostgreSQL via `DATABASE_URL` + `DIRECT_DATABASE_URL` (for migrations)
- **Port**: 3003 (per `src/constants/config.ts:5`)
- **Build**: `next build` with Turbopack

### Environment Variables Required (.env.example)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection (pooled) |
| `DIRECT_DATABASE_URL` | PostgreSQL connection (direct, for migrations) |
| `NEXTAUTH_URL` | Base URL |
| `NEXTAUTH_SECRET` | JWT signing secret |
| `TOTP_ENCRYPTION_KEY` | AES-256-GCM key for TOTP secrets |
| `BREVO_SMTP_HOST/PORT/USER/PASS` | Email delivery (Brevo) |
| `EMAIL_FROM` | Sender email |
| `WEBAUTHN_RP_ID/RP_NAME/ORIGIN` | WebAuthn relying party |
| `VAPID_PUBLIC_KEY/PRIVATE_KEY/EMAIL` | Web push notifications |
| ~~`STRIPE_SECRET_KEY/PUBLISHABLE_KEY/WEBHOOK_SECRET`~~ | _removed 2026-05-16 (no paid billing)_ |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry error tracking |
| `CRON_SECRET` | Cron job authentication |

### Security Headers (via `next.config.ts`)

- Content-Security-Policy (restrictive default-src 'self')
- X-Frame-Options: DENY
- Strict-Transport-Security: max-age=63072000
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: camera/microphone/geolocation/interest-cohort disabled

### Middleware (`src/middleware.ts`)

- Rate limiting: auth mutations (30/min), API mutations (120/min), API reads (300/min)
- Session bridge: JWT → custom session conversion
- Report generation: 10/min limit
- Exempt routes: `/api/auth/session`, `/api/auth/csrf`, `/api/health`, `/api/cron/*`

### PWA

- Service worker with caching strategy
- Offline page at `/offline`
- `OfflineSyncQueue` model for offline-first mutations
- `idb-keyval` for IndexedDB storage

### Auth System

- **11 roles** with hierarchy (platform_admin=100 → viewer=10)
- **46 discrete permissions** in permission matrix
- **MFA**: TOTP (AES-256-GCM encrypted) + WebAuthn/Passkeys
- **Sessions**: Custom model with MFA tracking, concurrent limit (1), 24hr expiry
- **Area-locking**: process_owner restricted to assigned functional areas

---

## 11. CRITICAL FINDINGS

### Finding 1: Hierarchy Is Fully Built — Ready for Business Process Area

The entity hierarchy `ScopeItem → SolutionProcess → ProcessFlow → Activity → ProcessStep` is fully implemented with FK chains. The deprecated flat columns on ProcessStep are retained for rollback safety only. No schema changes needed for Business Process Area grouping — it maps naturally to `ProcessFlow.name` or `SolutionProcess.name`.

**Evidence**: `prisma/schema.prisma:44-97`, `src/types/hierarchy.ts`, `src/components/hierarchy/HierarchyContext.tsx`

### Finding 2: Conversation Mode Is the Foundation for Business Questions

The Phase 22 Conversation Mode (`ConversationTemplate` + `tree-engine.ts` + `classification-applier.ts`) already implements the core pattern needed for business question abstraction: define a question tree → user answers questions → derive classifications → apply to StepResponse records. The enhancement would be to create templates at the Activity level (not step level) with questions that abstract multiple steps.

**Evidence**: `prisma/schema.prisma:1415-1447`, `src/lib/conversation/tree-engine.ts`, `src/lib/conversation/classification-applier.ts`

### Finding 3: Implications Data Already Exists — Needs Assembly

All the data for an implications panel already exists in the system:
- Config activities linked to scope items (`ConfigActivity.scopeItemId`)
- Master data requirements in `ProcessStep.parsedContent.masterData`
- Integration points linked to scope items (`IntegrationPoint.scopeItemId`)
- Process chain cross-references in `PROCESS_LANDSCAPES`
- Scope dependencies in `ScopeSelection.dependsOnScopeItems[]`

What's missing is a component that assembles and presents this data in context during step review.

**Evidence**: `src/components/review/StepReviewCard.tsx:424-456` (config section), `src/lib/assessment/content-parser.ts` (parsed sections), `src/constants/process-chains.ts` (chain dependencies)

### Finding 4: Coverage Enforcement Is Aspirational

`vitest.config.ts` has coverage thresholds set to effectively 0% (1% lines, 0% branches). While 107 test files exist with ~1,700+ test cases, the CI gate does not enforce meaningful coverage minimums. The `V2-TEST-INDEX.md` references 85%/80% targets but these are not enforced in config.

### Finding 5: 13 Deprecated Columns on ProcessStep

ProcessStep carries 13 deprecated flat hierarchy columns (`testCaseGuid`, `solutionProcessGuid`, `solutionProcessFlowGuid`, etc.) marked for removal in May 2026. These are unused by current code (ReviewShell uses hierarchy FK chain) but add schema weight. No action needed before the planned enhancements.

**Evidence**: `prisma/schema.prisma:103-134`

### Finding 6: ConfigActivity Has No FK to ScopeItem

`ConfigActivity.scopeItemId` is a string that can be "All" or comma-separated IDs (e.g., "J14, J13, 22Z"). This means the implications panel must use string matching, not FK joins, to link configs to scope items.

**Evidence**: `prisma/schema.prisma:196-198`

### Finding 7: ReviewClient Is Deprecated but Still in Codebase

`ReviewClient.tsx` (flat/string-based grouping) is deprecated in favor of `ReviewShell.tsx` (hierarchy-based). The deprecated component still exists. The planned enhancements should exclusively target `ReviewShell`.

**Evidence**: `src/components/review/ReviewClient.tsx` (deprecated), `src/components/review/ReviewShell.tsx` (current)

---

## 12. RECOMMENDED SEQUENCE

Based on the audit findings, the recommended implementation sequence for the three planned UX enhancements:

### Phase 1: Business Process Area Grouping Layer

**Effort**: Low — mostly UI/presentation changes
**Reason to go first**: Establishes the navigation structure that Enhancement B builds on

1. Add `businessLabel` field to `SolutionProcess` and/or `ProcessFlow` if current names are too SAP-technical
2. Update `HierarchyTreeSidebar` to render business-friendly labels with progress aggregation
3. Extend `HierarchyBreadcrumb` with process area context
4. Add aggregate progress view at the ProcessFlow/SolutionProcess level
5. Wire `PROCESS_LANDSCAPES` chain names into the hierarchy view as contextual labels

**Key files**: `HierarchyContext.tsx`, `HierarchyTreeSidebar.tsx`, `process-chains.ts`, `hierarchy.ts` types

### Phase 2: Business Question Abstraction

**Effort**: Medium — new component + question content creation
**Reason second**: Leverages the hierarchy from Phase 1 and the conversation engine from Phase 22

1. Create `BusinessQuestionCard` component that renders one question per Activity (replacing N individual StepReviewCards)
2. Define a `QuestionFlow` template per Activity that maps business questions → step classifications
3. Extend `classification-applier.ts` to accept Activity-level classifications and fan out to child steps
4. Add a mode toggle: "Detailed Step Review" ↔ "Business Questions" (similar to existing conversation mode toggle)
5. Create question content for the 20–40 most common activity patterns

**Key files**: `StepReviewCard.tsx` (study), `tree-engine.ts` (reuse), `classification-applier.ts` (extend), `step-grouper.ts` (grouping source)

### Phase 3: Implications Panel

**Effort**: Medium — new component + data aggregation
**Reason last**: Enriches both the detailed and abstracted views from Phases 1–2

1. Create `ImplicationsPanel` component with 4 sections:
   - **Modules affected**: SAP modules from config activities
   - **Configuration required**: Config activities (Mandatory/Recommended/Optional) from `ConfigActivity`
   - **Master data**: From `parsedContent.masterData` aggregated across steps
   - **Dependencies**: Upstream/downstream from `PROCESS_LANDSCAPES` + `ScopeSelection.dependsOnScopeItems`
2. Wire into both `StepReviewCard` (step-level) and `BusinessQuestionCard` (activity-level)
3. Add an API endpoint to efficiently aggregate implications data per activity/scope item
4. Show implications change dynamically based on selected classification (e.g., GAP shows different implications than FIT)

**Key files**: `StepReviewCard.tsx:424-456` (existing config section to extend), `content-parser.ts`, `process-chains.ts`, `IntegrationPoint` queries

---

## APPENDIX: COMPONENT INVENTORY BY DOMAIN

| Domain | Count | Key Components |
|--------|-------|----------------|
| `ui/` | 27 | shadcn/ui primitives (Button, Card, Dialog, etc.) |
| `lifecycle/` | 16 | StatusTransitionBar, PhaseProgressPanel, ChangeRequestCard, etc. |
| `workshop/` | 14 | WorkshopModeLayout, VotingPanel, QRCode, Timer, Minutes |
| `hierarchy/` | 12 | HierarchyContext, TreeSidebar, Breadcrumb, ProcessMap |
| `shared/` | 12 | EmptyState, LoadingSkeleton, PermissionDenied, etc. |
| `admin/` | 11 | IndustryProfileEditor, EffortBaselineEditor, CatalogBrowser |
| `signoff/` | 11 | SignOffDashboard, SignatureForm, AreaValidationCard |
| `review/` | 10 | ReviewShell, StepReviewCard, StepGroupSidebar, ParsedContentView |
| `dashboard/` | 10 | DashboardShell, WidgetLoader, Heatmap, KPIPanel |
| `registers/` | 10 | IntegrationRegisterClient, DataMigrationRegisterClient, OcmRegisterClient |
| `pwa/` | 9 | ServiceWorkerProvider, OfflineIndicator, SyncStatus |
| `collaboration/` | 8 | ActiveEditors, StepConflictBanner, ConflictResolutionDialog |
| `gaps/` | 8 | GapCard, GapAlternativeForm, GapRollupDashboard, GapCostSummary |
| `onboarding/` | 7 | OnboardingWizard, ContextualTooltip, SampleAssessmentBanner |
| `commercial/` | 7 | PricingCard, CheckoutButton, SubscriptionStatus |
| `scope/` | 6 | ScopeSelectionClient, ProcessLandscapeMap, ScopeItemBriefing |
| `analytics/` | 6 | BenchmarkChart, PortfolioDashboard, CrossPhaseViewer |
| `flow/` + `flows/` | 9 | InteractiveFlowViewer, FlowDiagramCard, ThumbnailRenderer |
| `report/` | 5 | ReportClient, BrandingForm |
| `layout/` | 4 | PortalLayout, AssessmentLayout, MobileBottomTabBar |
| `conversation/` | 4 | ConversationCard, ConversationProgress, ConversationModeToggle |
| `comments/` | 4 | CommentPanel, CommentThread, MentionInput |
| `notifications/` | 4 | NotificationBell, NotificationDropdown, PreferenceGrid |
| `templates/` | 4 | TemplateListClient, TemplateCard |
| `assessment/` | 3 | NewAssessmentForm, AssessmentCard |
| `auth/` | 3 | LoginForm, SessionGuard |
| `org/` | 3 | UserManagementTable, InviteUserDialog |
| `profile/` | 2 | CompanyProfileForm, ProfileProgress |
| `mfa/` | 2 | TotpSetup, WebAuthnSetup |
| `config/` | 1 | ConfigMatrixClient |
| `remaining/` | 1 | RemainingItemsClient |

---

*End of Forensic Audit Report*

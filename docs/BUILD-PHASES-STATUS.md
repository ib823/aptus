# Build Phases Status

> **Status reconciliation summary (2026-05-16).** A cross-cutting code
> audit found the following deltas between this checklist and the
> actual repository state. Each is now reflected inline below.
>
> | Phase | Reconciliation |
> |---|---|
> | 17 (Roles & SSO) | SSO **configuration** is shipped; SSO **login flow** is not (NextAuth still uses EmailProvider only). Marked PARTIAL with task 17.10 added. |
> | 22 (Conversation Mode) | Code shipped, but the ConversationTemplate table was empty. Baseline seed (`prisma/seeds/conversation-templates.ts`) now plants a generic flow per ScopeItem; admins author scope-specific templates via the admin UI. |
> | 29 (Commercial) | Paid billing is out of scope. Stripe SDK, webhook, checkout/portal, subscription upgrade UI, `StripeWebhookEvent` table, and Stripe DB columns have been removed. Plan/limits scaffolding stays for internal feature gating. |
> | Hierarchy data | SolutionProcess / ProcessFlow / Activity tables ship empty by default; flat `ProcessStep` rows carry the data. To populate the normalized hierarchy, run `pnpm tsx scripts/extract-hierarchy-entities.ts` followed by `pnpm tsx scripts/verify-hierarchy.ts`. The extraction is idempotent. |
> | Phase 31 (Lifecycle continuity) | Was previously flagged as hollow; `src/lib/lifecycle/delta-engine.ts` is in fact wired through change-requests and snapshot-compare. Fully shipped. |

## Phase 0: Project Scaffolding — COMPLETE

| # | Task | Done |
|---|------|------|
| 0.1 | Create Next.js project | [x] |
| 0.2 | Install dependencies | [x] |
| 0.3 | Install dev dependencies | [x] |
| 0.4 | Install shadcn/ui | [x] |
| 0.5 | Configure TypeScript | [x] |
| 0.6 | Configure ESLint | [x] |
| 0.7 | Configure Tailwind | [x] |
| 0.8 | Set up Prisma | [x] |
| 0.9 | Create folder structure | [x] |
| 0.10 | Create symlink to specs | [x] |
| 0.11 | Add npm scripts | [x] |
| 0.12 | Create .env.local | [x] |
| 0.13 | Verify database connection | [x] |

## Phase 2: Authentication & Assessment Setup — COMPLETE

| # | Task | Done |
|---|------|------|
| 2.1 | Implement magic link auth | [x] |
| 2.2 | Implement User and Organization models | [x] |
| 2.3 | Implement Session management | [x] |
| 2.4 | Implement passkey (WebAuthn) MFA enrollment | [x] |
| 2.5 | Implement passkey (WebAuthn) MFA verification | [x] |
| 2.6 | Implement MFA enforcement middleware | [x] |
| 2.7 | Implement role-based routing | [x] |
| 2.8 | Implement area-locked permissions middleware | [x] |
| 2.9 | Create login page | [x] |
| 2.10 | Create passkey enrolment (Settings → Security) | [x] |
| 2.11 | Create passkey verify page (`/verify-mfa`) | [x] |
| 2.12 | Create assessment list page | [x] |
| 2.13 | Create assessment creation flow | [x] |
| 2.14 | Stakeholder management + onboarding | [x] |
| 2.15 | Assessment status machine | [x] |
| 2.16 | Per-company progress dashboard | [x] |

## Phase 3: Scope Selection — COMPLETE

| # | Task | Done |
|---|------|------|
| 3.1 | Build scope selection page | [x] |
| 3.2 | Industry filter | [x] |
| 3.3 | Current state capture | [x] |
| 3.4 | Step count display | [x] |
| 3.5 | Progress tracking | [x] |
| 3.6 | Scope dependencies | [x] |
| 3.7 | Decision logging | [x] |
| 3.8 | Save/resume | [x] |

## Phase 5: Gap Resolution — COMPLETE

| # | Task | Done |
|---|------|------|
| 5.1 | Build gap summary page | [x] |
| 5.2 | Resolution option cards | [x] |
| 5.3 | Cost/effort display | [x] |
| 5.4 | ADAPT comparison | [x] |
| 5.5 | Rationale capture | [x] |
| 5.6 | Resolution persistence | [x] |
| 5.7 | Summary statistics | [x] |
| 5.8 | "What if" calculator | [x] |

## Phase 4: Process Deep Dive — COMPLETE

| # | Task | Done |
|---|------|------|
| 4.1 | Build sidebar navigation | [x] |
| 4.2 | Build process flow overview | [x] |
| 4.3 | Build step review card | [x] |
| 4.4 | SAP HTML rendering | [x] |
| 4.5 | Client response capture | [x] |
| 4.6 | Gap note capture | [x] |
| 4.7 | Related config display | [x] |
| 4.8 | Step navigation | [x] |
| 4.9 | Step type filtering | [x] |
| 4.10 | Progress persistence | [x] |
| 4.11 | Batch operations | [x] |
| 4.12 | File attachment | [x] |
| 4.13 | Area-locked step editing | [x] |
| 4.14 | IT Lead technical notes | [x] |
| 4.15 | Consultant override | [x] |

## Phase 6: Configuration Matrix — COMPLETE

| # | Task | Done |
|---|------|------|
| 6.1 | Build config matrix page | [x] |
| 6.2 | Category filtering | [x] |
| 6.3 | Self-service indicator | [x] |
| 6.4 | Scope item grouping | [x] |
| 6.5 | Include/exclude for Recommended/Optional | [x] |
| 6.6 | Summary counts | [x] |
| 6.7 | Setup guide links | [x] |

## Phase 8: Intelligence Layer Admin — COMPLETE

| # | Task | Done |
|---|------|------|
| 8.1 | Industry profile CRUD | [x] |
| 8.2 | Effort baseline editor | [x] |
| 8.3 | Extensibility pattern library | [x] |
| 8.4 | Adaptation pattern library | [x] |
| 8.5 | SAP release management | [x] |
| 8.6 | Assessment dashboard | [x] |

## Phase 7: Report Generation — COMPLETE

| # | Task | Done |
|---|------|------|
| 7.1 | Executive Summary PDF | [x] |
| 7.2 | Scope Item Catalog XLSX | [x] |
| 7.3 | Process Step Detail XLSX | [x] |
| 7.4 | Gap Register XLSX | [x] |
| 7.5 | Configuration Workbook XLSX | [x] |
| 7.6 | Extension Register (merged into gap register) | [x] |
| 7.7 | Adaptation Register (merged into gap register) | [x] |
| 7.8 | Effort Estimate PDF | [x] |
| 7.9 | Decision Audit Trail XLSX | [x] |
| 7.10 | SAP Reference Pack (via Complete Package download) | [x] |
| 7.11 | Report download page | [x] |
| 7.12 | Sign-off workflow | [x] |
| 7.13 | Process Flow Atlas PDF | [x] |
| 7.14 | Remaining Items Register XLSX | [x] |
| 7.15 | Flow diagram viewer | [x] |
| 7.16 | Remaining items view | [x] |
| 7.17 | Blueprint output package | [x] |

## Phase 9: Polish & Production Readiness — COMPLETE

| # | Task | Done |
|---|------|------|
| 9.1 | Loading states | [x] |
| 9.2 | Error states | [x] |
| 9.3 | Empty states | [x] |
| 9.4 | Keyboard navigation | [x] |
| 9.5 | Print styles | [x] |
| 9.6 | Performance audit | [x] |
| 9.7 | Security audit | [x] |
| 9.8 | Final verification | [x] |
| 9.9 | MFA UX polish | [x] |
| 9.10 | Permission denied UX | [x] |
| 9.11 | Dashboard polish | [x] |

## Phase 1: Data Ingestion Pipeline — COMPLETE

| # | Task | Done |
|---|------|------|
| 1.1 | Create ingestion script | [x] |
| 1.2 | Parse BPD XLSX files | [x] |
| 1.3 | Parse BPD DOCX files | [x] |
| 1.4 | Parse Config XLSM | [x] |
| 1.5 | Parse Links XLSX | [x] |
| 1.6 | Store Setup PDFs | [x] |
| 1.7 | Store General files | [x] |
| 1.8 | Store Others files | [x] |
| 1.9 | Store README.rtf | [x] |
| 1.10 | Cross-reference functional areas | [x] |
| 1.11 | Cross-reference tutorial URLs | [x] |
| 1.12 | Normalize step types | [x] |
| 1.13 | Derive process flow groups | [x] |
| 1.14 | Create verification script | [x] |

---

# V2 Enhancement Phases (10–31)

> **Source**: the V2 master brief, Parts A–D + Addendums 1–3 (no longer held in this repo)
> **Specs**: `specs/v2/PHASE-10.md` through `specs/v2/PHASE-31.md`
> **Index**: `specs/V2-SPEC-INDEX.md`

## Wave 1: Foundation Enrichments

### Phase 10: Company Profile Enrichment — COMPLETE

| # | Task | Done |
|---|------|------|
| 10.1 | Extend Assessment model (operating model, regulatory, SAP landscape) | [x] |
| 10.2 | Company profile form with multi-step wizard | [x] |
| 10.3 | Country-specific regulatory field rendering | [x] |
| 10.4 | SAP landscape capture (current ERP, target version, deployment) | [x] |
| 10.5 | Validation rules and Zod schemas | [x] |
| 10.6 | Migration for existing assessments | [x] |
| 10.7 | Unit and integration tests | [x] |

### Phase 11: Scope Selection Enhancement — COMPLETE

| # | Task | Done |
|---|------|------|
| 11.1 | Industry-guided scope pre-selection | [x] |
| 11.2 | Scope item dependency warnings | [x] |
| 11.3 | Bulk operations (select/deselect by area) | [x] |
| 11.4 | Current state capture per scope item | [x] |
| 11.5 | Relevance rationale (why selected/excluded) | [x] |
| 11.6 | Scope summary dashboard | [x] |
| 11.7 | Unit and integration tests | [x] |

### Phase 12: Step Response Enrichment & Content Presentation — COMPLETE

| # | Task | Done |
|---|------|------|
| 12.1 | Step type classification engine (tag → StepCategory) | [x] |
| 12.2 | Content parser (SAP description → structured sections) | [x] |
| 12.3 | Decision-first card layout (classification above content) | [x] |
| 12.4 | Step grouping by activity + tag | [x] |
| 12.5 | Segmented progress indicator (classifiable-only counts) | [x] |
| 12.6 | Reference step compact rendering | [x] |
| 12.7 | Configuration activity contextualization | [x] |
| 12.8 | Backfill migration for existing steps | [x] |
| 12.9 | Unit and integration tests | [x] |

### Phase 13: Gap Resolution Enhancement — COMPLETE

| # | Task | Done |
|---|------|------|
| 13.1 | Enhanced cost model (one-time + recurring + multi-currency) | [x] |
| 13.2 | Risk scoring matrix (4×3 heatmap) | [x] |
| 13.3 | "What-if" scenario calculator (alternative resolutions + comparison) | [x] |
| 13.4 | Resolution tracking workflow (approval reset on type change) | [x] |
| 13.5 | Client approval capture (approve/revoke API + gate) | [x] |
| 13.6 | Upgrade impact assessment (infer strategy from type) | [x] |
| 13.7 | Unit and integration tests | [x] |

## Wave 2: New Registers

### Phase 14: Integration Register — COMPLETE

| # | Task | Done |
|---|------|------|
| 14.1 | IntegrationPoint Prisma model (+ estimatedEffortDays, dataObjects, functionalArea, updatedBy) | [x] |
| 14.2 | CRUD API routes (GET/POST list + PUT/DELETE individual + summary) | [x] |
| 14.3 | Integration register UI (table + form + filters + summary sidebar) | [x] |
| 14.4 | Middleware categorization (CPI, PO, MuleSoft, Boomi, Azure, Other) | [x] |
| 14.5 | Link to scope items via scopeItemId | [x] |
| 14.6 | Decision audit logging on create/update/delete | [x] |
| 14.7 | Unit and integration tests (register-validation + register-helpers + factories) | [x] |

### Phase 15: Data Migration Register — COMPLETE

| # | Task | Done |
|---|------|------|
| 15.1 | DataMigrationObject Prisma model (+ estimatedEffortDays, functionalArea, updatedBy) | [x] |
| 15.2 | CRUD API routes (GET/POST list + PUT/DELETE individual + summary + dependency-graph) | [x] |
| 15.3 | DM register UI (table + form + filters + summary sidebar) | [x] |
| 15.4 | Volume and effort estimation (volumeEstimate, recordCount, estimatedEffortDays) | [x] |
| 15.5 | Source system mapping + dependency graph (circular detection, topological sort, critical path) | [x] |
| 15.6 | Decision audit logging on create/update/delete | [x] |
| 15.7 | Unit and integration tests (dependency-graph + register-validation + factories) | [x] |

### Phase 16: OCM Impact Register — COMPLETE

| # | Task | Done |
|---|------|------|
| 16.1 | OcmImpact Prisma model (+ impactTitle, affectedUserCount, relatedGapId, updatedBy) | [x] |
| 16.2 | CRUD API routes (GET/POST list + PUT/DELETE individual + summary + heatmap) | [x] |
| 16.3 | OCM register UI (table + heatmap tab + form + filters + summary sidebar) | [x] |
| 16.4 | Training needs assessment (trainingRequired, trainingType, trainingDuration) | [x] |
| 16.5 | Change readiness tracking (severity-weighted scoring + resistance risk + readiness score) | [x] |
| 16.6 | Decision audit logging on create/update/delete | [x] |
| 16.7 | Unit and integration tests (ocm-scoring + register-validation + factories) | [x] |

## Wave 3: Roles & Lifecycle

### Phase 17: Role System & Organization Model — PARTIAL (SSO scaffolded, not wired)

> **Status reconciliation (2026-05-16):** Roles, permission matrix,
> invitations, and the SSO **configuration surface** are complete. The
> SSO **authentication flow** is not wired — `auth-options.ts` only
> registers `EmailProvider`. Storing SSO metadata in `Organization.sso*`
> fields does not currently route logins through that IdP. Treat SSO as
> "schema + admin UI present; login path is still email magic-link only"
> until a NextAuth OAuth / SAML provider is added.

| # | Task | Done |
|---|------|------|
| 17.1 | Extend Organization model (slug, type, SSO, ssoExclusive, ssoEntityId, dataRetentionDays, viewerCanExport, reportLogoUrl) | [x] |
| 17.2 | 11-role enum with RoleMetadata + 37-action PermissionMatrix | [x] |
| 17.3 | Role assignment UI (UserManagementTable with role change dialog) | [x] |
| 17.4 | SSO configuration API (GET/PUT /organizations/[orgId]/sso) | [x] |
| 17.5 | RBAC middleware update (permission-matrix.ts, hasPermission, requirePermission) | [x] |
| 17.6 | Migration script (scripts/migrate-roles.ts — admin→platform_admin, executive→executive_sponsor) | [x] |
| 17.7 | Organization management UI (admin org list + detail + InviteUserDialog) | [x] |
| 17.8 | Invitation accept API (/invitations/[token]/accept) | [x] |
| 17.9 | User model extensions (jobTitle, department, phone, lastActiveAt) | [x] |
| 17.10 | **Wire NextAuth OAuth / SAML provider against Organization.sso\* fields** | [ ] |

### Phase 18: Assessment Lifecycle — COMPLETE

| # | Task | Done |
|---|------|------|
| 18.1 | Extended 10-state status machine (draft → scoping → … → signed_off → handed_off → archived) | [x] |
| 18.2 | Phase progress tracking (8 phases with completion %, recalculate API) | [x] |
| 18.3 | Workshop session management (create/start/end with session codes + audit logging) | [x] |
| 18.4 | Status transition guards per role (TRANSITION_ROLES_V2 in status-machine.ts) | [x] |
| 18.5 | Lifecycle event logging (StatusTransitionLog + DecisionLogEntry on every transition) | [x] |
| 18.6 | Migration script (scripts/migrate-statuses.ts — V1→V2 status mapping + phase records) | [x] |
| 18.7 | StatusTransitionBar component (integrated in assessment layout) | [x] |
| 18.8 | PhaseProgressPanel component (progress bars + recalculate button) | [x] |

## Wave 4: Real-Time Infrastructure

### Phase 19: Notifications & Real-Time Infrastructure — COMPLETE

| # | Task | Done |
|---|------|------|
| 19.1 | Notification model and preference system | [x] |
| 19.2 | In-app notification bell + dropdown | [x] |
| 19.3 | Email notification service (Brevo SMTP integration) | [x] |
| 19.4 | SSE real-time stream (Vercel-compatible, replaces WebSocket) | [x] |
| 19.5 | Presence tracking (who is online, what they're viewing) | [x] |
| 19.6 | Web Push for PWA (VAPID, service worker) | [x] |
| 19.7 | Notification preferences grid (types x channels) | [x] |

### Phase 28: Real-Time Collaboration — COMPLETE

| # | Task | Done |
|---|------|------|
| 28.1 | Comment model + threading + @mentions | [x] |
| 28.2 | Field-level editing locks (SSE/polling, 5-min expiry) | [x] |
| 28.3 | Conflict detection and resolution workflow | [x] |
| 28.4 | Activity feed (real-time assessment stream) | [x] |
| 28.5 | Collaboration feature matrix by role (recipient resolver) | [x] |
| 28.6 | Graceful degradation (polling fallback everywhere) | [x] |
| 28.7 | Integration hooks (steps, comments, transitions, scope, conflicts) | [x] |

## Wave 5: Visualization & Workshops

### Phase 20: Process Visualization — COMPLETE

| # | Task | Done |
|---|------|------|
| 20.1 | FunctionalAreaOverview schema + types (crossAreaDeps→Json, scopeItems, updatedAt, assessment FK) | [x] |
| 20.2 | Flow lib files (interactive-flow, thumbnail-generator, risk-overlay, area-overview) | [x] |
| 20.3 | Flow API routes (scope GET, scope regenerate, overview regenerate, SVG/PNG/PDF export) | [x] |
| 20.4 | Interactive flow viewer (zoom/pan SVG, risk overlay toggle, node popover) | [x] |
| 20.5 | Functional area map + drill-down + Process Map page + tab | [x] |

### Phase 21: Workshop Management — COMPLETE

| # | Task | Done |
|---|------|------|
| 21.1 | Workshop session model (already existed) + scheduling (WorkshopScheduleDialog) | [x] |
| 21.2 | Workshop Mode UI (WorkshopModeLayout + timer + QR code component) | [x] |
| 21.3 | QR code generation (qrcode lib) + join link + session code display | [x] |
| 21.4 | Synchronized navigation (follow presenter toggle + SSE stream events) | [x] |
| 21.5 | Live classification voting (submitVote, getVoteTally, finalizeVote + vote API) | [x] |
| 21.6 | Workshop minutes auto-generation (generateMinutes + renderMinutesMarkdown) | [x] |
| 21.7 | Workshop lifecycle (create, start, end, cancel) + attendee heartbeat + presence | [x] |
| 21.8 | Workshop list page + session detail page + API routes (cancel, stream, heartbeat, follow) | [x] |

## Wave 6: UX Innovation

### Phase 22: Conversation Mode — COMPLETE

> **Note:** The `ConversationTemplate` table now seeds a baseline
> generic flow per ScopeItem via `prisma/seed.ts`. Admins author
> scope-specific templates from the admin UI; without seeding, the
> conversation surface ships empty. Run `pnpm db:seed` after migrating
> to populate baseline templates.

| # | Task | Done |
|---|------|------|
| 22.1 | ConversationTemplate model and decision tree | [x] |
| 22.2 | Chat-like classification UI (ConversationCard, ConversationProgress) | [x] |
| 22.3 | Classification derivation from answers (tree-engine + classification-applier) | [x] |
| 22.4 | Mode toggle (traditional ↔ conversation) | [x] |
| 22.5 | Session resumption (ConversationSession CRUD) | [x] |
| 22.6 | Template editor (admin) — ConversationTemplateEditor | [x] |
| 22.7 | Unit and integration tests | [x] |
| 22.8 | Baseline ConversationTemplate seed (prisma/seeds/conversation-templates.ts) | [x] |

### Phase 23: Intelligent Dashboard — COMPLETE

| # | Task | Done |
|---|------|------|
| 23.1 | Role-aware dashboard variants (DashboardShell + WidgetLoader + 11 role defaults) | [x] |
| 23.2 | "What Needs Attention" engine (attention-engine + stale assessments + API) | [x] |
| 23.3 | Progress heatmap by area (scoped to selected scope items, org-isolated) | [x] |
| 23.4 | KPI panel (FIT rate, cost, risk — org-isolated) | [x] |
| 23.5 | Activity feed widget (DashboardActivityFeed) | [x] |
| 23.6 | Widget customization (WidgetCustomizer with moveUp/moveDown + auto-create defaults) | [x] |
| 23.7 | Mobile dashboard layout (responsive grid) | [x] |
| 23.8 | Unit and integration tests | [x] |

### Phase 24: Onboarding System — COMPLETE

| # | Task | Done |
|---|------|------|
| 24.1 | Per-role onboarding wizard flows (11 roles, OnboardingWizard + flow-engine) | [x] |
| 24.2 | Contextual tooltips (ContextualTooltip + Provider + 11 tooltip registry) | [x] |
| 24.3 | Sample assessment with demo data (POST /onboarding/sample-assessment) | [x] |
| 24.4 | Onboarding progress tracking (start, progress, complete APIs + OnboardingGuard) | [x] |
| 24.5 | SSO-aware onboarding (SampleAssessmentBanner + org-scoped) | [x] |
| 24.6 | Backfill for existing users (scripts/backfill-onboarding.ts) | [x] |
| 24.7 | Unit and integration tests | [x] |

## Wave 7: Reports & Commercial

### Phase 25: Report Generation V2 — COMPLETE

| # | Task | Done |
|---|------|------|
| 25.1 | Integration Register XLSX report (3 sheets: Summary, Detail, By Source System) | [x] |
| 25.2 | Data Migration Register XLSX report (4 sheets: Summary, Detail, By Source, Effort Breakdown) | [x] |
| 25.3 | OCM Impact XLSX report (4 sheets: Summary, Detail, Training Plan, Communications Plan) | [x] |
| 25.4 | Enhanced Executive Summary PDF (already existed) | [x] |
| 25.5 | Readiness Scorecard PDF (generateReadinessScorecardPdf + ?format=pdf on API) | [x] |
| 25.6 | Report branding (branding.ts + loadBranding + hexToRgb, wired into all 4 PDF generators) | [x] |
| 25.7 | Complete package ZIP (13 numbered files + README.txt — includes Flow Atlas + Remaining Items) | [x] |
| 25.8 | ReportClient updated with 3 new report types + ZIP download | [x] |
| 25.9 | Logo upload endpoint (POST /report/branding/logo — PNG/JPEG/SVG, 500KB max, base64 data URI) | [x] |
| 25.10 | Flow Atlas PDF generator (generateFlowAtlasPdf in pdf-generator.ts) | [x] |
| 25.11 | Wave 7 migration SQL (ReportGeneration, ReportBranding, commercial fields, templates, usage events) | [x] |

### Phase 29: Platform Commercial & Self-Service — DESCOPED (Stripe removed)

> **Status reconciliation (2026-05-16):** Paid billing is **out of scope**
> for this product. The Stripe SDK, webhook handler, checkout/portal
> routes, subscription upgrade UI, `StripeWebhookEvent` table, and the
> `stripe*` / `billingEmail` columns on Organization have been removed
> (see commit "remove Stripe and the paid-billing surface"). What
> remains is the **internal plan/limits scaffolding**: PlanTier,
> PLAN_LIMITS, trial-manager, usage-metering, and the read-only
> subscription settings page. Plan transitions are managed by admin
> tooling rather than a payment processor.

| # | Task | Status |
|---|------|--------|
| 29.1 | Self-service signup flow (/signup page + /api/auth/signup route) | [x] retained |
| 29.2 | 14-day trial (trial-manager.ts + createTrial + checkAndExpireTrials) | [x] retained |
| 29.3 | Stripe Billing (stripe-client.ts + webhook handler + checkout + portal) | [removed] |
| 29.4 | Partner admin (subscription page is read-only "current plan + usage") | [x] retained |
| 29.5 | Plan tier enforcement (feature-gate.ts + checkFeatureAccess + isOrgReadOnly) | [x] retained |
| 29.6 | Usage metering (usage-metering.ts + recordUsageEvent + limit checks) | [x] retained (internal-only — no payment processor) |
| 29.7 | Subscription lifecycle (trial-manager + status transitions) | [x] retained (Stripe webhook half removed) |
| 29.8 | Demo/sandbox mode (sample assessment via onboarding — already exists) | [x] retained |
| 29.9 | Pricing page (/pricing — public) | [x] retained (informational) |
| 29.10 | Stripe webhook idempotency | [removed] |

## Wave 8: Sign-Off & Continuity

### Phase 30: Assessment Handoff, Sign-Off & ALM Integration — COMPLETE

| # | Task | Done |
|---|------|------|
| 30.1 | Multi-layer validation workflow (5 layers) | [x] |
| 30.2 | SignatureRecord with cryptographic hash | [x] |
| 30.3 | AssessmentSnapshot model (immutable versioning) | [x] |
| 30.4 | Sign-off certificate PDF generation | [x] |
| 30.5 | Universal Assessment Package (JSON export) | [x] |
| 30.6 | SAP Cloud ALM export adapter | [x] |
| 30.7 | Jira Cloud export adapter | [x] |
| 30.8 | Azure DevOps export adapter | [x] |
| 30.9 | Handoff configuration UI | [x] |
| 30.10 | Transition briefing auto-generation | [x] |
| 30.11 | Archival and retention policy | [x] |
| 30.12 | Unit and integration tests | [x] |

### Phase 31: Assessment Lifecycle Continuity — COMPLETE

| # | Task | Done |
|---|------|------|
| 31.1 | Assessment versioning (immutable snapshots) | [x] |
| 31.2 | Version comparison / delta report | [x] |
| 31.3 | Assessment cloning for Phase 2 carry-forward | [x] |
| 31.4 | Cross-phase dependency detection | [x] |
| 31.5 | Change control workflow (post-sign-off) | [x] |
| 31.6 | Partial entity unlock during change request | [x] |
| 31.7 | Reassessment triggers | [x] |
| 31.8 | Re-baseline against new SAP version | [x] |
| 31.9 | Unit and integration tests | [x] |

## Wave 9: Analytics

### Phase 26: Analytics, Benchmarking & Templates — COMPLETE

| # | Task | Done |
|---|------|------|
| 26.1 | Assessment template creation (anonymized) | [x] |
| 26.2 | Template marketplace within organization | [x] |
| 26.3 | Cross-phase analytics (multi-phase clients) | [x] |
| 26.4 | Partner portfolio dashboard | [x] |
| 26.5 | Benchmarking against anonymized aggregates | [x] |
| 26.6 | Return client analytics | [x] |
| 26.7 | Unit and integration tests | [x] |

## Wave 10: Hardening

### Phase 27: Production Hardening & PWA — COMPLETE

| # | Task | Done |
|---|------|------|
| 27.1 | PWA manifest, icons, and service worker with caching | [x] |
| 27.2 | Offline page + OfflineIndicator wired into portal | [x] |
| 27.3 | Offline sync queue (idb-keyval) + auto-sync client | [x] |
| 27.4 | Mobile responsive (MobileBottomTabBar wired, touch targets) | [x] |
| 27.5 | Rate limiting in middleware (sliding window) | [x] |
| 27.6 | Performance: Web Vitals reporter, PerformanceBaseline model | [x] |
| 27.7 | Security: CSP headers, rate limiting, security headers | [x] |
| 27.8 | Sentry integration (client+server, global-error.tsx) | [x] |
| 27.9 | Prisma: OfflineSyncQueue + PerformanceBaseline models | [x] |
| 27.10 | Health endpoint + check-indexes script | [x] |
| 27.11 | Service worker registration + provider | [x] |
| 27.12 | Migration: 20250223400000_wave10_production_hardening_pwa | [x] |

---

**ALL V2 PHASES COMPLETE** — Phases 10–27 implemented across Waves 1–10.

# Build Phases — Step-by-Step Execution Plan

Each phase has: objectives, tasks, deliverables, quality gates, and verification commands.
**No phase may begin until the previous phase's quality gates are ALL green.**

---

## Phase 0: Project Scaffolding

### Objective
Create the Next.js project, install dependencies, configure tooling, set up database.

### Tasks

| # | Task | Details | Done |
|---|------|---------|------|
| 0.1 | Create Next.js project | `npx create-next-app@latest fit-portal --typescript --tailwind --eslint --app --src-dir` inside `/workspaces/cockpit/` | [ ] |
| 0.2 | Install dependencies | `prisma`, `@prisma/client`, `zod`, `lucide-react`, `@tanstack/react-query`, `date-fns`, `jspdf`, `exceljs`, `sanitize-html`, `mammoth` (DOCX→HTML), `pdf-parse` | [ ] |
| 0.3 | Install dev dependencies | `vitest`, `@testing-library/react`, `@testing-library/jest-dom` | [ ] |
| 0.4 | Install shadcn/ui | Initialize and add: `button`, `input`, `select`, `radio-group`, `checkbox`, `card`, `dialog`, `progress`, `badge`, `textarea`, `tabs`, `separator`, `skeleton`, `tooltip`, `dropdown-menu`, `scroll-area`, `accordion` | [ ] |
| 0.5 | Configure TypeScript | `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true` in tsconfig | [ ] |
| 0.6 | Configure ESLint | Extend `next/core-web-vitals`, add `@typescript-eslint/strict`, no-any rule | [ ] |
| 0.7 | Configure Tailwind | Add custom colors, fonts, spacing from `DESIGN-SYSTEM.md` to `tailwind.config.ts` | [ ] |
| 0.8 | Set up Prisma | Create `prisma/schema.prisma` EXACTLY as specified in `DATA-MODEL.md`. Run `prisma generate` and `prisma db push`. | [ ] |
| 0.9 | Create folder structure | EXACTLY as specified in `AGENT-PROTOCOL.md` Rule 9 | [ ] |
| 0.10 | Create symlink to specs | `ln -s /workspaces/cockpit/specs/fit-portal /workspaces/cockpit/fit-portal/specs` | [ ] |
| 0.11 | Add npm scripts | `dev`, `build`, `lint:strict`, `typecheck:strict`, `test`, `verify:data` | [ ] |
| 0.12 | Create `.env.local` | `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` (port 3003 to avoid conflict with main portal on 3002) | [ ] |
| 0.13 | Verify database connection | Create a `scripts/verify-db.ts` that connects to PostgreSQL and confirms schema is ready | [ ] |

### Quality Gate

```bash
cd /workspaces/cockpit/fit-portal
pnpm typecheck:strict    # 0 errors
pnpm lint:strict          # 0 errors, 0 warnings
pnpm build               # success
pnpm test --run           # passes (no tests yet, but suite runs)
npx prisma db push       # schema applied
npx tsx scripts/verify-db.ts  # "Database ready: X tables created"
```

All 6 must pass. Record results in `HANDOFF.md`.

---

## Phase 1: Data Ingestion Pipeline

### Objective
Parse the ENTIRE SAP ZIP file into the database. Every file, every row, every cell. Verify 100% completeness.

### Tasks

| # | Task | Details | Done |
|---|------|---------|------|
| 1.1 | Create ingestion script | `scripts/ingest-sap-zip.ts` — TypeScript script using `adm-zip`, `xlsx` (SheetJS), `mammoth`, `pdf-parse` | [ ] |
| 1.2 | Parse BPD XLSX files | For each of 550 XLSX files in TestScripts/: read "Test Cases" sheet, extract rows 5+ using column schema from `DATA-CONTRACT.md` Section 4. Insert into `ScopeItem` + `ProcessStep` tables. | [ ] |
| 1.3 | Parse BPD DOCX files | For each of 577 DOCX files: extract Purpose, Overview, Prerequisites sections as HTML using mammoth. Update corresponding `ScopeItem` record. | [ ] |
| 1.4 | Parse Config XLSM | Read `2508 S4H Cloud` sheet (rows 4-4706, 19 columns). Insert into `ConfigActivity` table. Read `IMG Activity TRAN in BC` sheet (rows 1-4451, 9 columns). Insert into `ImgActivity` table. Read expert config sheets (13 sheets). Insert into `ExpertConfig` table. | [ ] |
| 1.5 | Parse Links XLSX | Read all 3 sheets from `S4C_2508_MY_links.xlsx`. Insert into `SolutionLink` table. | [ ] |
| 1.6 | Store Setup PDFs | For each of 230 PDFs in Setup/: store binary in `SetupGuide` table with filename and file size. Extract page count via pdf-parse. | [ ] |
| 1.7 | Store General files | For each of 162 files in General/: classify type (upload_template, brd, template, other), store in `GeneralFile` table. | [ ] |
| 1.8 | Store Others files | Store 4 files from Others/ in `OtherFile` table. | [ ] |
| 1.9 | Store README.rtf | Extract text content, store in `ReadmeFile` table. | [ ] |
| 1.10 | Cross-reference functional areas | For each ScopeItem: look up its ID in the ConfigActivity table (column `Main Scope Item ID`) to find the Application Area and Application Subarea. Update ScopeItem.functionalArea and ScopeItem.subArea. For scope items not in config (orphans), set area to "Uncategorized". | [ ] |
| 1.11 | Cross-reference tutorial URLs | For each ScopeItem: look up its ID in the SolutionLink table (type=process). Update ScopeItem.tutorialUrl. | [ ] |
| 1.12 | Normalize step types | For each ProcessStep: apply the normalization rules from `DATA-CONTRACT.md` Section 12 to derive stepType from actionTitle. | [ ] |
| 1.13 | Derive process flow groups | For each ProcessStep: extract solutionProcessFlowName (column 7) and solutionProcessName (column 5). These define the visual grouping of steps into flows and processes. Store in processFlowGroup. | [ ] |
| 1.14 | Create verification script | `scripts/verify-data.ts` — runs ALL 13 integrity checks from `DATA-CONTRACT.md` Section 13 | [ ] |

### Quality Gate

```bash
cd /workspaces/cockpit/fit-portal
npx tsx scripts/ingest-sap-zip.ts /workspaces/cockpit/SAP_Best_Practices_for_SAP_S4HANA_Cloud_Public_Edition_2508_MY_SAPCUSTOMER.zip
npx tsx scripts/verify-data.ts

# verify-data.ts must output:
# ✓ Scope items: 550 (expected 550)
# ✓ Process steps: 102261 (expected 102261)
# ✓ Config activities: 4703 (expected 4703)
# ✓ Config categories: Mandatory=591, Recommended=1491, Optional=2604, Other=17
# ✓ Self-service configs: Yes=4690, No=13
# ✓ IMG activities: 4451 (expected 4451)
# ✓ Setup guides: 230 (expected 230)
# ✓ General files: 162 (expected 162)
# ✓ Solution links (scenario): 32 (expected 32)
# ✓ Solution links (process): 163 (expected 163)
# ✓ Expert configs: 13 (expected 13)
# ✓ Orphaned steps: 0
# ✓ Orphaned configs: 0
# ✓ All checks passed!

pnpm typecheck:strict    # 0 errors
pnpm lint:strict          # 0 warnings
pnpm test --run           # data verification tests pass
```

**ALL checks must show exact expected values. Any mismatch is a blocker.**

---

## Phase 2: Authentication & Assessment Setup

### Objective
Magic link auth, TOTP MFA, role-based access control, area-locked permissions, organization management, assessment creation with stakeholder management.

### Tasks

| # | Task | Details | Done |
|---|------|---------|------|
| 2.1 | Implement magic link auth | Email magic link via MagicLinkToken model. Token generation, email sending (stubbed in dev), token verification, session creation. | [ ] |
| 2.2 | Implement User and Organization models | CRUD for User, Organization. Role enum: process_owner, it_lead, executive, consultant, admin. | [ ] |
| 2.3 | Implement Session management | Session model with token, expiry, device tracking. Concurrent session detection: revoke existing session on new login. Session middleware on all protected routes. | [ ] |
| 2.4 | Implement TOTP MFA enrollment | `/mfa/setup` page: generate TOTP secret, display QR code (otpauth URI), verify 6-digit code. Encrypt secret with AES-256-GCM before storage. | [ ] |
| 2.5 | Implement TOTP MFA verification | `/mfa/verify` page: 6-digit code input with 30-second window. Rate limit: 5 attempts per challenge. Lock out after max attempts. | [ ] |
| 2.6 | Implement MFA enforcement middleware | All API routes check: if user.role is external (process_owner/it_lead/executive) AND session.mfaVerified is false, return 403 MFA_REQUIRED. Redirect to /mfa/setup if totpVerified is false, else /mfa/verify. | [ ] |
| 2.7 | Implement role-based routing | After login+MFA: process_owner → /assessment/[id]/review, it_lead → /assessment/[id]/review (read-only), executive → /dashboard, consultant → /assessments, admin → /admin. | [ ] |
| 2.8 | Implement area-locked permissions middleware | `src/lib/auth/permissions.ts`: check user.role + stakeholder.assignedAreas + target entity's functionalArea. Consultant override requires reason field. All overrides logged to DecisionLogEntry. | [ ] |
| 2.9 | Create login page | Per DESIGN-SYSTEM.md. Bound ≈ logo. Email input → magic link. Clean, minimal. | [ ] |
| 2.10 | Create MFA setup page | QR code display, manual secret display, 6-digit verification input, success confirmation. | [ ] |
| 2.11 | Create MFA verify page | 6-digit input, countdown timer, "Use recovery code" link, attempt counter. | [ ] |
| 2.12 | Create assessment list page | `/assessments` — shows assessments for user's org. Status badges. Create button. | [ ] |
| 2.13 | Create assessment creation flow | Company profile form with all Assessment model fields. Zod validation. | [ ] |
| 2.14 | Stakeholder management + onboarding | Add stakeholders with email, name, role, assignedAreas. Auto-create User record. Send magic link invitation with assessment context. | [ ] |
| 2.15 | Assessment status machine | draft → in_progress → completed → reviewed → signed_off. Role-based transition rules. | [ ] |
| 2.16 | Per-company progress dashboard | `/dashboard` — shows team progress by area, by person, activity feed, overall completion stats. | [ ] |

### Quality Gate

```bash
pnpm typecheck:strict && pnpm lint:strict && pnpm test --run && pnpm build
# All pass with 0 errors/warnings
# Manual verification:
# - Login with magic link works
# - MFA enrollment generates valid QR code and accepts correct TOTP
# - MFA verification blocks access until verified
# - Concurrent session: second login revokes first session
# - Process owner can only edit steps in assigned areas (403 otherwise)
# - Consultant can override area lock with required reason
# - Executive sees dashboard only
# - Stakeholder invitation creates user and sends magic link
```

---

## Phase 3: Scope Selection (Screen 2)

### Objective
Present the full SAP scope item catalog filtered by industry, allow selection/deselection, capture current state per item.

### Tasks

| # | Task | Details | Done |
|---|------|---------|------|
| 3.1 | Build scope selection page | `/assessment/[id]/scope` — grouped by functional area per ScopeItem.functionalArea | [ ] |
| 3.2 | Industry filter | Pre-select scope items based on IndustryProfile.applicableScopeItems. Gray out non-applicable items (still selectable). | [ ] |
| 3.3 | Current state capture | For each scope item: radio selection (YES/NO/MAYBE for relevance), plus dropdown (MANUAL/SYSTEM/OUTSOURCED/NA for currentState). | [ ] |
| 3.4 | Step count display | Show totalSteps per scope item from database. No hardcoded values. | [ ] |
| 3.5 | Progress tracking | Show % of scope items with responses. Persist on every change. | [ ] |
| 3.6 | Scope dependencies | If scope item A requires B (from Intelligence Layer), show dependency warning when A is selected without B. | [ ] |
| 3.7 | Decision logging | Every scope selection change logs to DecisionLogEntry. | [ ] |
| 3.8 | Save/resume | All selections persist to ScopeSelection table in real-time (debounced 500ms). | [ ] |

### Quality Gate

```bash
pnpm typecheck:strict && pnpm lint:strict && pnpm test --run && pnpm build
# Verify: all 550 scope items appear in UI
# Verify: selecting an industry filters the list
# Verify: step counts match database values
# Verify: selections persist across page reload
```

---

## Phase 4: Process Deep Dive (Screen 3)

### Objective
Step-by-step review of every process step within selected scope items. This is the core experience.

### Tasks

| # | Task | Details | Done |
|---|------|---------|------|
| 4.1 | Build sidebar navigation | List all selected scope items with progress (% steps reviewed). Click to navigate. | [ ] |
| 4.2 | Build process flow overview | For each scope item: group steps by solutionProcessFlowName. Show flow cards with step counts and progress. | [ ] |
| 4.3 | Build step review card | Per `DESIGN-SYSTEM.md` Step Review Card spec. Shows: SAP content (actionInstructionsHtml rendered), expected result, related configs. | [ ] |
| 4.4 | SAP HTML rendering | Render actionInstructionsHtml safely (sanitize-html with allowed tags: p, h1-h6, span, strong, em, ul, ol, li, table, tr, td, th, br). Preserve inline styles for bold/formatting. | [ ] |
| 4.5 | Client response capture | Radio group: FIT / CONFIGURE / GAP / NA. Per `DESIGN-SYSTEM.md`. | [ ] |
| 4.6 | Gap note capture | When GAP selected: required textarea "Tell us how your process differs". Min 10 characters. | [ ] |
| 4.7 | Related config display | For each step: query ConfigActivity where scopeItemId matches. Show inline: activity description, category badge (Mandatory/Recommended/Optional), self-service indicator. | [ ] |
| 4.8 | Step navigation | Previous/Next buttons. Step picker (numbered dots or dropdown). Keyboard shortcuts (←/→). | [ ] |
| 4.9 | Step type filtering | Option to hide LOGON and ACCESS_APP steps (repetitive). Toggle: "Show all steps" / "Show process steps only". Default: show all. | [ ] |
| 4.10 | Progress persistence | Every response saves to StepResponse table immediately. Decision log entry created. | [ ] |
| 4.11 | Batch operations | "Mark remaining as FIT" button (with confirmation) for steps the client has reviewed and confirmed. | [ ] |
| 4.12 | File attachment | Allow PNG/PDF/DOCX uploads per step (stored in blob storage). Max 10MB per file. | [ ] |
| 4.13 | Area-locked step editing | Process owners can only respond to steps whose parent ScopeItem.functionalArea is in their assignedAreas. Others get read-only view with "You don't have permission to edit this area" message. | [ ] |
| 4.14 | IT Lead technical notes | IT leads can add clientNote to any step but cannot change fitStatus. UI shows different form variant. | [ ] |
| 4.15 | Consultant override | Consultants can edit any step. When editing outside their normal scope, require reason field. Log PERMISSION_OVERRIDE to decision log. | [ ] |

### Quality Gate

```bash
pnpm typecheck:strict && pnpm lint:strict && pnpm test --run && pnpm build
# Verify: navigate to a scope item with 714 steps (J60)
# Verify: all 714 steps render with SAP HTML content
# Verify: marking FIT/GAP persists across reload
# Verify: gap note is required when GAP is selected
# Verify: related configs appear for relevant steps
# Verify: step navigation works (prev/next + keyboard)
# Verify: decision log entries are created for each response
```

---

## Phase 5: Gap Resolution Engine (Screen 5)

### Objective
For every identified gap, present resolution options with cost/risk analysis and capture the decision.

### Tasks

| # | Task | Details | Done |
|---|------|---------|------|
| 5.1 | Build gap summary page | `/assessment/[id]/gaps` — lists all gaps grouped by scope item. Shows count per resolution type. | [ ] |
| 5.2 | Resolution option cards | Per `DECISION-FRAMEWORK.md`: present FIT, CONFIGURE, KEY_USER_EXT, BTP_EXT, ISV, CUSTOM_ABAP, ADAPT_PROCESS, OUT_OF_SCOPE as selectable cards. | [ ] |
| 5.3 | Cost/effort display | For each option: show effort_days, recurring_cost, risk_level, upgrade_impact. Values from ExtensibilityPattern or manually entered. | [ ] |
| 5.4 | ADAPT comparison | Always show "What if you adapted?" alongside extension options. Show the cost delta. | [ ] |
| 5.5 | Rationale capture | Required text field when selecting any non-FIT resolution. Minimum 20 characters. | [ ] |
| 5.6 | Resolution persistence | Save to GapResolution table. Log to DecisionLogEntry. | [ ] |
| 5.7 | Summary statistics | Real-time calculation: total gaps, resolved gaps, total additional effort, total recurring cost. | [ ] |
| 5.8 | "What if" calculator | Toggle individual gaps between EXTEND and ADAPT to see the total effort change in real-time. | [ ] |

### Quality Gate

```bash
pnpm typecheck:strict && pnpm lint:strict && pnpm test --run && pnpm build
# Verify: all gaps from step review appear in gap summary
# Verify: selecting a resolution persists
# Verify: rationale is required
# Verify: effort/cost totals update in real-time
# Verify: decision log entries created for each resolution
```

---

## Phase 6: Configuration Matrix (Screen 4)

### Objective
Display the complete configuration workload derived from selected scope items.

### Tasks

| # | Task | Details | Done |
|---|------|---------|------|
| 6.1 | Build config matrix page | `/assessment/[id]/config` — all config activities for selected scope items. | [ ] |
| 6.2 | Category filtering | Filter by: Mandatory, Recommended, Optional. Sortable. Searchable. | [ ] |
| 6.3 | Self-service indicator | Show which configs are self-service (4,690) vs. require SAP support (13). | [ ] |
| 6.4 | Scope item grouping | Group configs by scope item. Show count per group. | [ ] |
| 6.5 | Include/exclude for Recommended/Optional | Client can include/exclude Recommended and Optional configs. Mandatory are always included. Log decisions. | [ ] |
| 6.6 | Summary counts | By area: Mandatory count, Recommended count, Optional count, Total. | [ ] |
| 6.7 | Setup guide links | Link each config to its scope item's Setup PDF (if exists). Open in-page PDF viewer. | [ ] |

### Quality Gate

```bash
pnpm typecheck:strict && pnpm lint:strict && pnpm test --run && pnpm build
# Verify: correct config counts per category (Mandatory=591 total, actual shown = subset for selected scope)
# Verify: filtering works
# Verify: include/exclude persists
# Verify: setup guide PDFs open correctly
```

---

## Phase 7: Report Generation (Screen 6)

### Objective
Generate the complete auditable assessment report in multiple formats.

### Tasks

| # | Task | Details | Done |
|---|------|---------|------|
| 7.1 | Executive Summary (PDF) | One-page overview: company, scope summary, fit %, gap count, effort estimate, key decisions. Bound branding. | [ ] |
| 7.2 | Scope Item Catalog (PDF/XLSX) | All 550 scope items: selected (87) with status, excluded (463) with reason. | [ ] |
| 7.3 | Process Step Detail (XLSX) | Every reviewed step: scope item, flow, step name, SAP content, client response, fit status, notes. | [ ] |
| 7.4 | Gap Register (XLSX) | All gaps: step reference, client description, resolution type, effort, cost, risk, decided by, rationale. | [ ] |
| 7.5 | Configuration Workbook (XLSX) | All config activities for selected scope: category, self-service, include/exclude decision. | [ ] |
| 7.6 | Extension Register (XLSX) | All non-standard resolutions: type, description, effort, recurring cost, upgrade risk. | [ ] |
| 7.7 | Adaptation Register (XLSX) | All ADAPT resolutions: current process, SAP process, change description. | [ ] |
| 7.8 | Effort Estimate (PDF) | Breakdown by area, by phase (implement, config, test, go-live), by resolution type. Confidence score. | [ ] |
| 7.9 | Decision Audit Trail (XLSX) | Complete DecisionLogEntry export: timestamp, actor, entity, action, old value, new value, reason. | [ ] |
| 7.10 | SAP Reference Pack (ZIP) | All Setup PDFs for selected scope items. BPD documents. Config XLSM extract. | [ ] |
| 7.11 | Report download page | UI to preview and download each section individually or as a combined ZIP. | [ ] |
| 7.12 | Sign-off workflow | Digital sign-off: client representative, Bound consultant, Bound PM. Captures name, email, timestamp. Stored in assessment record. | [ ] |
| 7.13 | Process Flow Atlas (PDF) | Generate sequential annotated flow diagrams per scope item per processFlowGroup. Steps are colored nodes: green=FIT, blue=CONFIGURE, amber=GAP, gray=N/A/pending. Connected by arrows. Compile all diagrams into a single PDF with table of contents. | [ ] |
| 7.14 | Remaining Items Register (XLSX) | Auto-generate remaining items: unreviewed steps, MAYBE scope items, excluded recommended configs, OUT_OF_SCOPE gaps, integration points, data migration items. Export as XLSX with columns: Category, Title, Description, Severity, Source, Functional Area, Assigned To. | [ ] |
| 7.15 | Flow diagram viewer | `/assessment/[id]/flows` — interactive viewer for generated flow diagrams. Zoom/pan, click step for detail, export individual flows as SVG/PDF. | [ ] |
| 7.16 | Remaining items view | `/assessment/[id]/remaining` — view, filter, sort remaining items. Add manual items. Export to XLSX. | [ ] |
| 7.17 | Blueprint output package | Complete ZIP containing: Executive Summary PDF, all XLSX reports, Process Flow Atlas PDF, Remaining Items Register XLSX, SAP Reference Pack. Single download. | [ ] |

### Quality Gate

```bash
pnpm typecheck:strict && pnpm lint:strict && pnpm test --run && pnpm build
# Verify: all 10 report sections generate without error
# Verify: PDF opens in browser and renders correctly
# Verify: XLSX opens in Excel/Google Sheets with correct data
# Verify: audit trail export contains all decision log entries
# Verify: sign-off captures all required fields
# Verify: Process Flow Atlas PDF generates with colored step nodes
# Verify: Remaining Items Register XLSX includes all auto-detected items
# Verify: Flow diagram viewer renders interactive SVG with zoom/pan
# Verify: Blueprint package ZIP contains all deliverables
```

---

## Phase 8: Intelligence Layer Admin

### Objective
Internal admin UI for managing effort baselines, industry profiles, extensibility patterns.

### Tasks

| # | Task | Details | Done |
|---|------|---------|------|
| 8.1 | Industry profile CRUD | Create/edit/delete industry profiles. Assign scope items per industry. | [ ] |
| 8.2 | Effort baseline editor | Per scope item: set complexity, effort days breakdown, confidence, notes. Bulk import via XLSX. | [ ] |
| 8.3 | Extensibility pattern library | CRUD for common gap patterns with resolution templates. | [ ] |
| 8.4 | Adaptation pattern library | CRUD for common adaptation patterns with recommendations. | [ ] |
| 8.5 | SAP release management | UI to trigger ZIP re-ingestion for new SAP releases. Shows current version (2508) and last ingestion date. | [ ] |
| 8.6 | Assessment dashboard | List all assessments across all clients. Filter by status. View summary stats. | [ ] |

### Quality Gate

```bash
pnpm typecheck:strict && pnpm lint:strict && pnpm test --run && pnpm build
# Verify: CRUD operations work for all Intelligence Layer tables
# Verify: industry profile assignment reflects in assessment scope selection
# Verify: effort baselines appear in report generation
```

---

## Phase 9: Polish & Production Readiness

### Tasks

| # | Task | Details | Done |
|---|------|---------|------|
| 9.1 | Loading states | Skeleton screens for all data-loading components | [ ] |
| 9.2 | Error states | Error boundaries with retry. API error display. | [ ] |
| 9.3 | Empty states | Appropriate messages when no data (no assessments, no gaps, etc.) | [ ] |
| 9.4 | Keyboard navigation | Tab order, Enter/Space activation, arrow key navigation in step review | [ ] |
| 9.5 | Print styles | CSS @media print for report pages | [ ] |
| 9.6 | Performance audit | Lighthouse score > 90. Bundle analysis. Lazy loading for heavy components. | [ ] |
| 9.7 | Security audit | Auth on all routes. Input sanitization. CSRF protection. Rate limiting. | [ ] |
| 9.8 | Final verification | Run ALL quality gates from ALL phases. Everything must still pass. | [ ] |
| 9.9 | MFA UX polish | Smooth QR code animation, clear error messages for wrong codes, countdown timer for TOTP window, recovery code flow. | [ ] |
| 9.10 | Permission denied UX | Clear, helpful messages when area-locked editing blocks an action. Show which area the user needs access to. | [ ] |
| 9.11 | Dashboard polish | Real-time progress updates, smooth animations, clear team visibility. | [ ] |

### Quality Gate (FINAL)

```bash
cd /workspaces/cockpit/fit-portal
pnpm typecheck:strict    # 0 errors
pnpm lint:strict          # 0 warnings
pnpm test --run           # ALL tests pass
pnpm build               # success
npx tsx scripts/verify-data.ts  # ALL 13 checks pass
# Lighthouse Performance: > 90
# Lighthouse Accessibility: > 90
```

---

## Phase Dependency Graph

```
Phase 0 (Scaffold)
  └──→ Phase 1 (Data Ingestion)
         ├──→ Phase 2 (Auth, MFA, Permissions & Assessment)
         │      └──→ Phase 3 (Scope Selection)
         │             └──→ Phase 4 (Process Deep Dive + Area Locks)
         │                    └──→ Phase 5 (Gap Resolution)
         │                           └──→ Phase 7 (Reports + Flow Atlas + Remaining Items)
         │                                  └──→ Phase 9 (Polish)
         └──→ Phase 6 (Config Matrix) ──→ Phase 7
         └──→ Phase 8 (Intelligence Admin) ──→ Phase 7
```

Phases 3, 6, and 8 can run in parallel after their dependencies are met.
Phase 7 requires 4, 5, 6, and 8.
Phase 9 is always last.

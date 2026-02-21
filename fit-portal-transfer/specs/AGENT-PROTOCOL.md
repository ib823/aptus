# Agent Protocol — Mandatory Rules for ALL AI Agents

**THIS DOCUMENT GOVERNS ALL AI AGENTS** (Claude Code, Codex, Cursor, Copilot, or any other) working on the Bound Fit Portal. Violation of any rule invalidates the work product.

---

## Rule 1: Single Source of Truth

The specification files in `/workspaces/cockpit/specs/fit-portal/` are the ONLY authority.

- **NEVER** invent, assume, or fabricate data that is not in the spec or derivable from the SAP ZIP file.
- **NEVER** create placeholder data, mock content, or "lorem ipsum" for SAP-sourced fields.
- **NEVER** guess at column names, row counts, or file structures — they are exactly specified in `DATA-CONTRACT.md`.
- **ALWAYS** verify your work against the spec before marking any task as complete.
- If the spec is ambiguous, STOP and flag the ambiguity. Do not proceed with an assumption.

---

## Rule 2: Zero Hallucination Policy

For SAP-sourced data:
- Every scope item ID must exist in the verified list of 550 BPD scope items (see `DATA-CONTRACT.md` Section 3).
- Every configuration activity must trace to the XLSM main sheet (`2508 S4H Cloud`, 4,703 data rows).
- Every process step must trace to a BPD XLSX file from the ZIP.
- Process step counts per scope item must match the verified counts (see `DATA-CONTRACT.md` Section 6).
- Column names must match exactly — character for character — as specified in `DATA-CONTRACT.md` Section 4.

For Intelligence Layer data (effort baselines, industry profiles, extensibility catalog):
- These are NOT in the ZIP. They must be clearly marked as `[INTELLIGENCE_LAYER]` in the schema.
- They must have admin UI for manual population — they are never auto-generated.
- Default values must be clearly marked as defaults, not presented as SAP-sourced data.

---

## Rule 3: Completeness Verification

After EVERY phase of work, the agent MUST run the verification script defined in `VERIFICATION.md`.

**Minimum checks before declaring a phase complete:**

1. **Data Ingestion Phase**: Run `pnpm verify:data` which confirms:
   - Exactly 550 scope items in database (from BPD XLSX)
   - Exactly 102,261 process steps in database
   - Exactly 4,703 configuration activities in database
   - Exactly 4,451 IMG Activity cross-references in database
   - Exactly 230 setup PDF records in database
   - Exactly 162 general file records in database
   - 0 orphaned steps (every step links to a valid scope item)
   - 0 orphaned configs (every config links to a valid scope item)

2. **Screen Implementation Phase**: For each screen:
   - All data fields specified in `SCREENS.md` are rendered
   - All interactions specified in `SCREENS.md` are functional
   - All states (loading, empty, error, populated) are handled
   - TypeScript strict mode passes with 0 errors
   - Lint passes with 0 warnings

3. **API Phase**: For each endpoint:
   - Request/response matches `API-CONTRACT.md` exactly
   - Auth is enforced as specified
   - Error responses match specified error codes
   - Integration test passes

4. **Build Completion**: ALL of the following pass:
   - `pnpm typecheck:strict` — 0 errors
   - `pnpm lint:strict` — 0 warnings
   - `pnpm test --run` — 0 failures
   - `pnpm build` — successful
   - `pnpm verify:data` — all counts match

---

## Rule 4: Handoff Protocol

When work is handed off between agents (e.g., Claude Code stops, Codex continues):

### The outgoing agent MUST:
1. Commit all work with a descriptive message referencing the spec phase
2. Update `BUILD-PHASES.md` with completion status of each task
3. Run and record verification results
4. Leave NO uncommitted changes
5. Leave NO broken builds
6. Document any known issues or deviations in a `HANDOFF.md` file at the project root

### The incoming agent MUST:
1. Read ALL spec files in `/workspaces/cockpit/specs/fit-portal/` before writing any code
2. Read `HANDOFF.md` if it exists
3. Run verification to confirm the state left by the previous agent
4. Continue from the next uncompleted task in `BUILD-PHASES.md`
5. NEVER redo work that has passed verification
6. NEVER refactor or "improve" completed work unless the spec requires it

---

## Rule 5: Code Quality Standards

### TypeScript
- Strict mode: `"strict": true` in tsconfig
- No `any` types — every value is typed
- No `// @ts-ignore` or `// @ts-expect-error`
- No `as` type assertions unless explicitly required for a third-party library
- All function parameters and return types explicitly typed
- All API response types defined in a shared types file

### React/Next.js
- Server Components by default; Client Components only when interactivity is required
- No inline styles — Tailwind CSS only
- No `useEffect` for data fetching — use Server Components or React Query
- All user-facing text must be in a constants file, never hardcoded in JSX
- All forms must have validation (Zod schemas)
- All loading/error/empty states must be handled

### Database
- All queries via Prisma — no raw SQL unless performance-critical and documented
- All mutations in transactions where atomicity is required
- All user-facing IDs are cuid2 (not auto-increment)
- All timestamps are UTC
- Soft-delete where specified (Decision Log is append-only, never deleted)

### Testing
- Unit tests for all utility functions and decision logic
- Integration tests for all API endpoints
- Data verification tests that run against the ingested database
- No snapshot tests — they're brittle and meaningless

---

## Rule 6: SAP Data Referencing

When implementing ANY feature that displays SAP data:

1. **ALWAYS** query the database, which was populated from the ZIP
2. **NEVER** hardcode SAP scope item names, step counts, or config activities
3. **NEVER** assume a scope item exists — always handle the "not found" case
4. **ALWAYS** display the SAP version identifier ("SAP Best Practices 2508") alongside SAP-sourced data
5. **ALWAYS** preserve the original SAP HTML content for process steps (Action Instructions column) — do not rewrite, summarize, or modify
6. **ALWAYS** link configuration activities to their parent scope item

---

## Rule 7: UX Standards

1. **No SAP jargon in client-facing UI**: Translate internally, display human language
   - "Scope Item J60" → "Accounts Payable"
   - "BPD" → "Process Document"
   - "SSCUI" → hidden, never shown
2. **Apple HIG alignment**: See `DESIGN-SYSTEM.md` for exact specifications
3. **Accessibility**: WCAG 2.1 AA minimum — proper ARIA labels, keyboard navigation, focus management
4. **Responsive**: Tablet-first (1024px primary), desktop (1440px), mobile (375px) read-only
5. **Performance**: First Contentful Paint < 1.5s, Time to Interactive < 3s
6. **Progressive disclosure**: Show summary first, details on demand, never overwhelm

---

## Rule 8: Audit Trail

Every user action that modifies assessment data MUST be logged to the Decision Log:

```
{
  assessmentId: string,
  entityType: "scope_item" | "process_step" | "gap" | "config_activity" | "assessment",
  entityId: string,
  action: string,       // e.g., "MARKED_FIT", "MARKED_GAP", "RESOLUTION_SELECTED"
  oldValue: json | null,
  newValue: json,
  actor: string,         // user email
  actorRole: string,     // "process_owner" | "it_lead" | "executive" | "consultant" | "admin"
  timestamp: ISO8601,
  reason: string | null  // required for gap resolutions
}
```

The Decision Log table is:
- **Append-only**: No UPDATE or DELETE operations, ever
- **Indexed**: By assessmentId, entityId, actor, timestamp
- **Exportable**: Included in the final assessment report

---

## Rule 9: File Organization

```
/workspaces/cockpit/fit-portal/          # Separate Next.js project root
├── src/
│   ├── app/                             # Next.js App Router pages
│   │   ├── (client)/                    # Client-facing routes (grouped)
│   │   │   ├── assessment/[id]/         # Assessment wizard
│   │   │   ├── review/[id]/            # Process deep dive
│   │   │   └── report/[id]/            # Final report view
│   │   ├── (admin)/                     # Internal admin routes
│   │   │   ├── intelligence/           # Manage effort baselines, etc.
│   │   │   ├── ingest/                 # SAP ZIP ingestion
│   │   │   └── assessments/            # Assessment management
│   │   ├── api/                        # API routes
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/                         # shadcn/ui base components
│   │   ├── assessment/                 # Assessment-specific components
│   │   ├── review/                     # Process review components
│   │   ├── report/                     # Report generation components
│   │   └── shared/                     # Shared components
│   ├── lib/
│   │   ├── db/                         # Prisma client and queries
│   │   ├── sap/                        # SAP data types and utilities
│   │   ├── decision/                   # Decision framework logic
│   │   ├── report/                     # Report generation utilities
│   │   └── audit/                      # Decision log utilities
│   ├── types/                          # TypeScript type definitions
│   └── constants/                      # UI text, enums, configuration
├── prisma/
│   ├── schema.prisma                   # Database schema
│   ├── seed.ts                         # Seed Intelligence Layer defaults
│   └── migrations/
├── scripts/
│   ├── ingest-sap-zip.ts              # ZIP → database ingestion script
│   └── verify-data.ts                 # Data completeness verification
├── specs/ → symlink to /workspaces/cockpit/specs/fit-portal/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── verification/
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── HANDOFF.md                          # Current state for agent handoffs
```

---

## Rule 10: What To Do When Stuck

1. **Missing data**: If a spec references data that cannot be found in the ZIP or database, STOP. Log the discrepancy in `HANDOFF.md`. Do NOT fabricate data.

2. **Ambiguous spec**: If a specification is unclear or contradictory, STOP. Log the ambiguity in `HANDOFF.md` with your interpretation and why you're unsure. Do NOT proceed with a guess.

3. **Performance issue**: If a query or rendering is slow (>2s), log it in `HANDOFF.md` with the specific query/component and measured time. Do NOT add caching or optimization without it being in the spec.

4. **Third-party library conflict**: If a required library conflicts with an existing dependency, log it in `HANDOFF.md`. Do NOT force-install or version-pin without documenting.

5. **Scope creep**: If you think of a "nice to have" feature not in the spec, DO NOT BUILD IT. Log it in `HANDOFF.md` under "Suggestions" if you want, but do not implement.

---

## Rule 11: MFA and Authentication

1. All external users (process_owner, it_lead, executive) MUST complete TOTP MFA enrollment on first login.
2. The login flow is: email → magic link → token verify → session created (mfaVerified=false) → MFA setup/verify → session fully authenticated (mfaVerified=true).
3. NEVER bypass MFA checks in API route handlers. Every protected endpoint checks session.mfaVerified.
4. TOTP secrets MUST be encrypted at rest using AES-256-GCM. NEVER store plaintext TOTP secrets.
5. Concurrent sessions are blocked: one active session per user. New login revokes existing session.

---

## Rule 12: Area-Locked Permissions

1. Process owners can ONLY modify StepResponse and ScopeSelection records for entities whose parent ScopeItem.functionalArea is in their AssessmentStakeholder.assignedAreas.
2. IT leads can add clientNote to any step but CANNOT change fitStatus.
3. Executives have read-only access. They cannot modify any assessment data.
4. Consultants can override area locks. Every override MUST include a reason and is logged as PERMISSION_OVERRIDE in the Decision Log.
5. Permission checks are enforced at the API middleware layer, NOT just in the UI. The UI reflects the permissions, but the server is the authority.
6. When implementing area-locked editing, always check the permission BEFORE performing the database mutation. Never mutate first and check after.

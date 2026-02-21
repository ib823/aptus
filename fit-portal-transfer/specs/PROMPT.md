# Universal Execution Prompt — Bound Fit Portal

**Copy everything below the line into any AI CLI session (Claude Code, Codex, Cursor, Copilot, etc.) to resume work.**

---

```
You are building the Bound Fit Portal — a standalone Next.js web application for SAP S/4HANA Cloud best practices process validation with role-based access, TOTP MFA, area-locked editing, and blueprint output generation.

## Your Bible

All specifications live in /workspaces/cockpit/specs/fit-portal/. These files are the ONLY source of truth. Read them before writing any code.

| Priority | File | What It Tells You |
|----------|------|-------------------|
| 1 | MASTER.md | Product vision, 5 user roles, success criteria, blueprint deliverables |
| 2 | AGENT-PROTOCOL.md | 12 mandatory rules you MUST follow — read this FIRST |
| 3 | BUILD-PHASES.md | What to build, in what order, quality gates per phase |
| 4 | DATA-CONTRACT.md | The SAP ZIP file contents — every file, column, row count |
| 5 | DATA-MODEL.md | Complete Prisma schema with MFA, permissions, flow diagrams, remaining items |
| 6 | ARCHITECTURE.md | Tech stack, folder structure, environment setup, MFA/permission architecture |
| 7 | API-CONTRACT.md | 69 API endpoints with Zod schemas and TypeScript interfaces |
| 8 | SCREENS.md | 14 screens, component hierarchy, states, interactions, MFA & dashboard |
| 9 | DESIGN-SYSTEM.md | Colors, typography, spacing, component styles |
| 10 | DECISION-FRAMEWORK.md | Gap resolution logic, cost formulas, business rules |
| 11 | VERIFICATION.md | 149+ unit tests, 153+ integration tests, 7 E2E scenarios, quality gates |

## Key Architecture Concepts

### 5 User Roles (Non-Negotiable)
- **External** (require TOTP MFA):
  - `process_owner` — area-locked editing (only assigned functional areas)
  - `it_lead` — read-only + technical notes (cannot change fitStatus)
  - `executive` — dashboard-only read access
- **Internal** (MFA optional):
  - `consultant` — full access, can override area locks with logged reason
  - `admin` — system administration, unrestricted

### MFA Flow
Login → Magic Link → Token Verify → Session (mfaVerified=false) → MFA Setup/Verify → Session (mfaVerified=true)
- All external users MUST complete TOTP MFA
- TOTP secrets encrypted at rest with AES-256-GCM
- One active session per user (concurrent sessions blocked)

### Area-Locked Permissions
- Enforced at API middleware layer, not just UI
- Process owners edit only their assigned functional areas
- Consultant overrides require a reason → logged as PERMISSION_OVERRIDE
- Check permissions BEFORE database mutation, never after

### Blueprint Output Package (New)
- Process Flow Atlas — sequential annotated flow diagrams (SVG), color-coded by fit status
- Remaining Items Register — auto-generated XLSX of unresolved items across 7 categories
- Both exported as part of the final assessment deliverable

## Your First Action — Every Single Time

BEFORE writing any code, run this diagnostic sequence:

Step 1: Read the protocol.
  cat /workspaces/cockpit/specs/fit-portal/AGENT-PROTOCOL.md

Step 2: Check if the project exists.
  ls /workspaces/cockpit/fit-portal/package.json 2>/dev/null && echo "PROJECT EXISTS" || echo "PROJECT NOT CREATED"

Step 3: If project exists, check current state.
  cd /workspaces/cockpit/fit-portal
  cat HANDOFF.md 2>/dev/null || echo "NO HANDOFF FILE"
  cat BUILD-PHASES-STATUS.md 2>/dev/null || echo "NO STATUS FILE"
  git log --oneline -20 2>/dev/null
  pnpm typecheck:strict 2>/dev/null; pnpm lint:strict 2>/dev/null; pnpm test --run 2>/dev/null

Step 4: Determine the current phase.
  Read BUILD-PHASES.md from the specs. Cross-reference with HANDOFF.md and BUILD-PHASES-STATUS.md in the project. The FIRST phase with unchecked tasks is your current phase.

Step 5: Execute the current phase.
  Complete every task in the current phase. Run the phase's quality gate. Record results. Move to the next phase.

## Rules — Non-Negotiable

1. TRUST COMPLETED WORK. If a phase is marked complete in HANDOFF.md with passing quality gates, it IS complete. Do not re-examine, refactor, or second-guess it. Do not re-run its tests "just to check." It was done to gold standard. Move forward.

2. NEVER DEVIATE FROM THE SPEC. Every data model field, every API endpoint, every component, every color — it's all specified. If you think the spec is wrong, document your concern in HANDOFF.md and proceed with the spec as written. Do not improvise.

3. ZERO HALLUCINATION. The SAP ZIP contains exactly 550 scope items, 102,261 process steps, 4,703 config activities. These numbers are verified. If your code produces different numbers, YOUR CODE is wrong. Fix it.

4. QUALITY GATES ARE MANDATORY. After completing a phase, run EVERY command in its quality gate section. ALL must pass. If any fail, fix the issue before proceeding. Never skip a gate.

5. HANDOFF AFTER EVERY PHASE. After a phase's quality gates pass:
   - Update HANDOFF.md with: phase completed, quality gate results, any notes
   - Update BUILD-PHASES-STATUS.md: mark all tasks in the phase as [x]
   - Commit with message: "Phase N: [description] — all quality gates passed"
   - This is how the next agent (or your next session) knows where to start

6. ONE PHASE AT A TIME. Complete Phase N entirely before starting Phase N+1. No partial phases, no skipping ahead, no "I'll come back to this."

7. STRICT TYPESCRIPT. strict: true, noUncheckedIndexedAccess: true. No `any`. No `@ts-ignore`. No `as unknown as`. Every type explicit.

8. THE SAP ZIP FILE is at: /workspaces/cockpit/SAP_Best_Practices_for_SAP_S4HANA_Cloud_Public_Edition_2508_MY_SAPCUSTOMER.zip
   Always reference this path. Never hardcode SAP data — always read from the ZIP or database.

9. PORT 3003. The fit portal runs on port 3003 (main Bound portal uses 3002). Database name: fit_portal.

10. WHEN STUCK: Stop. Document what's blocking you in HANDOFF.md. Do not guess, do not hallucinate a solution, do not skip the blocker. The next agent or human will resolve it.

11. MFA AND AUTHENTICATION. All external users require TOTP MFA. Encrypt secrets with AES-256-GCM. Never bypass mfaVerified checks. One session per user — new login revokes existing.

12. AREA-LOCKED PERMISSIONS. Process owners edit only assigned areas. IT leads can add notes but not change fitStatus. Executives are read-only. Consultant overrides require reason + audit log. Enforce at API middleware, not just UI.

## Phase Dependency Graph

Phase 0 (Scaffold) → Phase 1 (Data Ingestion) → Phase 2 (Auth + MFA + Roles) → Phase 3 (Scope Selection) → Phase 4 (Process Deep Dive + Area Locks) → Phase 5 (Gap Resolution) → Phase 7 (Reports + Flow Atlas + Remaining Items) → Phase 9 (Polish + MFA UX)
Phase 1 → Phase 6 (Config Matrix) → Phase 7
Phase 1 → Phase 8 (Intelligence Admin) → Phase 7

## What Success Looks Like

When Phase 9 is complete:
- pnpm typecheck:strict → 0 errors
- pnpm lint:strict → 0 warnings
- pnpm test --run → ALL pass (302+ tests: 149 unit + 153 integration)
- pnpm build → success
- npx tsx scripts/verify-data.ts → 13/13 checks pass
- The portal at localhost:3003 renders all 14 screens from SCREENS.md
- All 69 API endpoints from API-CONTRACT.md work
- The SAP ZIP's 550 scope items, 102,261 steps, and 4,703 configs are queryable
- External users complete TOTP MFA enrollment and login with 2FA
- Process owners can only edit steps in their assigned functional areas
- Concurrent sessions are blocked (one session per user)
- Flow diagrams generate color-coded SVGs for reviewed scope items
- Remaining items auto-detect from assessment data across 7 categories
- Company dashboard shows progress by area, by person, and activity feed
- Blueprint output package includes Flow Atlas PDF + Remaining Items XLSX
- An assessment can be created, stakeholders onboarded, reviewed, resolved, reported, and signed off

## Start Now

Read AGENT-PROTOCOL.md, then determine your current phase, then execute.
```

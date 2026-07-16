# MASTER PROMPT — Claude Code · Build the Neutral Process Discovery capability into `ib823/aptus` and deploy to live

Before pasting: copy the design + data artifacts into the repo (step 0 below), commit, then paste everything below the line into Claude Code CLI at the repo root.

---

You are building the **Neutral Process Discovery** capability — a client discovery surface + a consultant workbench — into the existing ABeam Workbench repo (Next.js 15 App Router, Tailwind v4 token system, the shipped Affirm External patterns). The designs are **approved and verified**; the data is **final and QA'd**. This is a build-to-spec pass, following the same playbook as the Affirm External build (guest infra, flag-gated deploy). Do not invent design, copy, or data — everything you need is committed.

## 0 · SOURCE-OF-TRUTH ARTIFACTS (copy into repo first, commit as `docs/neutral-discovery/`)

| Artifact | Role |
|---|---|
| `design/Neutral Process Discovery.dc4.html` | Client surface visual contract — Explore (V1–V4), Present (V5), Export, all states |
| `design/Consultant Workbench.dc3.html` | Consultant surface visual contract — C1–C10, fenced product-map, split-screen seam |
| `data/app-data/discovery-library.client.json` | **Client dataset** (742 processes, flows, sub-steps, completeness — vendor-term free, verified) |
| `data/app-data/discovery-library.consultant.json` | **Consultant dataset** (adds origin, APQC, full provenance, parked SAP enablers) |
| `data/app-data/vendor-term-guard.json` | The banned-terms list for the CI guard test |
| `data/app-data/MANIFEST.json` | Integrity manifest (counts + hashes) — CI asserts against it |
| `P4-Client-Capture-Method.md` | The capture→promote pipeline the C5 wizard implements |
| `DESIGN-BRIEF-Neutral-Process-Discovery.md` + `DESIGN-BRIEF-Consultant-Workbench.md` | Written spec behind the .dc files; where a .dc and brief disagree, the brief wins |

**How to read the .dc files:** self-contained design-component prototypes — semantic HTML sections per screen, inline styles bound to CSS vars matching the repo's tokens, `{{ }}` view-model bindings, and a `<script>` state model enumerating states and interactions. Extract the visual contract (structure, tokens, states, copy); ignore `./support.js`.

## 1 · ARCHITECTURE — how the pieces synergize

```
                       ┌──────────────────────────────────────────────┐
   canonical library ─▶│ src/data/discovery/  (committed JSON)         │
   (P1–P4 output)      │  client.json ── consultant.json ── guard.json │
                       └──────┬───────────────────────┬───────────────┘
                              │ serializer (allowlist) │ full read
                    ┌─────────▼─────────┐   ┌──────────▼──────────────┐
                    │ CLIENT surface    │   │ CONSULTANT workbench     │
                    │ app/(external)/d/*│   │ app/(workbench)/discovery│
                    │ Explore·Present·  │   │ C1–C10 · product map     │
                    │ Export            │   │ (fenced) · sessions      │
                    └─────────┬─────────┘   └──────────┬──────────────┘
                              │   §8 seam: session + live decisions    │
                              └───────────────┬────────────────────────┘
                                              ▼
                                   decisions store (DB) → C9 outputs
                                   (client pack · internal pack)
```

Principles:
1. **One data source, two serializers.** Both surfaces read the committed JSON; the client route's serializer consumes `client.json` ONLY (which contains no vendor terms by construction). The consultant dataset is never imported by any `(external)` module — enforce with a lint rule/dependency check, not convention.
2. **Reuse, don't rebuild.** The designs were verified against repo tokens. Extend the shipped components: choice chips → fit selector; ProcessFlowStrip → role-laned flow; ribbon segment, stat tiles, stacked progress bar, status pills, grants table (Affirm S9) → reviewer grants. New components live in `src/components/discovery/` (client) and `src/components/discovery/workbench/` (consultant).
3. **Same guest-infra pattern as Affirm External** for client sessions (token link + OTP verify + sealed states) — reuse that code path, do not fork a second auth mechanism.
4. **Decisions are server state** (same DB/ORM as affirm decisions): fit status + reason per process per session; captures (park/notes/red-lines) per session for P4.

## 2 · ROUTES & FLAG

- Client: `app/(external)/d/[token]` → verify → `d/home` (V1) → `d/stream/[id]` (V2) → `d/process/[pid]` (V3) → `d/summary` (V4). Present mode = a mode param/state on the same routes (V5 chrome); Export = print-clean route `d/export`.
- Consultant: `app/(workbench)/discovery/{,library,coverage,sources,map,sessions,facilitate,outputs,health}` (C1–C10; C3 editor is a drawer on library).
- Feature flag: **`NEUTRAL_DISCOVERY_ENABLED`** — exactly the `AFFIRM_EXTERNAL_ENABLED` pattern: unset ⇒ all `(external)/d/*` 404 and the workbench section hides. Rollback = unset flag.

## 3 · STAGED BUILD — six PRs, in order (one branch each, conventional commits)

**PR-1 · Data layer + guards** — commit datasets under `src/data/discovery/`; typed loaders + zod schema; serializer allowlist for client routes; **CI guard tests**: (a) grep every file under `app/(external)/d/**` + `components/discovery/**` (client side) + the built client dataset against `vendor-term-guard.json` → must be 0; (b) assert MANIFEST counts (742/726/400) against the loaded data; (c) dependency-boundary test: no `(external)` module imports the consultant dataset. *Gate: typecheck, lint, unit tests green.*

**PR-2 · Client Explore (V1–V4)** — the core journey per dc4: overview ribbon + heatmap, stream index, process detail with role-laned flow + sub-step drill + completeness badge + fit selector (radiogroup semantics, `aria-live` scorecard — close the a11y debt the prototypes deferred), summary buckets. Guest session infra reused from Affirm. *Gate: e2e journey spec (land → verify → decide 3 processes incl. one differ-with-reason → summary), axe scan green.*

**PR-3 · Client Present + Export** — Present chrome (keyboard 1–4 / arrows, facilitator bar, flow-hero) and the print-clean Export pack (pattern+label decisions, colorblind-safe). *Gate: keyboard e2e, print snapshot.*

**PR-4 · Consultant core (C1–C4, C6, C10)** — workbench home, library grid (semantic `<table>`, real keyboard nav — close the a11y debt), process/flow editor drawer, APQC coverage + gap register, **fenced product map** (guard banner + lock; route lives only in `(workbench)`), library health. *Gate: axe on all views; the wall test — assert product-map components/data are unreachable & unimported from `(external)`.*

**PR-5 · Sessions + facilitation + the seam (C7, C8)** — session setup + reviewer grants (reuse Affirm S9), launch → facilitation console; consultant console private (notes never serialized to client payloads — test this), client Present view driven by session state; live decision flow-back to C9. *Gate: two-browser e2e (consultant drives, client view follows; notes absent from client network traffic).*

**PR-6 · Outputs + P4 capture (C5, C9)** — decisions review, **two-lane export** (distinct actions + distinct confirm copy; client pack serializer reuses PR-1 allowlist so it *cannot* contain the product map — test by construction, not review); C5 sources + capture-promotion wizard implementing `P4-Client-Capture-Method.md` (triage → generalize → anonymization checklist + second-reviewer sign-off field → promote with `origin: client-captured`, internal register vs shared entry separation). *Gate: export-content test (internal pack has map, client pack provably doesn't), wizard e2e.*

## 4 · INVARIANTS (violating any fails the pass)

1. **Product-agnostic wall:** no vendor term (guard list) in any client-facing route, component, dataset, or export — enforced by CI grep + serializer allowlist, both.
2. **Consultant-only wall:** product map + internal pack unreachable and unimportable from `(external)`; C8 notes never reach a client payload.
3. Two-lane export: two buttons, two confirms, two serializers — never one toggle.
4. Honesty rules carried from the designs: fallbacks for the 16 no-flow processes, completeness badges everywhere a process renders, "roles indicative" footnotes, empty Oracle/NetSuite cells shown as "to map".
5. Tokens only (no stray hex — reuse the repo's guard test); light mode; the locked type ramp.
6. Sealed/read-only, skeleton, empty, error states are first-class, per the .dc state models.
7. Data is read-only in PR-1..5; only PR-6's wizard writes library changes, and only via the P4 pipeline with review sign-off.

## 5 · GATES (every PR)

`pnpm typecheck:strict` · `pnpm lint:strict` · `pnpm test` · relevant e2e specs green · axe a11y scan on new routes · vendor-term guard green · no-stray-hex guard green · MANIFEST assertion green. Keep a parity checklist per screen vs the .dc contract in `docs/neutral-discovery/BUILD-LOG.md` (screen · state · match/deviation · reason).

## 6 · DEPLOY SEQUENCE (Vercel, same as Affirm External)

1. Merge PR-1..6 to main with **`NEUTRAL_DISCOVERY_ENABLED` unset** — production unchanged (routes 404, workbench section hidden). Verify `/d/anything` 404s in prod after each deploy.
2. In a **preview env with the flag ON**: full dry-run — consultant creates session → invites reviewer → client journey end-to-end (Explore + one Present-driven segment) → decisions land in C9 → both exports → verify the client pack contains zero vendor terms (run the guard against the generated artifact) → run one P4 capture through the wizard.
3. **Pilot:** set the flag ON in production, create the pilot engagement (⟨pilot client⟩), run the first real discovery. Rollback at any point = unset the flag (instant, pure UI+routes; no destructive migrations in this build — decisions tables are additive).
4. **Post-pilot:** run the P4 harvest per the method doc; regenerate library data via the established scripts; bump MANIFEST; ship as a data-only PR.

## 7 · WHAT NOT TO DO

- Do not read process content from the repo's raw SAP/BPD files for these surfaces — the committed neutral datasets are the only content source (this exact mistake produced a vendor-leak in design v1).
- Do not fork the guest/OTP/session infra — reuse Affirm's.
- Do not touch existing Affirm surfaces, presales `/c/*`, or portal code beyond the shared components you extend.
- Do not add migrations that alter existing tables; discovery tables are new + additive.
- No new tokens, fonts, colors; ≤ the repo's existing design system.

**Final report:** per-PR summary, parity checklist, deviations with one-line rationale, test deltas, and the preview-env dry-run evidence (screenshots + the guard-scan output on the generated client pack).

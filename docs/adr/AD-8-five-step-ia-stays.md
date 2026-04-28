# AD-8: 5-step IA stays; sub-tab structure rebuilt

**Status:** Accepted (2026-04-27)

## Context

`StepRail.STEPS` (`src/components/aptus/StepRail.tsx:33-39`) defines the
canonical 5-step assessment IA: Profile → Scope → Analyze → Adjust → Export.
This is referenced by `APTUS-DESIGN-SPEC.md §3` as the product's spine.

The 5 steps are a sound cognitive frame. Verified in this session by walking
the Bursa engagement end-to-end.

The cognitive defect is BELOW the spine: `AptusAssessmentShell.tsx:43-74`
adds sub-tabs per step, with the Adjust step having SIX siblings:
- Gaps
- Config
- Integrations
- Data Migration
- OCM
- Remaining

These six aren't peers. They're facets of the SAME gap. Resolving a single
gap requires navigating all six tabs (~3-5 minutes of tab-switching per gap;
for 67 gaps in the Bursa pass this compounds).

## Decision

- The 5-step `STEPS` array stays unchanged. It's the right cognitive frame.
- The Adjust step's sub-tabs collapse from 6 to 3 (Phase 7):
  - **Gap Workspace** — per-gap unified view: definition + resolution path
    + integration touchpoints + data-migration impact + OCM impact, all on
    one page.
  - **Operational Plan** — Remaining Items + cross-gap summary
    (Remaining is a catch-all, not a gap facet, so stays separate).
  - **Phase Bridge** — cross-gap dependencies (replaces what `cross-phase`
    partly does at the assessment level; `cross-phase` itself moves to
    portfolio per AD-9).

Other steps' sub-tabs are simpler (Scope=4, Analyze=4, Export=3) and stay
as-is, with the addition of an "Analyze" QA sub-tab from Phase 6.

## Consequences

### Positive

- Cognitive surface for resolving a gap drops from 6 tabs × N gaps to
  1 workspace × N gaps.
- The 5-step canonical IA stays stable; no muscle-memory disruption for
  existing users.
- Sub-tab restructure is mechanical (rehosting existing client components
  inside the new workspace shell).

### Negative

- Existing bookmarks to `/gaps`, `/config`, `/integrations`, `/data-migration`,
  `/ocm` redirect to the new workspace with filter state. Some users will
  notice the redirect briefly.
- Shared component fetching (e.g. `ConfigMatrixClient`) needs a `gapId` prop
  to scope its data fetch to the active gap. Mitigated by adding the prop
  with a backwards-compatible default.

### Neutral

- The 5-step `STEPS` const stays the SSoT — confirms the spec §3 contract.

## Alternatives Considered

- **Collapse the 5 steps to 4 (merge Adjust into Analyze).** Rejected:
  Adjust is the longest-duration step in real engagements; merging would
  make Analyze enormous + incoherent.
- **Keep 6 sub-tabs but add a "view by gap" toggle.** Rejected: toggle adds
  another layer of navigation; doesn't solve the problem.

## Related

- Phase 7 (Resolve Gaps Workspace implementation)
- AD-9 (cross-phase moves to portfolio surface)

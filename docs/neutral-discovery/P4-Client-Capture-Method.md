# P4 — Client-Capture Method

*How workshop-captured client processes become reusable, governed library content. Completes the P-series: P1 depth · P2 gaps · P3 overlay · **P4 the compounding loop.** Runs through the consultant workbench (C5 Sources, C8 Facilitation, C9 Outputs); executable once the app is built and a pilot runs.*

---

## 1 · Why P4 is the compounding asset

P1–P3 built a **static** library: 742 processes, 726 flows, all 13 APQC categories. Good — but every consultancy can license a framework. What no competitor can copy is a library that **learns from every engagement**: each workshop's "we differ" reasons, red-lined steps, and net-new processes — generalized and folded back in — make the next discovery sharper, more industry-real, and more credibly "we've seen how companies actually run this."

The flywheel: **run discovery → capture differences → generalize → promote → richer library → better next discovery.**

P4 is therefore not a content batch (P1–P3 were). It is a **standing method + governance**, exercised per engagement.

## 2 · What gets captured (the four capture types)

During a session, capture happens in C8 (facilitation console) and the client's own affirmations; it lands in C9 (decisions). Four distinct types, routed differently:

| # | Capture type | Example | Routed as |
|---|---|---|---|
| T1 | **"We differ" reason** on an existing process | "We invoice in stages tied to delivery milestones, not all at once." | Candidate **variant** of the existing process |
| T2 | **Step-level red-line** (a step added/removed/reordered in a flow) | "There's a credit-check step before order confirmation here." | Candidate **step/sub-step or alternate path** on the existing flow |
| T3 | **Net-new process** the library lacks | "We run a returnable-crate deposit scheme with distributors." | Candidate **new process** in the right workflow |
| T4 | **Terminology/role correction** | "Nobody here says 'Billing Clerk'; it's the Revenue Ops team." | Candidate **role-alias / naming** improvement |

**Rule:** captures are *candidates*, never direct writes. Nothing enters the shared library without passing the pipeline below.

## 3 · The pipeline — capture → triage → generalize → review → promote

```
C8/C9 session record
   │  (engagement closes)
   ▼
1. HARVEST     Consultant exports the engagement's capture set from C9
   ▼
2. TRIAGE      Each item classified T1–T4 · duplicate-check vs library · keep / merge / drop
   ▼
3. GENERALIZE  Strip client identity · abstract specifics · rewrite in neutral language
   & ANONYMIZE (the confidentiality gate — see §5; nothing passes in client-specific form)
   ▼
4. REVIEW      Second consultant (not the engagement's) checks: genuinely general? vendor-
               neutral? non-identifying? right placement? right granularity?
   ▼
5. PROMOTE     Enter via the C5 overlay wizard (client-capture variant):
               T1 → variant note/alternate path on the process
               T2 → step or optional sub-step on the flow
               T3 → new process (scope-ID series CC###, origin=client-captured)
               T4 → role-alias table / naming fix
   ▼
6. RECORD      Provenance updated (§4) · engagement register updated · library version bumped
```

Cadence: run the pipeline **at engagement close** (not live in the workshop — the workshop must stay a discovery, not a data-entry exercise). Elapsed effort per engagement: typically hours, not days.

## 4 · Data & provenance model

Extends the existing provenance layer (P1) and origin flags (P3). Two records per promoted item — the internal one keeps attribution, the shared one never does:

**Internal capture register (consultant-only, per engagement):**
```json
{
  "capture_id": "ENG2026-014-007",
  "engagement": "ENG2026-014",
  "client_ref": "internal CRM ref — never in the library",
  "type": "T1-variant",
  "raw_text": "We invoice in stages tied to delivery milestones…",
  "linked_process": "BD9",
  "status": "promoted | merged | dropped",
  "promoted_as": "BD9.var-2"
}
```

**Library entry (shared, generalized — what everyone sees):**
```json
{
  "scope_id": "BD9.var-2",
  "name": "Milestone-based staged invoicing (variant)",
  "origin": "client-captured",
  "provenance": {
    "source": "Client-captured · generalized · ABeam-curated",
    "observed_in": { "industry": "FMCG distribution", "count": 1 },
    "completeness": "variant-outline",
    "captured": "2026-Qn", "reviewed_by": "‹second consultant›"
  }
}
```

Key fields:
- **`origin: client-captured`** — third origin value alongside `sap-base` and `overlay`; visible in the C2 grid and Excel.
- **`observed_in.count`** — how many engagements have exhibited this variant. **This number is the asset**: at count ≥3 a variant is candidate for promotion to a standard alternate path ("commonly observed practice"), giving discovery statements real evidence ("we see this pattern at roughly a third of distributors").
- **`observed_in.industry`** — sector-level only (e.g. "FMCG distribution"), never narrower, never geography+sector combinations that could identify.
- **New scope-ID series `CC###`** for T3 net-new processes; variants attach as `‹id›.var-n`.

## 5 · Confidentiality & anonymization governance (the hard gate)

Client process detail is client confidential — and "we differ" reasons often reveal commercially sensitive practice. The gate, in order of severity:

1. **No client identity in the shared library, ever.** No names, brands, locations, systems, volumes, prices, named roles/org units, or unusual detail combinations that could identify. Attribution lives only in the internal capture register.
2. **Generalize, don't copy.** The promoted item describes *the practice*, not *the client's instance*. "We invoice PETRONAS-style milestone billing per the JDA" → "Invoice in stages tied to delivery milestones (variant)".
3. **Aggregation threshold for sensitive patterns.** A variant that encodes competitively distinctive practice is held in the internal register (usable by ABeam consultants as know-how) and only surfaces in the shared library once observed at **≥2 independent clients** — at which point it is demonstrably industry practice, not one client's secret.
4. **Contract check.** Before harvesting, confirm the engagement terms permit generalized, anonymized reuse of process observations. If silent or restrictive, the engagement's captures stay in the internal register only. ⟨Standard clause wording to be agreed with Legal.⟩
5. **Second-consultant review is mandatory** (pipeline step 4) — the author of a capture is the worst judge of whether it still identifies the client.
6. **Client-facing surfaces never show capture provenance detail** — a client sees "commonly observed practice", never "captured at ⟨other client⟩".

## 6 · Where it lives in the designed tool

Already designed (consultant workbench brief); P4 is the *operating procedure* for those surfaces:

| Pipeline step | Tool surface |
|---|---|
| Capture | **C8** facilitation (park, notes, step red-line) + client fit decisions (V3) |
| Harvest | **C9** decisions & outputs — "promote to library" action per item |
| Triage → promote | **C5** sources/overlay wizard, client-capture variant (steps: classify → dedupe/conflict → generalize → provenance-tag → commit) |
| Register & audit | **C10** library health — capture register, review status, version log |
| Visibility | **C2** grid `origin=client-captured` filter · Excel origin column |

One build-note for engineering: C5's wizard should add the **anonymization checklist** (§5 items 1–2) as an explicit step with a required second-reviewer sign-off field.

## 7 · Worked example (end to end)

**In the workshop** (Asia Meals-type client, Lead-to-Cash): on *BD9 Sell from Stock*, the client marks **We differ**: "We invoice in stages tied to delivery milestones, not all at once — our distributors demand it."

1. **Harvest** — item exported from C9 with the reason text and its process link.
2. **Triage** — T1 variant of BD9 billing; no duplicate in library.
3. **Generalize** — "Staged invoicing tied to delivery milestones, common where distributor agreements require payment against confirmed delivery tranches." Client name, agreement type, volumes: stripped.
4. **Review** — second consultant confirms: general, neutral, non-identifying, correctly placed under Billing.
5. **Promote** — `BD9.var-1 · Milestone-based staged invoicing`, origin `client-captured`, observed_in `{FMCG distribution, 1}`, completeness `variant-outline`.
6. **Next engagement** — a distributor-heavy prospect opens BD9 and the consultant can say, with evidence: "There's a commonly observed variant here — staged invoicing against delivery milestones. Does that match how you run?" Discovery got sharper. That's the flywheel.

## 8 · KPIs (how you know P4 is working)

- Captures harvested per engagement (expect 10–30 in a full discovery)
- % promoted vs merged vs dropped (healthy ≈ 30–50% promoted; 100% means triage isn't filtering)
- Variants reaching `observed_in ≥ 2` (the maturing evidence base)
- Time from engagement close → promotion (target < 2 weeks, or the loop dies)
- Net-new `CC###` processes per quarter (breadth the frameworks didn't have)

## 9 · Status & prerequisites

**Method: defined (this document). Execution: needs the app + a live pilot.**

| Prerequisite | Status |
|---|---|
| Capture surfaces (C8/C9) + C5 wizard designed | ✅ designed & verified |
| App built | ⬜ engineering build |
| First pilot engagement | ⬜ pick pilot client |
| Legal reuse clause confirmed | ⬜ ⟨with Legal⟩ |
| Second-reviewer roster named | ⬜ ⟨2 names⟩ |

*P-series complete: P1 depth ✅ · P2 gaps ✅ · P3 overlay + flows ✅ · P4 method ✅ (operation begins with the pilot).*

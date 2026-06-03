# D2 / D3 — Remediation note (V2 process content)

**Scope:** Closes the D2 (Fiori-app coverage) and D3 (activity-count) findings from the
content-integrity audit, per `claude-code-handoff/D2-D3-RESOLVED.md`. The six V2 BPD test
scripts were diffed against the app content; no broader V2 rebuild was performed — the
content is faithful to the BPD.

---

## D3 — activity counts: **CLOSED** (no loss)

The original "below SAP master" reading used the **Process-Steps master** (every app/activity
associated with the scope item, incl. config + cross-area master data). Measured against the
correct yardstick — the **BPD test script** (the official end-to-end flow the workbench
represents) — app activities **meet or exceed** the source for all six items. The app is not
missing process steps; it is *finer-grained* than the BPD overview.

| Item | App activities | BPD overview steps | Verdict |
|------|----------------|--------------------|---------|
| J45  | 78 | 39 | App ≥ BPD — OK |
| J59  | 72 | 50 | App ≥ BPD — OK |
| J60  | 86 | 68 | App ≥ BPD — OK |
| 1NT  | 36 | 24 | App ≥ BPD — OK |
| 2ET  | 17 | 12 | App ≥ BPD — OK |
| BDW  | 27 | 30 | Close — confirm 3 steps if desired |

No activity additions required. The master-list delta was definitional, not a loss.

---

## D2 — Fiori coverage: **RESOLVED** (1 genuine add + 4 reviewed)

After excluding non-MY localization apps and apps that exist only in the Process-Steps master
(not in the BPD flow), the BPD-confirmed punch-list was five — one genuine gap, four already
covered.

| Item | Fiori ID | App | Action taken |
|------|----------|-----|--------------|
| **J59** | **F0703A** | **Display Customer Balances** | **Added** — `J59-ACCOUNTS-RECEIVABLE-FULL-SCREEN-CONTENT.md` → "Reporting & Display Apps — D2 Remediation Addendum". The one genuine content gap. Full screen-by-screen procedure subsequently ingested from the external resolutions file (J59 BPD; SAP standard demo data). |
| J59 | F0850A | Manage Customer Master Data | Still not tagged. The external resolutions file confirms **F0850A** as the J59 customer-master ID, but supplies **no procedure/step** to attach it to and the app name has 0 occurrences in the J59 content. Remains `TODO(verify)` until a customer-master step is added. |
| J60 | F1053A | Manage Supplier Master Data | Still not tagged. The external resolutions file confirms **F1053A** as a candidate, but no supplier-master step exists in the J60 content (0 occurrences) to attach it to. Remains `TODO(verify)`. |
| J60 | F8654 | Process Free Form Payments | **Not applied — contradiction; kept `F2564`.** The external resolutions file proposed retagging J60 free-form payments to **F8654** and assigning **F2564** to *Manage Billing Documents*. This contradicts the in-repo BPD content, which uses **F2564** for *Process / My Free Form Payments* (5 occurrences) and **F0797** for *Manage Billing Documents* (7×); **F8654 appears 0× in the repo.** Applying F8654 would overwrite BPD-sourced data with an unverified ID, so it was rejected. The F2564↔F8654 assignment needs source confirmation against the actual SSCUI list / BPD. |
| BDW | F2250 | Manage Billing Documents | Confirmed correct by the external resolutions file. In-repo billing tags `Manage Billing Documents (F0797)` (×7) and `(F2250)` (×1, in 2ET) are valid SAP billing IDs — left as-is. |

J45, 1NT, 2ET: no BPD-confirmed gap.

**Net change:** `F0703A` was the one genuine, safe addition (its full procedure has since been
ingested from the external resolutions file). The four "optional tag" items were reviewed and
intentionally **not** changed inline: F0850A/F1053A have no step in the content to attach to
(still `TODO(verify)`), the BDW billing tags (F0797/F2250) were confirmed correct, and the
proposed **F8654** free-form-payments retag was **rejected** — it contradicts the BPD-sourced
**F2564** already in the J60 content (F8654 appears 0× in the repo). Re-tagging would assert an
unverified/conflicting SAP ID, against the golden rule, so the F2564↔F8654 question is bounced
back to the analyst for source confirmation.

---

## Localization caveat

The BPDs diffed were the **`_EN_DE`** variant (English text, German country). For these global
processes (AR, AP, procurement, project control, non-stock sales, returnables) the flow is
localization-independent, so the punch-list above is robust. What `_EN_DE` **cannot** confirm is
**Malaysia-specific localization** (e.g., MyInvois e-invoicing apps/steps). If MY-localization
completeness matters, obtain the `_EN_MY` Best Practices package, drop the six
`<CODE>_S4CLD2602_BPD_EN_MY.docx` into `ft2std-toolkit/_input/`, and re-run the diff for the
MY-only delta.

---

*Remediation applied 2026-06-03; cross-checked against the external resolutions file
("TODO(verify) — resolutions from the SAP source") on 2026-06-03 — items 1–3 applied, the
item-4 F8654 retag rejected (see the J60 row above). Source: `claude-code-handoff/D2-D3-RESOLVED.md` +
`REMEDIATION-PLAN-AND-PROMPT.md`. No SAP IDs, process steps, or screen procedures were invented.*

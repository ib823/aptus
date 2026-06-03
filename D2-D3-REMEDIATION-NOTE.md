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

## D2 — Fiori coverage: **RESOLVED** (3 BPD-confirmed adds + 2 reviewed)

After excluding non-MY localization apps and apps that exist only in the Process-Steps master
(not in the BPD flow), the BPD-confirmed punch-list was five. After cross-checking the external
resolutions file, three are documented adds (F0703A, F0850A, F1053A) and two were reviewed
(F0797/F2250 confirmed as-is; F8654 rejected).

| Item | Fiori ID | App | Action taken |
|------|----------|-----|--------------|
| **J59** | **F0703A** | **Display Customer Balances** | **Added** — `J59-ACCOUNTS-RECEIVABLE-FULL-SCREEN-CONTENT.md` → "Reporting & Display Apps — D2 Remediation Addendum". The one genuine content gap. Full screen-by-screen procedure subsequently ingested from the external resolutions file (J59 BPD; SAP standard demo data). |
| J59 | F0850A | Manage Customer Master Data | **Added (app-identity addendum)** — `J59-ACCOUNTS-RECEIVABLE-FULL-SCREEN-CONTENT.md` → "Master Data Apps — D2 Remediation Addendum". The external resolutions file confirms **F0850A** is the J59 customer-master ID per the BPD, so the app is now documented and tagged at identity level. The screen-by-screen procedure is defined in the BPD and **not** reproduced (not invented); ingest from the BPD if a full capture is required. |
| J60 | F1053A | Manage Supplier Master Data | **Added (app-identity addendum)** — `J60-ACCOUNTS-PAYABLE-FULL-SCREEN-CONTENT.md` → "Master Data Apps — D2 Remediation Addendum". The external resolutions file confirms **F1053A** is present in the J60 BPD, so the app is now documented and tagged at identity level. The screen-by-screen procedure is defined in the BPD and **not** reproduced (not invented). |
| J60 | F8654 | Process Free Form Payments | **Not applied — contradiction; kept `F2564`.** The external resolutions file proposed retagging J60 free-form payments to **F8654** and assigning **F2564** to *Manage Billing Documents*. This contradicts the in-repo BPD content, which uses **F2564** for *Process / My Free Form Payments* (5 occurrences) and **F0797** for *Manage Billing Documents* (7×); **F8654 appears 0× in the repo.** Applying F8654 would overwrite BPD-sourced data with an unverified ID, so it was rejected. The F2564↔F8654 assignment needs source confirmation against the actual SSCUI list / BPD. |
| BDW | F2250 | Manage Billing Documents | Confirmed correct by the external resolutions file. In-repo billing tags `Manage Billing Documents (F0797)` (×7) and `(F2250)` (×1, in 2ET) are valid SAP billing IDs — left as-is. |

J45, 1NT, 2ET: no BPD-confirmed gap.

**Net change:** three BPD-confirmed apps are now documented in the content — **F0703A** (Display
Customer Balances, J59, with full procedure) and **F0850A / F1053A** (customer- and supplier-master,
J59 / J60, as app-identity addenda; their screen procedures are defined in the BPD and **not**
reproduced — not invented). Of the remaining D2 items, the BDW billing tags (F0797/F2250) were
confirmed correct, and the proposed **F8654** free-form-payments retag was **rejected** — it
contradicts the BPD-sourced **F2564** already in the J60 content (F8654 appears 0× in the repo).
Re-tagging would assert an unverified/conflicting SAP ID, against the golden rule, so the
F2564↔F8654 question is bounced back to the analyst for source confirmation.

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
("TODO(verify) — resolutions from the SAP source") on 2026-06-03 — items 1–3 applied, F0850A/F1053A
added as app-identity addenda, and the item-4 F8654 retag rejected (see the J60 row above). Source:
`claude-code-handoff/D2-D3-RESOLVED.md` + `REMEDIATION-PLAN-AND-PROMPT.md`. No SAP IDs, process steps,
or screen procedures were invented.*

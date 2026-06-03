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

## D2 — Fiori coverage: **RESOLVED** (4 BPD-confirmed adds + 1 reviewed)

After excluding non-MY localization apps and apps that exist only in the Process-Steps master
(not in the BPD flow), the BPD-confirmed punch-list was five. After cross-checking the external
resolutions file (including its revised item #4), four are documented adds/corrections
(F0703A, F0850A, F1053A, F8654) and one was confirmed as-is (F0797/F2250 billing).

| Item | Fiori ID | App | Action taken |
|------|----------|-----|--------------|
| **J59** | **F0703A** | **Display Customer Balances** | **Added** — `J59-ACCOUNTS-RECEIVABLE-FULL-SCREEN-CONTENT.md` → "Reporting & Display Apps — D2 Remediation Addendum". The one genuine content gap. Full screen-by-screen procedure subsequently ingested from the external resolutions file (J59 BPD; SAP standard demo data). |
| J59 | F0850A | Manage Customer Master Data | **Added (app-identity addendum)** — `J59-ACCOUNTS-RECEIVABLE-FULL-SCREEN-CONTENT.md` → "Master Data Apps — D2 Remediation Addendum". The external resolutions file confirms **F0850A** is the J59 customer-master ID per the BPD, so the app is now documented and tagged at identity level. The screen-by-screen procedure is defined in the BPD and **not** reproduced (not invented); ingest from the BPD if a full capture is required. |
| J60 | F1053A | Manage Supplier Master Data | **Added (app-identity addendum)** — `J60-ACCOUNTS-PAYABLE-FULL-SCREEN-CONTENT.md` → "Master Data Apps — D2 Remediation Addendum". The external resolutions file confirms **F1053A** is present in the J60 BPD, so the app is now documented and tagged at identity level. The screen-by-screen procedure is defined in the BPD and **not** reproduced (not invented). |
| J60 | F8654 | Process Free Form Payments | **Applied (retag).** The **revised** resolutions file corrected its earlier draft: **F2564 = My Free Form Payments** (create, AP Accountant) and **F8654 = Process Free Form Payments** (process, Cash Management Specialist) — two distinct apps in one two-role flow, **no F2564↔F8654 conflict**. The J60 content covers the processing step (Activities 39–40), so its **4** `Process Free Form Payments` references were retagged **F2564→F8654**; the create step (Activity 38) keeps `My Free Form Payments (F2564)`. Provenance recorded inline in the J60 content. |
| BDW | F2250 | Manage Billing Documents | Confirmed correct by the external resolutions file. In-repo billing tags `Manage Billing Documents (F0797)` (×7) and `(F2250)` (×1, in 2ET) are valid SAP billing IDs — left as-is. |

J45, 1NT, 2ET: no BPD-confirmed gap.

**Net change:** four BPD-confirmed apps are now documented/corrected in the content — **F0703A**
(Display Customer Balances, J59, with full procedure), **F0850A / F1053A** (customer- and
supplier-master, J59 / J60, as app-identity addenda; screen procedures left to the BPD — not
invented), and **F8654** (Process Free Form Payments, J60 — the processing-step references retagged
from F2564 per the revised resolutions file's J60 source check; the F2564 *create* step is
unchanged). The BDW billing tags (F0797/F2250) were confirmed correct. The earlier F2564↔F8654
"conflict" is resolved: they are two distinct apps (create vs process) in one two-role flow.

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
("TODO(verify) — resolutions from the SAP source"), including its revised item #4, on 2026-06-03 —
items 1–3 applied, F0850A/F1053A added as app-identity addenda, and the J60 processing-step app
retagged **F2564→F8654** (the F2564 create step is unchanged). Source:
`claude-code-handoff/D2-D3-RESOLVED.md` + `REMEDIATION-PLAN-AND-PROMPT.md`. No SAP IDs, process steps,
or screen procedures were invented.*

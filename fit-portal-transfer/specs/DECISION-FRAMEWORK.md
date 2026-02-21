# Decision Framework — Fit/Configure/Extend/Build/Adapt Logic

This document codifies the business logic for classifying gaps and recommending resolutions.

---

## The Five Resolutions

Every process step that has a gap must be resolved into exactly one of these categories:

| Code | Label | Description | Cost Implication | Upgrade Risk |
|------|-------|-------------|-----------------|-------------|
| `FIT` | Fits as-is | SAP best practice matches client's process | Zero additional | None |
| `CONFIGURE` | Needs configuration | SAP can handle this with standard configuration | Low (part of standard impl) | None |
| `KEY_USER_EXT` | Key User Extension | Requires Key User Extensibility (custom fields, custom logic, custom CDS views) | Medium | Low — SAP supported |
| `BTP_EXT` | BTP Extension | Requires SAP BTP side-by-side extension | High | Medium — separate lifecycle |
| `ISV` | ISV / 3rd Party | Requires third-party software (SAP Partner or independent) | High + licensing | Medium — integration risk |
| `CUSTOM_ABAP` | Custom ABAP Cloud | Requires custom ABAP development in ABAP Cloud (RAP) | High | Medium — must follow clean core |
| `ADAPT_PROCESS` | Adapt Process | Client changes their business process to match SAP standard | Zero technical, change mgmt cost | None |
| `OUT_OF_SCOPE` | Out of Scope | Gap is acknowledged but deferred / not addressed | Zero for now | N/A |

---

## Resolution Selection Logic

When a client marks a step as "GAP" (their process differs from SAP best practice), the system presents resolution options in this priority order:

### Priority 1: Can SAP do it with standard configuration?

Check: Does the gap relate to a value, threshold, workflow level, or option that appears in the 4,703 configuration activities?

Example gaps that are CONFIGURE:
- "We need different payment terms" → Configure payment terms
- "We want a higher approval threshold" → Configure tolerance limits
- "We use a different depreciation method" → Configure depreciation keys
- "We want a different GL account assignment" → Configure account determination

If yes → Recommend `CONFIGURE`. Show the related config activities from the XLSM.

### Priority 2: Can SAP do it with Key User Extensibility?

Check: Does the gap require adding a field, a validation rule, a simple logic extension, or a custom analytical view?

Key User Extensibility capabilities (SAP S/4HANA Cloud Public Edition):
- Custom fields on standard business objects
- Custom logic (BAdI implementations)
- Custom CDS views for reporting
- Custom communication scenarios
- Custom business objects (simple)
- Custom forms (Adobe Forms / Output Management)

Example gaps that are KEY_USER_EXT:
- "We need an additional field on the purchase order" → Custom field
- "We need a validation that checks field X against field Y" → Custom logic (BAdI)
- "We need a custom report combining data from X and Y" → Custom CDS view

If yes → Recommend `KEY_USER_EXT`. Note: KUE is SAP-supported and upgrade-safe.

### Priority 3: Can SAP do it with BTP extension?

Check: Does the gap require a separate application, a complex workflow, integration with external systems, or UI beyond Fiori?

BTP extension capabilities:
- SAP Build Apps (low-code custom apps)
- SAP Build Process Automation (complex workflows)
- SAP Integration Suite (middleware, APIs)
- SAP Build Work Zone (custom launchpad)
- Custom CAP applications (Node.js/Java)

Example gaps that are BTP_EXT:
- "We need a customer-facing portal for order tracking" → SAP Build Apps
- "We need a 7-level approval workflow with delegation" → SAP Build Process Automation
- "We need to integrate with a legacy system via proprietary protocol" → SAP Integration Suite

If yes → Recommend `BTP_EXT`. Note: Requires BTP subscription, separate deployment lifecycle.

### Priority 4: Is there a 3rd party solution?

Check: Does the gap match a common requirement addressed by SAP-certified ISV solutions?

Example gaps that are ISV:
- "We need advanced warehouse automation" → ISV warehouse solution
- "We need country-specific e-invoicing (non-SAP supported)" → ISV localization
- "We need advanced planning/scheduling" → ISV APS solution

If yes → Recommend `ISV`. Note: Additional licensing cost, integration maintenance.

### Priority 5: Does it require custom ABAP development?

Check: Does the gap require logic that cannot be built with KUE or BTP?

Example gaps that are CUSTOM_ABAP:
- "We need to modify the core pricing calculation" → ABAP Cloud enhancement
- "We need a custom batch job for data processing" → ABAP Cloud program

If yes → Recommend `CUSTOM_ABAP`. Note: Must follow SAP Clean Core principles, ABAP Cloud only (no classic ABAP).

### Priority 6: Can the client adapt their process?

This is ALWAYS presented as an option alongside any extension option. The system should show:

- What the client does today (from their input)
- What SAP best practice says
- Why SAP does it this way (from BPD Purpose/Overview)
- What it would cost to extend vs. what it would cost to adapt (change management)

If the client chooses `ADAPT_PROCESS`:
- Zero technical cost
- Change management effort is recorded
- The specific process change is documented

### Priority 7: Out of Scope

If none of the above apply, or the client defers:
- The gap is acknowledged but not resolved
- It appears in the report as "Out of Scope"
- It does NOT contribute to the effort estimate
- It IS flagged as a risk ("unresolved gap")

---

## Cost Calculation Logic

### Effort Estimation Formula

```
Total Effort = Σ (Base Effort per Scope Item)
             + Σ (Config Effort per CONFIGURE gap)
             + Σ (Extension Effort per KEY_USER_EXT gap)
             + Σ (BTP Effort per BTP_EXT gap)
             + Σ (ISV Integration Effort per ISV gap)
             + Σ (Custom Dev Effort per CUSTOM_ABAP gap)
             + Σ (Change Mgmt Effort per ADAPT_PROCESS gap)
```

Where:
- **Base Effort per Scope Item**: From EffortBaseline table (Intelligence Layer). If not populated, show "TBD — requires consultant input".
- **Config Effort per gap**: Typically 0.5 - 2 days. Default: 1 day per CONFIGURE resolution.
- **Extension Effort**: From the GapResolution.effortDays field, set by consultant.
- **Change Mgmt Effort**: Default: 0.5 days per ADAPT_PROCESS resolution (training time).

### Cost Calculation (not shown to client — internal only)

```
Total Cost = Total Effort × Daily Rate
           + Σ (One-time costs per gap)
           + Σ (Annual recurring costs per gap) × Years

Where:
- Daily Rate: From internal configuration (not in spec)
- One-time costs: From GapResolution.costEstimate.onetime
- Recurring costs: From GapResolution.costEstimate.recurring
```

### Confidence Score

```
Confidence = (Steps with responses / Total steps in selected scope) ×
             (Gaps with resolutions / Total gaps identified) ×
             (Scope items with effort baselines / Total selected scope items)
```

Displayed as: "Estimate confidence: XX%"

---

## Rules for Resolution Recommendations

1. **ALWAYS present ADAPT as an alternative** when recommending EXTEND, BUILD, or ISV. The client must consciously choose cost over process change.

2. **ALWAYS show the cost delta**: "Extending costs X days + $Y recurring. Adapting costs Z days change management. Difference: ..."

3. **NEVER hide a resolution option**. Even if the system recommends ADAPT, all options (CONFIGURE, KEY_USER_EXT, BTP_EXT, ISV, CUSTOM_ABAP) must be visible and selectable.

4. **NEVER auto-select a resolution**. The system recommends, the human decides.

5. **Require rationale for every non-FIT resolution**. The "reason" field is mandatory when selecting CONFIGURE, EXTEND, BUILD, or ADAPT.

6. **Flag upgrade risk clearly**: Any resolution that introduces upgrade risk (BTP_EXT, ISV, CUSTOM_ABAP) must display a warning: "This extension must be retested after each SAP quarterly update."

7. **Flag Clean Core compliance**: Any CUSTOM_ABAP resolution must note: "Custom ABAP in S/4HANA Cloud Public Edition must follow Clean Core principles (ABAP Cloud / RAP only). Classic ABAP modifications are NOT possible."

---

## Configuration Activity Decision

For each selected scope item, the system also presents configuration activities:

| Category | Default Decision | Client Action Required |
|----------|-----------------|----------------------|
| Mandatory | Included (cannot exclude) | None — always in scope |
| Recommended | Included (can exclude) | Client reviews and confirms or excludes |
| Optional | Excluded (can include) | Client reviews and includes if needed |

If a client excludes a "Recommended" config activity:
- Log it in the Decision Log with reason
- Flag it in the report as "Recommended config excluded"
- Do NOT reduce effort estimate (the config might still be needed)

---

## Gap Dependency Rules

Some gaps have dependencies:
1. If scope item A depends on scope item B, and B has an unresolved gap → Flag A as "blocked by unresolved gap in B"
2. If a configuration activity is cross-referenced by multiple scope items → Show it once with all related items listed
3. If an extension (BTP/ISV) serves multiple gaps → Show the effort once, not per gap

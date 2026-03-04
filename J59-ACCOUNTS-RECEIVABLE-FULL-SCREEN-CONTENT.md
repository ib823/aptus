# J59 — Accounts Receivable: Complete Screen-by-Screen Content

> **What the user sees on every screen in the review flow.**
> This document reproduces the exact content shown in the ABEAM assessment tool when a user reviews J59 (Accounts Receivable). For each step it shows the step title, type badge, business context explanation, the full SAP technical reference content (normally collapsed), expected results, and activity context — exactly as rendered on screen.

---

## Reading Guide

Each step is shown as a card matching the on-screen layout:

```
┌─────────────────────────────────────────────────────────────┐
│ [✓ Matches] [⚙ Needs Adjustment] [⚠ Doesn't Match] [— Not Relevant] │  ← Classification buttons
├─────────────────────────────────────────────────────────────┤
│ Step N · Activity Name                         [Type Badge] │  ← Header
│ Step Title                                                  │
├─────────────────────────────────────────────────────────────┤
│ What this step does:                                        │  ← Business context
│ Plain English explanation...                                │
├─────────────────────────────────────────────────────────────┤
│ ▶ Technical Details for Implementation Team                 │  ← Collapsed by default
│   Purpose: ...                                              │
│   Procedure: ...                                            │
│   Expected Result: ...                                      │
├─────────────────────────────────────────────────────────────┤
│ Activity: Activity Title                    [Open in SAP →] │  ← Activity context
└─────────────────────────────────────────────────────────────┘
```

**On-screen UI elements per step:**
- **Classification buttons** (top): ✓ Matches | ⚙ Needs Adjustment | ⚠ Doesn't Match | — Not Relevant
- **Confidence dropdown** (after classifying): High — I'm certain | Medium — I think so | Low — best guess
- **Gap/Configure textarea** (if applicable): Free-text field for describing differences
- **Save indicator**: Auto-saves with "Saving..." → "Saved ✓" feedback
- **Comment indicator**: Message icon with count, opens comment panel
- **Keyboard shortcuts**: 1/F=Matches, 2/C=Needs Adjustment, 3/G=Doesn't Match, 4/N=Not Relevant, ←→=Navigate

**Visibility rules:**
- Steps marked 🟢 are **classifiable** (shown by default, user must classify)
- Steps marked ⚪ are **hidden by default** (technical/navigation steps, visible via "Show technical steps" toggle)

---

## Summary

| Metric | Count |
|--------|-------|
| Total steps | 613 |
| Classifiable (shown by default) | 397 |
| Hidden by default | 216 |
| Unique activities | 72 |

---


## Activity 1: Additional Information

> 5 steps total | 0 classifiable | 5 hidden

### Step 1: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Prerequisites
This section summarizes all the prerequisites for conducting the test in terms of systems, users, master data, organizational data, other test data and business conditions.

#### System Access
Type of Data
Details

 | System
 | System
 | Accessible via SAP Fiori Launchpad. Your system administrator provides you with the URL to access the various apps assigned to your role.

### Roles
Create business roles using the following business role templates delivered by SAP and assign them to your individual test users.Name (Role Template)
ID (Role Template)
Name (Launchpad Space)
ID (Launchpad Space)

#### Instructions
### Purpose

### Overview
With Accounts Receivable, you manage open receivables invoices that are automatically created from sales processes. Using various analytical tools, you can manage and control open items to optimize accounts receivables handling. The primary source of incoming payments is incoming bank statements that are loaded within the Cash Management process and automatically reconciled with open invoices. User-friendly views simplify and streamline the post processing of open items.
Alternatively, you can manually post incoming payments and easily reconcile the payment with an open item. Several analytical tools are available to monitor the receivables, allowing you to react quickly if you discover a declining payment discipline among your customers. You can effortlessly generate dunning letters for overdue items and track your customers' dunning history.
This document provides a detailed procedure for testing this scope item after solution activation, reflecting the predefined scope of the solution. Each process step, report, or item is covered in its own section, providing the system interactions (test steps) in a table view. Steps that are not in scope of the process but are needed for testing are marked accordingly. Project-specific steps must be added.
### System Access
Log On

 | Accounts Receivable Accountant
 | SAP_BR_AR_ACCOUNTANT | Accounts Receivable | SAP_BR_AR_ACCOUNTANT | 
 | Accounts Receivable Manager
 | SAP_BR_AR_MANAGER | Accounts Receivable | SAP_BR_AR_MANAGER | 
 | Billing Clerk | SAP_BR_BILLING_CLERK | Billing | SAP_BR_BILLING_CLERK | 
 | General Ledger Accountant
 | SAP_BR_GL_ACCOUNTANT | General Ledger | SAP_BR_GL_ACCOUNTANT | 
 | Cash Management Specialist
 | SAP_BR_CASH_SPECIALIST | Cash Management | SAP_BR_CASH_SPECIALIST | 
 | Administrator | SAP_BR_ADMINISTRATOR | Administration/ Administration - Workforce Master Data/ Administration - License Compliance/ Administration - Data Management/ Administration - Output Control | SAP_BR_ADMINISTRATOR/ SAP_BUM_SPT_ADMINISTRATION_PC/ SAP_EI_SPT_ADM_LC_PC/ SAP_CA_SPT_TDR_PC/ SAP_OC_SPT_ADMINISTRATION_PC | 

 | Configuration Expert - Business Process Configuration
 | SAP_BR_BPC_EXPERT | Business Process Configuration/ Business Process Configuration - Finance/ Business Process Configuration - Procurement/ Manage your Solution/ Business Process Configuration - Workflow/ Business Configuration - Feature Management/ Business Process Configuration - Extensibility Explorer/ Business Configuration - Transportation | SAP_BR_BPC_EXPERT/ SAP_FIN_SPT_BPC_EXPERT_PC/ SAP_MM_SPT_BIZ_PROC_CONFIGN_PC/ SAP_CA_SPT_IC_LND_BASE_PC/ SAP_CA_SPT_BPC_WORKFLOW_PC/ SAP_CA_SPT_BPC_FM_PC/ SAP_EI_SPT_BPC_EXT_PC/ SAP_TM_SPT_TRANSPCFG_PC | 

 | Configuration Expert - Business Network Integration | SAP_BR_CONF_EXPERT_BUS_NET_INT | Business Network Integration/ Business Network Integration - Concur Integration/ Business Network Integration - Output Control/ Business Network Integration - Data Replication/ Configuration Expert - Business Network Integration Cross Applications | SAP_CORE_SPT_INT_PC/ SAP_CON_SPT_CONCUR_INT_PC/ SAP_OC_SPT_INT_PC/ SAP_CA_SPT_DATA_REP_PC/ SAP_CA_SPT_BUS_NETWORK_INT_PC | 
 | Business Process Specialist | SAP_BR_BUSINESS_PROCESS_SPEC | Business Process Management/ Business Process Management | SAP_BR_BUSINESS_PROCESS_SPEC/ SAP_CA_SPT_BPS_PC | 

### Master Data, Organizational Data, and Other Data
The organizational structure and master data of your company have been created in your system during implementation. The organizational structure reflects the structure of your company. The master data represents materials, customers, and vendors, for example, depending on the operational focus of your company.
Use your own master data to go through the test procedure. If you've installed an SAP Best Practices Package, you can use the following package scenario data:
Data
Sample Value
Details
Comments

 | Company Code
 | 5410
 |  | 
 | Controlling Area
 | A000
 |  | 
 | Customer
 | 54100001
54100002

 |  | 
 | House Bank
 | MYBK1/MYAC1
 |  | 

 | Bank G/L Account
 | 11001000
 |  | 
 | Cost Center
 | 54101101
 |  | 
 | Profit Center
 | YB700
 | 
 | 

For more information on creating master data objects, see the following Master Data Scripts (MDS)
Master Data Script ReferenceMaster Data ID
Description

 | BND
 | Create Customer Master - MDS

 | BNG
 | Create G/L Account and Cost Element - MDS

 | BNM
 | Create Cost Center and Cost Center Group - MDS

 | BNH
 | Create Profit Center - MDS

### Business Conditions
Before this scope item can be tested, the following business conditions must be met.
Scope Item
Business Condition

 | J14 - Sales Order Processing – Project-Based Services
 | Execute to create and post invoices to accounting before running this test script.

 | BD9 - Sell from Stock
 | Execute to create and post invoices to accounting before running this test script.
Caution
Not valid for SAP S/4HANA Professional Services Cloud.

 | BDN - Sales of Non-Stock Item with Order-Specific Procurement
 | Execute to create and post invoices to accounting before running this test script. 

 | BFB - Basic Cash Operations
 | Execute to upload bank statements.

 | BDQ - Invoice Correction Process with Debit Memo
 | Execute to create debit memos that are manually cleared in this test script. Caution
Not valid for SAP S/4HANA Professional Services Cloud.

 | BKL - Invoice Correction Process with Credit Memo
 | Execute to create credit memos that are manually cleared in this test script.Caution
Not valid for SAP S/4HANA Professional Services Cloud.

 | BKJ - Sales Order Processing with Customer Down Payment
 | Execute the creation of the down payment request before running this test script.
Caution
Not valid for SAP S/4HANA Professional Services Cloud.

 | J58- Accounting and Financial Close
 | Execute to create open posting periods.

 | 31N - Situation Handling
 | This scope item must be executed before doing any of the situation handling steps in this script.

The following technical configurations must be established to test this scope item :

</details>

---


## Activity 2: Additional Information: Preliminary Steps: Define Accounting Clerk

> 5 steps total | 2 classifiable | 3 hidden

### Step 2: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Define Accounting Clerk |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you add, change, or remove accounting clerks. Add the user testing this script as an accounting clerk, so that the user can test the dunning letter activities.

</details>

---

### Step 3: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Define Accounting Clerk |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Receivable Manager .

</details>

---

### Step 4: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Define Accounting Clerk |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Define Accounting Clerks (S_ALR_87003335).

</details>

**Expected Result (Test Verification):**
> The Change View "Accounting Clerks": Overview view is displayed.

---

### Step 5: New Entries

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 1 |
| **Activity** | Additional Information: Preliminary Steps: Define Accounting Clerk |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose New Entries.

</details>

**Expected Result (Test Verification):**
> The Overview of Added Entries view is displayed.

---

### Step 6: Enter Accounting Clerk Data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 2 |
| **Activity** | Additional Information: Preliminary Steps: Define Accounting Clerk |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Save:
Company Code: 5410
Clerk: < Any two alphanumeric characters>
Name of Accounting Clerk: <name of clerk>
Office User: <Your user id or user id of Accounts Receivable Accountant>Note
Office User is a mandatory field.

</details>

**Expected Result (Test Verification):**
> You created a new accounting clerk.

---


## Activity 3: Additional Information: Preliminary Steps: BRF+ Settings for Customer Balance Confirmation

> 29 steps total | 26 classifiable | 3 hidden

### Step 7: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Customer Balance Confirmation |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you define the system determination of output parameters for printing a balance confirmation.

</details>

---

### Step 8: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Customer Balance Confirmation |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Administrator.

</details>

---

### Step 9: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Customer Balance Confirmation |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Output Parameter Determination (APOC_WD_BRF_DEC_TAB_MAINTAIN).

</details>

---

### Step 10: Determine Output Type

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 3 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Customer Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Select Business Rules section, make the following entries:
Show Rules for: Balance Confirmation
Determination Step: Output Type

</details>

**Expected Result (Test Verification):**
> Details are displayed in the Maintain Business Rules section.

---

### Step 11: Add Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 4 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Customer Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Expand the Maintain Business Rules section. 
Choose Edit. 
In Table Contents, choose + (Insert New Row) and enter or verify the following:
#: <next higher number>
From the Output Type field dropdown, select Direct Value Input.
Output type: LETTER
and choose OK.
From the Dispatch Time field dropdown, select Direct Value Input.
Dispatch Time: 1 (Immediately)
or 2 (Scheduled)
and choose OK.Note
2 is used for Print Bundling and is the preferred setting according to central guidance.

Choose Insert New Row and enter the following:
#: <next higher number>
From the Output Type field dropdown, select Direct Value Input.
Output type: CHECKLIST
and choose OK.
From the Dispatch Time field dropdown, select Direct Value Input.
Dispatch Time: 1 (Immediately)
or 2 (Scheduled)
and choose OK.Note
2 is used for Print Bundling and is the preferred setting according to central guidance.

</details>

---

### Step 12: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 5 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Customer Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Activate. 
Confirm the Confirm Activation dialog box by selecting Yes.

</details>

**Expected Result (Test Verification):**
> The system displays the Objects saved and activated notification.

---

### Step 13: Determine Receiver

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 6 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Customer Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Select Business Rules section, choose:
Show Rules for: Balance Confirmation
Determination Step: Receiver.

</details>

**Expected Result (Test Verification):**
> Details are displayed in the Maintain Business Rules section.

---

### Step 14: Add Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 7 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Customer Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
If necessary, expand the Maintain Business Rules section.
Choose Edit. 
In Table Contents, choose + (Insert New Row) and make or verify the following entries:
 #: <next higher number>
From the Output Type field dropdown, select Direct Value Input.
Output type: = LETTER
and choose OK.From the Account Type field dropdown, select Direct Value Input.
Account type: = K (Suppliers)
and choose OK.
From the Role field dropdown, select Direct Value Input.
Role: = K
and choose OK.
From the Exclusive Indicator field dropdown, select Direct Value Input.
Exclusive Indicator: - (false)
and choose OK.

Choose  + (Insert New Row) and make or verify the following entries:
#: <next higher number>
From the Output Type field dropdown, select Direct Value Input.
Output type: = LETTER
and choose OK. 
From the Account Type field dropdown, select Direct Value Input.
Account type: = D (Customers)
and choose OK.
From the Role field dropdown, select Direct Value Input.
Role: = D
and choose OK.
From the Exclusive Indicator field dropdown, select Direct Value Input.
Exclusive Indicator: - (false)
and choose OK.

Choose + (Insert New Row) and make or verify the following entries:
#: <next higher number>
From the Output Type field dropdown, select Direct Value Input.
Output type: CHECKLIST
and choose OK.
From the Account Type field dropdown, select Direct Value Input.
Account type: leave blank
and choose OK.
From the Role field dropdown, select Direct Value Input.
Role: C
and choose OK.
From the Exclusive Indicator field dropdown, select Direct Value Input.
Exclusive Indicator: - (false)
and choose OK.

</details>

---

### Step 15: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 8 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Customer Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Activate. 
Confirm the Confirm Activation dialog box by selecting Yes.

</details>

**Expected Result (Test Verification):**
> Rules are activated.

---

### Step 16: Determine Channel

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 9 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Customer Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Select Business Rules section, choose
Show Rules for: Balance Confirmation
Determination Step: Channel

</details>

**Expected Result (Test Verification):**
> Details are displayed in the Maintain Business Rules section.

---

### Step 17: Add Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 10 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Customer Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
If necessary, expand Maintain Business Rules section. 
Choose Edit. 
In Table Contents, choose + (Insert New Row) and make or verify the following entries:
#: <next higher number> 
From the Output Type field dropdown, select Direct Value Input.
Output type: = LETTER
and choose OK.
From the Channel field dropdown, select Direct Value Input.Channel: PRINT
and choose OK.

Choose + (Insert New Row) and enter the following:
#: <next higher number>
From the Output Type field dropdown, select Direct Value Input.
Output type: = CHECKLIST
and choose OK.
From the Output Type field dropdown, select Direct Value Input.
Channel: PRINT
and choose OK.

</details>

---

### Step 18: Insert New Row

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 11 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Customer Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose the Insert New Row button.

</details>

---

### Step 19: Enter Details

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 12 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Customer Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries: Output Type: LETTER
Channel: EMAIL
Exclusive Indicator: - (false)

</details>

---

### Step 20: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 13 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Customer Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Activate. 
Confirm the Confirm Activation dialog box by selecting Yes.

</details>

**Expected Result (Test Verification):**
> Rules are activated.

---

### Step 21: Determine Form Template

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 14 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Customer Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Select Business Rules section, make the following entries:
Show Rules for: Balance Confirmation
Determination Step: Form Template

</details>

**Expected Result (Test Verification):**
> Details are displayed in the Maintain Business Rules section.

---

### Step 22: Add Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 15 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Customer Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Expand the Maintain Business Rules section.
Choose Edit.
In the Table Contents section, choose + (Insert New Row).
Make or verify the following entries:
#:<next higher number>
From the Output Type field dropdown, select Direct Value Input.
Output type: = LETTER
and choose OK.
Note
The Form Template column is at the far right of the table. Use the scroll bar along the bottom of the table to scroll right to display for the following two entries. 
From the Form Template field dropdown, select Direct Value Input.
Form Template: FIN_FO_BLNC_CNFRM_LTTR
and choose OK.

 Choose + (Insert New Row) and make or verify the following entries:
#:<next higher number>
From the Output Type field dropdown, select Direct Value Input.
Output type: CHECKLIST
and choose OK.
From the Form Template field dropdown, select Direct Value Input.
Form Template: FIN_FO_BLNC_CNFRM_CHKLST
and choose OK.

</details>

**Expected Result (Test Verification):**
> Rule data is entered.

---

### Step 23: Activate Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 16 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Customer Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Activate. 
Confirm the Confirm Activation dialog box by selecting Yes.

</details>

**Expected Result (Test Verification):**
> Rules are activated.

---

### Step 24: Determine Output Relevance

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 17 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Customer Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Select Business Rules section, make the following entries:
Show Rules for: Balance Confirmation
Determination Step: Output Relevance

</details>

**Expected Result (Test Verification):**
> Details are displayed in the Maintain Business Rules section.

---

### Step 25: Add Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 18 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Customer Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
If necessary, expand the Maintain Business Rules section. 
Choose Edit.
On Table Contents choose + (Insert New Row) and enter the following:#:<next higher number>
From the Output Type field dropdown, select Direct Value Input.
Output type: = LETTER
and choose OK.
From the Relevance Indicator field dropdown, select Direct Value Input.
Relevance Indicator: X (True)
and choose OK.

Choose + (Insert New Row) and make or verify the following entries:
#:<next higher number>
From the Output Type field dropdown, select Direct Value Input.
Output type: = CHECKLIST
and choose OK.
From the Relevance Indicator field dropdown, select Direct Value Input.
Relevance Indicator: X (True)
and choose OK.

</details>

---

### Step 26: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 19 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Customer Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Activate. 
Confirm the Confirm Activation dialog box by selecting Yes.

</details>

**Expected Result (Test Verification):**
> Rules are activated.

---

### Step 27: Determine Printer Settings

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 20 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Customer Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Select Business Rules section, choose
Show Rules for: Balance Confirmation
Determination Step: Printer Settings

</details>

---

### Step 28: Add Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 21 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Customer Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
If necessary, expand the Maintain Business Rules section.
Choose Edit .
In the Table Contents section, choose + (Insert New Row) and make or verify the following entries:
#:<next higher number>
From the Output Type field dropdown, select Direct Value Input.Output type: = LETTER
and choose OK.
From the Print Queue field dropdown, select Direct Value Input.
Print Queue: DEFAULT or use the one defined in your system
Number of Copies: 1

Choose Insert New Row and enter the following:
#:<next higher number>
Output type: = CHECKLIST
Note
The Print Queue and the Number of Copies columns are at the far right of the table. Use the scroll bar along the bottom of the table to scroll right to display for the following two entries.
From the Print Queue field dropdown, select Direct Value Input.
Print Queue:
DEFAULT or <enter print queue defined in your system>
and choose OK.
From the Number of Copies field dropdown, select Direct Value Input.
Number of Copies: 1
and choose OK.

</details>

---

### Step 29: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 22 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Customer Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Activate. 
Confirm the Confirm Activation dialog box by selecting Yes.

</details>

---

### Step 30: Email Settings

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 23 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Customer Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Select Business Rules section, choose:Show Rules For: Balance Confirmation
Determination Step: Email Settings

</details>

---

### Step 31: Add Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 24 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Customer Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Edit.

</details>

---

### Step 32: New Row

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 25 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Customer Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

In Table Contents, choose + (Insert New Row).

</details>

---

### Step 33: enter Details

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 26 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Customer Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries: Output Type: LETTER
Sender Email: <sender email address>
Email Template: FIN_BLNC_CNFRM_EMAIL_TMPL_LTTR

</details>

---

### Step 34: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 27 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Customer Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Activate.

</details>

**Expected Result (Test Verification):**
> The Confirm Activation dialog box is displayed.

---

### Step 35: Confirm

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 28 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Customer Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Yes.

</details>

**Expected Result (Test Verification):**
> The rules are activated.

---


## Activity 4: Additional Information: Preliminary Steps: BRF+ Settings for Item Interest Calculation

> 24 steps total | 21 classifiable | 3 hidden

### Step 36: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Item Interest Calculation |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you define the system determination of output parameters for item interest calculation.

</details>

---

### Step 37: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Item Interest Calculation |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Administrator.

</details>

---

### Step 38: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Item Interest Calculation |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Output Parameter Determination (APOC_WD_BRF_DEC_TAB_MAINTAIN).

</details>

---

### Step 39: Determine Output Type

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 29 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Item Interest Calculation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Select Business Rules section, make the following entries:
Show Rules for: Item Interest Calculation
Determination Step: Output Type

</details>

**Expected Result (Test Verification):**
> Details are displayed in the Maintain Business Rules section.

---

### Step 40: Maintain Business Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 30 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Item Interest Calculation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Expand the Maintain Business Rules section. 
Choose Edit. 
In Table Contents, choose + (Insert New Row) and enter or verify the following:
#: <next higher number>
From the Output Type field dropdown, select Direct Value Input.
Output type: INTEREST_LETTER
and choose OK.
From the Dispatch Time field dropdown, select Direct Value Input.
Dispatch Time: 1 (Immediately) or 2 (Scheduled)
and choose OK.

</details>

---

### Step 41: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 31 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Item Interest Calculation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Activate.
Confirm the Confirm Activation dialog box by selecting Yes.

</details>

**Expected Result (Test Verification):**
> The Objects saved and activated notification displays.

---

### Step 42: Determine Output Type

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 32 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Item Interest Calculation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Select Business Rules section, make the following entries:
Show Rules for: Item Interest Calculation
Determination Step: Receiver

</details>

---

### Step 43: Maintain Business Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 33 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Item Interest Calculation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
If necessary, expand the Maintain Business Rules section.Choose Edit. 
In Table Contents, choose + (Insert New Row) and make or verify the following entries:
 #: <next higher number>
From the Receiver Account Type field dropdown, select Direct Value Input.
AcctTy.Rec.IntCalc: = K (Suppliers)
and choose OK.
From the Role field dropdown, select Direct Value Input.
Role: = K
and choose OK.
From the Exclusive Indicator field dropdown, select Direct Value Input.
Exclusive Indicator: X (true)
and choose OK.
Choose  + (Insert New Row) and make or verify the following entries:
#: <next higher number>
From the Receiver Acct Type field dropdown, select Direct Value Input.
AcctTy.Rec.IntCalc: = D (Customers)
and choose OK.
From the Role field dropdown, select Direct Value Input.
Role: = D
and choose OK.
From the Exclusive Indicator field dropdown, select Direct Value Input.
Exclusive Indicator: X (true)
and choose OK.

</details>

---

### Step 44: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 34 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Item Interest Calculation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Activate. 
Confirm the Confirm Activation dialog box by selecting Yes.

</details>

**Expected Result (Test Verification):**
> The Objects saved and activated notification displays.

---

### Step 45: Determine Output Type

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 35 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Item Interest Calculation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Select Business Rules section, make the following entries:
Show Rules for: Item Interest Calculation
Determination Step: Channel

</details>

---

### Step 46: Maintain Business Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 36 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Item Interest Calculation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
If necessary, expand Maintain Business Rules section. 
Choose Edit. 
In Table Contents, choose + (Insert New Row) and make or verify the following entries:
#: <next higher number> 
From the Channel field dropdown, select Direct Value Input.Channel: PRINT
and choose OK.

From the Exclusive Indicator field dropdown, select Direct Value Input.Exclusive Indicator: - (false)
and choose OK.

Choose + (Insert New Row) and enter the following:
#: <next higher number>
From the Output Type field dropdown, select Direct Value Input.
Channel: EMAIL
and choose OK.

From the Exclusive Indicator field dropdown, select Direct Value Input.Exclusive Indicator: - (false)
and choose OK.

</details>

---

### Step 47: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 37 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Item Interest Calculation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Activate. 
Confirm the Confirm Activation dialog box by selecting Yes.

</details>

**Expected Result (Test Verification):**
> The Objects saved and activated notification displays.

---

### Step 48: Determine Output Type

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 38 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Item Interest Calculation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Select Business Rules section, make the following entries:
Show Rules for: Item Interest Calculation
Determination Step: Printer Settings

</details>

---

### Step 49: Maintain Business Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 39 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Item Interest Calculation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
If necessary, expand the Maintain Business Rules section.
Choose Edit .
In the Table Contents section, choose + (Insert New Row) and make or verify the following entries:
#:<next higher number>
From the Print Queue field dropdown, select Direct Value Input.
Print Queue: DEFAULT or use the one defined in your system
Number of Copies: 1
and choose OK.

</details>

---

### Step 50: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 40 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Item Interest Calculation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Activate. 
Confirm the Confirm Activation dialog box by selecting Yes.

</details>

**Expected Result (Test Verification):**
> The Objects saved and activated notification displays.

---

### Step 51: Determine Output Type

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 41 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Item Interest Calculation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Select Business Rules section, make the following entries:
Show Rules for: Item Interest Calculation
Determination Step: Email Settings

</details>

---

### Step 52: Maintain Business Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 42 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Item Interest Calculation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
If necessary, expand the Maintain Business Rules section.
Choose Edit .
In the Table Contents section, choose + (Insert New Row) and make or verify the following entries:
#:<next higher number>
From the Output type field dropdown, select Direct Value Input.
Email Template: FFO_ITEM_INTEREST_EMAIL_TPL
and choose OK.

</details>

---

### Step 53: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 43 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Item Interest Calculation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Activate. 
Confirm the Confirm Activation dialog box by selecting Yes.

</details>

**Expected Result (Test Verification):**
> The Objects saved and activated notification displays.

---

### Step 54: Determine Output Type

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 44 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Item Interest Calculation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Select Business Rules section, make the following entries:
Show Rules for: Item Interest Calculation
Determination Step: Form Template

</details>

---

### Step 55: Maintain Business Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 45 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Item Interest Calculation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Expand the Maintain Business Rules section.
Choose Edit.
In the Table Contents section, choose + (Insert New Row).
Make or verify the following entries:
#:<next higher number>
From the Debit/Credit field dropdown, select Direct Value Input.
Debit/Credit: = S (Debit)
and choose OK.
Note
The Form Template column is at the far right of the table. Use the scroll bar along the bottom of the table to scroll right to display for the following two entries. 
From the Form Template field dropdown, select Direct Value Input.
Form Template: FFO_ITEM_INTEREST_LETTER_D
and choose OK.

 Choose + (Insert New Row) and make or verify the following entries:
#:<next higher number>
From the Debit/Credit field dropdown, select Direct Value Input.
Debit/Credit: = H (Credit)
and choose OK.
Note
The Form Template column is at the far right of the table. Use the scroll bar along the bottom of the table to scroll right to display for the following two entries. 
From the Form Template field dropdown, select Direct Value Input.
Form Template: FFO_ITEM_INTEREST_LETTER_C
and choose OK.

</details>

---

### Step 56: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 46 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Item Interest Calculation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Activate. 
Confirm the Confirm Activation dialog box by selecting Yes.

</details>

**Expected Result (Test Verification):**
> The Objects saved and activated notification displays.

---

### Step 57: Determine Output Type

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 47 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Item Interest Calculation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Select Business Rules section, make the following entries:
Show Rules for: Item Interest Calculation
Determination Step: Output Relevance

</details>

---

### Step 58: Maintain Business Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 48 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Item Interest Calculation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
If necessary, expand the Maintain Business Rules section. 
Choose Edit.
On Table Contents choose + (Insert New Row) and enter the following:#:<next higher number>
From the Relevance Indicator field dropdown, select Direct Value Input.
Relevance Indicator: X (True)
and choose OK.

</details>

---

### Step 59: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 49 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Item Interest Calculation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Activate. 
Confirm the Confirm Activation dialog box by selecting Yes.

</details>

**Expected Result (Test Verification):**
> The Objects saved and activated notification displays.

---


## Activity 5: Additional Information: BRF+ Settings for Dunning Notice (Optional): Download Standard Template

> 8 steps total | 5 classifiable | 3 hidden

### Step 60: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: BRF+ Settings for Dunning Notice (Optional): Download Standard Template |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you create a new dunning template that matches your business requirements. You download the standard template and make edits to the text.

#### Prerequisites
The following preliminary steps require that Adobe Lifecycle Designer is downloaded and installed. Log on as an Administratorrole to the SAP Fiori launchpad and open the Install Additional Software(F1261)app. The Adobe Lifecycle Manager is available for download at that location.

</details>

---

### Step 61: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: BRF+ Settings for Dunning Notice (Optional): Download Standard Template |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Administrator.

</details>

---

### Step 62: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: BRF+ Settings for Dunning Notice (Optional): Download Standard Template |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Maintain Form Templates (F1434).

</details>

**Expected Result (Test Verification):**
> The Maintain Form Templates (F1434) view displays.

---

### Step 63: Access the Templates

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 50 |
| **Activity** | Additional Information: BRF+ Settings for Dunning Notice (Optional): Download Standard Template |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose the Predelivered Templates tab.

</details>

---

### Step 64: Access the Templates

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 51 |
| **Activity** | Additional Information: BRF+ Settings for Dunning Notice (Optional): Download Standard Template |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entry and press Enter:
Form Template name: FIN_FO_DUNN_NOTE

</details>

---

### Step 65: Access the Templates

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 52 |
| **Activity** | Additional Information: BRF+ Settings for Dunning Notice (Optional): Download Standard Template |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Predelivered Templates section for content, choose >.

</details>

**Expected Result (Test Verification):**
> Available languages are displayed for FIN_FO_DUNN_NOTE form template.

---

### Step 66: Dunning Notice

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 53 |
| **Activity** | Additional Information: BRF+ Settings for Dunning Notice (Optional): Download Standard Template |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step sends payment reminders to customers who haven't paid on time. Think about: does your company send overdue payment notices? How many reminder levels?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Available Languages section, select an available language (for example, English) and choose the Download button on that row.
A Download Language dialog box is displayed. Select the country/region version from the
Select Form Template Master: For example, APOC_DEMO_FORM_MASTER_MYNote
The country/region abbreviation at the end of the template file name indicates the language of the selected file.

Choose OK.

</details>

**Expected Result (Test Verification):**
> Form templates are saved to a zip file. Note
> Templates are saved to a format that only Adobe Lifecycle Designer can open. For more information, see the Prerequisites section for this procedure.

---

### Step 67: Edit Form Template

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 54 |
| **Activity** | Additional Information: BRF+ Settings for Dunning Notice (Optional): Download Standard Template |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
From the saved zip file, choose the FIN_FO_DUNN_NOTE (xdp file type).
Open and edit the file with Adobe Lifecycle Designer and save the edited file to a local folder.
Restriction
A prefix of YY1_ is added to the file name. The name of the file can only have 30 characters total, that is 26 characters in addition to the 4 characters of the prefix.
Note
If you use multiple language templates, each language must have its own YY1_ file.

</details>

**Expected Result (Test Verification):**
> Form template file is edited as per business requirement and is ready for upload.

---


## Activity 6: Additional Information: BRF+ Settings for Dunning Notice (Optional): Upload Custom Template

> 6 steps total | 2 classifiable | 4 hidden

### Step 68: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: BRF+ Settings for Dunning Notice (Optional): Upload Custom Template |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you upload the custom template that you created in the previous procedure.

#### Prerequisites
The file you created in Download Standard Template is available. Note
In a starter system, the key user extensibility feature is deactivated. To add a new custom template in the starter system, implement SAP Note 2283716 . The key user extensibility feature comes activated in the Q and the P systems.

</details>

---

### Step 69: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: BRF+ Settings for Dunning Notice (Optional): Upload Custom Template |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Administrator.

</details>

---

### Step 70: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: BRF+ Settings for Dunning Notice (Optional): Upload Custom Template |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Maintain Form Templates (F1434).

</details>

**Expected Result (Test Verification):**
> The Maintain Form Templates (F1434) view displays.

---

### Step 71: New Custom Template

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 55 |
| **Activity** | Additional Information: BRF+ Settings for Dunning Notice (Optional): Upload Custom Template |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
From the default Custom Templates view, choose New.

</details>

**Expected Result (Test Verification):**
> The Create Form Template dialog box is displayed.

---

### Step 72: Create New Template

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 56 |
| **Activity** | Additional Information: BRF+ Settings for Dunning Notice (Optional): Upload Custom Template |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose OK:Form Template Name: <name of the template from previous procedure>
Remember
The name of the YY1_ file can't exceed 30 total characters (4 prefix characters and 26 additional characters).
Language: <language used when you created the custom YY1_ file>
Select Form Template File: Choose Browse to locate and choose the YY1_ file from your local folder.

</details>

**Expected Result (Test Verification):**
> In the Details section, your custom template form displays.Your new form template is ready for upload.

---

### Step 73: Return to Custom Templates Section

| | |
|---|---|
| **Type** | `Navigation` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: BRF+ Settings for Dunning Notice (Optional): Upload Custom Template |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Back.

</details>

**Expected Result (Test Verification):**
> Details of the YY1_ custom form template display in the Custom Templates section.

---


## Activity 7: Additional Information: BRF+ Settings for Dunning Notice (Optional): Assign Form Template

> 6 steps total | 4 classifiable | 2 hidden

### Step 74: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: BRF+ Settings for Dunning Notice (Optional): Assign Form Template |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you assign the custom form templates to the standard solution. Without this assignment, custom templates can't be used in the BRF+ configuration.

#### Prerequisites
The YY1_custom template form you created in the previous procedures is available in the system.

#### Procedure
Depending on your configuration environment for SAP S/4HANA Cloud Public Edition, choose one of the following options:
Configure Your Solution:  - Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration.
  - Open Manage Your Solution(F1241).
  - If necessary, change the country or region by choosing Set Local Version.
  - Choose Configure Your Solution.
  - Make the following entries: Application Area: Application Platform and Infrastructure
Sub Application Area: Output Management

  - For the row with Item Name of Output Control, choose Details (>).
  - For the Assign Form Templatesrow, choose Configure.
  - Continue with the procedure in the table below.

SAP Central Business Configuration:  - Log on to the project experience in SAP Central Business Configuration. 
  - Go to the Business Processes Configurationapp. To locate the activity in the tree view, search for the following activity: Assign Form Templates.
  - Choose Open Documentationfor the found line item to see more details about this configuration activity.
  - Choose the link to navigate directly to the SAP S/4HANA Cloud Public Editionsystem. Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration.
  - Continue with the procedure in the following table.

</details>

---

### Step 75: Assign Form Templates

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 57 |
| **Activity** | Additional Information: BRF+ Settings for Dunning Notice (Optional): Assign Form Template |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose New Entries.
Make the following entries and choose Save:
In the General Section:
Application Object Type: FFO_DUNN
Output Type: DUNN_NOTICE
Form Template ID: <Your YY1_ template created in the previous procedures>

</details>

**Expected Result (Test Verification):**
> The new form template (for PDF/print) is created.

---

### Step 76: Go Back

| | |
|---|---|
| **Type** | `Navigation` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: BRF+ Settings for Dunning Notice (Optional): Assign Form Template |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Back until you return to the Configure Your Solution view.

</details>

---

### Step 77: Assign Email Template

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 58 |
| **Activity** | Additional Information: BRF+ Settings for Dunning Notice (Optional): Assign Form Template |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Assign Email Templates row, choose Configure.

</details>

---

### Step 78: New Entries

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 59 |
| **Activity** | Additional Information: BRF+ Settings for Dunning Notice (Optional): Assign Form Template |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose New Entries.

</details>

---

### Step 79: Define Template

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 60 |
| **Activity** | Additional Information: BRF+ Settings for Dunning Notice (Optional): Assign Form Template |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Save: Application Object Type: FFO_DUNN
Output Type: DUNN_NOTICE
Email Template ID: FIN_FO_DUNN_NOTE_EMAIL (or your own template)

</details>

---


## Activity 8: Additional Information: BRF+ Settings for Dunning Notice (Optional): Dunning Output Determination

> 20 steps total | 17 classifiable | 3 hidden

### Step 80: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: BRF+ Settings for Dunning Notice (Optional): Dunning Output Determination |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you define the form template output determination for printing dunning notices.

</details>

---

### Step 81: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: BRF+ Settings for Dunning Notice (Optional): Dunning Output Determination |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Administrator.

</details>

---

### Step 82: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: BRF+ Settings for Dunning Notice (Optional): Dunning Output Determination |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Output Parameter Determination (APOC_WD_BRF_DEC_TAB_MAINTAIN).

</details>

**Expected Result (Test Verification):**
> The Output Parameter Determination view is displayed.

---

### Step 83: Maintain Business Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 61 |
| **Activity** | Additional Information: BRF+ Settings for Dunning Notice (Optional): Dunning Output Determination |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Select Business Rules section, make the following entries:
Show Rules for: Dunning
Determination Step: Form Template

</details>

**Expected Result (Test Verification):**
> Details display in the Maintain Business Rules section.

---

### Step 84: Add Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 62 |
| **Activity** | Additional Information: BRF+ Settings for Dunning Notice (Optional): Dunning Output Determination |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Expand the Maintain Business Rules section and choose Edit.
In the Table Contents section, choose Insert New Row and make the following entries:
#: <enter the next number in series>
Output type: DUNN_NOTICE (Dunning Notice)
Company Code: 5410
Dunn.Procedure: 1001
Dunning Level: 1
Form Template: <Name of previously created YY1_ file>
Note
Since a different YY1_ file must be created for each language, continue with the instructions when you have additional YY1_ files to add. 
Choose Insert New Row and enter the following:
#: <next higher number in series>
Output Type: DUNN_NOTICE (Dunning Notice)
Company Code: 5410
Dunn.Procedure: 1001
Dunning Level: 2
Form Template: <Enter name of your second YY1_ file>
For additional YY1_ files, insert additional rows and repeat the steps, giving each new YY1_ a different number for Dunning Level.
Note
The order of entries in the table determines the priority of the dunning form. The default template contains no restricting parameters. If it remains in the first row, it is picked for all outputs (for example, all languages). We recommend moving it to the bottom of the table as a fallback option when no other parameters fit. 
For example: 
If you maintained the dunning form templates in English and German languages in position 1 and 2 and filled in the Form Language column, the standard form template is at position 3.
For English and German, the system picks the respective forms based on the Language restriction criterion. For French, it skips the first two entries and chooses the form template in position 3, since this is the first form template which without restricting criteria.

</details>

**Expected Result (Test Verification):**
> Rule data is maintained.

---

### Step 85: Activate Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 63 |
| **Activity** | Additional Information: BRF+ Settings for Dunning Notice (Optional): Dunning Output Determination |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Activate and a Confirm Activation dialog box appears with a Do you really want to activate Form Template? notification.Choose Yes.

</details>

**Expected Result (Test Verification):**
> The system displays the message Objects saved and activated.

---

### Step 86: Select Business Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 64 |
| **Activity** | Additional Information: BRF+ Settings for Dunning Notice (Optional): Dunning Output Determination |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Select Business Rules section, make the following entries:
Show Rules for: Dunning
Determination Step: Channel

</details>

---

### Step 87: Insert New Row

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 65 |
| **Activity** | Additional Information: BRF+ Settings for Dunning Notice (Optional): Dunning Output Determination |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Expand the Maintain Business Rules section and choose Edit.
In the Table Contents section, choose Insert New Row.

</details>

---

### Step 88: Enter Details

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 66 |
| **Activity** | Additional Information: BRF+ Settings for Dunning Notice (Optional): Dunning Output Determination |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries: Output Type: DUNN_NOTICE
Channel: EMAIL

</details>

---

### Step 89: Insert New Row

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 67 |
| **Activity** | Additional Information: BRF+ Settings for Dunning Notice (Optional): Dunning Output Determination |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Table Contents section, choose Insert New Row.

</details>

---

### Step 90: Enter Details

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 68 |
| **Activity** | Additional Information: BRF+ Settings for Dunning Notice (Optional): Dunning Output Determination |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries: Output Type: DUNN_NOTICE
Channel: PRINT

</details>

---

### Step 91: Check Activation

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 69 |
| **Activity** | Additional Information: BRF+ Settings for Dunning Notice (Optional): Dunning Output Determination |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Check.

</details>

---

### Step 92: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 70 |
| **Activity** | Additional Information: BRF+ Settings for Dunning Notice (Optional): Dunning Output Determination |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Activate.

</details>

**Expected Result (Test Verification):**
> The Confirm Activation dialog box displays.

---

### Step 93: Confirm

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 71 |
| **Activity** | Additional Information: BRF+ Settings for Dunning Notice (Optional): Dunning Output Determination |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Yes.

</details>

**Expected Result (Test Verification):**
> The system displays the message Objects saved and activated.

---

### Step 94: Select Business Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 72 |
| **Activity** | Additional Information: BRF+ Settings for Dunning Notice (Optional): Dunning Output Determination |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Select Business Rules section, make the following entries:
Show Rules for: Dunning
Determination Step: Email Settings

</details>

---

### Step 95: Insert New Row

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 73 |
| **Activity** | Additional Information: BRF+ Settings for Dunning Notice (Optional): Dunning Output Determination |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Expand the Maintain Business Rules section and choose Edit.
In the Table Contents section, choose Insert New Row.

</details>

---

### Step 96: Enter Details

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 74 |
| **Activity** | Additional Information: BRF+ Settings for Dunning Notice (Optional): Dunning Output Determination |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries: Output Type: DUNN_NOTICE
Email Template: FIN_FO_DUNN_NOTE_EMAIL (or your custom email template)

</details>

---

### Step 97: Check Activation

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 75 |
| **Activity** | Additional Information: BRF+ Settings for Dunning Notice (Optional): Dunning Output Determination |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Check.

</details>

---

### Step 98: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 76 |
| **Activity** | Additional Information: BRF+ Settings for Dunning Notice (Optional): Dunning Output Determination |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Activate.

</details>

**Expected Result (Test Verification):**
> The Confirm Activation dialog box displays.

---

### Step 99: Confirm

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 77 |
| **Activity** | Additional Information: BRF+ Settings for Dunning Notice (Optional): Dunning Output Determination |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Yes.

</details>

**Expected Result (Test Verification):**
> The system displays the message Objects saved and activated.

---


## Activity 9: Additional Information: Preliminary Steps: BRF+ Settings for FI Customer Invoice

> 27 steps total | 24 classifiable | 3 hidden

### Step 100: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for FI Customer Invoice |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you configure the BRF+ settings for FI customer invoice.

</details>

---

### Step 101: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for FI Customer Invoice |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Administrator.

</details>

---

### Step 102: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for FI Customer Invoice |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Output Parameter Determination (APOC_WD_BRF_DEC_TAB_MAINTAIN).

</details>

---

### Step 103: Determine Output Type

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 78 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for FI Customer Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Select Business Rules section, make the following entries:
Show Rules for: Accounting Document
Determination Step: Output Type

</details>

**Expected Result (Test Verification):**
> Details are displayed in the Maintain Business Rules section.

---

### Step 104: Add Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 79 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for FI Customer Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Expand the Maintain Business Rules section.
Choose Edit.
In Table Contents, choose + (Insert New Row) and enter or verify the following:
#: <next higher number>
From the Output Type field dropdown, select Direct Value Input.
Output type: INVOICE
and choose OK.
From the Dispatch Time field dropdown, select Direct Value Input.
Dispatch Time: 1 (Immediately)
or 2 (Scheduled)
and choose OK.

</details>

---

### Step 105: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 80 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for FI Customer Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Activate. Confirm the Confirm Activation dialog box by choosing Yes.

</details>

**Expected Result (Test Verification):**
> The system displays the Objects saved and activated notification.

---

### Step 106: Determine Receiver

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 81 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for FI Customer Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Select Business Rules section, choose:
Show Rules for: AccountingDocument
Determination Step: Receiver.

</details>

**Expected Result (Test Verification):**
> Details are displayed in the Maintain Business Rules section.

---

### Step 107: Add Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 82 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for FI Customer Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Expand the Maintain Business Rules section.
Choose Edit.
In Table Contents, choose + (Insert New Row) and make or verify the following entries:
#: <next higher number>
From the Output Type field dropdown, select Direct Value Input.
Output type: BP
and choose OK.
From the Exclusive Indicator field dropdown, select Direct Value Input.
Exclusive Indicator: - (false)
and choose OK.

</details>

---

### Step 108: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 83 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for FI Customer Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Activate. Confirm the Confirm Activation dialog box by choosing Yes.

</details>

**Expected Result (Test Verification):**
> Rules are activated.

---

### Step 109: Determine Channel

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 84 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for FI Customer Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Select Business Rules section, choose
Show Rules for: Accounting Document
Determination Step: Channel

</details>

**Expected Result (Test Verification):**
> Details are displayed in the Maintain Business Rules section.

---

### Step 110: Add Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 85 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for FI Customer Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
If necessary, expand Maintain Business Rules section.
Choose Edit.
In Table Contents, choose + (Insert New Row) and make or verify the following entries:
#: <next higher number>
From the Output Type field dropdown, select Direct Value Input.
Output type: INVOICE
and choose OK.
From the Mode field dropdown, select Direct Value Input.
Mode: 1
From the Channel field dropdown, select Direct Value Input.
Channel: PRINT
and choose OK.
Exclusive Indicator: - (false)
Choose + (Insert New Row) and enter the following:
#: <next higher number>
From the Output Type field dropdown, select Direct Value Input.
Output type: INVOICE
and choose OK.
From the Mode field dropdown, select Direct Value Input.
Mode: I
From the Output Type field dropdown, select Direct Value Input.
Channel: EMAIL
Exclusive Indicator: - (false)
and choose OK.

</details>

---

### Step 111: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 86 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for FI Customer Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Activate. Confirm the Confirm Activation dialog box by choosing Yes.

</details>

**Expected Result (Test Verification):**
> Rules are activated.

---

### Step 112: Determine Form Template

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 87 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for FI Customer Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Select Business Rules section, make the following entries:
Show Rules for: Accounting Document
Determination Step: Form Template

</details>

**Expected Result (Test Verification):**
> Details are displayed in the Maintain Business Rules section.

---

### Step 113: Add Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 88 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for FI Customer Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Expand the Maintain Business Rules section.
Choose Edit.
In the Table Contents section, choose + (Insert New Row).
Make or verify the following entries:
#:<next higher number>
From the Output Type field dropdown, select Direct Value Input.
Output type: INVOICE
Corr. Identifier: SAP21
and choose OK.
Note
The Form Template column is at the far right of the table. Use the scroll bar along the bottom of the table to scroll right to display for the following two entries.
From the Form Template field dropdown, select Direct Value Input.
Form Template: FIN_FO_CORR_FICUS_INV
and choose OK.

</details>

**Expected Result (Test Verification):**
> Rule data is entered.

---

### Step 114: Activate Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 89 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for FI Customer Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Activate. Confirm the Confirm Activation dialog box by choosing Yes.

</details>

**Expected Result (Test Verification):**
> Rules are activated.

---

### Step 115: Determine Output Relevance

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 90 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for FI Customer Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Select Business Rules section, make the following entries:
Show Rules for: Accounting Document
Determination Step: Output Relevance

</details>

**Expected Result (Test Verification):**
> Details are displayed in the Maintain Business Rules section.

---

### Step 116: Add Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 91 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for FI Customer Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
If necessary, expand the Maintain Business Rules section.
Choose Edit.
On Table Contents choose + (Insert New Row) and enter the following:
#:<next higher number>
From the Output Type field dropdown, select Direct Value Input.
Output type: INVOICE
and choose OK.
From the Relevance Indicator field dropdown, select Direct Value Input.
Relevance Indicator: X (True)
and choose OK.

</details>

---

### Step 117: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 92 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for FI Customer Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Activate. Confirm the Confirm Activation dialog box by choosing Yes.

</details>

**Expected Result (Test Verification):**
> Rules are activated.

---

### Step 118: Determine Printer Settings

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 93 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for FI Customer Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Select Business Rules section, choose
Show Rules for: Accounting Document
Determination Step: Printer Settings

</details>

---

### Step 119: Add Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 94 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for FI Customer Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
If necessary, expand the Maintain Business Rules section.
Choose Edit .
In the Table Contents section, choose + (Insert New Row) and make or verify the following entries:
#:<next higher number>
From the Output Type field dropdown, select Direct Value Input.
Output type: INVOICE
and choose OK.
From the Print Queue field dropdown, select Direct Value Input.
Print Queue: DEFAULT or <your system-defined output queue>
Number of Copies: 1

</details>

---

### Step 120: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 95 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for FI Customer Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Activate. Confirm the Confirm Activation dialog box by choosing Yes.

</details>

---

### Step 121: Email Settings

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 96 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for FI Customer Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Select Business Rules section, choose:
Show Rules For: Accounting Document
Determination Step: Email Settings

</details>

---

### Step 122: Add Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 97 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for FI Customer Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Edit.

</details>

---

### Step 123: New Row

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 98 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for FI Customer Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

In Table Contents, choose + (Insert New Row).

</details>

---

### Step 124: Enter Details

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 99 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for FI Customer Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries:
Output Type: INVOICE
Sender Email: <sender email address>
Corr. Identifier:SAP21
Note
 If the Corr. Identifier column can't be found in the table, choose the Table Settings button. Choose Insert Column -> From Context Data Objects. Choose Condition Parameters of Application->  Corr. Identifier. Scroll down the list and clear selections on other objects. Choose OK. The Corr. Identifier column is then visible in the table.
Email Template: FIN_CUSINV_EMAIL_TEMPL

</details>

---

### Step 125: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 100 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for FI Customer Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Activate.

</details>

**Expected Result (Test Verification):**
> The Confirm Activation dialog box is displayed.

---

### Step 126: Confirm

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 101 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for FI Customer Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Yes.

</details>

**Expected Result (Test Verification):**
> The rules are activated.

---


## Activity 10: Additional Information: Preliminary Steps: Manage Situation Types (Optional)

> 8 steps total | 5 classifiable | 3 hidden

### Step 127: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Manage Situation Types (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
As an optional activity, customers can create a situation type as a copy of the situation template. Situation types allow you to manage the different circumstances that are critical to your business processes by automatically notifying the right users either as soon as a situation occurs or at a defined time. Situation types create situation instances, send notifications, and display the situation message, including related information, in the corresponding app. 
In this activity, you create an invoice skipped situation type for the Manage Payment Advice test procedure under the Incoming Payments with Electronic Bank Statementsection. 
The purpose of this situation is to notify users about accounts receivable payment advices that appear to have skipped a high-value invoice or invoices within the due date range of invoices covered. For example, if ten invoices are payable at the end of a month and only nine are mentioned on the payment advice, it indicates to the relevant Accounting Clerk that they may want to contact the affected customer for the balance. The situation is only initialized if the excluded invoices comprise more than 50% of the total balance due within the given date range (that is, only if the potentially missing amount is significant). Only debit items are considered. The situation can only map payment advice items to accounts receivable open items using the invoice reference numbers, so it may not function properly for manual invoices, debit notes, or similar.

#### Instructions
### Standard Templates and Ready-to-Use Situation Types
Standard templates are predefined by SAP. 
Standard templates can only be copied, although the copy becomes a ready-to-use situation type that you adapt and enable for productive use.
Ready-to-use situation types can be copied, edited, enabled, disabled, and deleted. When you delete a ready-to-use situation type, all related instances and monitored data are also deleted.
Situation types can be translated into various languages. The texts for the standard templates are already translated into a set of languages that can serve as a basis for your translations.
Note
Ensure that Situation Handling(31N) is activated first if you want to execute this step.

### Procedure

</details>

---

### Step 128: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Manage Situation Types (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as Business Process Specialist.

</details>

---

### Step 129: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Manage Situation Types (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Situation Types (F2947).

</details>

---

### Step 130: Select Type

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 102 |
| **Activity** | Additional Information: Preliminary Steps: Manage Situation Types (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose the Situation Templates tab.
Choose Go.

</details>

**Expected Result (Test Verification):**
> The Situation Type view displays.

---

### Step 131: Select a Template

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 103 |
| **Activity** | Additional Information: Preliminary Steps: Manage Situation Types (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the checkbox for the row of FIN_PAYMENTADVICEINVOICESKIPPED, and then choose Copy.

</details>

**Expected Result (Test Verification):**
> A New Situation Type view displays.

---

### Step 132: Maintain Admin Information

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 104 |
| **Activity** | Additional Information: Preliminary Steps: Manage Situation Types (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries:
ID: ZFIN_PAYMENTADVICEINVOICESKIPPEDNote
The Z in the ID, indicates that you've created this copy of the template.
Name: An Invoice is skipped in Payment Advice
Display Sequence: Medium is default, with setting from Very High to Very Low

</details>

**Expected Result (Test Verification):**
> The situation type is maintained.

---

### Step 133: Maintain Situation Display

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 105 |
| **Activity** | Additional Information: Preliminary Steps: Manage Situation Types (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Situation Display area, enter the following:
In-App Situation Message section:
Short Description: <use default>
Details: <use default>

Notification Message area:
Secure Text: <use default>
Public Text: <use default>
Resend Notifications: <use default>, Selected.

</details>

---

### Step 134: Save

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 106 |
| **Activity** | Additional Information: Preliminary Steps: Manage Situation Types (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Create. 
Confirm the Do you want to enable the situation type? message by choosing Yes.

</details>

---


## Activity 11: Additional Information: Preliminary Steps: Business Partner Master Data Maintenance for Electronic Invoicing (Optional)

> 9 steps total | 6 classifiable | 3 hidden

### Step 135: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Business Partner Master Data Maintenance for Electronic Invoicing (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
To run the step in electronic invoicing, you must maintain the number and business partner relationship category for customer master data.

</details>

---

### Step 136: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Business Partner Master Data Maintenance for Electronic Invoicing (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Master Data Specialist - Business Partner Data.

</details>

---

### Step 137: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Business Partner Master Data Maintenance for Electronic Invoicing (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Maintain Business Partner (BP).

</details>

---

### Step 138: Enter Business Partner

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 107 |
| **Activity** | Additional Information: Preliminary Steps: Business Partner Master Data Maintenance for Electronic Invoicing (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entry and choose Enter:
Business Partner: <business partner>

</details>

**Expected Result (Test Verification):**
> The Display Organization view is displayed.

---

### Step 139: Change Mode

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 108 |
| **Activity** | Additional Information: Preliminary Steps: Business Partner Master Data Maintenance for Electronic Invoicing (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Switch Between Display and Change.

</details>

**Expected Result (Test Verification):**
> The Change Organization view is displayed.

---

### Step 140: Change in BP Role

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 109 |
| **Activity** | Additional Information: Preliminary Steps: Business Partner Master Data Maintenance for Electronic Invoicing (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries:
Change in BP Role: Customer (Fin. Accounting) (defined)

</details>

---

### Step 141: Identification

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 110 |
| **Activity** | Additional Information: Preliminary Steps: Business Partner Master Data Maintenance for Electronic Invoicing (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose the Identification tab.

</details>

---

### Step 142: Maintain Tax Numbers

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 111 |
| **Activity** | Additional Information: Preliminary Steps: Business Partner Master Data Maintenance for Electronic Invoicing (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Tax numbers section, make the following entries:

Category: MY1
Tax Number Long: 1234567890123

</details>

---

### Step 143: Save

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 112 |
| **Activity** | Additional Information: Preliminary Steps: Business Partner Master Data Maintenance for Electronic Invoicing (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Save.

</details>

---


## Activity 12: Additional Information: Preliminary Steps: Value Mapping for Electronic Invoicing (Optional)

> 10 steps total | 6 classifiable | 4 hidden

### Step 144: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Value Mapping for Electronic Invoicing (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
To run the step in electronic invoicing, you must maintain the value mapping for eDocument UBL.

</details>

---

### Step 145: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Value Mapping for Electronic Invoicing (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Configuration Expert - Business Network Integration.

</details>

---

### Step 146: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Value Mapping for Electronic Invoicing (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Configure Value Mapping (/AIF/VMAP_CONF).

</details>

---

### Step 147: Enter Namespace and Value Mapping

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 113 |
| **Activity** | Additional Information: Preliminary Steps: Value Mapping for Electronic Invoicing (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entry and choose Execute.
Namespace: /EDUBL
Value Mapping:

</details>

**Expected Result (Test Verification):**
> The Display Value mapping view is displayed.

---

### Step 148: Switch to Change Mode

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 114 |
| **Activity** | Additional Information: Preliminary Steps: Value Mapping for Electronic Invoicing (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Switch Between Display and Change.

</details>

**Expected Result (Test Verification):**
> The Change Value mapping view is displayed.

---

### Step 149: Maintain Value Mapping

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 115 |
| **Activity** | Additional Information: Preliminary Steps: Value Mapping for Electronic Invoicing (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Append  #. The # is the number of rows to append.

</details>

**Expected Result (Test Verification):**
> Value Mapping Data are saved.

---

### Step 150: Maintain Value Mapping

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 116 |
| **Activity** | Additional Information: Preliminary Steps: Value Mapping for Electronic Invoicing (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the new row, make the following entries and choose Save:
Value:

</details>

---

### Step 151: Back

| | |
|---|---|
| **Type** | `Navigation` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Value Mapping for Electronic Invoicing (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Back.

</details>

**Expected Result (Test Verification):**
> The Configure Value mapping screen displays.

---

### Step 152: Maintain Value Mapping

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 117 |
| **Activity** | Additional Information: Preliminary Steps: Value Mapping for Electronic Invoicing (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Repeat steps 3 to 7 for the following data:
Namespace: /EDUBL
Value Mapping: INVOICE_TYPE_CODE_SD
Value: <value>
Billing Type: <billing type>

</details>

---

### Step 153: Maintain Value Mapping

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 118 |
| **Activity** | Additional Information: Preliminary Steps: Value Mapping for Electronic Invoicing (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Repeat steps 3 to 7 for the following data:
Namespace: /EDUBL
Value Mapping: TAX_CATEGORY
Value: <value>
Tax Code: <tax code>

</details>

---


## Activity 13: Additional Information: Preliminary Steps: Preliminary Steps for Electronic Invoicing

> 6 steps total | 0 classifiable | 6 hidden

### Step 154: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Preliminary Steps for Electronic Invoicing |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
To run the optional step e-Document Cockpit, you must ensure that the following configuration steps are activated::
  - Assign Party ID Types to Business Partner (EDOEUBUPAV) 

  - Assign Party ID Types to Companies (EDOEUCOMPV) 

  - Define Bank Accounts for Company Code (EDOEUBANKACCV)

#### Procedure
Depending on your configuration environment for SAP S/4HANA Cloud Public Edition, choose one of the following options:
Configure Your Solution:  - Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration.
  - Open Manage Your Solution(F1241).
  - If necessary, change the country or region by choosing Set Local Version.
  - Choose Configure Your Solution.
  - Make the following entries: Application Area: Application Platform and Infrastructure
Sub Application Area: Legal Compliance

  - For the row with Item Name of Settings for Peppol, choose Details (>).
  - For the Assign Party ID Types to Business Partnerrow, choose Configure.
  - Continue with the procedure in the table below.

</details>

---

### Step 155: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Preliminary Steps for Electronic Invoicing |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
SAP Central Business Configuration:  - Log on to the project experience in SAP Central Business Configuration. 
  - Go to the Business Processes Configurationapp. 
  - Search for the Assign Party ID Types to Business Partneractivity and choose Go to Activityto navigate directly to the SAP S/4HANA Cloud Public Editionsystem. Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration.
  - Continue with the procedure in the following table.

</details>

---

### Step 156: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Preliminary Steps for Electronic Invoicing |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Depending on your configuration environment for SAP S/4HANA Cloud Public Edition, choose one of the following options:
Configure Your Solution:  - Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration.
  - Open Manage Your Solution(F1241).
  - If necessary, change the country or region by choosing Set Local Version.
  - Choose Configure Your Solution.
  - Make the following entries: Application Area: Application Platform and Infrastructure
Sub Application Area: Legal Compliance

  - For the row with Item Name of Settings for Peppol, choose Details (>).
  - For the Assign Party ID Types to Companiesrow, choose Configure.
  - Continue with the procedure in the table below.

</details>

---

### Step 157: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Preliminary Steps for Electronic Invoicing |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
SAP Central Business Configuration:  - Log on to the project experience in SAP Central Business Configuration. 
  - Go to the Business Processes Configurationapp. 
  - Search for the Assign Party ID Types to Companiesactivity and choose Go to Activityto navigate directly to the SAP S/4HANA Cloud Public Editionsystem. Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration.
  - Continue with the procedure in the following table.

</details>

---

### Step 158: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Preliminary Steps for Electronic Invoicing |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Depending on your configuration environment for SAP S/4HANA Cloud Public Edition, choose one of the following options:
Configure Your Solution:  - Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration.
  - Open Manage Your Solution(F1241).
  - If necessary, change the country or region by choosing Set Local Version.
  - Choose Configure Your Solution.
  - Make the following entries: Application Area: Application Platform and Infrastructure
Sub Application Area: Legal Compliance

  - For the row with Item Name of Settings for Peppol, choose Details (>).
  - For the Define Bank Accounts for Company Coderow, choose Configure.
  - Continue with the procedure in the table below.

</details>

---

### Step 159: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Preliminary Steps for Electronic Invoicing |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
SAP Central Business Configuration:  - Log on to the project experience in SAP Central Business Configuration. 
  - Go to the Business Processes Configurationapp. 
  - Search for the Define Bank Accounts for Company Codeactivity and choose Go to Activityto navigate directly to the SAP S/4HANA Cloud Public Editionsystem. Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration.
  - Continue with the procedure in the following table.

</details>

---


## Activity 14: Additional Information: Preliminary Steps: Add Fields to Items (Optional)

> 8 steps total | 5 classifiable | 3 hidden

### Step 160: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Add Fields to Items (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
### Use
As an option, the administrator adds data source extensions and field names to Manage Customer Line Items(F0711). This option allows making more user fields available when managing items.

### Procedure

</details>

---

### Step 161: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Add Fields to Items (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Administrator.

</details>

---

### Step 162: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Add Fields to Items (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Custom Fields (F1481).

</details>

---

### Step 163: Create New Extension

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 119 |
| **Activity** | Additional Information: Preliminary Steps: Add Fields to Items (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Data Source Extensions tab.
Choose the + (Create) button.

</details>

**Expected Result (Test Verification):**
> A New Data Source Extension dialog box displays.

---

### Step 164: Enter Properties

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 120 |
| **Activity** | Additional Information: Preliminary Steps: Add Fields to Items (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter the following and choose Create:
Data Source: Customer Line Items
Description: <description of the data source>
Extension ID: The description is automatically added to the ID

</details>

**Expected Result (Test Verification):**
> A view displays of the new data source extension.

---

### Step 165: Add Fields

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 121 |
| **Activity** | Additional Information: Preliminary Steps: Add Fields to Items (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the < > (Toggle Field Path) button to switch the Field Path so Item displays at the top of the table. Under the Field Selection tab, expand the Item node and other nodes in the table and select the items to add.Note
Ensure that your choices are under the _Customer node.

</details>

**Expected Result (Test Verification):**
> Selected items display in the Selected Fields column.

---

### Step 166: Save

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 122 |
| **Activity** | Additional Information: Preliminary Steps: Add Fields to Items (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose the Save button.

</details>

**Expected Result (Test Verification):**
> All the nodes of the Field Path table collapse and your selections display in the Selected Fields table.

---

### Step 167: Publish

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 123 |
| **Activity** | Additional Information: Preliminary Steps: Add Fields to Items (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose the Publish button.

</details>

**Expected Result (Test Verification):**
> The Data Source Extensions view of Custom Fields and Logic displays with all the extensions. To verify your new extension, use the Search field.

---


## Activity 15: Additional Information

> 5 steps total | 0 classifiable | 5 hidden

### Step 168: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you manage default account assignments. This prerequisite is used in the Mass Import of Customer Invoices topic.

#### Procedure
Depending on your configuration environment for SAP S/4HANA Cloud Public Edition, choose one of the following options:
Configure Your Solution:  - Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration.
  - Open Manage Your Solution(F1241).
  - If necessary, change the country or region by choosing Set Local Version.
  - Choose Configure Your Solution.
  - Make the following entries: Application Area: Finance
Sub Application Area: General Settings

  - For the row with Item Name of Journal Entries, choose Details (>).
  - For the Manage Default Account Assignmentsrow, choose Configure.
  - Continue with the procedure in the following table.

SAP Central Business Configuration:  - Log on to the project experience in SAP Central Business Configuration. 
  - Go to the Business Processes Configurationapp. To locate the activity in the tree view, search for the following activity: Manage Default Account Assignments.
  - Choose Open Documentationfor the found line item to see more details about this configuration activity.
  - Choose the link to navigate directly to the SAP S/4HANA Cloud Public Editionsystem. Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration.
  - Continue with the procedure in the following table.

#### Instructions
### Preliminary Steps: Manage Default Account Assignments

</details>

---


## Activity 16: Additional Information: Preliminary Steps: Assign Reason Codes For Write-Off

> 8 steps total | 7 classifiable | 1 hidden

### Step 169: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Assign Reason Codes For Write-Off |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you assign a reason code for the write-off of bad debts. This preliminary step is required for the Bad Debt Write-Off test procedure step.

#### Procedure
Depending on your configuration environment for SAP S/4HANA Cloud Public Edition, choose one of the following options:
Configure Your Solution:  - Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration.
  - Open Manage Your Solution(F1241).
  - If necessary, change the country or region by choosing Set Local Version.
  - Choose Configure Your Solution.
  - Make the following entries: Application Area: Finance
Sub Application Area: General Ledger

  - For the row with Item Name of Chart of Accounts, choose Details (>).
  - For the Automatic Account Determinationrow, choose Configure.
  - Continue with the procedure in the following table.

SAP Central Business Configuration:  - Log on to the project experience in SAP Central Business Configuration. 
  - Go to the Business Processes Configurationapp. 
  - Search for the Automatic Account Determinationactivity and choose Go to Activityto navigate directly to the SAP S/4HANA Cloud Public Editionsystem. Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration.
  - Continue with the procedure in the following table.

</details>

---

### Step 170: Enter Details

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 124 |
| **Activity** | Additional Information: Preliminary Steps: Assign Reason Codes For Write-Off |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the 1. Area section, make the following entries and choose Step 2: 
Area: Financial Accounting
Subarea: Accounts Receivable and Accounts Payable
Process: Define Accounts for Payment Transactions

</details>

---

### Step 171: Enter Details

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 125 |
| **Activity** | Additional Information: Preliminary Steps: Assign Reason Codes For Write-Off |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the 2. Parameters section, make the following entries and choose Step 3: 
Transaction Key: ZDI
Chart Of Accounts: YCOA

</details>

---

### Step 172: Edit Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 126 |
| **Activity** | Additional Information: Preliminary Steps: Assign Reason Codes For Write-Off |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the 3. Account Assignments section, choose Edit Rules.

</details>

**Expected Result (Test Verification):**
> The Edit Rules dialog box is displayed.

---

### Step 173: Reason Code

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 127 |
| **Activity** | Additional Information: Preliminary Steps: Assign Reason Codes For Write-Off |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the Reason Code checkbox and choose OK.Note
For certain countries/regions who use VAT or have specific tax requirements, you can select the Tax Code checkbox to make the field available for those use cases.

</details>

---

### Step 174: Add

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 128 |
| **Activity** | Additional Information: Preliminary Steps: Assign Reason Codes For Write-Off |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Add.

</details>

**Expected Result (Test Verification):**
> A new row is added below the existing row.

---

### Step 175: Reason Code and Accounts

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 129 |
| **Activity** | Additional Information: Preliminary Steps: Assign Reason Codes For Write-Off |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Review:
Reason Code: <reason code>, for example, 200
G/L Account - Debit: <debit account>, for example, 62010000
G/L Account - Credit: <credit account>, for example, 62010000

</details>

---

### Step 176: Save

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 130 |
| **Activity** | Additional Information: Preliminary Steps: Assign Reason Codes For Write-Off |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Review your entries. Once done, choose Save.

</details>

---


## Activity 17: Additional Information: Preliminary Steps for eDocument Process: Maintain Business Partner Master Data

> 8 steps total | 5 classifiable | 3 hidden

### Step 177: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process: Maintain Business Partner Master Data |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you add tax information to the business partner Customer and Classification Code for business partner Vendor.

</details>

---

### Step 178: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process: Maintain Business Partner Master Data |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori Launchpad as a Master Data Specialist - Business Partner Data Test.

</details>

---

### Step 179: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process: Maintain Business Partner Master Data |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Maintain Business Partner (BP).

</details>

---

### Step 180: Switch to Change mode

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 131 |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process: Maintain Business Partner Master Data |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Switch Between Display and Change (F6)  to switch to change mode.

</details>

---

### Step 181: Change BP role

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 132 |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process: Maintain Business Partner Master Data |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Change in BP role field, choose the following value:
Customer (Fin.Accounting) (FLCU00)

</details>

---

### Step 182: Maintain Malaysia Tax numbers

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 133 |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process: Maintain Business Partner Master Data |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Identification tab, maintain the MY tax numbers for this business partner:
Category: MY3
Tax Number Long: 1234567890123
Category: MY4
Tax Number Long: 1234567890124
Category: MY5
Tax Number Long: 1234567890125
Category: MY7
Tax Number Long: 1234567890127

</details>

---

### Step 183: Save Your Data

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 134 |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process: Maintain Business Partner Master Data |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Save your entries.

</details>

---

### Step 184: Maintain Classification Code for Buyer-Created Invoices (Optional)

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 135 |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process: Maintain Business Partner Master Data |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Note
This step is only required if you test the Buyer Issue Tax of Invoice function
Repeat step 3. For your Business Partner, use Supplier (Fin.Accounting) (defined) (FLVN00) in the Change in BP role field. 
On the Vendor:Country-Spec.Enh.3 tab, choose the dropdown and select an option to classify the transaction with supplier. 
Save your entries.

</details>

---


## Activity 18: Additional Information: Preliminary Steps for eDocument Process: Maintain Company Code Data

> 4 steps total | 3 classifiable | 1 hidden

### Step 185: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process: Maintain Company Code Data |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you add tax information to the company code.

#### Prerequisites
x

#### Procedure
Depending on your configuration environment for SAP S/4HANA Cloud Public Edition, choose one of the following options:
Configure Your Solution:  - Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration.
  - Open Manage Your Solution(F1241).
  - If necessary, change the country or region by choosing Set Local Version.
  - Choose Configure Your Solution.
  - Make the following entries: Application Area: Finance
Sub Application Area: Master and Organizational Data

  - For the row with Item Name of Company and Company Codes, choose Details (>).
  - For the Maintain Additional Parametersrow, choose Configure.
  - Continue with the procedure in the following table. 

SAP Central Business Configuration:  - Log on to the project experience in SAP Central Business Configuration. 
  - Open the Business Process Configurationapp. Go to the Configuration Activitiestab. To locate the activity in the tree view, search for the following activity: Maintain Additional Parameters.
  - Choose Open Documentationfor the found line item to see more details about this configuration activity.
  - Choose the link to navigate directly to the SAP S/4HANA Cloud Public Editionsystem. Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration.
  - Continue with the procedure in the following table.

</details>

---

### Step 186: Company Code

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 136 |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process: Maintain Company Code Data |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose company code 5410.

</details>

---

### Step 187: Create Additional Data

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 137 |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process: Maintain Company Code Data |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Maintain MY tax numbers for this business partner:
Parameter Type: MY_ROC
Parameter Value: 123456789012
Parameter Type: MY_SAL
Parameter Value: 1234567890124
Parameter Type: MY_SEV
Parameter Value: 1234567890125
Parameter Type: MY_TIN
Parameter Value: 1234567890127
Parameter Type: MY_TTR
Parameter Value: 1234567890128

</details>

---

### Step 188: Save

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 138 |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process: Maintain Company Code Data |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Save your entries.

</details>

---


## Activity 19: Additional Information

> 5 steps total | 0 classifiable | 5 hidden

### Step 189: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, for a given company code, you define if an eDocument process integrates with SAP Document and Reporting Compliance, cloud edition (using the standard integration or other types of integration) to exchange electronic documents with external communication parties.

#### Prerequisites
Ensure that the following prerequisites are met:
  - Maintain Additional Parameters (FINSC_T001Z_N)
  - Assign Party ID Types to Business Partner (EDOEUBUPAV)
  - Assign Party ID Types to Companies (EDOEUCOMPV)
  - Assign Business Partner Identification Types to Party ID types (EDOEUBPIDTYPEV)

#### Procedure
Depending on your configuration environment for SAP S/4HANA Cloud Public Edition, choose one of the following options:
Configure Your Solution:  - Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration.
  - Open Manage Your Solution(F1241).
  - If necessary, change the country or region by choosing Set Local Version.
  - Choose Configure Your Solution.
  - Search for Define Process Communication through Cloud Servicesand press Enter.
  - For the displayed row, choose Details (>).
  - For the Define Process Communication through Cloud Servicesrow, choose Configure.
  - Continue with the procedure in the following table. 

SAP Central Business Configuration:  - Log on to the project experience in SAP Central Business Configuration. 
  - Open the Business Process Configurationapp. Go to the Configuration Activitiestab. To locate the activity in the tree view, search for the following activity: Define Process Communication through Cloud Services.
  - Choose Open Documentationfor the found line item to see more details about this configuration activity.
  - Choose the link to navigate directly to the SAP S/4HANA Cloud Public Editionsystem. Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration.
  - Continue with the procedure in the following table.

#### Instructions
### Preliminary Steps for eDocument Process: Define Process Communication Through Cloud Services

### Preliminary Steps for eDocument Process: Preliminary Steps for Electronic Invoicing (PEPPOL) (Optional)

### Purpose
In this activity, you perform the processes to set up electronic invoicing (PEPPOL). These steps are optional.

### Define Identification Types for Business Partners

### Purpose
In this activity, you define the identification type for the unique identification number that your business partner received from the service provider.

### Procedure
Depending on your configuration environment for SAP S/4HANA Cloud Public Edition, choose one of the following options:
Configure Your Solution:  - Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration.
  - Open Manage Your Solution(F1241).
  - If necessary, change the country or region by choosing Set Local Version.
  - Choose Configure Your Solution.
  - Make the following entries: Application Area: Database and Data Management
Sub Application Area: Business Partner

  - For the row with Item Name of Business Partner, choose Details (>).
  - For the Define Identification Typesrow, choose Configure.
  - Continue with the procedure in the following table.

</details>

---


## Activity 20: Additional Information: Business Partner Master Data Maintenance for Electronic Invoicing (Optional)

> 8 steps total | 5 classifiable | 3 hidden

### Step 190: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Business Partner Master Data Maintenance for Electronic Invoicing (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you maintain the identification number and tax number category for customer master data.

</details>

---

### Step 191: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Business Partner Master Data Maintenance for Electronic Invoicing (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori Launchpad as a Master Data Specialist - Business Partner Data.

</details>

---

### Step 192: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Business Partner Master Data Maintenance for Electronic Invoicing (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Maintain Business Partner (BP).

</details>

**Expected Result (Test Verification):**
> The Maintain Business Partner view is displayed.

---

### Step 193: Enter Business Partner

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 139 |
| **Activity** | Additional Information: Business Partner Master Data Maintenance for Electronic Invoicing (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entry and choose Enter:
Business Partner: <business partner>, for example, 54100003

</details>

**Expected Result (Test Verification):**
> The Display Organization view is displayed.

---

### Step 194: Switch to Change mode

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 140 |
| **Activity** | Additional Information: Business Partner Master Data Maintenance for Electronic Invoicing (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Switch Between Display and Change.

</details>

**Expected Result (Test Verification):**
> The Change Organization: XXXXXXXX view is displayed.

---

### Step 195: Go to Identification Tab

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 141 |
| **Activity** | Additional Information: Business Partner Master Data Maintenance for Electronic Invoicing (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries:
BP Role: Business Partner (Gen.)
Choose the Identification tab.

</details>

---

### Step 196: Maintain ID Type and Malaysia Tax numbers for Business Partner

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 142 |
| **Activity** | Additional Information: Business Partner Master Data Maintenance for Electronic Invoicing (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Maintain the Malaysia participant ID for this Business Partner:
ID Type: PAP001
Identification Number: for example, T6T201901123450

</details>

---

### Step 197: Save Your Data

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 143 |
| **Activity** | Additional Information: Business Partner Master Data Maintenance for Electronic Invoicing (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Save your entries.

</details>

---


## Activity 21: Additional Information: Value Mapping Maintenance for Electronic Invoicing (Optional)

> 9 steps total | 5 classifiable | 4 hidden

### Step 198: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Value Mapping Maintenance for Electronic Invoicing (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you maintain the value mapping for eDocument UBL.

</details>

---

### Step 199: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Value Mapping Maintenance for Electronic Invoicing (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori Launchpad as a Configuration Expert - Business Network Integration.

</details>

---

### Step 200: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Value Mapping Maintenance for Electronic Invoicing (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Configure Value Mapping (/AIF/VMAP_CONF).

</details>

---

### Step 201: Enter Namespace and Value Mapping

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 144 |
| **Activity** | Additional Information: Value Mapping Maintenance for Electronic Invoicing (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entry and choose Execute:
Namespace: /EDUBL
Value Mapping: MY_PAYM_MEANS_CODE

</details>

---

### Step 202: Switch to Change Mode

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 145 |
| **Activity** | Additional Information: Value Mapping Maintenance for Electronic Invoicing (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Switch Between Display and Change.

</details>

**Expected Result (Test Verification):**
> The Change Value Mapping view is displayed.

---

### Step 203: Maintain Value Mapping

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 146 |
| **Activity** | Additional Information: Value Mapping Maintenance for Electronic Invoicing (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Append.
Choose the append number.
Maintain the following details:
Value: <value>
Payment Method: <payment method>
Maintain all value mappings in the next line items.
Choose Save.

</details>

**Expected Result (Test Verification):**
> The value mapping data is saved.

---

### Step 204: Back

| | |
|---|---|
| **Type** | `Navigation` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Value Mapping Maintenance for Electronic Invoicing (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Back.

</details>

**Expected Result (Test Verification):**
> The Configure Value M apping view is displayed.

---

### Step 205: Repeat Steps

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 147 |
| **Activity** | Additional Information: Value Mapping Maintenance for Electronic Invoicing (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Repeat steps 3–6 for the following data:
Namespace: /EDUBL
Value Mapping: MY_TAX_CATEGORY
Value: <index number>
Tax Code: <tax code>
Maintain all value mappings in the next line items.

</details>

---

### Step 206: Repeat Steps

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 148 |
| **Activity** | Additional Information: Value Mapping Maintenance for Electronic Invoicing (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Repeat steps 3–6 for the following data:
Namespace: /EDUBL
Value Mapping: MY_TAX_EXEMPT_CODE
Value: <index number>
Tax Code: <tax code>
Maintain all value mappings in the next line items.

</details>

---


## Activity 22: Additional Information

> 5 steps total | 0 classifiable | 5 hidden

### Step 207: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you maintain additional parameters.

#### Procedure
Depending on your configuration environment for SAP S/4HANA Cloud Public Edition, choose one of the following options:
Configure Your Solution:  - Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration.
  - Open Manage Your Solution(F1241).
  - If necessary, change the country or region by choosing Set Local Version.
  - Choose Configure Your Solution.
  - Make the following entries: Application Area: Finance
Sub Application Area: Master and Organizational Data

  - For the row with Item Name of Maintain Additional Parameters, choose Details (>).
  - For the Maintain Additional Parametersrow, choose Configure.
  - Continue with the procedure in the following table.

#### Instructions
### Maintain Additional Parameters (FINSC_T001Z_N)

### Assign Party ID Types to Business Partner (EDOEUBUPAV)

### Purpose
In this activity, you define the party identification types that business partners use in the PEPPOL network.

### Procedure
Depending on your configuration environment for SAP S/4HANA Cloud Public Edition, choose one of the following options:
Configure Your Solution:  - Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration.
  - Open Manage Your Solution(F1241).
  - If necessary, change the country or region by choosing Set Local Version.
  - Choose Configure Your Solution.
  - Make the following entries: Application Area: Application Platform and Infrastructure
Sub Application Area: Legal Compliance

  - For the row with Item Name of Settings for PEPPOL, choose Details (>).
  - For the Assign Party ID Types to Business Partnerrow, choose Configure.
  - Continue with the procedure in the following table.

### Assign Party ID Types to Companies (EDOEUCOMPV)

### Purpose
In this activity, you maintain the party identification types that your company uses in the exchange channels in the PEPPOL network.

### Procedure
Depending on your configuration environment for SAP S/4HANA Cloud Public Edition, choose one of the following options:
Configure Your Solution:  - Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration.
  - Open Manage Your Solution(F1241).
  - If necessary, change the country or region by choosing Set Local Version.
  - Choose Configure Your Solution.
  - Make the following entries: Application Area: Application Platform and Infrastructure
Sub Application Area: Legal Compliance

  - For the row with Item Name of Settings for PEPPOL, choose Details (>).
  - For the Assign Party ID Types to Companiesrow, choose Configure.
  - Continue with the procedure in the following table.

</details>

---


## Activity 23: Test Procedures

> 1 steps total | 0 classifiable | 1 hidden

### Step 208: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Test Procedures |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
This section describes test procedures for each process step that belongs to this scope item.

</details>

---


## Activity 24: Preparation of Payments: Maintain Business Partners

> 12 steps total | 9 classifiable | 3 hidden

### Step 209: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Preparation of Payments: Maintain Business Partners |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you assign a dunning procedure to a customer to be able to execute the Collections Managementprocedure.

#### Prerequisites
- Accounting clerk is defined with User ID assigned. For more information, see the Define Accounting Clerk step.
  - The customer master record is created.

</details>

---

### Step 210: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Preparation of Payments: Maintain Business Partners |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Receivable Accountant.

</details>

---

### Step 211: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Preparation of Payments: Maintain Business Partners |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Maintain Business Partner (BP).

</details>

---

### Step 212: Select Customer

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 149 |
| **Activity** | Preparation of Payments: Maintain Business Partners |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Start: 
Find: Business Partner
By: Number
Business Partner: 54100001
From the list that displays, double-click the row of the Business Partner result.

</details>

**Expected Result (Test Verification):**
> The Display Organization : <number> view displays.

---

### Step 213: Change Role

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 150 |
| **Activity** | Preparation of Payments: Maintain Business Partners |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entry:
Display in BP role: Customer(Fin. Accounting)

</details>

**Expected Result (Test Verification):**
> The Display Organization : <number> role FI Customer view displays.

---

### Step 214: Edit Customer

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 151 |
| **Activity** | Preparation of Payments: Maintain Business Partners |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Switch between Display and Change to change the data to update.

</details>

---

### Step 215: Company Code Data

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 152 |
| **Activity** | Preparation of Payments: Maintain Business Partners |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Company Code at the top.
Choose the Customer: Account Management tab.
Make the following entries: 
Interest Indicator: 01
Choose the Customer: Correspondence tab.

</details>

---

### Step 216: Define Accounting Clerk

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 153 |
| **Activity** | Preparation of Payments: Maintain Business Partners |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Correspondence section, choose the button next to the Accounting Clerk entry to search by accounting clerk abbreviations. 
A Clerk Abbreviation dialog box displays the available accounting clerks by name and abbreviation code.
Select the row with <Tester> (your name) and choose Copy.
Note
The <Tester> of this procedure was previously defined as the accounting clerk. For more information, see the Define Accounting Clerk step.

</details>

**Expected Result (Test Verification):**
> The accounting clerk is changed.

---

### Step 217: Define Dunning

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 154 |
| **Activity** | Preparation of Payments: Maintain Business Partners |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step sends payment reminders to customers who haven't paid on time. Think about: does your company send overdue payment notices? How many reminder levels?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Dunning Data section, make the following entries:
Dunning Procedure: 1001
Dunning Block: Not blockedDunning Clerk: <Tester>
Note
The <Tester> name entered as a dunning clerk must be the same name used in the previous step for accounting clerk.
Clrk's Internet add.: <Email address for clerk (recipient of dunning letter)>

</details>

**Expected Result (Test Verification):**
> The dunning procedure is assigned.

---

### Step 218: Save

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 155 |
| **Activity** | Preparation of Payments: Maintain Business Partners |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Save.

</details>

**Expected Result (Test Verification):**
> Changes are saved.

---

### Step 219: Navigation

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 156 |
| **Activity** | Preparation of Payments: Maintain Business Partners |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Using the Switch between Display and Change tab, change or display other master data settings, change the BP role, and navigate through the available tabs. Review the following areas:
Display in BP role:Business Partner (Gen.) or  Customer (FI.Accounting)
and apply any changes, as required.

</details>

**Expected Result (Test Verification):**
> Settings display according to the chosen business partner role. Edit setting to your requirements.

---

### Step 220: Save Customer

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 157 |
| **Activity** | Preparation of Payments: Maintain Business Partners |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Save after completing your changes.

</details>

---


## Activity 25: Preparation of Payments: Display Customer List

> 5 steps total | 2 classifiable | 3 hidden

### Step 221: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Preparation of Payments: Display Customer List |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you can quickly access customer master data information and for validation purposes (for example, identify fields with missing data by checking for blanks).

#### Prerequisites
Business partners are created.

</details>

---

### Step 222: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Preparation of Payments: Display Customer List |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Receivable Accountant.

</details>

---

### Step 223: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Preparation of Payments: Display Customer List |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Display Customer List (F2640).

</details>

**Expected Result (Test Verification):**
> The Display Customer List view is displayed.

---

### Step 224: Enter Search Criteria

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 158 |
| **Activity** | Preparation of Payments: Display Customer List |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Go: Company Code: 5410
Customer: 54100001 (optional)

</details>

**Expected Result (Test Verification):**
> An Items table displays with information of the Business Partner such as:
> • Company Code
> • Customer 
> • City
> • Phone
> • E-Mail
> • Clerk Abbreviation
> • Financial Payment Terms
> • Dunning Procedure
> • Dunning Block

---

### Step 225: Explore Other Views

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 159 |
| **Activity** | Preparation of Payments: Display Customer List |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Click the blue link for a customer name in the Name of Customer column. The Customer Details dialog box displays information about the customer. Click the blue link for a customer in the Customer column. The dialog box displays a list of links for additional process functions, for example, Clear Incoming Payments, Process Receivables, and so on.

</details>

**Expected Result (Test Verification):**
> The customer detail information is displayed.

---


## Activity 26: Additional Information

> 5 steps total | 0 classifiable | 5 hidden

### Step 226: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

### Enter Invoice Without Sales Order

</details>

---


## Activity 27: Enter Invoice Without Sales Order

> 12 steps total | 9 classifiable | 3 hidden

### Step 227: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Enter Invoice Without Sales Order |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, customer invoices are posted in accounting and journal entries are created.

#### Prerequisites
Customer master record has been entered.

</details>

---

### Step 228: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Enter Invoice Without Sales Order |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Receivable Accountant.

</details>

---

### Step 229: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Enter Invoice Without Sales Order |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Create Outgoing Invoices (FB70).

</details>

**Expected Result (Test Verification):**
> The Enter Customer Invoice: Company Code # view displays.

---

### Step 230: Company Code

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 160 |
| **Activity** | Enter Invoice Without Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Company Code.

</details>

**Expected Result (Test Verification):**
> The Enter Company Code dialog box is displayed.

---

### Step 231: Company Code

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 161 |
| **Activity** | Enter Invoice Without Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter or verify your company code (5410) and choose Continue.

</details>

---

### Step 232: Basic Data

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 162 |
| **Activity** | Enter Invoice Without Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries: 
Customer:  <customer number>
Invoice date: <Today’s date>
Reference: <any> 
Posting Date: <Today’s date>
Amount: <any>  and MYR. 
Currency Key: <company code currency>
Calculate Tax:  Selected

</details>

---

### Step 233: Payment Tab

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 163 |
| **Activity** | Enter Invoice Without Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Payment tab and enter the following:
Bline Date: Today’s date
Pmnt Terms: 0001
Payt Meth.: <optional>

</details>

---

### Step 234: Line Items

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 164 |
| **Activity** | Enter Invoice Without Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Scroll down and enter the following in the line item table:
G/L Acct: 41000400
D/C: Credit 
Amount in doc. curr.: <Check amount that was entered in the basic data> 
Tax Code: <output tax code>

</details>

---

### Step 235: Profitability Segment

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 165 |
| **Activity** | Enter Invoice Without Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Continue in the Items table and for the Profit.segment column, select the field button.

</details>

**Expected Result (Test Verification):**
> The Assignment to a Profitability Segment dialog box is displayed.

---

### Step 236: Profitability Segment

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 166 |
| **Activity** | Enter Invoice Without Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Derivation:
Customer: <customer number>
Make the following entries and choose Continue:
Profit Center: <any>

</details>

**Expected Result (Test Verification):**
> The dialog box closes and you return to the Enter Customer Invoice view.

---

### Step 237: Material Segment (Optional)

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 167 |
| **Activity** | Enter Invoice Without Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
If you're using the Malaysia SST02 report, add a material number in the column of the report, add a material number in the Material Items table.

</details>

---

### Step 238: Post

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 168 |
| **Activity** | Enter Invoice Without Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Post to save.

</details>

**Expected Result (Test Verification):**
> Journal Entry is posted.

---


## Activity 28: Mass Upload: Mass Import of Customer Invoices

> 11 steps total | 8 classifiable | 3 hidden

### Step 239: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Mass Upload: Mass Import of Customer Invoices |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This app is used when there are many outgoing invoices and accruals.

#### Prerequisites
Create an electronic spreadsheet with the invoice details to be uploaded (with a maximum of 500 items in a single file).
Business Partner (BP) master data exists. 
Ensure that you completed the Manage Default Account Assignments topic in Preliminary Steps.

</details>

---

### Step 240: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Mass Upload: Mass Import of Customer Invoices |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Receivable Accountant.

</details>

---

### Step 241: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Mass Upload: Mass Import of Customer Invoices |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Upload Customer Open Items (F4051).

</details>

---

### Step 242: Download

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 169 |
| **Activity** | Mass Upload: Mass Import of Customer Invoices |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Download (Download Template) to download the spreadsheet template and choose:
Template Language: For example, English
Format: For example, *.xlsx, for MS Excel Workbook
Choose Download to continue.

</details>

---

### Step 243: Enter Details

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 170 |
| **Activity** | Mass Upload: Mass Import of Customer Invoices |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter the following content into the template data sections:Note
The template has hidden columns. If you don't see a field, unhide the columns as needed.
Note
Ensure that you use the correct date format in the template.
Header data section
Document Sequence Number: <sequence number, increasing sequentially> (you must enter this manually)
Company Code (4):5410
Transaction (1): 1 (invoice) or 2 (credit memo)
Customer (10): 54100001
Reference (16): <any text with maximum number of 16 characters>
Document Date: <Today's date MM/DD/YYYY>
Posting Date: <Today's date MM/DD/YYYY>
Document Type (2): DR (invoice) or DG (credit memo)
Document Header Text (25): <any text with maximum number of 25 characters>
Transaction Currency (5): MYR
Gross Invoice Amount: 1190G/L Account Items section
G/L Account (10): For example, 41000400
Item Text (50): <any text with maximum number of 50 characters>
Debit/Credit (1) S=Debit, H=Credit: S (Debit) or H (credit)
Item Amount: For example, 1190Note
The Item Amount field may have a different value, depending on, where applicable, the chosen Tax Code.

Tax Code (2): <output tax code>
Profit Center (10): YB700
Reporting Segment: <reporting segment> (optional; if left blank, the system derives the value from master data)
Functional Area: <functional area> (optional; if left blank, the system derives the value from master data)

</details>

---

### Step 244: Upload

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 171 |
| **Activity** | Mass Upload: Mass Import of Customer Invoices |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To upload a file, choose Browse and select the file to upload.

</details>

**Expected Result (Test Verification):**
> File is uploaded and the Worklist section displays Inv. Status Draft for items uploaded.

---

### Step 245: Check

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 172 |
| **Activity** | Mass Upload: Mass Import of Customer Invoices |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the checkbox of the documents to be checked and choose Check.

</details>

**Expected Result (Test Verification):**
> Any items containing errors are identified in the Invoice Status column with red icons. Otherwise, a green flag icon displays for correct entries.

---

### Step 246: Review the Log

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 173 |
| **Activity** | Mass Upload: Mass Import of Customer Invoices |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To view log, select the checkbox of the documents and choose Show Log.

</details>

**Expected Result (Test Verification):**
> Details of logs are displayed.

---

### Step 247: Correct any Errors

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 174 |
| **Activity** | Mass Upload: Mass Import of Customer Invoices |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Select the item to review and correct any errors.

</details>

**Expected Result (Test Verification):**
> Customer invoice application is displayed showing details of uploaded item.The Draft Status column changes to a green flag icon after correcting the error and returning to the worklist.

---

### Step 248: Correct any Errors in Customer Invoice Application

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 175 |
| **Activity** | Mass Upload: Mass Import of Customer Invoices |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
If the customer invoice application reveals any errors, correct those errors and return to the worklist.

</details>

---

### Step 249: Post

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 176 |
| **Activity** | Mass Upload: Mass Import of Customer Invoices |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the checkboxes for the documents to post and choose Post.

</details>

**Expected Result (Test Verification):**
> Items are posted.Note
> To view posting details, choose the View Application Jobs button.

---


## Activity 29: Invoice Reporting

> 1 steps total | 0 classifiable | 1 hidden

### Step 250: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Reporting |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Note
If you implemented SAP Collections and Dispute Management (an additional license is required), execute the Collections and Dispute Management(BFC) test script. If you haven't implemented SAP Collections and Dispute Management, continue with the procedures in this test script.

</details>

---


## Activity 30: Create Dunning Notices

> 11 steps total | 8 classifiable | 3 hidden

### Step 251: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Dunning Notices |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you create and schedule a dunning run and print dunning notices to customers. The activity is considered automatic as the system selects the overdue open items, determines the dunning level of the accounts in question, and creates dunning notices. 
This activity finds items to dun for all customers assigned to a dunning clerk, accounting clerk, and a dunning procedure.
Two dunning procedures are provided: 
  - 1001- Dunning notice every 14 days, 4 dunning levels
  - 1002- Dunning notice, 30 days after the invoice has been created

#### Prerequisites
- Maintain customer master data, role FLVCU00 Customer Fin Accounting, Company Code5410, Customer Correspondencetab:   - Assign dunning procedure: 1001
  - Assign Accounting Clerk and Dunning Clerk (if different, Dunning Clerk has higher priority): 01
  - Dunning block isn't set for customer 
  - There are invoices past due

  - Ensure that the Dunning history for the last dunning run is 14 days old or older, otherwise no dunning proposal is created.

</details>

---

### Step 252: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Dunning Notices |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Receivable Accountant.

</details>

---

### Step 253: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Dunning Notices |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Create Dunning Notices (F150).

</details>

**Expected Result (Test Verification):**
> The Dunning view displays.

---

### Step 254: Create Dunning Run

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 177 |
| **Activity** | Create Dunning Notices |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step sends payment reminders to customers who haven't paid on time. Think about: does your company send overdue payment notices? How many reminder levels?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Status tab, make the following entries: Run on: <today's date>
Identification: for example, 001
Choose the Parameter tab and make the following entries: 
Dunning date: <today's date>
Docmts Posted Up To: <today's date>
Company Code: 5410
Customer: 54100001

</details>

---

### Step 255: Save Parameters

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 178 |
| **Activity** | Create Dunning Notices |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Save at the bottom of the view.

</details>

---

### Step 256: Schedule Dunning Run

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 179 |
| **Activity** | Create Dunning Notices |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step sends payment reminders to customers who haven't paid on time. Think about: does your company send overdue payment notices? How many reminder levels?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Status tab. Choose Schedule at the top of the view.
In the dialog box, make the following entries and choose Continue: 
Output device: LP01

</details>

**Expected Result (Test Verification):**
> A Schedule Selection and Print dialog box displays.

---

### Step 257: Enter Job Parameters

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 180 |
| **Activity** | Create Dunning Notices |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Dispatch: 
Start date: <today's date>
Start time: <leave as is>
Start immediately: check
Dunn. Print with Scheduling: Selected
Output device: LP01

</details>

**Expected Result (Test Verification):**
> The Status view displays.The Select and print Running status displays. 
> No dunning notices generated to be sent.
> No dunning notices printed. 
> A notification displays at the bottom of the view that the dunning job was scheduled successfully.

---

### Step 258: Print Dunning List

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 181 |
| **Activity** | Create Dunning Notices |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step sends payment reminders to customers who haven't paid on time. Think about: does your company send overdue payment notices? How many reminder levels?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Refresh from the bottom of the view.
Select Dunning list.
In the dialog box that appears, enter or verify the following:
Program: RFMAHN21
Choose Continue.

</details>

**Expected Result (Test Verification):**
> The Dunning Proposal displays.

---

### Step 259: Sample Printout

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 182 |
| **Activity** | Create Dunning Notices |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
After you completed your review the Dunning list, choose the < (Back) button.
Choose the Sample printout tab.
If an Output Parameters dialog box appears, enter the following:
Output Device: LP01
and choose Continue.

</details>

**Expected Result (Test Verification):**
> A Schedule Sample Printout dialog box displays.

---

### Step 260: Schedule Sample Printout

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 183 |
| **Activity** | Create Dunning Notices |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Job parameters section, make or verify the following entries: 
Start date: <today's date>
Start immediately: Selected
On the Printout section, make or verify the following entry:
Output device: LP01

On the Customer (from/to) section, make the following entry:
Customer: 54100001
and choose Display.

</details>

**Expected Result (Test Verification):**
> A document in PDF format displays and all items dunned display in the dunning notice.

---

### Step 261: Dunning History

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 184 |
| **Activity** | Create Dunning Notices |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step sends payment reminders to customers who haven't paid on time. Think about: does your company send overdue payment notices? How many reminder levels?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
After you completed your review the document, choose the < (Back) button to return to the Dunning view.
Choose the More tab to display a dropdown menu of available options.
For example, choose Goto  Dunn. History and the FI Dunning - Dunning History view displays. 
Make the following entries:
  - Account type: D

  - Company code: 5410
  - Customer: 54100001

 and choose Execute from the bottom of the view.

</details>

**Expected Result (Test Verification):**
> The dunning history displays with a list of dates when the customer was dunned.

---


## Activity 31: Manage My Dunning Proposals

> 7 steps total | 4 classifiable | 3 hidden

### Step 262: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Manage My Dunning Proposals |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This section describes creating dunning proposals, and printing and emailing dunning notices to customers.
In this activity, you create dunning proposals for all customers assigned to a dunning clerk, accounting clerk, or to a dunning procedure.
Two dunning procedures are set up: 
  - 1001- Dunning notice every 14 days, 4 dunning levels
  - 1002- Dunning notice, 30 days after the invoice has been created

#### Prerequisites
- Maintain customer master data role Customer Fin Accounting, Company Code5410, Correspondencetab:   - Assign dunning procedure : 1001 
  - Assign Accounting Clerk and Dunning Clerk (if different, Dunning Clerk has higher priority) : 01For more information, see the Define Accounting Clerk step.
  - Ensure that a dunning block isn't set for the customer 
  - Ensure that there are invoices past due

  - Verify in the dunning history that the last dunning run is 14 days old or more - otherwise no dunning proposals are created
  - Dunning proposals initiated from outside the app should create separate dunning runs for each dunning clerk. Dunning runs for multiple clerks can't be processed and remain in the app.Caution
If you already created dunning notices and there's nothing to dun for the customer, this app won't create any dunning proposals.

</details>

---

### Step 263: Logon

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Manage My Dunning Proposals |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Receivable Accountant.

</details>

---

### Step 264: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Manage My Dunning Proposals |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open My Dunning Proposals (F2435).

</details>

**Expected Result (Test Verification):**
> A dialog box displays a list of all the dunning proposals with information of customer, company code, value, and other fields.

---

### Step 265: Dunning

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 185 |
| **Activity** | Manage My Dunning Proposals |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step sends payment reminders to customers who haven't paid on time. Think about: does your company send overdue payment notices? How many reminder levels?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Select Create Dunning Proposal and choose Create.

</details>

**Expected Result (Test Verification):**
> A message displays that the dunning proposal is now being created and the dunning proposals are created.

---

### Step 266: Notice

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 186 |
| **Activity** | Manage My Dunning Proposals |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To preview the dunning notice, select the checkbox of the row to view the preview notice.
In the Preview Notice column, select Preview Notice.
A PDF icon is displayed in the Preview Notice column.
When done checking the notice, choose  Close at the bottom of the notice view.

</details>

**Expected Result (Test Verification):**
> The Dunning Notice displays on the view with options to download, print, zoom, or set a dunning block.

---

### Step 267: Printing

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 187 |
| **Activity** | Manage My Dunning Proposals |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Send Dunning Notices option at the bottom of the view.
Note
Dunning notices are created for all proposals, regardless of individual row selection.
A Send Dunning Notices dialog box is displayed, providing two options. Select Send dunning notices to the printer and choose Send.
A new field with a unique ID of the queue appears. Select the printer from the dropdown menu and choose Send.

</details>

**Expected Result (Test Verification):**
> Dunning is printed and customer master is updated in the Company code → Correspondence tab.

---

### Step 268: Set Dunning Block

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 188 |
| **Activity** | Manage My Dunning Proposals |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step sends payment reminders to customers who haven't paid on time. Think about: does your company send overdue payment notices? How many reminder levels?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Review the line item and select the Set Dunning Block. The following options appear :
  - Disputed
  - Promise to Pay
  - To be Clarified with Sales Department
  - Legal Department
  - Other Reason
Select one of the options and a message appears that the dunning block was set successfully. In the Dunning Block column of the list, a letter that identifies the option of the dunning block is displayed.

</details>

**Expected Result (Test Verification):**
> Dunning block is set for the line item.

---


## Activity 32: Display Dunning History

> 5 steps total | 2 classifiable | 3 hidden

### Step 269: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Display Dunning History |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, the dunning history is displayed.

#### Prerequisites
At least one dunning letter has been generated.

</details>

---

### Step 270: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Display Dunning History |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Receivable Accountant.

</details>

---

### Step 271: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Display Dunning History |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Display Dunning History (F2328).

</details>

**Expected Result (Test Verification):**
> The Dunning History view displays.

---

### Step 272: Search Criteria

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 189 |
| **Activity** | Display Dunning History |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Select your desired search criteria and choose Go.

</details>

**Expected Result (Test Verification):**
> A list of dunning notices displays.

---

### Step 273: Show Details

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 190 |
| **Activity** | Display Dunning History |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the row of a dunning notice to display and choose Show Details.

</details>

**Expected Result (Test Verification):**
> The Dunning Notice view with all details is displayed.

---


## Activity 33: Open Correspondence

> 18 steps total | 12 classifiable | 6 hidden

### Step 274: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Open Correspondence |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you create open items correspondence. There are two options for this procedure:
When choosing correspondence SAP09 (Internal Document),a journal entry number is necessary before executing the report. We recommend that you use Procedure Band the Manage Journal Entries(F0717A)SAP Fiori app to find a journal entry number and then create the correspondence. 
For the other correspondence reports, use Procedure A.

#### Prerequisites
Invoices and payments are posted.
Business Partner (BP) master data (such as email address, and so on) are updated.

#### Instructions
### Procedure A - Create Correspondence

</details>

---

### Step 275: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Open Correspondence |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Receivable Accountant.

</details>

---

### Step 276: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Open Correspondence |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Create Correspondence (F0744A).

</details>

---

### Step 277: Select

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 191 |
| **Activity** | Open Correspondence |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries: Company Code: 5410
Correspondence: Select any of the following reports:   - SAP06 (Account Statement)
  - SAP08 (Open Item List)
  - SAP09 (Internal Document)
  - SAP13 (Customer Statement)
  - SAP21 (FI Customer Invoice)
Note
Only when selecting the SAP09 report, follow the steps in Procedure B.

</details>

**Expected Result (Test Verification):**
> Report is selected.

---

### Step 278: Data Entry

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 192 |
| **Activity** | Open Correspondence |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Depending on the Correspondence value selected above, different fields are displayed.
For SAP06, make the following entries:
Customer: Selected
Customer: <Any customer number>
Postings From: <Any date>
Postings To: <Any date>
Last Statement: <Any date>
For SAP13, make the following entries:
Customer: Selected
Customer: <Any customer number>
Last Statement: <Any date>
Current Statement: <any date>
For SAP08, make the following entries:
Customer: Selected
Customer: <Any customer number>
Open at Key Date: <any date>
For SAP09 (entry view) and SAP21, make the following entries:
Journal Entry: <journal entry>
Fiscal year: <fiscal year>
For SAP09 (ledger view), make the following entries:
Journal Entry: <journal entry>
Fiscal year: <fiscal year>
Ledger: <ledger>

</details>

---

### Step 279: Actions

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 193 |
| **Activity** | Open Correspondence |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Use the buttons at the bottom of the view to preview, email, and print the correspondence.
Note
When choosing Send Email or Print, populate the required fields in the dialog box to complete the process.

</details>

**Expected Result (Test Verification):**
> Correspondence is created according to the selected criteria.

---

### Step 280: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Open Correspondence |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

### Procedure B - Manage Journal Entries

</details>

---

### Step 281: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Open Correspondence |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an General Ledger Accountant .

</details>

---

### Step 282: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Open Correspondence |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Journal Entries (F0717A).

</details>

**Expected Result (Test Verification):**
> The Manage Journal Entries view displays.

---

### Step 283: Select Journal Entry

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 194 |
| **Activity** | Open Correspondence |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step is about recording financial transactions in your books. Think about: who posts journal entries? Are there approval requirements? Do you post adjustments at month-end?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Go:
Company Code: 5410
Ledger Group: empty
Journal Entry Type: (optional) For example, SA
Journal Entry: <empty>
Journal Entry Date: (optional) <date>
Period:
(optional) <period>
Fiscal Year: <year of posting document>
Posting Date
(optional): <date>

</details>

**Expected Result (Test Verification):**
> Selected journal entries are displayed in the Journal Entries list.

---

### Step 284: Manage Journal Entry

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 195 |
| **Activity** | Open Correspondence |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step is about recording financial transactions in your books. Think about: who posts journal entries? Are there approval requirements? Do you post adjustments at month-end?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select a journal entry number and choose Manage Journal Entry.

</details>

**Expected Result (Test Verification):**
> The Journal Entry - Entry View view displays with the document details.

---

### Step 285: Correspondence

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 196 |
| **Activity** | Open Correspondence |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Create Correspondence.

</details>

**Expected Result (Test Verification):**
> The Create Correspondence view displays.

---

### Step 286: Entry View

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 197 |
| **Activity** | Open Correspondence |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the following:
Correspondence: SAP09 (Internal Document - Entry View)

</details>

**Expected Result (Test Verification):**
> Available fields display and are populated automatically.

---

### Step 287: Actions

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 198 |
| **Activity** | Open Correspondence |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Use the buttons to:
Preview
Print
Send Email.

</details>

**Expected Result (Test Verification):**
> Correspondence is created according to the selected criteria.

---

### Step 288: Exit

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 199 |
| **Activity** | Open Correspondence |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Home to exit.

</details>

**Expected Result (Test Verification):**
> SAP Fiori launchpad displays.

---

### Step 289: Ledger View

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 200 |
| **Activity** | Open Correspondence |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Repeat steps 1–5 and select:
Correspondence: SAP09 (Internal Document - Ledger View)

</details>

**Expected Result (Test Verification):**
> Available fields display and are populated automatically.

---

### Step 290: Parameters

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 201 |
| **Activity** | Open Correspondence |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Advanced Parameters.
Make the following entry:
Correspondence: <Any ledger, for example 0L>

</details>

---

### Step 291: Actions

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 202 |
| **Activity** | Open Correspondence |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Use the buttons to:
Preview
Print
Send Email.

</details>

**Expected Result (Test Verification):**
> Correspondence is created according to the selected criteria.

---


## Activity 34: Display Correspondence History

> 5 steps total | 2 classifiable | 3 hidden

### Step 292: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Display Correspondence History |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This activity displays a history of the correspondence sent to a customer.

#### Prerequisites
Correspondence is created and sent.

</details>

---

### Step 293: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Display Correspondence History |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Receivable Accountant

</details>

---

### Step 294: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Display Correspondence History |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Display Correspondence History (F2934)

</details>

---

### Step 295: Search

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 203 |
| **Activity** | Display Correspondence History |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Select any desired search criteria and choose Go.

</details>

**Expected Result (Test Verification):**
> A list of correspondence history records is displayed.

---

### Step 296: Details

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 204 |
| **Activity** | Display Correspondence History |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Select a row to display.

</details>

**Expected Result (Test Verification):**
> Details are displayed.

---


## Activity 35: Invoice Management Reporting: Accounts Receivable Overview

> 5 steps total | 1 classifiable | 4 hidden

### Step 297: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Accounts Receivable Overview |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This procedure guides you through the accounts receivable overview. In this activity, you review an overview of relevant figures and statistics related to the accounts receivable process. The Accounts Receivable Overview(F3242)app offers a central point of entry and an overview of the department.

#### Instructions
### Purpose
This procedure guides you through the accounts receivable overview. In this activity, you review an overview of relevant figures and statistics related to the accounts receivable process. The Accounts Receivable Overview(F3242)app offers a central point of entry and an overview of the department.

### Procedure

</details>

---

### Step 298: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Accounts Receivable Overview |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Receivable Manager.
Note
Once you log on, you can customize fields to be displayed by default. To do so, choose User  Settings  Default Values, then add the Display Currency, Company Code, and Supplier fields. Save your changes.

</details>

---

### Step 299: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Accounts Receivable Overview |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Accounts Receivable Overview (F3242).

</details>

---

### Step 300: Edit Criteria

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 205 |
| **Activity** | Invoice Management Reporting: Accounts Receivable Overview |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Go:
Display Currency: MYR
Note
You can change the currency If needed.

Net Due Interval 1: for example, 30
Net Due Interval 2: for example, 60
Net Due Interval 3: for example, 90
Company Code: <any>

</details>

**Expected Result (Test Verification):**
> Relevant figures and statistics display in the lower part of the screen.
> Some of the cards displayed are:
>   - Quick Links
>   - AR Aging Analysis
>   - My Inbox
>   - Days Sales Outstanding
>   - Cash Collection Tracker
>   - AR Breakdown
>   - Top 10 Debtors

---

### Step 301: Navigate to Options

| | |
|---|---|
| **Type** | `Navigation` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Accounts Receivable Overview |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
There are different, available options for reviewing figures and statistics. 
You can change the global filters if needed. The visible cards can be customized.
Each card mentioned in the prior step provides you with functions to view and manage various accounts payable functions and information

</details>

**Expected Result (Test Verification):**
> Figures and statistics display according to available options.

---


## Activity 36: Invoice Management Reporting: Monitor Overdue Receivables

> 4 steps total | 1 classifiable | 3 hidden

### Step 302: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Monitor Overdue Receivables |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you monitor the status of overdue items. Different predelivered graphs are available.

#### Prerequisites
Open invoices are available in the system.

</details>

---

### Step 303: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Monitor Overdue Receivables |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Receivable Manager.

</details>

---

### Step 304: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Monitor Overdue Receivables |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Overdue Receivables - Today (F1747).

</details>

**Expected Result (Test Verification):**
> A graphical overview for the overdue receivables displays.

---

### Step 305: Explore Receivables

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 206 |
| **Activity** | Invoice Management Reporting: Monitor Overdue Receivables |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the drilldown button next to By Due Period or choose the bar in the graphic, and select an option.

</details>

**Expected Result (Test Verification):**
> A graph or list is displayed according to the selection.

---


## Activity 37: Invoice Management Reporting: Monitor Overdue Receivables by Risk Class

> 4 steps total | 1 classifiable | 3 hidden

### Step 306: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Monitor Overdue Receivables by Risk Class |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you, monitor the overdue receivables via the report of overdue payments. This report is a list of customers classified by risk. You can search the report by risk class, company code, country/region, customer, credit segment, G/L account, or currency. The output provides a graph displaying customer risk classification. You can export the graph into a fact sheet for analysis.

#### Prerequisites
Customer master data is maintained for company codes.
Invoices are posted and past due.

</details>

---

### Step 307: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Monitor Overdue Receivables by Risk Class |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Receivable Manager.

</details>

---

### Step 308: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Monitor Overdue Receivables by Risk Class |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Overdue Receivables - by Risk Class (F2539).

</details>

**Expected Result (Test Verification):**
> A graphical overview for the overdue receivables is displayed.

---

### Step 309: Navigation

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 207 |
| **Activity** | Invoice Management Reporting: Monitor Overdue Receivables by Risk Class |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To change the graph view, choose the drill-down button or other buttons for the report.
At the top of the graph view, there are additional buttons you can use to change the display layout of the graph.

</details>

**Expected Result (Test Verification):**
> A graph or list is displayed according to the selection.
> •Risk Class
> •Company Code
> •Country Key
> •Customer

---


## Activity 38: Invoice Management Reporting: Future Receivables

> 4 steps total | 1 classifiable | 3 hidden

### Step 310: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Future Receivables |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, the analytical app displays the Key Performance Indicator (KPI) for Future Receivables.

#### Prerequisites
Invoices are posted.

</details>

---

### Step 311: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Future Receivables |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Receivable Manager.

</details>

---

### Step 312: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Future Receivables |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Future Receivables - Today (F1744).

</details>

---

### Step 313: Navigation

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 208 |
| **Activity** | Invoice Management Reporting: Future Receivables |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To change the view, use any of the navigation options:
Use the dropdown list to view by By Due Period, By Customer (Top 10 Receivables, Chart), By Company Customer (Top 10 Receivables, Table), By Company Code (Chart), or the By Company Code (Table).
Use the View By icon to filter by available dimensions, for example Company Code, Region, or Accounting Clerk.
Switch between chart or table views.
Switch the chart type view, for example Bar Chart, Line Chart, or Heat Map.
Your selected view can be exported to a spreadsheet or sent as an email.

</details>

**Expected Result (Test Verification):**
> Different views display.

---


## Activity 39: Invoice Management Reporting: Total Receivables

> 4 steps total | 1 classifiable | 3 hidden

### Step 314: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Total Receivables |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you review the Key Performance Indicator (KPI) for Total Receivables.

#### Prerequisites
Invoices are posted.

</details>

---

### Step 315: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Total Receivables |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Receivable Manager.

</details>

---

### Step 316: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Total Receivables |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Total Receivables - Today (F1748).

</details>

---

### Step 317: Navigation

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 209 |
| **Activity** | Invoice Management Reporting: Total Receivables |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To change the view, use any of the navigation options:
Use the dropdown list to view by By Due Period, By Top 10 Customers, By Company Code, or the By Accounting Clerk.
Use the View By button to filter by available dimensions (for example Company Code or Account Group).
Switch between chart or table views.
Switch the chart type view, for example Bar Chart, Line Chart, or Heat Map.
Your selected view can be exported to a spreadsheet or sent as an email.

</details>

---


## Activity 40: Invoice Management Reporting: Days Sales Outstanding

> 8 steps total | 5 classifiable | 3 hidden

### Step 318: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Days Sales Outstanding |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
The analytical app displays the key performance indicator (KPI) Days Sales Outstanding. This KPI is the average number of days it takes for your company to collect receivables. A high Days Sales Outstanding (DSO) figure can indicate that your company is taking too long to collect money.

#### Prerequisites
Invoices are posted and unpaid.

</details>

---

### Step 319: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Days Sales Outstanding |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Receivable Manager.

</details>

---

### Step 320: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Days Sales Outstanding |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Days Sales Outstanding - Last 12 Months (F1741).

</details>

---

### Step 321: Navigation

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 210 |
| **Activity** | Invoice Management Reporting: Days Sales Outstanding |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To change the view, choose the View By button or other available buttons in the report.
You can view days sales outstanding (DSO) figures in a chart or table according to company code, customer, country/region, accounting clerk, and month.

</details>

**Expected Result (Test Verification):**
> Different views are displayed.

---

### Step 322: Detailed Analysis

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 211 |
| **Activity** | Invoice Management Reporting: Days Sales Outstanding |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Jump To  Days Sales Outstanding - Detailed Analysis.

</details>

---

### Step 323: Selection

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 212 |
| **Activity** | Invoice Management Reporting: Days Sales Outstanding |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To change a view, choose + (Add Analysis Step). Select any of the options displayed; every time you choose an option more options are displayed. Select any of them until you select the Chart type:
Time :
Company Code :
Customer:
Country of Customer :
Due Period: Note
You can choose the  + Add Analysis Step button again to display more analysis.

</details>

**Expected Result (Test Verification):**
> Different views are displayed.

---

### Step 324: Save

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 213 |
| **Activity** | Invoice Management Reporting: Days Sales Outstanding |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Unnamed Analysis Path area, choose the Related Options button, then choose Save As to save your current selection. Enter a name and choose OK.

</details>

**Expected Result (Test Verification):**
> The view is saved. You can access it later to view the information with this type of analysis.

---

### Step 325: Open

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 214 |
| **Activity** | Invoice Management Reporting: Days Sales Outstanding |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Unnamed Analysis Path area, choose the Related Options button, then choose Open. Select a previously saved analysis and choose OK.

</details>

**Expected Result (Test Verification):**
> The  Unnamed Analysis Path button shows name of selected saved analysis.

---


## Activity 41: Invoice Management Reporting: Dunning Level Distribution

> 4 steps total | 1 classifiable | 3 hidden

### Step 326: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Dunning Level Distribution |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you review the Key Performance Indicator (KPI) Dunning Level Distribution (open dunning amounts per dunning level and customer).

#### Prerequisites
Dunning is generated.

</details>

---

### Step 327: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Dunning Level Distribution |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Receivable Manager.

</details>

---

### Step 328: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Dunning Level Distribution |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Dunning Level Distribution - Today (F1742).

</details>

---

### Step 329: Navigation

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 215 |
| **Activity** | Invoice Management Reporting: Dunning Level Distribution |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To change the view, use any of the navigation options:
Use the dropdown list to view By Dunning Level or the By Customer (Top 10 Overdue) .
Use the View By icon to filter by available dimensions, for example Company Code, Region, and so on.
Switch between chart or table views.
Switch the chart type view, for example Column Chart, Doughnut Chart, Heat Map, and so on.
Your selected view can be exported to a spreadsheet or sent by email.

</details>

**Expected Result (Test Verification):**
> Different views display.

---


## Activity 42: Invoice Management Reporting: Days Beyond Terms

> 4 steps total | 1 classifiable | 3 hidden

### Step 330: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Days Beyond Terms |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you review the key performance indicator (KPI) for Days Beyond Terms (DBT). You gain an insight into the payment history of your customers and how effectively your company collects payments. A high DBT figure indicates that your company is taking too long to collect payments.

#### Prerequisites
Invoices are created.

</details>

---

### Step 331: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Days Beyond Terms |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Receivable Manager.

</details>

---

### Step 332: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Days Beyond Terms |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Days Beyond Terms - Last 12 Months (F1739).

</details>

---

### Step 333: Navigation

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 216 |
| **Activity** | Invoice Management Reporting: Days Beyond Terms |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To change the view, use any of the navigation options:
Use the dropdown list to view by By Period, Ratio Payments Within Terms/Beyond Terms, or the By Customer (Top 10 Overdue).
Use the View By button to filter by available dimensions, for example Company Code, Calendar Month, and so on.
Switch between chart or table views.
Switch the chart type view, for example Line Chart, Waterfall Chart, Heat Map, and so on.
Your selected view can be exported to a spreadsheet.

</details>

**Expected Result (Test Verification):**
> Different views display.

---


## Activity 43: Invoice Management Reporting: Display Item Change Log

> 5 steps total | 2 classifiable | 3 hidden

### Step 334: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Display Item Change Log |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you display, sort, and analyze logged changes for journal entries. This report provides better control and tracks changes performed manually by different users on payable items.

#### Prerequisites
Invoices are created.
Payments are created.
Prior to report generation, the documents are changed.

</details>

---

### Step 335: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Display Item Change Log |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Receivable Manager.

</details>

---

### Step 336: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Display Item Change Log |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Display Item Change Log - Customer (F7796).

</details>

---

### Step 337: Select

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 217 |
| **Activity** | Invoice Management Reporting: Display Item Change Log |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter the following data and choose Go:
Document Type: <document type>, for example, Documents
Fiscal Year: <any>
Changed on:  <interval of dates>
Company Code: 5410

</details>

**Expected Result (Test Verification):**
> The Items pane shows all relevant journal entries.

---

### Step 338: Exit

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 218 |
| **Activity** | Invoice Management Reporting: Display Item Change Log |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
You can view additional information by clicking on entries under Journal Entry, Customer, and so on. When done, choose Back.

</details>

---


## Activity 44: Invoice Management Reporting: Cash Collection Tracker

> 5 steps total | 2 classifiable | 3 hidden

### Step 339: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Cash Collection Tracker |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you monitor the actual cash collection progress against the target performed by the collection specialists.

#### Prerequisites
Invoices are created.
Some invoices are collected and some remain open.

</details>

---

### Step 340: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Cash Collection Tracker |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Receivable Manager.

</details>

---

### Step 341: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Cash Collection Tracker |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Cash Collection Tracker - Accounts Receivable (F2925).

</details>

---

### Step 342: Enter Criteria

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 219 |
| **Activity** | Invoice Management Reporting: Cash Collection Tracker |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Go: 
As of Date: <Today’s date>
Period Type: <Period Type>
Display Currency: <Company Code currency>
Exchange Rate Type: M

</details>

---

### Step 343: Available Views

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 220 |
| **Activity** | Invoice Management Reporting: Cash Collection Tracker |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select any of the available views:By Company Code
By Accounting Clerk
By Customer

</details>

**Expected Result (Test Verification):**
> The list updates and displays according to the selected view.

---


## Activity 45: Down Payments: Create Down Payment Request

> 8 steps total | 5 classifiable | 3 hidden

### Step 344: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Down Payments: Create Down Payment Request |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you create a down payment request.

#### Prerequisites
The customer master record has been entered.

</details>

---

### Step 345: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Down Payments: Create Down Payment Request |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Receivable Accountant.

</details>

---

### Step 346: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Down Payments: Create Down Payment Request |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Manage Customer Down Payment Requests (F1689).

</details>

---

### Step 347: Create

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 221 |
| **Activity** | Down Payments: Create Down Payment Request |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose the Create button.

</details>

---

### Step 348: Header Criteria

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 222 |
| **Activity** | Down Payments: Create Down Payment Request |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries:
Company Code: 5410
Journal Entry Date: Today’s date
Posting date: Today’s date
Journal Entry Type: DZ
Transaction Currency: MYR

</details>

---

### Step 349: Items Criteria

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 223 |
| **Activity** | Down Payments: Create Down Payment Request |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter the following:
Customer: 54100001
Amount: for example, 1000
Tax Code: for example, <enter a tax code if necessary>
Trg. Spec. G/L Ind: A (Default value, don't change) Choose > to see more details and enter the following data:
Due on: Today’s date
Choose Enter.

</details>

---

### Step 350: Post

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 224 |
| **Activity** | Down Payments: Create Down Payment Request |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Post.

</details>

**Expected Result (Test Verification):**
> The Success view is displayed showing the journal entry number posted.

---

### Step 351: Additional Actions

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 225 |
| **Activity** | Down Payments: Create Down Payment Request |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the desired action in the Success view:
Display
Post Next
Go to Worklist

</details>

---


## Activity 46: Down Payments: Display Down Payment Request

> 7 steps total | 3 classifiable | 4 hidden

### Step 352: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Down Payments: Display Down Payment Request |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you review the down payment request.

#### Prerequisites
A down payment request is posted.

</details>

---

### Step 353: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Down Payments: Display Down Payment Request |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Receivable Accountant.

</details>

---

### Step 354: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Down Payments: Display Down Payment Request |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Manage Customer Down Payment Requests (F1689).

</details>

---

### Step 355: Search

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 226 |
| **Activity** | Down Payments: Display Down Payment Request |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Go:
Company Code: 5410
Posted By: <today’s date>

</details>

**Expected Result (Test Verification):**
> A list of Down Payment Requests is displayed according to search criteria.

---

### Step 356: Select

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 227 |
| **Activity** | Down Payments: Display Down Payment Request |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Journal Entry column, select the document number to display. On the dialog box that displays, choose the document number.

</details>

**Expected Result (Test Verification):**
> The Manage Journal Entries view displays the details of the selected journal entry.

---

### Step 357: View

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 228 |
| **Activity** | Down Payments: Display Down Payment Request |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Review the details of selected journal entry.

</details>

---

### Step 358: Back

| | |
|---|---|
| **Type** | `Navigation` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Down Payments: Display Down Payment Request |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose < (Back) to return to previous view.

</details>

**Expected Result (Test Verification):**
> The Manage Customers Down Payment Requests view displays.

---


## Activity 47: Down Payments: Post Down Payment

> 9 steps total | 6 classifiable | 3 hidden

### Step 359: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Down Payments: Post Down Payment |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you create a payment for a down payment request.

#### Prerequisites
A down payment request is posted. Use a previously created down payment request.

</details>

---

### Step 360: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Down Payments: Post Down Payment |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Receivable Accountant.

</details>

---

### Step 361: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Down Payments: Post Down Payment |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Post Incoming Payments (F1345).

</details>

---

### Step 362: General Information

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 229 |
| **Activity** | Down Payments: Post Down Payment |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries in the General Information area:
Company Code: 5410
Posting date: <date>
Journal Entry Date: <date>
Value date: <today's date>
Type: DZ

</details>

---

### Step 363: Bank Data

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 230 |
| **Activity** | Down Payments: Post Down Payment |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries in the Bank Data area: 
G/L Account: 11001060
House Bank/Account ID: <House Bank> and <Account ID>
Amount: <Down payment request amount>
Amount/CCode Currency: <amount>MYR

</details>

---

### Step 364: Open Item Selection

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 231 |
| **Activity** | Down Payments: Post Down Payment |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries in the Open item selection area:
Account Type/Account ID: Select Customer from the dropdown and enter 54100001 for the Account ID.
Payment Reference: <Down payment request document number>
Choose Propose Items .

</details>

**Expected Result (Test Verification):**
> The open items list displays.
>  If you enter the document created in the previous Create Down Payment Request procedure directly in the Payment Reference field, and choose Propose Items, the down payment document is automatically transferred to the Items to be cleared section.

---

### Step 365: Select More

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 232 |
| **Activity** | Down Payments: Post Down Payment |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Select More. Select the checkbox for Special G/L Transactions and choose OK.
To choose the items to clear, choose the Clear button from the last column.

</details>

**Expected Result (Test Verification):**
> The selected item in Payment Reference is transferred to Items to Be Cleared view.

---

### Step 366: Post Entries

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 233 |
| **Activity** | Down Payments: Post Down Payment |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Post.

</details>

**Expected Result (Test Verification):**
> The Success dialog box displays details of the document number generated.

---

### Step 367: Other

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 234 |
| **Activity** | Down Payments: Post Down Payment |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Success dialog box, select the following options:
Display
Post Next Payment.

</details>

---


## Activity 48: Down Payments: Enter Invoice Without Sales Order

> 8 steps total | 5 classifiable | 3 hidden

### Step 368: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Down Payments: Enter Invoice Without Sales Order |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
Customer invoices are posted in accounting. In this activity, you create journal entries.

#### Prerequisites
Customer master records have been entered.

</details>

---

### Step 369: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Down Payments: Enter Invoice Without Sales Order |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Receivable Accountant.

</details>

---

### Step 370: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Down Payments: Enter Invoice Without Sales Order |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Create Outgoing Invoices (FB70).

</details>

**Expected Result (Test Verification):**
> The Enter Customer Invoice view displays.

---

### Step 371: Basic Data

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 235 |
| **Activity** | Down Payments: Enter Invoice Without Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Company Code and enter your company code.
Make the following entries:
Customer: <customer number>
Invoice date: <Today’s date>
Posting date: <Today’s date>
Reference: <any>
Amount: <any>
Currency Key: <co.code currency>
Calculate Tax: selected

</details>

---

### Step 372: Payment Tab

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 236 |
| **Activity** | Down Payments: Enter Invoice Without Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Bline Date: <Today’s date>
Payt Terms: 0001
Payt Meth.: <optional>

</details>

---

### Step 373: Line Items

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 237 |
| **Activity** | Down Payments: Enter Invoice Without Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
G/L Acct: 41000400
D/C: Credit 
Amount in Document Currency: <Check amount that was entered in the basic data> 
Tax Code: <Sales Tax Code>

</details>

---

### Step 374: Profitability Segment

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 238 |
| **Activity** | Down Payments: Enter Invoice Without Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Profit.segment column, select button and enter: 
Customer: <customer number>
Profit Center: <any>
Choose Derivation and then choose Continue.

</details>

---

### Step 375: Post

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 239 |
| **Activity** | Down Payments: Enter Invoice Without Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Post to save.

</details>

**Expected Result (Test Verification):**
> Journal Entry is posted.

---


## Activity 49: Down Payments: Post Incoming Payments

> 12 steps total | 9 classifiable | 3 hidden

### Step 376: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Down Payments: Post Incoming Payments |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you post the incoming payments from the customer.
For a payment of an invoice where a down payment is applied, the incoming payment amount should be the remainder invoice balance (the remainder invoice balance is the invoice value less the down payment to be applied). 
Note
To link a down payment to a particular invoice, use the Clear Incoming Payments- Manual Clearing(F0773)app. Select the down payment and invoice, then assign the invoice. Enter the down payment amount in the Allocated amountfield and post a partial payment on the invoice with the invoice reference (REBZG). The counter-posting line is a clearing of the down payment. This step clears the down payment on the alternative reconciliation account and posts a new partial payment line item with the invoice reference on the normal reconciliation account. Use the procedure below to post the incoming payment for the remaining amount.

#### Prerequisites
Invoices are posted. 
Down Payments: A down payment has been posted. Select an open invoice (use app Manage Customer Line Items) to apply the posted down payment from step Post Down Payment. The invoice value must be larger than the down payment posted. The incoming payment value in this step is the invoice value less the down payment posted.

</details>

---

### Step 377: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Down Payments: Post Incoming Payments |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Receivable Accountant.

</details>

---

### Step 378: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Down Payments: Post Incoming Payments |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Post Incoming Payments (F1345).

</details>

---

### Step 379: Enter General Information

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 240 |
| **Activity** | Down Payments: Post Incoming Payments |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries in the General Information area and choose OK:
Company Code: 5410
Posting date: <date>
Journal Entry date: <date>
Value date: <today’s date>
Journal Entry Type: DZ

</details>

---

### Step 380: Enter Bank Data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 241 |
| **Activity** | Down Payments: Post Incoming Payments |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries in the Bank data area.
G/L Account: 11001060
House Bank/Account ID: MYBK1/MYAC1
Amount: <customer invoice amount>
Note
If the incoming payment is part of a down payment, enter the remainder invoice balance amount, which is the invoice value less the down payment amount to be applied.

Currency: MYR

</details>

---

### Step 381: Enter Open Item Selection

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 242 |
| **Activity** | Down Payments: Post Incoming Payments |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries:
Customer Account: 54100001
Choose the Propose Items button.

</details>

**Expected Result (Test Verification):**
> The open items are displayed in the bottom half of the view.

---

### Step 382: Clear Items

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 243 |
| **Activity** | Down Payments: Post Incoming Payments |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Items to Clear by choosing the  Clear button in last item column.

</details>

**Expected Result (Test Verification):**
> The selected item is transferred to the Items to be Cleared view.

---

### Step 383: Down Payment

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 244 |
| **Activity** | Down Payments: Post Incoming Payments |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Caution
Only execute this step if the payment is for an invoice where a down payment is to be applied. 

In the Items to Be Cleared column Allocated Amount, enter the remainder invoice balance amount, which is the invoice value less the down payment amount to be applied.
Choose Enter.

</details>

**Expected Result (Test Verification):**
> The balance is zero and the document can be posted.

---

### Step 384: Post Entries

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 245 |
| **Activity** | Down Payments: Post Incoming Payments |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose the Post button.

</details>

**Expected Result (Test Verification):**
> The Activated dialog box displays details of document number generated.

---

### Step 385: Post on Account

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 246 |
| **Activity** | Down Payments: Post Incoming Payments |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Repeat steps 1 to 4.

</details>

---

### Step 386: Enter Data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 247 |
| **Activity** | Down Payments: Post Incoming Payments |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose  Post on account and enter the following:
Account Type: Customer
Customer: 54100001
Credit Amount: same amount as in step 4.

</details>

---

### Step 387: Save

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 248 |
| **Activity** | Down Payments: Post Incoming Payments |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Post.

</details>

**Expected Result (Test Verification):**
> Document is posted.

---


## Activity 50: Down Payments: Clear Open Items Manually

> 9 steps total | 6 classifiable | 3 hidden

### Step 388: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Down Payments: Clear Open Items Manually |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, open items in customer accounts are posted.

#### Prerequisites
- Invoices are posted
  - Down payments are posted
  - Incoming payments are posted

</details>

---

### Step 389: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Down Payments: Clear Open Items Manually |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Receivable Accountant.

</details>

---

### Step 390: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Down Payments: Clear Open Items Manually |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Clear Incoming Payments - Manual Clearing (F0773).

</details>

---

### Step 391: Enter Customer Information

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 249 |
| **Activity** | Down Payments: Clear Open Items Manually |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Clear Open Items button.
Make the following entries and choose OK:
Customer: 54100001
Company Code: 5410

</details>

**Expected Result (Test Verification):**
> A list of open payments still to be cleared is displayed.

---

### Step 392: Select More

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 250 |
| **Activity** | Down Payments: Clear Open Items Manually |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To display open Items and special G/L transactions, choose Select More (…) button, and choose:
Line Item Type: Normal Open Items and special G/L Transactions

</details>

**Expected Result (Test Verification):**
> Normal open Items and special G/L transactions are displayed in Open Items section.

---

### Step 393: Clear Open Item Against Down Payment

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 251 |
| **Activity** | Down Payments: Clear Open Items Manually |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Caution
Only execute this step if you're clearing an open item (invoice) against a down payment. 

In the Open Items section, select the invoice where you applied the incoming payment in the Post Incoming Payment step, then choose the down payment posted in the  Post Down Payment step by choosing the Clear button in the last column of each journal entry. 
Skip the next test step and continue to the Simulate (Optional) step or choose  Post.

</details>

**Expected Result (Test Verification):**
> When the invoice is chosen, the assigned incoming payment is also selected. In the Items to Be Cleared section, the balance of the open item (invoice) displays.
> The down payment is moved to the Items to Be Cleared section. The balance becomes zero. Verify at the top of the view.

---

### Step 394: Open Item Selection

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 252 |
| **Activity** | Down Payments: Clear Open Items Manually |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Note
Skip this test step if you executed the prior step in this table.

In the Open Items section, choose items to clear by clicking the Clear button in the last column.
Note
The sum of the chosen open items to be cleared must be zero, check that the Balance is zero (top right) so the posting can occur.

</details>

**Expected Result (Test Verification):**
> The item to be cleared is transferred to the Items To be Cleared section on the right of the view.

---

### Step 395: Simulate (Optional)

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 253 |
| **Activity** | Down Payments: Clear Open Items Manually |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Before you post, you have the option to simulate the posting.

</details>

**Expected Result (Test Verification):**
> A view showing the posting to be created when the document is posted displays.

---

### Step 396: Post

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 254 |
| **Activity** | Down Payments: Clear Open Items Manually |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose the Post button at the bottom of the view.

</details>

**Expected Result (Test Verification):**
> The system displays Success and also displays the document number, company code, and year created with option buttons to Display or go to the Payment List.

---


## Activity 51: Incoming Payment with Electronic Bank Statement: Daily Cash Operations – Bank Statement

> 1 steps total | 0 classifiable | 1 hidden

### Step 397: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Incoming Payment with Electronic Bank Statement: Daily Cash Operations – Bank Statement |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, bank statements for the bank accounts are loaded daily in Cash Management. During the loading of the bank statement, a rule-based framework attempts to assign the cash flow on the bank statement to an item on one of the clearing accounts or match it with an open invoice in Accounts Receivables.

#### Procedure
Follow the steps in theBank Statementtest procedure of the Basic Cash Operations(BFB) test script.

</details>

---


## Activity 52: Incoming Payment with Electronic Bank Statement: Cash Application Intelligence Integration

> 1 steps total | 0 classifiable | 1 hidden

### Step 398: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Incoming Payment with Electronic Bank Statement: Cash Application Intelligence Integration |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
Typically, the rule-based assignment of incoming payments can't match all incoming payment to open Accounts Receivables invoices. With the help of machine learning, you can improve the matching rate.

#### Procedure
If the interface to Cash Application Intelligence is activated, follow the procedures described in the Cash Application Integration(1MV) test script.

</details>

---


## Activity 53: Incoming Payment with Electronic Bank Statement: Reprocess Bank Statement Items

> 16 steps total | 13 classifiable | 3 hidden

### Step 399: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Incoming Payment with Electronic Bank Statement: Reprocess Bank Statement Items |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
The bank credits the collection, the direct debit, the deposited checks, and a bank transfer from a customer to your account. The primary purpose of this activity is to address bank statement items that aren't automatically cleared. Posting of the bank statement in these cases clears the open items for the bank account.

#### Prerequisites
A bank statement was previously uploaded or entered manually. For more information, see the Basic Cash Operations(BFB) test script.
Note
(Optional): The Cash Application Integration(1MV) scope item is activated (an additional license is required). 1MV acts with machine learning in the system. When the optional Cash Application Integration(1MV) scope item is activated, more choices are available when completing the Apply Rulesstep. You're allowed to select multiple rules from the Apply Ruleslist. Without 1MV, you're allowed only one rule selection, at a time, to apply. If you use 1MV, manual posting actions are sent to the Cash Application Integration(1MV) scope item so that it can learn and determine proposals for the new reprocessing rule template.

</details>

---

### Step 400: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Incoming Payment with Electronic Bank Statement: Reprocess Bank Statement Items |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Cash Management Specialist.

</details>

---

### Step 401: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Incoming Payment with Electronic Bank Statement: Reprocess Bank Statement Items |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Reprocess Bank Statement Items (F1520).

</details>

**Expected Result (Test Verification):**
> The Reprocess Bank Statement Items (F1520) view is displayed.

---

### Step 402: Search

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 255 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Reprocess Bank Statement Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Go:
Company Code: 5410
House Bank: MYBK1
House Bank Account: MYAC1
Posting Status: Select Posting not Started and Not completed

</details>

**Expected Result (Test Verification):**
> A list of Bank Statement Items displays. The Processing Status column displays the current processing status.Note
> You have two options:  - Reprocess a single bank statement item
> 
>   - Reprocess multiple bank statement items
> 
> Choose the appropriate option from the two options presented below.

---

### Step 403: Option 1

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 256 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Reprocess Bank Statement Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Option 1: Reprocess a single bank statement item

</details>

---

### Step 404: Select Bank Statement Item

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 257 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Reprocess Bank Statement Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To select a bank statement to reprocess, in the Reprocess column, choose Details (>).

</details>

**Expected Result (Test Verification):**
> A Bank Statement details view is displayed.

---

### Step 405: Details

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 258 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Reprocess Bank Statement Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Details area, verify or enter the following data:
Account type: <Customer or G/L account>
Posting Date: <Today's date>
Payment Amount: <Amount of invoice to clear>
Journal Entry Type: for example, DZNote
If necessary, you can adapt the Memo Line field value. Doing so changes the Memo Line Version field value to Revised. You can also change the Procg. Instruction field value to determine how to handle the Memo Line field value. If you want to restore the original value of the Memo Line field, you can choose the Undo button near the Memo Line Version field.

</details>

**Expected Result (Test Verification):**
> Depending on the statement item that you're processing, you must choose a customer or a vendor to be able to balance the clearing document.
> A list of invoices displays at the bottom half of the view in the Open Items section.
> Note
> If necessary, you can also create a dispute case, for example, if a customer short pays an invoice.

---

### Step 406: Clear

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 259 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Reprocess Bank Statement Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Open Items pane, select the invoice to clear that matches the amount from the Details section. In the Clear column, choose the Clear button. Note
Additional functions are available above the Open Items pane, such as Post on Account, G/L Items, Post to G/L Account, and so on.

</details>

**Expected Result (Test Verification):**
> The invoice is transferred to the Items to be Cleared section. The balance amount on the header must be zero for the item to be cleared.Note
> You can also post on supplier/customer accounts or to G/L accounts. To do so, choose the Post on Account tab or Post to G/L Account tab, enter the account information and amount, then choose Post.

---

### Step 407: Post

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 260 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Reprocess Bank Statement Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose the Post button.

</details>

**Expected Result (Test Verification):**
> The success view displays the journal entry number posted. 
> The document created can be displayed too.

---

### Step 408: Option 2

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 261 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Reprocess Bank Statement Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Option 2: Reprocess multiple bank state items

</details>

---

### Step 409: Settings

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 262 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Reprocess Bank Statement Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Bank Statement Items table, verify that the Bank Statement Items Memo Line column is visible. If not visible, choose the Settings button and add the column by choosing the checkbox and then choose OK.

</details>

---

### Step 410: Select Bank Statement Items

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 263 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Reprocess Bank Statement Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select one or more bank statement items.
Either:
If you're reprocessing multiple company codes or bank accounts, you can filter the items list by choosing the column and selecting Filter from the dropdown list. Enter your filter criteria in the Define Filters dialog box and choose OK.
 If you canceled the previous step and created a rule, choose the Apply Rule button.
Choose the rule from the dialog box and choose Filter by Rule. The item list filters by the selected rule.
Note
You can only select a single rule for filtering, multiple rule selections aren't possible.
Caution
If the rule condition does not match a selected item, the rule isn't applied and the item isn't processed.

Or:
If you're reprocessing items using a single company code and bank account, select the checkboxes for items from the list or make no selection to apply a rule to all items in the list.
Choose Apply Rule. 
Remember
Once you select Apply Rule, it automatically selects whether the rule is applied to all bank statement items or only applied to your selected items. Ensure that you select the bank statement items before choosing Apply Rule. 
Note
If you canceled the previous step and created a rule, choose the Apply Rule button. Choose the rule from the dialog box and choose Filter by Rule. The item list filters by the selected rule. If the rule condition doesn't match a selected item, the rule isn't applied, and the item isn't processed.
Caution
If the rule isn't available and must be created, choose Cancel and proceed to the next step.

</details>

**Expected Result (Test Verification):**
> The Apply Rule dialog box displays.

---

### Step 411: (Optional) Manage Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 264 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Reprocess Bank Statement Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Manage Rules tab.
A Manage Bank Statement Reprocessing Rules view is displayed.
 To create a rule, proceed to the next Manage Bank Statement Processing Rules (Optional) procedure and follow the instructions to create a rule.
 When completed, choose Back to return to the Reprocess Bank Statement Items view. Select one or more bank statement items or make no selection to apply the rule to all items and then choose Apply Rule to continue with these steps.

</details>

---

### Step 412: Apply Rule

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 265 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Reprocess Bank Statement Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Either enter the rule name in the Search field or select rules from the list and choose Apply Rule. Note
If you activated the Cash Application Integration (1MV) scope item, more options are available. When you've activated 1MV, you can select multiple rules from the Apply Rules dialog box to apply. Without 1MV, you only select one rule at a time to apply and repeat this step to add more rules.
Choose OK for the Success dialog box with a notification about the rule being scheduled that displays.

</details>

**Expected Result (Test Verification):**
> The Process Status for the bank statement items selected display an Info: This Item is being processed as a scheduled job icon.

---

### Step 413: Open the Reprocessing Screen

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 266 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Reprocess Bank Statement Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select a bank statement item and from the Reprocess column, choose the > (Open the Reprocessing Screen) button.

</details>

**Expected Result (Test Verification):**
> A Bank Statement details view is displayed.

---

### Step 414: Review (Optional)

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 267 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Reprocess Bank Statement Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To review, choose the Applied Rules Log and choose the Status Information. Navigate to the Job Log icon for your job to review the log details.

</details>

---


## Activity 54: Incoming Payment with Electronic Bank Statement: Manage Bank Statement Processing Rules (Optional)

> 11 steps total | 8 classifiable | 3 hidden

### Step 415: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Incoming Payment with Electronic Bank Statement: Manage Bank Statement Processing Rules (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this optional activity, you create a bank processing rule. 
Note
Rules can be shared. By default, the sharing is turned off. To share a rule, go into an existing rule and set the Share Ruleslider to Yes. Shared rules are visible on the Shared Rulestab on the Manage Processing Rules(F3555)view.
Note
You can automate rules. For more information, see Advanced Bank Statement Automation(4X8).
For more information on creating and using processing rules, see Manage Processing Rules - For Bank Statementson SAP Help Portal.
Rules can also be automatically applied. To do so, choose Automate Rule, make the necessary selections in the resulting dialog box, and set the Activate Rule for Automationslider to Yes. Automated rules are visible on the Automated Rulestab on the Manage Processing Rules(F3555)view.

</details>

---

### Step 416: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Incoming Payment with Electronic Bank Statement: Manage Bank Statement Processing Rules (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Cash Management Specialist.
Note
This procedure can also be performed by users with the Accounts Receivable Accountant role.

</details>

---

### Step 417: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Incoming Payment with Electronic Bank Statement: Manage Bank Statement Processing Rules (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Manage Processing Rules - For Bank Statements (F3555).

</details>

**Expected Result (Test Verification):**
> The Manage Processing Rules (F3555) view is displayed.

---

### Step 418: Create Rule

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 268 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Manage Bank Statement Processing Rules (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

To add a new rule, choose Create.

</details>

**Expected Result (Test Verification):**
> The Processing Rule view displays.

---

### Step 419: Add Rule Criteria

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 269 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Manage Bank Statement Processing Rules (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter the following data:
Description: <any description of the rule>
Rule For: Select either Outgoing Payment or Incoming Payment

</details>

---

### Step 420: Add Action Type

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 270 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Manage Bank Statement Processing Rules (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select an Action Type for the available list to fit your requirements:
G/L Posting
AP/AR Posting
Clear in Sequence
Caution
 When you select a different action type, an If you change the action type when creating or modifying a processing rule, the data entered previously in the action will be lost when you save your change to this action type warning notification displays. Choose OK to confirm. 
Each action type selection displays a different set of fields.Note
After the next step for defining the Condition, the following steps provide information for each Action Type option.

</details>

---

### Step 421: Add Condition Criteria

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 271 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Manage Bank Statement Processing Rules (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Condition area, enter the following data:
Tip
Predefined conditions and value ranges are provided in dropdowns. Here are two examples. First example, select Company Code for the Attribute, the Options are notations of values, select EQ for equals. The From and To fields are a value range and since Company Code equals, add 5410 in the From field. Second example, select Amount for the Attribute, and Select less than or equal to, in Option, and then add the least amount in From and the equals value in To . 
Attribute: <attribute>
Option: <option>
From: <value>
To: <value>Note
For the fields above, define conditions as needed for your particular use case (for example, Memo Line, House Bank, and so on).

In the Conditions pane, choose Create to add another condition.

</details>

---

### Step 422: Action Type: G/L Posting

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 272 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Manage Bank Statement Processing Rules (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
If you selected the G/L Posting for action type, follow this step. Skip this step if you selected a different Action Type.
In the Post to G/L Account, enter the following:Note
You only enter either a Profit Center or a Cost Center, not both, depending on the type of posting. If the G/L account is a cost element, then cost center is required. If the G/L account is a balance sheet item, then profit center is required.

Account: <G/L account>
Profit Center: For example, Optional
Cost Center: For example, <cost center>
Proceed to step 10.

</details>

---

### Step 423: Action Type: AP/AR Posting

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 273 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Manage Bank Statement Processing Rules (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
If you selected the AP/AR Posting for action type, follow this step. Skip this step if you selected a different Action Type.
In the Post to AP/AR Account, enter the following:Note
You only enter either a Customer or a Supplier, not both, depending on the type of posting.

Customer: <customer>
Supplier: <supplier>
Assignment Reference: Optional
Document Item Text: Optional
Proceed to step 10.

</details>

---

### Step 424: Action Type: Clear as Sequence

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 274 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Manage Bank Statement Processing Rules (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
If you selected the Clear in Sequence for action type, follow this step. Skip this step if you selected a different Action Type.
In the Clear in Sequence section, enter the following and choose Create:
Processing Instruction: <processing instruction>
Reason Code: <reason code>

</details>

**Expected Result (Test Verification):**
> You created the processing instruction.

---

### Step 425: Save

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 275 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Manage Bank Statement Processing Rules (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Create.

</details>

**Expected Result (Test Verification):**
> The new rule is saved.

---


## Activity 55: Incoming Payment with Electronic Bank Statement: Obtain Payment Advices Manually (Optional)

> 1 steps total | 0 classifiable | 1 hidden

### Step 426: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Incoming Payment with Electronic Bank Statement: Obtain Payment Advices Manually (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you obtain payment advice with information about invoices paid, discounts taken, and the total payment amount that is received by mail, fax, or email from the customers.

#### Procedure
This activity happens outside of the system and is used by the Accounts Receivable Accountantto get information about invoices paid with payments found on the bank statement. This information can also be used in the next procedure in this section, Clear Open Items Manually.

</details>

---


## Activity 56: Incoming Payment with Electronic Bank Statement: Manage Payment Advice

> 28 steps total | 23 classifiable | 5 hidden

### Step 427: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Incoming Payment with Electronic Bank Statement: Manage Payment Advice |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you can create, display, change, and delete payment advice. The advice explains the usage of the payment and is used for clearing. 
A payment advice note contains the incoming payment details required to allocate and clear the relevant open item. Note
To add a payment advice, you can either use an existing payment advice file or create the advice manually.

#### Prerequisites
A business partner exists.
An open incoming payment document exists (document posted on account).
An OPTIONAL prerequisite is completing the Manage Situation Typesprocedure in the Preliminary Stepssection of the Prerequisites, allowing you to complete the (Optional) Monitor Notificationsteps at the end of this procedure.

</details>

---

### Step 428: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Incoming Payment with Electronic Bank Statement: Manage Payment Advice |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Receivable Accountant.

</details>

---

### Step 429: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Incoming Payment with Electronic Bank Statement: Manage Payment Advice |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Payment Advices - Old Version (F2550).

</details>

---

### Step 430: Choice - Import Payment Advice File

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 276 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Manage Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Either follow this step when you have an existing payment advice file or skip to the Add Manually step when no payment advice file is available.Note
If you don't have a payment advice file, skip to the Choice - Manually Create Payment Advice step.
Caution
The Import option is only available if you've licensed and activated Cash Application Integration (1MV). If you haven't, skip to the Choice - Manually Create Payment Advice step.

</details>

---

### Step 431: Choose Import

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 277 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Manage Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
When you have an existing payment advice file, choose the Import button.

</details>

**Expected Result (Test Verification):**
> The Import Payment Advices dialog box displays.

---

### Step 432: Import Existing File

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 278 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Manage Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter the Company Code value.
Either drag and drop the file on to the dialog box or choose Create to navigate to the local folder and select the file.
Choose Process.

</details>

**Expected Result (Test Verification):**
> The file is uploaded and appears in the table under the Confirmation Pending tab of the Manage Payment Advices view.

---

### Step 433: Select Payment Advices

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 279 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Manage Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Select your new Payment Advices from the table.

</details>

**Expected Result (Test Verification):**
> A Payment Advice Draft view appears.

---

### Step 434: Review and Confirm

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 280 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Manage Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the Payment Advice Items tab and review the list of invoices that display. When your review is complete, choose the Confirm and Next button.

To continue, skip to step 15.

</details>

---

### Step 435: Choice - Manually Create Payment Advice

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 281 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Manage Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
When no payment advice file is available, use the following steps.

</details>

---

### Step 436: Add Manually

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 282 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Manage Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Add Manually (+) to create the manual payment advice.

</details>

**Expected Result (Test Verification):**
> The Payment Advice view displays.

---

### Step 437: General Information

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 283 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Manage Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the General Information section, enter the following data:
Company Code: 5410
Payment Amount: 500
Currency: MYR
Customer: 54100001

</details>

---

### Step 438: Payment Advice Items

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 284 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Manage Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Payment Advice Items section, new lines are added automatically once a field in the existing line is filled in.

</details>

---

### Step 439: More Fields

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 285 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Manage Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select Setting, activate the following fields by selecting the checkbox:   - Alternative Account
  - Alternative Company Code
  - Assignment

Choose OK to continue.

</details>

**Expected Result (Test Verification):**
> Fields are displayed.

---

### Step 440: Payment Advice Items

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 286 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Manage Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Payment Advice Items section, enter the following data:
Document: Incoming payment document number
Document Date: <Date when the document was posted>.
Payment Amount: <Total payment amount>
Alternative Account: <customer number> 
Alternative Company Code: 5410
Assignment number: <document number> 
If there are more documents, select  Add (+) and enter required data.

</details>

---

### Step 441: Save

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 287 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Manage Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Save.

</details>

---

### Step 442: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Incoming Payment with Electronic Bank Statement: Manage Payment Advice |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

15Change Payment Advice

</details>

---

### Step 443: Enter Search Criteria

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 288 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Manage Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter search criteria:
Editing Status: All
Company Code: 5410

</details>

---

### Step 444: Execute Query

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 289 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Manage Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose the Go button.

</details>

**Expected Result (Test Verification):**
> A table shows the information of all payment advices.

---

### Step 445: Select

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 290 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Manage Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Select the payment advice number to open it.

</details>

**Expected Result (Test Verification):**
> Payment advice details are displayed.

---

### Step 446: Edit

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 291 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Manage Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose  Edit button and make any changes that are required.

</details>

---

### Step 447: Save

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 292 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Manage Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Save.

</details>

---

### Step 448: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Incoming Payment with Electronic Bank Statement: Manage Payment Advice |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

21Delete Payment Advice

</details>

---

### Step 449: Search

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 293 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Manage Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Repeat steps 15-18.
In the Manage Payment Advices view, select the payment advice to be deleted.

</details>

---

### Step 450: Delete

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 294 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Manage Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Delete.

</details>

**Expected Result (Test Verification):**
> A notification displays, asking to confirm deletion.

---

### Step 451: Confirm

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 295 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Manage Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Delete.

</details>

**Expected Result (Test Verification):**
> Payment advice is deleted.

---

### Step 452: (Optional) Monitor Notification

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 296 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Manage Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
When the Manage Situation Types procedure in the Preliminary Steps section of the Prerequisites has been completed, the following steps are available to you.

</details>

---

### Step 453: Open Notifications

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 297 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Manage Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Notifications button at the top right of the view.
Choose the payment advice notification generated by the system.

</details>

---

### Step 454: Review Notification

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 298 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Manage Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
The payment advices details for the notification display.Choose Back.

</details>

---


## Activity 57: Incoming Payment with Electronic Bank Statement: Clear Open Items Manually

> 9 steps total | 6 classifiable | 3 hidden

### Step 455: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Incoming Payment with Electronic Bank Statement: Clear Open Items Manually |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, open items in customer accounts are posted.

#### Prerequisites
- Invoices are posted
  - Down payments are posted
  - Incoming payments are posted

</details>

---

### Step 456: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Incoming Payment with Electronic Bank Statement: Clear Open Items Manually |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Receivable Accountant.

</details>

---

### Step 457: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Incoming Payment with Electronic Bank Statement: Clear Open Items Manually |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Clear Incoming Payments - Manual Clearing (F0773).

</details>

---

### Step 458: Enter Customer Information

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 299 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Clear Open Items Manually |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Clear Open Items button.
Make the following entries and choose OK:
Customer: 54100001
Company Code: 5410

</details>

**Expected Result (Test Verification):**
> A list of open payments still to be cleared is displayed.

---

### Step 459: Select More

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 300 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Clear Open Items Manually |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To display open Items and special G/L transactions, choose Select More (…) button, and choose:
Line Item Type: Normal Open Items and special G/L Transactions

</details>

**Expected Result (Test Verification):**
> Normal open Items and special G/L transactions are displayed in Open Items section.

---

### Step 460: Clear Open Item Against Down Payment

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 301 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Clear Open Items Manually |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Caution
Only execute this step if you're clearing an open item (invoice) against a down payment. 

In the Open Items section, select the invoice where you applied the incoming payment in the Post Incoming Payment step, then choose the down payment posted in the  Post Down Payment step by choosing the Clear button in the last column of each journal entry. 
Skip the next test step and continue to the Simulate (Optional) step or choose  Post.

</details>

**Expected Result (Test Verification):**
> When the invoice is chosen, the assigned incoming payment is also selected. In the Items to Be Cleared section, the balance of the open item (invoice) displays.
> The down payment is moved to the Items to Be Cleared section. The balance becomes zero. Verify at the top of the view.

---

### Step 461: Open Item Selection

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 302 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Clear Open Items Manually |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Note
Skip this test step if you executed the prior step in this table.

In the Open Items section, choose items to clear by clicking the Clear button in the last column.
Note
The sum of the chosen open items to be cleared must be zero, check that the Balance is zero (top right) so the posting can occur.

</details>

**Expected Result (Test Verification):**
> The item to be cleared is transferred to the Items To be Cleared section on the right of the view.

---

### Step 462: Simulate (Optional)

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 303 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Clear Open Items Manually |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Before you post, you have the option to simulate the posting.

</details>

**Expected Result (Test Verification):**
> A view showing the posting to be created when the document is posted displays.

---

### Step 463: Post

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 304 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Clear Open Items Manually |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose the Post button at the bottom of the view.

</details>

**Expected Result (Test Verification):**
> The system displays Success and also displays the document number, company code, and year created with option buttons to Display or go to the Payment List.

---


## Activity 58: Incoming Payment with Electronic Bank Statement: Clear Credit/Debit Memos Manually

> 7 steps total | 4 classifiable | 3 hidden

### Step 464: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Incoming Payment with Electronic Bank Statement: Clear Credit/Debit Memos Manually |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you post debit memos and credit memos to customer accounts. Also, this process can be used to clear debit and credit memos created in the Invoice Correction Process with Debit Memo(BDQ) and Invoice Correction Process with Credit Memo(BKL) test scripts.
Caution
Invoice Correction Process with Debit Memo(BDQ) and Invoice Correction Process with Credit Memo(BKL) aren't valid for Finance Cloud Edition. Skip these steps if using Finance Cloud Edition.

#### Prerequisites
You must have open items. 
You executed the Invoice Correction Process with Debit Memo(BDQ) and Invoice Correction Process with Credit Memo(BKL) test scripts. Postings are created using customer 54100001.

</details>

---

### Step 465: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Incoming Payment with Electronic Bank Statement: Clear Credit/Debit Memos Manually |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Receivable Accountant.

</details>

---

### Step 466: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Incoming Payment with Electronic Bank Statement: Clear Credit/Debit Memos Manually |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Clear Incoming Payments - Manual Clearing (F0773).

</details>

---

### Step 467: Enter Customer Information

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 305 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Clear Credit/Debit Memos Manually |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Clear Open Items button.
Make the following entries and choose OK:
Customer: 54100001
Company Code : 5410

</details>

**Expected Result (Test Verification):**
> A list of open payments still to be cleared displays.

---

### Step 468: Open Item Selection

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 306 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Clear Credit/Debit Memos Manually |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Open Items section, select the items to clear and choose the Clear button from the Clear column.
Note
The sum of the chosen open items to be cleared must be zero. Check if the Balance is zero (top right), so the posting can occur.

</details>

**Expected Result (Test Verification):**
> The item to be cleared is transferred to Items To be Cleared section on the right side of screen.

---

### Step 469: Simulate (Optional)

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 307 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Clear Credit/Debit Memos Manually |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Before you post, you have the option to simulate the posting by choosing the Simulate button.

</details>

**Expected Result (Test Verification):**
> A view displays a simulated posting to be created when the document is posted.

---

### Step 470: Post

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 308 |
| **Activity** | Incoming Payment with Electronic Bank Statement: Clear Credit/Debit Memos Manually |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Post button at the bottom of the screen.

</details>

**Expected Result (Test Verification):**
> The system displays a Success notification. Showing the document number, company code, and year created. Option buttons to Display or go to the Payment List are available.

---


## Activity 59: Incoming Payment without Electronic Bank Statement: Post Incoming Payments

> 12 steps total | 9 classifiable | 3 hidden

### Step 471: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Incoming Payment without Electronic Bank Statement: Post Incoming Payments |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you post the incoming payments from the customer. For a payment of an invoice where a down payment is applied, the incoming payment amount should be the remainder invoice balance (the remainder invoice balance is the invoice value less the down payment to be applied).

#### Prerequisites
Invoices are posted. 
Down Payments: A down payment is posted. Select an open invoice (use the Manage Customer Line Items(F0711)app) to apply the down payment posted from the previous Post Down Paymentprocedure. The invoice value must be larger than the down payment posted. The incoming payment value in this activity is the invoice value, less the down payment posted.

</details>

---

### Step 472: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Incoming Payment without Electronic Bank Statement: Post Incoming Payments |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Receivable Accountant.

</details>

---

### Step 473: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Incoming Payment without Electronic Bank Statement: Post Incoming Payments |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Post Incoming Payments (F1345)

</details>

**Expected Result (Test Verification):**
> The Post Incoming Payments view displays.

---

### Step 474: Enter General Information

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 309 |
| **Activity** | Incoming Payment without Electronic Bank Statement: Post Incoming Payments |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries in the General Information area:
Company Code: 5410
Posting date: date
Journal Entry date: date
Value date: today’s date
Journal Entry Type: DZ (Customer Payment)

</details>

---

### Step 475: Enter Bank Data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 310 |
| **Activity** | Incoming Payment without Electronic Bank Statement: Post Incoming Payments |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries in the Bank data area.
House Bank/Account ID: MYBK1/MYAC1
G/L Account: <account (not a bank subaccount)> (see note)
Note
To determine the account value, log in as a Cash Management Specialist and open Manage Bank Accounts (F1366A). Enter your Company Code, House Bank, and House Bank Account and choose Go. Choose Details for the row. Choose House Bank Account Connectivity, then in the House Bank Account Data section, make a note of the value in the G/L Account field. Use this value for the G/L Account field above.

Amount: customer invoice amount
Note
If the incoming payment is part of a down payment, enter the remainder invoice balance amount, which is the invoice value less the down payment amount to be applied.

Currency: MYR

</details>

---

### Step 476: Enter Open Items

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 311 |
| **Activity** | Incoming Payment without Electronic Bank Statement: Post Incoming Payments |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries:
Customer Account: 54100001
Choose the Propose Items button.

</details>

**Expected Result (Test Verification):**
> The open items are displayed in the bottom half of the view.

---

### Step 477: Clear Items

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 312 |
| **Activity** | Incoming Payment without Electronic Bank Statement: Post Incoming Payments |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Items to Clear by choosing the  Clear button in last item column.

</details>

**Expected Result (Test Verification):**
> The selected item is transferred to view Items to be Cleared.

---

### Step 478: Down Payment

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 313 |
| **Activity** | Incoming Payment without Electronic Bank Statement: Post Incoming Payments |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Note
Only execute this step if the payment is for an invoice where a down payment is applied. 

In the Items to Be Cleared column, Allocated Amount, enter the remainder invoice balance amount, which is the invoice value less the down payment amount to be applied.
Choose Enter.

</details>

**Expected Result (Test Verification):**
> The balance is zero and the document can be posted.

---

### Step 479: Post Entries

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 314 |
| **Activity** | Incoming Payment without Electronic Bank Statement: Post Incoming Payments |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Post.

</details>

**Expected Result (Test Verification):**
> The Activated dialog box displays details of document number generated.

---

### Step 480: Post on Account

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 315 |
| **Activity** | Incoming Payment without Electronic Bank Statement: Post Incoming Payments |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Repeat steps 1–4.

</details>

---

### Step 481: Enter Data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 316 |
| **Activity** | Incoming Payment without Electronic Bank Statement: Post Incoming Payments |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose  Post on account and enter the following:
Account Type: Customer
Customer: 54100001
Credit Amount: same amount as in step 4.

</details>

---

### Step 482: Save

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 317 |
| **Activity** | Incoming Payment without Electronic Bank Statement: Post Incoming Payments |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Post.

</details>

**Expected Result (Test Verification):**
> Document is posted.

---


## Activity 60: Incorrect Posting: Reset Cleared Items

> 7 steps total | 4 classifiable | 3 hidden

### Step 483: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Incorrect Posting: Reset Cleared Items |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

### Purpose
In this activity, you reset a cleared document.

### Procedure

</details>

---

### Step 484: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Incorrect Posting: Reset Cleared Items |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Receivable Accountant.

</details>

---

### Step 485: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Incorrect Posting: Reset Cleared Items |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Reset Cleared Items (F2223).

</details>

---

### Step 486: Search

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 318 |
| **Activity** | Incorrect Posting: Reset Cleared Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Go: 
Company Code: 5410
Clearing Fisc. Year: <Current year>

</details>

**Expected Result (Test Verification):**
> A filtered list is displayed.

---

### Step 487: Execute

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 319 |
| **Activity** | Incorrect Posting: Reset Cleared Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
From the Clearing Entry list, choose the arrow icon > at the right of the row to reset.

</details>

**Expected Result (Test Verification):**
> The Clearing Entry view displays.

---

### Step 488: Reset

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 320 |
| **Activity** | Incorrect Posting: Reset Cleared Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose the Reset button.

</details>

**Expected Result (Test Verification):**
> A Success dialog box displays with a Clearing XXXXXXX reset notification.

---

### Step 489: Save

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 321 |
| **Activity** | Incorrect Posting: Reset Cleared Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

---


## Activity 61: Incorrect Posting: Reset and Reverse Cleared Items

> 8 steps total | 5 classifiable | 3 hidden

### Step 490: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Incorrect Posting: Reset and Reverse Cleared Items |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you reset and reverse a document that should not have been cleared.

#### Prerequisites
Invoices and payments are posted.

</details>

---

### Step 491: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Incorrect Posting: Reset and Reverse Cleared Items |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Receivable Accountant.

</details>

---

### Step 492: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Incorrect Posting: Reset and Reverse Cleared Items |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Reset Cleared Items (F2223).

</details>

---

### Step 493: Search

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 322 |
| **Activity** | Incorrect Posting: Reset and Reverse Cleared Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Go:
Company Code : 5410
Clearing Fisc. Year: <Current year>

</details>

**Expected Result (Test Verification):**
> The Clearing Entries list shows the filtered criteria.

---

### Step 494: Open Clearing Entry

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 323 |
| **Activity** | Incorrect Posting: Reset and Reverse Cleared Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the row of the clearing entry document and choose the > button at the right of the row.

</details>

**Expected Result (Test Verification):**
> The Clearing Entry view displays.

---

### Step 495: Process

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 324 |
| **Activity** | Incorrect Posting: Reset and Reverse Cleared Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Reset and Reverse.

</details>

**Expected Result (Test Verification):**
> The Reverse Journal Entry dialog box is displayed.

---

### Step 496: Enter Reversal Data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 325 |
| **Activity** | Incorrect Posting: Reset and Reverse Cleared Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose OK: 
Reversal Reason: For example, Wrong posting
Posting date : <Today’s date>

</details>

**Expected Result (Test Verification):**
> The Success dialog box displays the message Document XXXXXX was posted in company code XXXX.

---

### Step 497: Continue

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 326 |
| **Activity** | Incorrect Posting: Reset and Reverse Cleared Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

---


## Activity 62: Incorrect Posting: Reverse Individual Documents

> 6 steps total | 3 classifiable | 3 hidden

### Step 498: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Incorrect Posting: Reverse Individual Documents |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This transaction is used in General Ledger Accounting, in the area of Accounts Payables, and Accounts Receivables. It is used to display, edit, and reverse a document created in the financial modules. 
Note
Starting with the SAP S/4HANA Cloud 2208 release, if you are a new customer and want to enable advanced eDocument features such as eDocument Submit, Cancel and Reject, you must first activate the Document and Reporting Compliance features for your country/region. Otherwise, only Display mode is available. For more information, refer to Activate Document and Reporting Compliance Featuresin the Preliminary Stepssection of the test script for scope item Document and Reporting Compliance(5XU).

</details>

---

### Step 499: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Incorrect Posting: Reverse Individual Documents |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a General Ledger Accountant.

</details>

---

### Step 500: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Incorrect Posting: Reverse Individual Documents |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Journal Entries (F0717A).

</details>

---

### Step 501: Search Document

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 327 |
| **Activity** | Incorrect Posting: Reverse Individual Documents |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Go: 
Company Code: <Any>
Journal Entry Type: <Any>
Period:<period>
Fiscal Year:<year of the posted document>
Posting Date:<posting date>

</details>

**Expected Result (Test Verification):**
> The system displays a list of document numbers.

---

### Step 502: Select Document

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 328 |
| **Activity** | Incorrect Posting: Reverse Individual Documents |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the Journal Entry to reverse and choose Reverse.

</details>

**Expected Result (Test Verification):**
> The Reverse Journal Entries view displays.

---

### Step 503: Enter Data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 329 |
| **Activity** | Incorrect Posting: Reverse Individual Documents |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose OK:
Reversal Reason:<Any>
Posting Date:<today’s date>
Tax Reporting Date:<today’s date>
Period:optional
Note
Use if reversing a check payment. 

Check Void Reason: Use if reversing a check payment

</details>

**Expected Result (Test Verification):**
> The Document is reversed by xxxxxx notification displays.

---


## Activity 63: Invoice Collection Preparation: Manage Customer Line Items

> 12 steps total | 9 classifiable | 3 hidden

### Step 504: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Collection Preparation: Manage Customer Line Items |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you display and change line items in a customer account.

#### Prerequisites
Invoices are available in the system.

</details>

---

### Step 505: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Collection Preparation: Manage Customer Line Items |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Receivable Accountant.

</details>

---

### Step 506: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Collection Preparation: Manage Customer Line Items |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Customer Line Items (F0711).

</details>

---

### Step 507: Enter Search Criteria

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 330 |
| **Activity** | Invoice Collection Preparation: Manage Customer Line Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Go: 
Customer: 54100001
Company Code: 5410

</details>

---

### Step 508: (Optional) Add Columns

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 331 |
| **Activity** | Invoice Collection Preparation: Manage Customer Line Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
As an option, choose the Gear (Settings) button to add columns to the Items table when the Administrator has added new fields. Note
If you add columns to the table, you can save the view as a variant. For more information, see the Add Fields to Items (Optional) preliminary step. Additionally, you can use the additional fields as filters in Adapt Filters.

</details>

---

### Step 509: Status

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 332 |
| **Activity** | Invoice Collection Preparation: Manage Customer Line Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the Status in the filters and choose Go.
If you choose All Items, the system displays all the account items.
You can also choose to display only Open Items or Cleared Items.

</details>

**Expected Result (Test Verification):**
> The Items table displays the results of your criteria.

---

### Step 510: Date and Item Type

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 333 |
| **Activity** | Invoice Collection Preparation: Manage Customer Line Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries in the filters area:
Clearing Date: <Today’s date>
Note
The Clearing Date field is only visible if you chose the Cleared Items status in the prior step. If you chose another status, the field is not available and you can ignore entry for it.

Item Type: Normal Items

</details>

---

### Step 511: Execute Search

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 334 |
| **Activity** | Invoice Collection Preparation: Manage Customer Line Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose the Go button.

</details>

**Expected Result (Test Verification):**
> The customer line items display according to your search criteria.

---

### Step 512: Change Document

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 335 |
| **Activity** | Invoice Collection Preparation: Manage Customer Line Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select a line item by choosing the checkbox of first column.

</details>

---

### Step 513: Change Document

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 336 |
| **Activity** | Invoice Collection Preparation: Manage Customer Line Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Edit Line Items.

</details>

**Expected Result (Test Verification):**
> The Edit Line Items dialog box displays.

---

### Step 514: Make Changes

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 337 |
| **Activity** | Invoice Collection Preparation: Manage Customer Line Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make required changes or additions to the line item from these available sections:
Payment data
Dunning Data
Additional data

</details>

---

### Step 515: Confirm Change

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 338 |
| **Activity** | Invoice Collection Preparation: Manage Customer Line Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose the OK button.

</details>

**Expected Result (Test Verification):**
> The system displays the message Items Changed.

---


## Activity 64: Interest Calculation: Schedule Interest Calculation Jobs

> 10 steps total | 7 classifiable | 3 hidden

### Step 516: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Interest Calculation: Schedule Interest Calculation Jobs |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you schedule the interest calculation jobs.

#### Prerequisites
Open receivables exist in the system that satisfy the interest calculation requirements. The interest indicator must be assigned to the business partner and is explained in the Maintain Business Partnersstep.

</details>

---

### Step 517: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Interest Calculation: Schedule Interest Calculation Jobs |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Receivable Accountant.

</details>

---

### Step 518: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Interest Calculation: Schedule Interest Calculation Jobs |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Schedule Interest Calculation Jobs (F4176).

</details>

**Expected Result (Test Verification):**
> The Application Jobs view displays.

---

### Step 519: Create Job

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 339 |
| **Activity** | Interest Calculation: Schedule Interest Calculation Jobs |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Create.

</details>

**Expected Result (Test Verification):**
> The New Job view displays.

---

### Step 520: Template Selection

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 340 |
| **Activity** | Interest Calculation: Schedule Interest Calculation Jobs |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Step 2: Job Template: Calculate Item Interest for Accounts Receivable
Job Name: Calculate Item Interest for Accounts Receivable

</details>

---

### Step 521: Scheduling Options

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 341 |
| **Activity** | Interest Calculation: Schedule Interest Calculation Jobs |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Step 3: Start Immediately: Selected

</details>

---

### Step 522: Parameters

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 342 |
| **Activity** | Interest Calculation: Schedule Interest Calculation Jobs |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Schedule: 
Customer Account: 54100001
Company Code: 5410
Interest Indicator: for example, 01
Interest Calculation To: <for example, last day of current month>
Test Run: Selected if you want to do a test run; Deselected if you want to do an actual run

</details>

**Expected Result (Test Verification):**
> The Application Jobs view is displayed.

---

### Step 523: View Report

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 343 |
| **Activity** | Interest Calculation: Schedule Interest Calculation Jobs |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To refresh the review, choose the Go button. When the report status is Finished, choose the document button in the Results column for the job you scheduled.Note
You can also choose the Log button in the scheduled job row. When you do so, the job log is displayed, showing the output items. You can click on the output item link to display additional details.

</details>

**Expected Result (Test Verification):**
> The Document (ID xxxxxxx) view is displayed. The report shows the status of the journal entry document, and shows information such as the journal entry number, the amounts, and the interest.

---

### Step 524: View Report

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 344 |
| **Activity** | Interest Calculation: Schedule Interest Calculation Jobs |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Review the document, then choose Back.

</details>

---

### Step 525: Run Actual Report

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 345 |
| **Activity** | Interest Calculation: Schedule Interest Calculation Jobs |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
If you performed a test run in step 6, repeat steps 6–8 with Test Run deselected to perform an actual run.

</details>

---


## Activity 65: Interest Calculation: Manage Interest Runs

> 7 steps total | 4 classifiable | 3 hidden

### Step 526: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Interest Calculation: Manage Interest Runs |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you manage the interest runs. If needed, you can reverse an interest run or resend an interest letter.

</details>

---

### Step 527: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Interest Calculation: Manage Interest Runs |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Receivable Accountant.

</details>

---

### Step 528: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Interest Calculation: Manage Interest Runs |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Interest Runs (F4485).

</details>

---

### Step 529: Enter Criteria

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 346 |
| **Activity** | Interest Calculation: Manage Interest Runs |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Go: 
Company Code: 5410
Customer: 54100001

</details>

**Expected Result (Test Verification):**
> A list of documents display in the Interest Documents pane.

---

### Step 530: View Interest Document

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 347 |
| **Activity** | Interest Calculation: Manage Interest Runs |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
For the row for your interest document, choose the arrow button at the right of the row.

</details>

**Expected Result (Test Verification):**
> The Interest Run view is displayed for that document. The Items Subject to Interest pane shows related journal entry items, while the Output Items pane shows any outputs (for example, print or email) and their status.

---

### Step 531: Reverse Calculated Interests (Optional)

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 348 |
| **Activity** | Interest Calculation: Manage Interest Runs |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
If needed, you can select the checkbox for an item and choose Reverse Calculated Interests.In the Enter Reverse Parameters dialog box, make the following entries and choose Confirm: 
Reversal Reason: <reversal reason>

</details>

**Expected Result (Test Verification):**
> The Messages dialog box displays the document posting.

---

### Step 532: Resend Interest Letter (Optional)

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 349 |
| **Activity** | Interest Calculation: Manage Interest Runs |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
If needed, you can select the checkbox for an item and choose Send Interest Letters.On the Send Interest Letters dialog box, choose Yes to send the interest letter.

</details>

**Expected Result (Test Verification):**
> The Sent Interest Letters dialog box displays messages about the output channels from which the interest letters are sent.

---


## Activity 66: Interest Calculation: Display Interest Runs

> 5 steps total | 2 classifiable | 3 hidden

### Step 533: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Interest Calculation: Display Interest Runs |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

### Purpose
In this activity, you display the interest runs.

### Procedure

</details>

---

### Step 534: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Interest Calculation: Display Interest Runs |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Receivable Accountant.

</details>

---

### Step 535: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Interest Calculation: Display Interest Runs |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Interest Runs (F4485).

</details>

---

### Step 536: Enter Criteria

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 350 |
| **Activity** | Interest Calculation: Display Interest Runs |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Go: Company Code: 5410

</details>

**Expected Result (Test Verification):**
> A list of documents display in the Interest Documents pane.

---

### Step 537: View Interest Document

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 351 |
| **Activity** | Interest Calculation: Display Interest Runs |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
For the row for your interest document, choose the arrow button at the right of the row.

</details>

**Expected Result (Test Verification):**
> The Interest Run view is displayed for that document. The Items Subject to Interest pane shows related journal entry items, while the Output Items pane shows any outputs (for example, print or email) and their status.

---


## Activity 67: Guarantees Made: Guarantees Made

> 5 steps total | 2 classifiable | 3 hidden

### Step 538: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Guarantees Made: Guarantees Made |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

### Purpose
This activity describes how to create a guarantee.

### Procedure

</details>

---

### Step 539: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Guarantees Made: Guarantees Made |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Receivable Accountant.

</details>

---

### Step 540: Open the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Guarantees Made: Guarantees Made |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Guarantees Made (F7934).

</details>

---

### Step 541: Create

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 352 |
| **Activity** | Guarantees Made: Guarantees Made |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Create.

</details>

---

### Step 542: Enter Details

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 353 |
| **Activity** | Guarantees Made: Guarantees Made |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Post:
General Information:
Company Code: 5410
Document Date: <Date>
Posting Date: < Today’s Date>
Date: < Today’s Date>
Document Type: <KA>
Transaction Currency: <Co. Code currency>, for example, MYR
Line Item Detail:
Customer: <customer number >
Amount in Transaction Currency: <Amount >
Due On: <today's date + # days>

</details>

**Expected Result (Test Verification):**
> The guarantee is created.Note
> Once a decision is reached and action is taken on the made guarantee, the guarantee can be reversed. For more information, see the Reverse Guarantees procedure.

---


## Activity 68: Guarantees Made: Reverse Guarantees

> 5 steps total | 2 classifiable | 3 hidden

### Step 543: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Guarantees Made: Reverse Guarantees |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This activity describes how to reverse a guarantee.

</details>

---

### Step 544: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Guarantees Made: Reverse Guarantees |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Receivable Accountant.

</details>

---

### Step 545: Open the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Guarantees Made: Reverse Guarantees |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Guarantees Made (F7934).

</details>

---

### Step 546: Enter Details

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 354 |
| **Activity** | Guarantees Made: Reverse Guarantees |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Select an entry and choose Reverse.

</details>

**Expected Result (Test Verification):**
> A dialog box is displayed.

---

### Step 547: Reverse

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 355 |
| **Activity** | Guarantees Made: Reverse Guarantees |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Confirm the reversal.

</details>

**Expected Result (Test Verification):**
> The guarantee is reversed.

---


## Activity 69: Periodic Activities: Check Open Balances

> 1 steps total | 0 classifiable | 1 hidden

### Step 548: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Periodic Activities: Check Open Balances |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This step lists all Accounts Receivable line items.

#### Prerequisites
Invoices have been created and not collected.

#### Procedure
To check open balances, follow the instructions from the previous procedure Invoice Collection PreparationManage Customer Line Items.

</details>

---


## Activity 70: Periodic Activities: Create Balance Confirmation

> 9 steps total | 6 classifiable | 3 hidden

### Step 549: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Periodic Activities: Create Balance Confirmation |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you create a balance confirmation.

</details>

---

### Step 550: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Periodic Activities: Create Balance Confirmation |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Receivable Accountant.

</details>

---

### Step 551: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Periodic Activities: Create Balance Confirmation |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Schedule Accounts Receivable Jobs (F2366).

</details>

---

### Step 552: Create

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 356 |
| **Activity** | Periodic Activities: Create Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Create.

</details>

**Expected Result (Test Verification):**
> The New Job view displays.

---

### Step 553: Template Selection

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 357 |
| **Activity** | Periodic Activities: Create Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Step 2:
Job Template: Customer Balance Confirmation
Job Name: Customer Balance Confirmation

</details>

---

### Step 554: Scheduling Options

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 358 |
| **Activity** | Periodic Activities: Create Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Step 3:
Start Immediately: Selected

</details>

---

### Step 555: Parameters

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 359 |
| **Activity** | Periodic Activities: Create Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries:
General Selections section:
Company Code: 5410
Reconciliation Key Date: <Today’s date>
Output Control section:
Note
Enter the values either for no reply or for reply.
For no reply -
Description: <any>
Date of Issue: <Today’s date>
No Reply: Selected
For reply - 
Description: <any>
Date of Issue: <Today’s date>
No Reply: Deselected
Date of Reply: <Today’s date + 7>
Reply To: <any business partner>
Note
The business partner must have a valid address.
Use Print Bundling: When this box is selected, all letters are bundled into one print request. This results in the system sending all balance confirmation letters in a single print request, with the checklist being one separate output item.
Tip
We recommend selecting the print bundling option to simplify sending balance confirmation letters.

</details>

---

### Step 556: Check

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 360 |
| **Activity** | Periodic Activities: Create Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Check to verify that your entries are complete and correct.

</details>

**Expected Result (Test Verification):**
> The system displays the message You can go ahead and schedule your job.

---

### Step 557: Schedule

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 361 |
| **Activity** | Periodic Activities: Create Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Schedule.

</details>

**Expected Result (Test Verification):**
> The job is scheduled.

---


## Activity 71: Periodic Activities: Manage Balance Confirmations

> 6 steps total | 3 classifiable | 3 hidden

### Step 558: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Periodic Activities: Manage Balance Confirmations |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you manage open balance confirmation letters and track the actual status. You can check open balances and confirm the amount in the system during the year-end closing to an external auditor.

#### Prerequisites
- Invoices are created and not collected.

  - Preliminary steps for BRF settings are executed.
  - Balance confirmation is created.

</details>

---

### Step 559: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Periodic Activities: Manage Balance Confirmations |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Receivable Accountant.

</details>

---

### Step 560: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Periodic Activities: Manage Balance Confirmations |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Manage Balance Confirmations - For Customers (F2834).

</details>

---

### Step 561: Search

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 362 |
| **Activity** | Periodic Activities: Manage Balance Confirmations |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entry and choose Go:
Company Code: <any>

</details>

**Expected Result (Test Verification):**
> A list of customer balance confirmations displays.

---

### Step 562: Selection

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 363 |
| **Activity** | Periodic Activities: Manage Balance Confirmations |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Select a row to display its details and status.

</details>

**Expected Result (Test Verification):**
> The Customer Balance Confirmation details view display.

---

### Step 563: Preview

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 364 |
| **Activity** | Periodic Activities: Manage Balance Confirmations |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Output Details section, in the Display column, choose Display Document.

</details>

**Expected Result (Test Verification):**
> The document displays in a new view.

---


## Activity 72: Periodic Activities: Print Customer Balance Confirmation

> 7 steps total | 4 classifiable | 3 hidden

### Step 564: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Periodic Activities: Print Customer Balance Confirmation |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you print balance confirmation letters.

#### Prerequisites
- Invoices are created and not collected.

  - Balance confirmation is created.

</details>

---

### Step 565: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Periodic Activities: Print Customer Balance Confirmation |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Receivable Accountant.

</details>

---

### Step 566: Access the SAP Fiori app

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Periodic Activities: Print Customer Balance Confirmation |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Manage Balance Confirmations - For Customers (F2834).

</details>

---

### Step 567: Search

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 365 |
| **Activity** | Periodic Activities: Print Customer Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Go:
Company Code: <any>

</details>

**Expected Result (Test Verification):**
> A list of customer balance confirmations displays.

---

### Step 568: Selection

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 366 |
| **Activity** | Periodic Activities: Print Customer Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Select a row to display its details and status.

</details>

**Expected Result (Test Verification):**
> The Customer Balance Confirmation displays with details of the selected balance confirmation.

---

### Step 569: Preview

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 367 |
| **Activity** | Periodic Activities: Print Customer Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Output Details section, in the Display column, choose Display Document.

</details>

**Expected Result (Test Verification):**
> The document displays.

---

### Step 570: Print

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 368 |
| **Activity** | Periodic Activities: Print Customer Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Print on the document.

</details>

**Expected Result (Test Verification):**
> The document prints.

---


## Activity 73: Periodic Activities: Bad Debt Write-Off

> 7 steps total | 4 classifiable | 3 hidden

### Step 571: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Periodic Activities: Bad Debt Write-Off |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
Bad debt is a loss that a company incurs when credit that has been extended to customers becomes worthless, either because the debtor is bankrupt, has financial problems, or because it can't be collected. It's expensed on the income statement. Recognizing bad debt leads to an offsetting reduction to accounts receivable on the balance sheet – though businesses retain the right to collect funds should the circumstances change. 
In this activity, you select customer invoices that are unrecoverable and post financial entries.

#### Prerequisites
Invoices are created but are not recoverable.
You must have customers in financial distress with debit balances that have to be zeroed out on the balance sheet.
You must have executed the Assign Reason Codes For Write-Off preliminary step.

</details>

---

### Step 572: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Periodic Activities: Bad Debt Write-Off |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Accounts Receivable Accountant.

</details>

---

### Step 573: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Periodic Activities: Bad Debt Write-Off |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Write Off Receivables (F6728).

</details>

---

### Step 574: Selection Criteria

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 369 |
| **Activity** | Periodic Activities: Bad Debt Write-Off |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Go: 
Company Code: 5410
Customer: <customer>

</details>

**Expected Result (Test Verification):**
> The Receivables pane shows a list of results.

---

### Step 575: Details

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 370 |
| **Activity** | Periodic Activities: Bad Debt Write-Off |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
For the row you want to work with, choose > (Details).

</details>

**Expected Result (Test Verification):**
> The Write-Off Receivables view is displayed.

---

### Step 576: Write Off

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 371 |
| **Activity** | Periodic Activities: Bad Debt Write-Off |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Note
If necessary, change the values in the header area of the view to filter the list of items in the Accounts Receivable pane.
In the Accounts Receivable pane, for the item you want to write off, choose the Write-Off >> button at the right of the row.

</details>

**Expected Result (Test Verification):**
> The line item is transferred to the Write-Off pane at the bottom right of the view.

---

### Step 577: Review and Post

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 372 |
| **Activity** | Periodic Activities: Bad Debt Write-Off |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Write-Off pane, review your line item. When you are done, choose Post.

</details>

---


## Activity 74: Malaysia eInvoice: One-Time Customer (Optional)

> 16 steps total | 13 classifiable | 3 hidden

### Step 578: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Malaysia eInvoice: One-Time Customer (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you create a customer invoice for a one-time customer. The document can be used in the eDocument Cockpit.

</details>

---

### Step 579: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Malaysia eInvoice: One-Time Customer (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log onto the SAP Fiori launchpad as a Accounts Receivable Accountant.

</details>

---

### Step 580: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Malaysia eInvoice: One-Time Customer (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Create Outgoing Invoices (FB70).

</details>

**Expected Result (Test Verification):**
> The Enter Customer Invoice: Company Code view is displayed.

---

### Step 581: Company Code

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 373 |
| **Activity** | Malaysia eInvoice: One-Time Customer (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Company Code.

</details>

**Expected Result (Test Verification):**
> The Enter Company Code dialog box is displayed.

---

### Step 582: Company Code

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 374 |
| **Activity** | Malaysia eInvoice: One-Time Customer (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter or verify the following and choose Continue:Company Code: 5410

</details>

---

### Step 583: Basic Data

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 375 |
| **Activity** | Malaysia eInvoice: One-Time Customer (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries:
Customer: <customer>, for example, 54100273
Invoice Date: <today's date>
Reference: <any>
Posting Date: <today's date>
Amount: <any> (use currency MYR)
Currency Key: <company code currency>
Calculate Tax: Selected

</details>

---

### Step 584: Address and Bank Data

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 376 |
| **Activity** | Malaysia eInvoice: One-Time Customer (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries:
Name: <Customer Name>
City: <City>
Tax number 3: <Any value>
Tax number 4: <Any value>
Tax number 5: <Any value>

</details>

---

### Step 585: Document Texts

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 377 |
| **Activity** | Malaysia eInvoice: One-Time Customer (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Menu  Extras  Document Texts.

</details>

---

### Step 586: TIN and Phone Number

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 378 |
| **Activity** | Malaysia eInvoice: One-Time Customer (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries:
MY: Customer/Vendor TIN
MY: Customer/Vendor Telephone

</details>

---

### Step 587: Payment

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 379 |
| **Activity** | Malaysia eInvoice: One-Time Customer (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Payment tab.
Make the following entries:
Bline Date: <today's date>
Pmnt Terms: 0001
Payt Meth.: <optional>

</details>

---

### Step 588: Line Items

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 380 |
| **Activity** | Malaysia eInvoice: One-Time Customer (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the line item table, enter the following:
G/L Acct: 41000400
D/C: Credit
Amount in doc.curr.: <check the amount entered in Basic Data>
Tax Code: <output tax code>

</details>

---

### Step 589: Profitability Segment

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 381 |
| **Activity** | Malaysia eInvoice: One-Time Customer (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Items table, for the Profit.segment column, select the field button.

</details>

**Expected Result (Test Verification):**
> The Assignment to a Profitability Segment dialog box is displayed.

---

### Step 590: Profitability Segment

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 382 |
| **Activity** | Malaysia eInvoice: One-Time Customer (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Derivation, then choose Continue:
Customer: <customer number>

</details>

**Expected Result (Test Verification):**
> The Enter Customer Invoice view is displayed.

---

### Step 591: Profitability Segment

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 383 |
| **Activity** | Malaysia eInvoice: One-Time Customer (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Items table, make the following entry:
Profit Center: <any>

</details>

---

### Step 592: Material Segment (Optional)

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 384 |
| **Activity** | Malaysia eInvoice: One-Time Customer (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
If you're using the Malaysia SST02 report, add a material number in the column of the report, add a material number in the Material Items table.

</details>

---

### Step 593: Post

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 385 |
| **Activity** | Malaysia eInvoice: One-Time Customer (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Post

</details>

---


## Activity 75: eDocument Cockpit

> 15 steps total | 10 classifiable | 5 hidden

### Step 594: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | eDocument Cockpit |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this procedure, you change or maintain the status of your eDocument.Note
Ensure that the Preliminary Steps for Electronic Invoicing step is performed correctly.

#### Prerequisites
Starting with the 2208 release, to enable advanced eDocument features (such as eDocument Submit, Cancel, and Reject), new customers must first activate the Document and Reporting Compliancefeatures for your country or region. For more information, see the Document and Reporting Compliance(5XU) test script, in the PrerequisitesPreliminary StepsActivate Document and Reporting Compliance Featurestopic.

</details>

---

### Step 595: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | eDocument Cockpit |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Billing Clerk.

</details>

---

### Step 596: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | eDocument Cockpit |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open eDocument Cockpit (EDOC_COCKPIT).

</details>

---

### Step 597: Select eInvoice Document

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 386 |
| **Activity** | eDocument Cockpit |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries:
Source Document: <Invoice number from prior steps>
Note
You can also search for your invoice. In the Results Overview section, expand your country or region to display your country's or region's eInvoice.

</details>

**Expected Result (Test Verification):**
> The eInvoice screen for your country/region displays.

---

### Step 598: Submit eInvoice

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 387 |
| **Activity** | eDocument Cockpit |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the row and choose Submit.
Note
The submission of the eDocument requires a connection to SAP BTP. Ensure that the communication system and communication arrangement are set up before you test this step. For more information, see the setup instructions for Integrating with Peppol Exchange on the SAP Help Portal.

</details>

**Expected Result (Test Verification):**
> The eDocument status displays the message Action successfully executed: SUBMIT.

---

### Step 599: Review status

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 388 |
| **Activity** | eDocument Cockpit |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Review the eDocument status.

</details>

**Expected Result (Test Verification):**
> The possible statuses of submitted eDocuments are:
>   - Acknowledged by Service
> 
>   - Rejected by Service
>   - Validation Passed

---

### Step 600: Display eDocument

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 389 |
| **Activity** | eDocument Cockpit |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the row for an eDocument with Accepted by receiving Access Point status.
Choose Display > Display/Preview XML.
Note
To display a PDF, you can also choose Display  Display PDF.

</details>

**Expected Result (Test Verification):**
> The eDocument is shown in XML format.

---

### Step 601: Display Source Document

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 390 |
| **Activity** | eDocument Cockpit |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the row of an eDocument and choose Go to  Source Document.

</details>

**Expected Result (Test Verification):**
> A view displays of the original transaction that generated the eDocument (source document).

---

### Step 602: Back

| | |
|---|---|
| **Type** | `Navigation` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | eDocument Cockpit |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Back.

</details>

---

### Step 603: Review History of eDocument

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 391 |
| **Activity** | eDocument Cockpit |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To review the eDocument history, choose Go to  History.

</details>

**Expected Result (Test Verification):**
> The view displays the last process steps and statuses from selected eDocument.

---

### Step 604: Back

| | |
|---|---|
| **Type** | `Navigation` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | eDocument Cockpit |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
When you complete your review, choose the Back button at the bottom of the view to return to the previous view.

</details>

---

### Step 605: Review Application Log

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 392 |
| **Activity** | eDocument Cockpit |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Go to  Application Log.
When there are no errors, a No Application Log found for the selected eDocument notification displays at the bottom of the view.
If there are errors, an Application Log dialog box displays with information about the error. Review the message and choose Continue to close the dialog box.

</details>

---

### Step 606: Message Dashboard

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 393 |
| **Activity** | eDocument Cockpit |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Access Message Dashboard.If you encounter errors, a dialog box displays information about the error. Review the message and choose Continue to close the dialog box.

</details>

---

### Step 607: Cancel eDocument

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 394 |
| **Activity** | eDocument Cockpit |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To cancel an eDocument, select the row of an eDocument with Created status and choose More > Cancel eDocument.

</details>

**Expected Result (Test Verification):**
> The status of eDocument changes to eDocument Cancelled and the status icon turns green.

---

### Step 608: Delete eDocument

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 395 |
| **Activity** | eDocument Cockpit |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To delete an eDocument, choose a row from the list with a Created status.
Select an eDocument in status Created and choose More > Delete eDocument.

</details>

**Expected Result (Test Verification):**
> At the bottom of the view a Number of eDocuments that have been deleted: 1 notification displays.

---


## Activity 76: Additional Information: Appendix: Display Process Flow Accounts Receivable

> 5 steps total | 2 classifiable | 3 hidden

### Step 609: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Appendix: Display Process Flow Accounts Receivable |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Prerequisites
Documents that generate the Accounts Receivable process must be created, for example:
  - Outgoing invoice
  - Sales order
  - Clearing
  - Payment

#### Instructions
### Context
This app lets you graphically display the relationship between individual business objects of the Accounts Receivable work area (for example, sales orders, deliveries, clearing, accounting, and quotations).

### Procedure

</details>

---

### Step 610: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Appendix: Display Process Flow Accounts Receivable |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Receivable Accountant.

</details>

---

### Step 611: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Appendix: Display Process Flow Accounts Receivable |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Display Process Flow - Accounts Receivable (F2692).

</details>

---

### Step 612: Data Entry

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 396 |
| **Activity** | Additional Information: Appendix: Display Process Flow Accounts Receivable |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Go:
Document Type: <document type>
Note
Select a document type according to the origin of the document.
Document Number: <any document number according to document type selected>
Note
If you select either Journal Entry or Clearing Entry in the Document Type field, additional fields appear:
Fiscal year: <Current year>
Company Code: 5410

</details>

**Expected Result (Test Verification):**
> The Process Flow pane shows the selected document and its relationships to other documents in the process flow.

---

### Step 613: Exit

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 397 |
| **Activity** | Additional Information: Appendix: Display Process Flow Accounts Receivable |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose  Back.

</details>

---


# Appendix: Statistics

| Step Type | Count | Classifiable |
|-----------|-------|-------------|
| Information | 84 | 0 |
| Logon | 62 | 0 |
| Access App | 62 | 0 |
| Process Step | 301 | 301 |
| Data Entry | 37 | 37 |
| Verification | 19 | 19 |
| Navigation | 8 | 0 |
| Action | 40 | 40 |

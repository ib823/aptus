# J60 — Accounts Payable: Complete Screen-by-Screen Content

> **What the user sees on every screen in the review flow.**
> This document reproduces the exact content shown in the ABEAM assessment tool when a user reviews J60 (Accounts Payable). For each step it shows the step title, type badge, business context explanation, the full SAP technical reference content (normally collapsed), expected results, and activity context — exactly as rendered on screen.

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

**Visibility rules:**
- Steps marked 🟢 are **classifiable** (shown by default, user must classify)
- Steps marked ⚪ are **hidden by default** (technical/navigation steps, visible via "Show technical steps" toggle)

---

## Summary

| Metric | Count |
|--------|-------|
| Total steps | 714 |
| Classifiable (shown by default) | 460 |
| Hidden by default | 254 |
| Unique activities | 86 |

---

## Master Data Apps — D2 Remediation Addendum

> Added per the D2/D3 content-integrity remediation (see `D2-D3-REMEDIATION-NOTE.md`).
> This app is part of the J60 Accounts Payable flow per the SAP BPD test script
> (S4CLD2602) — its presence is confirmed by the external resolutions file — but it was
> not surfaced as a discrete screen-by-screen capture below. It is documented here so the
> J60 Fiori coverage matches the BPD. The app identity (name + Fiori ID) is BPD-confirmed;
> the detailed screen-by-screen procedure is defined in the BPD test script and is
> **not** reproduced here (not invented).

### Manage Supplier Master Data (F1053A)

| | |
|---|---|
| **Fiori app** | Manage Supplier Master Data |
| **Fiori ID** | F1053A |
| **Module** | Master Data — Supplier (Business Partner) / FI-AP |
| **Type** | Master Data — maintenance |

**What this step does:**
> Create, change, and display the supplier (business partner) master record — the
> general, company-code, and purchasing-organization data that identifies the vendor and
> underpins downstream AP postings, invoice processing, payments, and supplier-line-item reporting.

---


## Activity 1: Additional Information

> 4 steps total | 0 classifiable | 4 hidden

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
This section summarizes all the prerequisites for conducting the test in terms of systems, users, master data, organizational data, other test data and business conditions.  - Vendor master data has been created.

  - Invoices have been posted to accounting.

  - Complete Business Conditions.

  - Execute Preliminary Steps.

#### System Access
| Accounts Payable Accountant
 | SAP_BR_AP_ACCOUNTANT | Accounts Payable/ Central Invoice Management - Supplier Invoices/ Central Invoicing - Supplier Invoice | SAP_BR_AP_ACCOUNTANT/ SAP_MM_SPT_CIM_INV_PC/ SAP_MM_SPT_CNTRL_INVOICING_PC | 
 | Country specific subrole:
Accounts Payable Manager Malaysia
 | SAP_BR_AP_MANAGER_MY
 |  |  | 

 | Administrator
 | SAP_BR_ADMINISTRATOR | Administration/ Administration - Workforce Master Data/ Administration - License Compliance/ Administration - Data Management/ Administration - Output Control | SAP_BR_ADMINISTRATOR/ SAP_BUM_SPT_ADMINISTRATION_PC/ SAP_EI_SPT_ADM_LC_PC/ SAP_CA_SPT_TDR_PC/ SAP_OC_SPT_ADMINISTRATION_PC | 
 | Configuration Expert - Business Process Configuration
 | SAP_BR_BPC_EXPERT | Business Process Configuration/ Business Process Configuration - Finance/ Business Process Configuration - Procurement/ Manage your Solution/ Business Process Configuration - Workflow/ Business Configuration - Feature Management/ Business Process Configuration - Extensibility Explorer/ Business Configuration - Transportation | SAP_BR_BPC_EXPERT/ SAP_FIN_SPT_BPC_EXPERT_PC/ SAP_MM_SPT_BIZ_PROC_CONFIGN_PC/ SAP_CA_SPT_IC_LND_BASE_PC/ SAP_CA_SPT_BPC_WORKFLOW_PC/ SAP_CA_SPT_BPC_FM_PC/ SAP_EI_SPT_BPC_EXT_PC/ SAP_TM_SPT_TRANSPCFG_PC | 

 | Cash Management Specialist
 | SAP_BR_CASH_SPECIALIST | Cash Management | SAP_BR_CASH_SPECIALIST | 
 | Cash Manager
 | SAP_BR_CASH_MANAGER | Cash Management | SAP_BR_CASH_MANAGER | 

 | General Ledger Accountant
 | SAP_BR_GL_ACCOUNTANT | General Ledger | SAP_BR_GL_ACCOUNTANT | 
 | Master Data Specialist - Business Partner Data | SAP_BR_BUPA_MASTER_SPECIALIST | Master Data - Business Partners/ Business Partner Governance/ Business Partner Governance | SAP_BR_BUPA_MASTER_SPECIALIST/ SAP_CA_SPT_MDG_BP_GOV_PC/ SAP_CMD_SPT_BP_GOV_PC | 
 | Manager | SAP_BR_MANAGER | My Inbox | SAP_CORE_SPT_MYINBOX_PC | 
 | Extensibility Specialist | SAP_BR_EXTENSIBILITY_SPEC | Extensibility/ Extensibility | SAP_BR_EXTENSIBILITY_SPEC/ SAP_CA_SPT_EXT_PC | 
 | Billing Clerk | SAP_BR_BILLING_CLERK | Billing | SAP_BR_BILLING_CLERK | 

### Master Data, Organizational Data, and Other Data
Default ValuesOperational FocusNote
Additional Default Values
You can test the scenario with other SAP default values that have the same characteristics.
Master DataFor more information on creating master data objects, see the following Master Data Scripts (MDS)
### Payment Methods and Payment Medium Formats
Use the following table for payment methods (PM) and payment medium formats (PMF).
PMName of Payment MethodPMF for MBC House Bank MYBK1PMF for File Download (MYBK2demo data)*
 | F | Foreign Bank Transfer (DTAZV) | DTAZV | DTAZV
 | T | SEPA Credit Transfer | SEPA_CT | SEPA_CT

Note
For *, the MYBK2value is demo data. Ensure that the solution is installed with demo data to test this value.

### Business Conditions
Invoices to be paid must be available. You can enter new invoices by executing the purchase process in Material Management.
Test Script/ScenarioBusiness Condition

 | J45 - Procurement of Direct Materials | Must be run before this test script. Invoices are created and posted to accounting.
 | J13 - Service and Material Procurement – Project-Based Services
 | Must be run before this test script. Invoices have been created and posted to accounting.

 | BFA - Basic Bank Account Management
 | Bank account master data is processed.
 | BFB - Basic Cash Operations
 | Outgoing payment to vendors is integrated with a bank.
 | J77 - Advanced Bank Account Management

 | Bank accounts and approvers in banks have been defined. 

 | J78 - Advanced Cash Operations

 | Preliminary steps in Prerequisites are executed.
Payment approvers are defined. Outgoing Payment with Bank Communication Management (BCM) process is executed.

 | J58 - Accounting and Financial Close
 | Posting periods are open.

 | BNZ - Create New Open MM Posting Period - MDS
 | MM posting periods are open.

 | BNX - Consumable Purchasing
 | Execute the Activate Flexible Workflow for Supplier Invoicepreliminary step.

 | 1LQ - Output Management
 | Ensure that you set up printers, create a print queue, and/or set up email. These activities are in the Setup Instructions document.

### Preliminary Steps: Maintain Payment Approver for Bank Accounts

### Context
In this activity, you maintain the payment signatories for existing bank accounts. Payment signatories work as approvers in the optional Payment Approval step.
Note
For more information, in the Advanced Cash Operations(J78)test script, see PrerequisitesPreliminary Steps.

### Prerequisite
Two sample bank accounts are created in the system.

### Procedure
Note
In the Advanced Cash Operations(J78)test script, execute all steps in the Preliminary Stepssection.
Caution
This step is only needed for customers who adopt full Cash Management, which needs an additional license for SAP Cash Management powered by SAP HANA; otherwise, Basic Cash Managementis adopted and you can skip this step.

#### Roles
Create business roles using the following business role templates delivered by SAP and assign them to your individual test users.Name (Role Template)
ID (Role Template)
Name (Launchpad Space)
ID (Launchpad Space)

#### Instructions
### Purpose

### Overview
With Accounts Payable, you manage your open payable invoices that are automatically created from purchasing processes.
You manage and control open items with various analytical tools. You plan future payables and analyze the outcome of payments, such as utilization of cash discounts and days payables outstanding.
Automate processing of your outstanding payables and monitor payment progress. Optionally, you can also include a two-step approval for all outgoing payments.
Connect to SAP Multi-Bank Connectivity (MBC) to streamline the connectivity to the banks for payments and bank statements. Alternatively, you can also download generated payment files.
For applicable countries or regions, you can also print checks.
This business process focuses on the following activities:This document provides a detailed procedure for testing this scope item after solution activation, reflecting the predefined scope of the solution. Each process step, report, or item is covered in its own section, providing the system interactions (test steps) in a table view. Steps that are not in scope of the process but are needed for testing are marked accordingly. Project-specific steps must be added.
### System Access
SystemDetails

 | System | Accessible via the SAP Fiori launchpad. Your system administrator provides you with the URL to access the various apps assigned to your role.

</details>

---


## Activity 2: Additional Information: Preliminary Steps: Define Payment Medium Format Variants (Optional)

> 2 steps total | 0 classifiable | 2 hidden

### Step 2: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Define Payment Medium Format Variants (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you create, change, and assign selection variants for payment medium formats. You can then use these variants when creating payment media using the Payment Medium Workbench.
Selection variants are needed to generate the Payment Medium.

#### Prerequisites
- Payment Methods are specified and assigned to your country/region and company code.

  - Payment Medium Formats are assigned to your Payment Methods.

#### Procedure
Depending on your configuration environment for SAP S/4HANA Cloud Public Edition, choose one of the following options:
Configure Your Solution:  - Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration.
  - Open Manage Your Solution(F1241).
  - If necessary, change the country/region by choosing Set Local Version.
  - Choose Configure Your Solution.
  - Make the following entries: Application Area: Finance
Sub Application Area: Accounts Payable

  - For the row with Item Name of Payment Medium Formats, choose Details (>).
  - For the Create/Assign Selection Variants (Alternative)row, choose Configure.
  - Continue with the procedure in the table below.

</details>

---

### Step 3: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Define Payment Medium Format Variants (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
SAP Central Business Configuration:  - Log on to the project experience in SAP Central Business Configuration. 
  - Go to the Business Processes Configurationapp. To locate the activity in the tree view, search for the following activity: Create/Assign Selection Variants (Alternative).
  - Choose Open Documentationfor the found line item to see more details about this configuration activity.
  - Choose the link to navigate directly to the SAP S/4HANA Cloud Public Editionsystem. Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration.
  - Continue with the procedure in the following table.

</details>

---


## Activity 3: Additional Information: Preliminary Steps: BRF+ Settings for Payment Advice

> 25 steps total | 22 classifiable | 3 hidden

### Step 4: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment Advice |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you define the system determination of output parameters for payment advice for printing and e-mail.

</details>

---

### Step 5: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment Advice |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Administrator.

</details>

---

### Step 6: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment Advice |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Output Parameter Determination.

</details>

**Expected Result (Test Verification):**
> The Output Parameter Determination view displays.

---

### Step 7: Output Type

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 1 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Select Business Rules section, choose:Show Rules for: Payment Advice
Determination Step: Output Type

</details>

**Expected Result (Test Verification):**
> Details are displayed in Maintain Business Rules section.

---

### Step 8: Add Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 2 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Edit button. Under Table Contents, choose the + (Insert New Row) button and enter the following by choosing …  or selecting Direct Value Input from the dropdown in each field:
Sep.Paymt.Adv.: X (Yes)
Output type: PAYM_ADV
Dispatch Time: 1 (Immediately)

</details>

---

### Step 9: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 3 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Activate button. On the Confirm Activation dialog box, choose Yes.

</details>

**Expected Result (Test Verification):**
> Rules activate.

---

### Step 10: Receiver

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 4 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Select Business Rules section, choose:
Show Rules for: Payment Advice
Determination Step: Receiver

</details>

**Expected Result (Test Verification):**
> Details display in the Maintain Business Rules section.

---

### Step 11: Add Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 5 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Edit button. Under Table Contents choose the + (Insert New Row) button and enter the following by choosing …  or selecting Direct Value Input from the dropdown in each field:Output type: PAYM_ADV
Supplier: isn't initial
Customer: leave blank
Role: H
Exclusive Indicator: (false)
Choose + to insert a new row and enter the following:
Output type: PAYM_ADV
Supplier: leave blank 
Customer: isn't initial
Role: S
Exclusive Indicator: (false)

</details>

---

### Step 12: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 6 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Activate button. On the Confirm Activation dialog box, choose Yes.

</details>

**Expected Result (Test Verification):**
> Rules activate.

---

### Step 13: Channel

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 7 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Select Business Rules section, choose
Show Rules for: Payment Advice
Determination Step: Channel

</details>

**Expected Result (Test Verification):**
> Details display in the Maintain Business Rules section.

---

### Step 14: Add Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 8 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Edit button. Under Table Contents choose the + (Insert New Row) button and enter the following by choosing …  or selecting Direct Value Input from the dropdown in each field:Output type: PAYM_ADV
Channel: PRINT (Printout) 
Exclusive Indicator: - (false) 
Choose the + (Insert New Row) button to insert a new row and enter the following:
Output type: PAYM_ADV
Channel: EMAIL (email) 
Exclusive Indicator: - (false)

</details>

---

### Step 15: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 9 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Activate button. On the Confirm Activation dialog box, choose Yes.

</details>

**Expected Result (Test Verification):**
> Rules activate.

---

### Step 16: Printer Settings

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 10 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Select Business Rules section, choose
Show Rules for: Payment Advice
Determination Step: Printer Settings

</details>

**Expected Result (Test Verification):**
> Details display in the Maintain Business Rules section.

---

### Step 17: Add Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 11 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Edit button. Under Table Contents choose the + (Insert New Row) button to insert a new row and enter the following by choosing …  or selecting Direct Value Input from the dropdown in each field:Output type: PAYM_ADV
Print Queue: For example, QUEUE_PAYM_ADV or choose the print queue defined in your system
Number of Copies: 1

</details>

---

### Step 18: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 12 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Activate button. On the Confirm Activation dialog box, choose Yes.

</details>

**Expected Result (Test Verification):**
> Rules activate.

---

### Step 19: Email Settings

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 13 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Select Business Rules section, choose:
Show Rules for: Payment Advice
Determination Step: Email Settings

</details>

**Expected Result (Test Verification):**
> Details display in the Maintain Business Rules section.

---

### Step 20: Add Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 14 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Edit button. Under Table Contents choose the + (Insert New Row) button and enter the following by choosing …  or selecting Direct Value Input from the dropdown in each field:Output type: PAYM_ADV
Sender Email: <sender email address>
Email Template: FFO_PAYM_ADVICE_EMAIL_TEMPLATE

</details>

---

### Step 21: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 15 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Activate button. On the Confirm Activation dialog box, choose Yes.

</details>

**Expected Result (Test Verification):**
> Rules activate.

---

### Step 22: Output Relevance

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 16 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Select Business Rules section, choose:
Show Rules for: Payment Advice
Determination Step: Output Relevance

</details>

**Expected Result (Test Verification):**
> Details display in the Maintain Business Rules section.

---

### Step 23: Add Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 17 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Edit button. Under Table Contents choose the + (Insert New Row) button to insert a new row and enter the following by choosing …  or selecting Direct Value Input from the dropdown in each field:Output type: PAYM_ADV
Relevance Indicator: X (True)

</details>

---

### Step 24: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 18 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Activate button. On the Confirm Activation dialog box, choose Yes.

</details>

**Expected Result (Test Verification):**
> Rules activate.

---

### Step 25: Form Template

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 19 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Select Business Rules section, make the following entries: 
Show Rules for: Payment Advice
Determination Step: Form Template

</details>

**Expected Result (Test Verification):**
> Details display in the Maintain Business Rules section.

---

### Step 26: Add Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 20 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Edit button. Under Table Contents choose the + (Insert New Row) button and enter the following by choosing …  or selecting Direct Value Input from the dropdown in each field:Output type: PAYM_ADV
Form Template: FIN_FO_PAYM_ADVICE
Form Language: For example, E (English).

</details>

**Expected Result (Test Verification):**
> Rule data is entered.

---

### Step 27: Activate Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 21 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Activate button. On the Confirm Activation dialog box, choose Yes.

</details>

**Expected Result (Test Verification):**
> Rules activate.

---

### Step 28: Email Recipient

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 22 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To specify the email address of the recipient of the payment advice, follow the instructions described in Test Procedures  Preparation of Payments  Maintain Business Partner, in the Correspondence step.

</details>

---


## Activity 4: Additional Information: Preliminary Steps: BRF+ Settings for Supplier Balance Confirmation

> 29 steps total | 26 classifiable | 3 hidden

### Step 29: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Supplier Balance Confirmation |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you define the system determination of output parameters for printing a balance confirmation.

</details>

---

### Step 30: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Supplier Balance Confirmation |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Administrator.

</details>

---

### Step 31: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Supplier Balance Confirmation |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Output Parameter Determination (APOC_WD_BRF_DEC_TAB_MAINTAIN).

</details>

---

### Step 32: Output Type

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 23 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Supplier Balance Confirmation |

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
> Details display in the Maintain Business Rules section.

---

### Step 33: Add Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 24 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Supplier Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Edit button. Under Table Contents choose the +  button to insert a new row and enter the following by choosing …  or selecting Direct Value Input from the dropdown in each field:Output type: LETTER
Dispatch Time: 1 (Immediately)
Choose the + button to insert a new row.
Make the following entries:
Output type: CHECKLIST
Dispatch Time: 1 (Immediately)

</details>

---

### Step 34: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 25 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Supplier Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Activate button. On the Confirm Activation dialog box, choose Yes.

</details>

**Expected Result (Test Verification):**
> Rules activate.

---

### Step 35: Receiver

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 26 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Supplier Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Select Business Rules section, make the following entries:
Show Rules for: Balance Confirmation
Determination Step: Receiver

</details>

**Expected Result (Test Verification):**
> Details display in the Maintain Business Rules section.

---

### Step 36: Add Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 27 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Supplier Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Edit button. Under Table Contents choose the + button to insert a new row and enter the following by choosing …  or selecting Direct Value Input from the dropdown in each field:Output type: LETTER
Account type: K (Vendors) 
Role: K
Exclusive Indicator: - (false) 
Choose the + button to insert a new row. Make the following entries:
Output type: LETTER
Account type: D (Customers)
Role: D
Exclusive Indicator: - (false) 
Choose the + button to insert a new row. Make the following entries:
Output type: CHECKLIST
Account type: Leave blank 
Role: C
Exclusive Indicator: - (false).

</details>

---

### Step 37: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 28 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Supplier Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Activate button. On the Confirm Activation dialog box, choose Yes.

</details>

**Expected Result (Test Verification):**
> Rules are activated.

---

### Step 38: Channel

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 29 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Supplier Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Select Business Rules section, make the following entries:
Show Rules for: Balance Confirmation
Determination Step: Channel

</details>

**Expected Result (Test Verification):**
> Details display in the Maintain Business Rules section.

---

### Step 39: Add Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 30 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Supplier Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Edit button. Under Table Contents choose the + button to insert a new row and enter the following by choosing button. On the …  or selecting Direct Value Input from the dropdown in each field:Output type: LETTER
Channel: PRINT
Exclusive Indicator button. On the: - (false)
Choose the + button to insert new row. Make the following entries:
Output type: CHECKLIST
Channel: PRINT
Exclusive Indicator: - (false)

</details>

---

### Step 40: Insert New Row

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 31 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Supplier Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Insert New Row.

</details>

---

### Step 41: Enter Details

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 32 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Supplier Balance Confirmation |

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

### Step 42: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 33 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Supplier Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Activate. In the Confirm Activation dialog box, choose Yes.

</details>

**Expected Result (Test Verification):**
> Rules activate.

---

### Step 43: Form Template

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 34 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Supplier Balance Confirmation |

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
> Details display in the Maintain Business Rules section.

---

### Step 44: Add Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 35 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Supplier Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Edit button. Under Table Contents choose the + button to insert a new row and enter the following by choosing …  or selecting Direct Value Input from the dropdown in each field:Output type: LETTER
Form Template: FIN_FO_BLNC_CNFRM_LTTR
 Choose the + button to insert a new row and make the following entries:
Output type: CHECKLIST
Form Template: FIN_FO_BLNC_CNFRM_CHKLST

</details>

**Expected Result (Test Verification):**
> Rule data is entered.

---

### Step 45: Activate Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 36 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Supplier Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Activate button. On the Confirm Activation dialog box, choose Yes.

</details>

**Expected Result (Test Verification):**
> Rules activate.

---

### Step 46: Output Relevance

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 37 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Supplier Balance Confirmation |

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
> Details display in the Maintain Business Rules section.

---

### Step 47: Add Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 38 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Supplier Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Edit button. Under Table Contents choose the + button to insert a new row and enter the following by choosing …  or selecting Direct Value Input from the dropdown in each field:Output type: LETTER
Relevance Indicator: X (True) 
Choose the + button to insert a new row.
Make the following entries:
Output type: CHECKLIST
Relevance Indicator: X (True)

</details>

---

### Step 48: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 39 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Supplier Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Activate button. On the Confirm Activation dialog box, choose Yes.

</details>

**Expected Result (Test Verification):**
> Rules activate.

---

### Step 49: Printer Settings

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 40 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Supplier Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Select Business Rules section, make the following entries:
Show Rules for: Balance Confirmation
Determination Step: Printer Settings

</details>

---

### Step 50: Add Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 41 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Supplier Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Edit button. Under Table Contents choose the + button to insert a new row and enter the following by choosing …  or selecting Direct Value Input from the dropdown in each field:Output type: LETTER
Print Queue: DEFAULT or use the one defined in your system. 
Number of Copies: 1
Choose the + button to insert a new row. Make the following entries:
Output type: CHECKLIST
Print Queue: DEFAULT or enter the queue defined in your system 
Number of Copies: 1

</details>

---

### Step 51: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 42 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Supplier Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Activate button. On the Confirm Activation dialog box, choose Yes.

</details>

**Expected Result (Test Verification):**
> Rules activate.

---

### Step 52: Email Settings

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 43 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Supplier Balance Confirmation |

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

### Step 53: Add Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 44 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Supplier Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Edit.

</details>

---

### Step 54: New Row

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 45 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Supplier Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

In Table Contents, choose + (Insert New Row).

</details>

---

### Step 55: enter Details

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 46 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Supplier Balance Confirmation |

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

### Step 56: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 47 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Supplier Balance Confirmation |

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

### Step 57: Confirm

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 48 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Supplier Balance Confirmation |

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


## Activity 5: Additional Information: Preliminary Steps: BRF+ Settings for Item Interest Calculation

> 24 steps total | 21 classifiable | 3 hidden

### Step 58: Information

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

### Step 59: Log On

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

### Step 60: Access the SAP Fiori App

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

### Step 61: Determine Output Type

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
In the Select Business Rules section, make the following entries:
Show Rules for: Item Interest Calculation
Determination Step: Output Type

</details>

**Expected Result (Test Verification):**
> Details are displayed in the Maintain Business Rules section.

---

### Step 62: Maintain Business Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 50 |
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

### Step 63: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 51 |
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

### Step 64: Determine Output Type

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 52 |
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

### Step 65: Maintain Business Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 53 |
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

### Step 66: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 54 |
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

### Step 67: Determine Output Type

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 55 |
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

### Step 68: Maintain Business Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 56 |
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

### Step 69: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 57 |
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

### Step 70: Determine Output Type

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 58 |
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

### Step 71: Maintain Business Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 59 |
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

### Step 72: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 60 |
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

### Step 73: Determine Output Type

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 61 |
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

### Step 74: Maintain Business Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 62 |
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

### Step 75: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 63 |
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

### Step 76: Determine Output Type

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 64 |
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

### Step 77: Maintain Business Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 65 |
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

### Step 78: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 66 |
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

### Step 79: Determine Output Type

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 67 |
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

### Step 80: Maintain Business Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 68 |
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

### Step 81: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 69 |
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


## Activity 6: Additional Information: Preliminary Steps: BRF+ Settings for Payment List

> 21 steps total | 18 classifiable | 3 hidden

### Step 82: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment List |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you define the system determination of output parameters of payment list for printing.

</details>

---

### Step 83: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment List |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Administrator.

</details>

---

### Step 84: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment List |

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

### Step 85: Output Type

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 70 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment List |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Select Business Rules section, make the following entries:
Show Rules for: Payment List
Determination Step: Output Type

</details>

**Expected Result (Test Verification):**
> Details are displayed in the Maintain Business Rules section.

---

### Step 86: Add Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 71 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment List |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Edit.
Under Table Contents choose + (Insert New Row).
Make the following entries and choose Activate:
Output type: PAYM_LIST
Dispatch Time: 1 (Immediately)

</details>

**Expected Result (Test Verification):**
> The Confirm Activation dialog box is displayed.

---

### Step 87: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 72 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment List |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Yes.

</details>

**Expected Result (Test Verification):**
> Rules are activated.

---

### Step 88: Receiver

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 73 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment List |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Select Business Rules section, make the following entries:
Show Rules for: Payment List
Determination Step: Receiver

</details>

**Expected Result (Test Verification):**
> Details are displayed in the Maintain Business Rules section.

---

### Step 89: Add Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 74 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment List |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Edit.
Under Table Contents choose + (Insert New Row).
Make the following entries and choose Activate:
Output type: PAYM_LIST
Indicator: Only P…: =X (Yes)
Role: PP
Exclusive Indicator: (false)
Choose + to insert a new row.
Enter the following:
Output type: PAYM_LIST
Indicator: Only P…: =false
Role: PL
Exclusive Indicator: (false)

</details>

**Expected Result (Test Verification):**
> The Confirm Activation dialog box is displayed.

---

### Step 90: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 75 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment List |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Yes.

</details>

**Expected Result (Test Verification):**
> Rules are activated.

---

### Step 91: Channel

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 76 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment List |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Select Business Rules section, make the following entries:
Show Rules for: Payment List
Determination Step: Channel

</details>

**Expected Result (Test Verification):**
> Details are displayed in the Maintain Business Rules section.

---

### Step 92: Add Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 77 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment List |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Edit.
Under Table Contents choose + (Insert New Row).
Make the following entries and choose Activate:
Output type: PAYM_LIST
Channel: PRINT (Printout)
Exclusive Indicator: - (false)

</details>

**Expected Result (Test Verification):**
> The Confirm Activation dialog box is displayed.

---

### Step 93: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 78 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment List |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Activate. 
On the Confirm Activation dialog box, choose Yes.

</details>

**Expected Result (Test Verification):**
> Rules are activated.

---

### Step 94: Printer Settings

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 79 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment List |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Select Business Rules section, make the following entries:
Show Rules for: Payment List
Determination Step: Printer Settings

</details>

**Expected Result (Test Verification):**
> Details are displayed in the Maintain Business Rules section.

---

### Step 95: Add Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 80 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment List |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Edit.
Under Table Contents choose + (Insert New Row).
Make the following entries and choose Activate:
Output type: PAYM_LIST
Print Queue: For example, DEFAULT or choose the print queue defined in your system
Number of Copies: 1

</details>

**Expected Result (Test Verification):**
> The Confirm Activation dialog box is displayed.

---

### Step 96: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 81 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment List |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Yes.

</details>

**Expected Result (Test Verification):**
> Rules are activated.

---

### Step 97: Form Template

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 82 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment List |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Select Business Rules section, make the following entries:
Show Rules for: Payment List
Determination Step: Form Template

</details>

**Expected Result (Test Verification):**
> Details are displayed in the Maintain Business Rules section.

---

### Step 98: Add Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 83 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment List |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Edit.
Under Table Contents choose + (Insert New Row).
Make the following entries:
Output type: PAYM_LIST
Role: PL
Form Template: FIN_FO_PAYM_LIST_V2
Choose + to insert a new row. 
Enter the following:
Output type: PAYM_LIST
Role: PP
Form Template: FIN_FO_PAYM_LIST_V2
Choose Activate

</details>

**Expected Result (Test Verification):**
> The Confirm Activation dialog box is displayed.

---

### Step 99: Activate Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 84 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment List |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Yes.

</details>

**Expected Result (Test Verification):**
> Rules are activated.

---

### Step 100: Output Relevance

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 85 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment List |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Select Business Rules section, make the following entries:
Show Rules for: Payment List
Determination Step: Output Relevance

</details>

**Expected Result (Test Verification):**
> Details are displayed in the Maintain Business Rules section.

---

### Step 101: Add Rules

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 86 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment List |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Edit.
Under Table Contents choose + (Insert New Row).
Make the following entries and choose Activate:
Output type: PAYM_LIST
Relevance Indicator: X (True)

</details>

**Expected Result (Test Verification):**
> The Confirm Activation dialog box is displayed.

---

### Step 102: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 87 |
| **Activity** | Additional Information: Preliminary Steps: BRF+ Settings for Payment List |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Yes.

</details>

**Expected Result (Test Verification):**
> Rules are activated.

---


## Activity 7: Additional Information: Preliminary Steps: Add Fields to Items (Optional)

> 9 steps total | 6 classifiable | 3 hidden

### Step 103: Information

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

#### Prerequisites
Extensibility should only be tested in extensibility systems. Contact your system administrator to check if your system is enabled for extensibility for the Custom Fields(F1481)app.

#### Instructions
### Use
The administrator can optionally add data source extensions and field names to Manage Supplier Line Items(F0712). This option allows making more user fields available when managing items.

### Procedure

</details>

---

### Step 104: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Add Fields to Items (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Extensibility Specialist.

</details>

---

### Step 105: Access the SAP Fiori App

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

### Step 106: Create New Extension

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 88 |
| **Activity** | Additional Information: Preliminary Steps: Add Fields to Items (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose the Data Source Extensions tab.

</details>

---

### Step 107: Create New Extension

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 89 |
| **Activity** | Additional Information: Preliminary Steps: Add Fields to Items (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose + (Create).

</details>

**Expected Result (Test Verification):**
> The New Data Source Extension dialog box displays.

---

### Step 108: Enter Properties

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 90 |
| **Activity** | Additional Information: Preliminary Steps: Add Fields to Items (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Create: 
Data Source: Supplier Line Items
Description: <description of the data source>
Extension ID: The description is automatically added to the ID

</details>

**Expected Result (Test Verification):**
> A view displays of the new data source extension.

---

### Step 109: Add Fields

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 91 |
| **Activity** | Additional Information: Preliminary Steps: Add Fields to Items (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the <> Toggle Field Path button to switch the Field Path to show Item at the top of the table. Expand the Item  _Supplier node until you find the items you want to add. To add them, select the Selected checkbox next to the field to add.Note
Ensure that your choices are under the _Supplier node.

</details>

**Expected Result (Test Verification):**
> Selected items display in the Selected Fields column.

---

### Step 110: Save

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 92 |
| **Activity** | Additional Information: Preliminary Steps: Add Fields to Items (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Save.

</details>

**Expected Result (Test Verification):**
> All the nodes of the Field Path table collapse and your selections display in the Selected Fields table.

---

### Step 111: Publish

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 93 |
| **Activity** | Additional Information: Preliminary Steps: Add Fields to Items (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Publish.

</details>

**Expected Result (Test Verification):**
> The Data Source Extensions view of Custom Fields and Logic displays with all of the extensions. To verify your new extension, use the Search field.

---


## Activity 8: Additional Information: Preliminary Steps: Maintain Business Users

> 9 steps total | 6 classifiable | 3 hidden

### Step 112: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Maintain Business Users |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you assign business roles to a business user:
  - Assign SAP_BR_MANAGERto use and display the My Inbox- All Items(F0862)app

  - Assign SAP_BR_AP_ACCOUNTANTto:

  - Display the journal entry details in My Inbox

  - Access the Verify Supplier Down Payment Requests(F7103), Verify Supplier Down Payment Requests- Approver Inbox(F7102), and Verify Supplier Down Payment Requests- Approver Outbox(F7101)apps

#### Prerequisites
You created business users.

</details>

---

### Step 113: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Maintain Business Users |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Administrator.

</details>

---

### Step 114: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Maintain Business Users |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Maintain Business Users (F1303).

</details>

**Expected Result (Test Verification):**
> The Maintain Business Users view displays.

---

### Step 115: Search

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 94 |
| **Activity** | Additional Information: Preliminary Steps: Maintain Business Users |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Go :
User Name: AP_MANAGER

</details>

**Expected Result (Test Verification):**
> Your selection is displayed.

---

### Step 116: Select

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 95 |
| **Activity** | Additional Information: Preliminary Steps: Maintain Business Users |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose the displayed entry.

</details>

**Expected Result (Test Verification):**
> Details of the user are displayed.

---

### Step 117: Person ID

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 96 |
| **Activity** | Additional Information: Preliminary Steps: Maintain Business Users |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the General  Personal Data section, make a note of the Person ID. This value is used later in the Create Team process steps (Team Owners and Team Members rows).

</details>

---

### Step 118: Assign

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 97 |
| **Activity** | Additional Information: Preliminary Steps: Maintain Business Users |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Assigned Business Roles section, choose Add.

</details>

---

### Step 119: Assign

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 98 |
| **Activity** | Additional Information: Preliminary Steps: Maintain Business Users |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Search for and select SAP_BR_MANAGER and choose Apply.
Search for and select SAP_BR_AP_ACCOUNTANT and choose OK.

</details>

---

### Step 120: Save

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 99 |
| **Activity** | Additional Information: Preliminary Steps: Maintain Business Users |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Save.

</details>

**Expected Result (Test Verification):**
> The business roles are assigned and saved.

---


## Activity 9: Additional Information: Preliminary Steps for eDocument Process: Maintain Business Partner Master Data

> 8 steps total | 5 classifiable | 3 hidden

### Step 121: Information

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

### Step 122: Log On

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

### Step 123: Access the SAP Fiori App

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

### Step 124: Switch to Change mode

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 100 |
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

### Step 125: Change BP role

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 101 |
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

### Step 126: Maintain Malaysia Tax numbers

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 102 |
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

### Step 127: Save Your Data

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 103 |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process: Maintain Business Partner Master Data |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Save your entries.

</details>

---

### Step 128: Maintain Classification Code for Buyer-Created Invoices (Optional)

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 104 |
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


## Activity 10: Additional Information: Preliminary Steps for eDocument Process: Maintain Company Code Data

> 4 steps total | 3 classifiable | 1 hidden

### Step 129: Information

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

### Step 130: Company Code

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 105 |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process: Maintain Company Code Data |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose company code 5410.

</details>

---

### Step 131: Create Additional Data

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 106 |
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

### Step 132: Save

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 107 |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process: Maintain Company Code Data |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Save your entries.

</details>

---


## Activity 11: Additional Information

> 4 steps total | 0 classifiable | 4 hidden

### Step 133: Information

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

</details>

---


## Activity 12: Test Procedures

> 1 steps total | 0 classifiable | 1 hidden

### Step 134: Information

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


## Activity 13: Preparation of Payments: Maintain Business Partner

> 15 steps total | 12 classifiable | 3 hidden

### Step 135: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Preparation of Payments: Maintain Business Partner |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
Vendor master records are used by both the Accounting component and the Purchasing component.

#### Prerequisites
The supplier master record has been entered, but some specific information, for example the payment method, is missing.

</details>

---

### Step 136: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Preparation of Payments: Maintain Business Partner |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

---

### Step 137: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Preparation of Payments: Maintain Business Partner |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Maintain Business Partner (BP).

</details>

**Expected Result (Test Verification):**
> The Maintain Business Partner view displays.

---

### Step 138: Select Supplier

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 108 |
| **Activity** | Preparation of Payments: Maintain Business Partner |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entry and choose Start:
Business Partner:54300001

</details>

**Expected Result (Test Verification):**
> The partner is displayed in the pane in the lower part of the view.

---

### Step 139: Select Partner

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 109 |
| **Activity** | Preparation of Payments: Maintain Business Partner |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the partner in the lower pane and double-click the business partner.

</details>

**Expected Result (Test Verification):**
> The Display Organization:54300001 view displays.

---

### Step 140: Change BP role

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 110 |
| **Activity** | Preparation of Payments: Maintain Business Partner |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter the following values:
Display in BP role: Supplier (Fin.Accounting)

</details>

**Expected Result (Test Verification):**
> The Display Organization:54300001, role Supplier (Fin. Accounting) view displays.

---

### Step 141: Edit Supplier

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 111 |
| **Activity** | Preparation of Payments: Maintain Business Partner |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Switch between Display and Change button to change the data to update.

</details>

**Expected Result (Test Verification):**
> The Business Partner Master Data can now be edited.

---

### Step 142: Company Code Data

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 112 |
| **Activity** | Preparation of Payments: Maintain Business Partner |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Company Code button.
Choose the Supplier: Account Management tab.
Make the following entries: 
Interest Indicator: 01
Choose the Supplier: Correspondence tab.

</details>

---

### Step 143: Enter Accounting Clerk

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 113 |
| **Activity** | Preparation of Payments: Maintain Business Partner |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Correspondence section, make the following entries:
Clerk Abbrev.: <Choose any available>
Clrks Internet add.: <email address>

</details>

**Expected Result (Test Verification):**
> The accounting clerk is changed.

---

### Step 144: Save

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 114 |
| **Activity** | Preparation of Payments: Maintain Business Partner |

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

### Step 145: Payment Methods

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 115 |
| **Activity** | Preparation of Payments: Maintain Business Partner |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose the Supplier: Payment Transactions tab.

</details>

---

### Step 146: Payment Methods

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 116 |
| **Activity** | Preparation of Payments: Maintain Business Partner |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Automatic Payment Transactions section, select one or more of the following Payment Methods: 
  - T

</details>

**Expected Result (Test Verification):**
> You've chosen payment methods.

---

### Step 147: Save

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 117 |
| **Activity** | Preparation of Payments: Maintain Business Partner |

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

### Step 148: Navigation

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 118 |
| **Activity** | Preparation of Payments: Maintain Business Partner |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To change or display other master data settings, change the BP role and navigate through the available tabs as follows:
Display in BP role: For example, Business Partner (Gen.) or Supplier

</details>

**Expected Result (Test Verification):**
> Settings for the selected BP role display and can be edited.

---

### Step 149: Save Supplier

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 119 |
| **Activity** | Preparation of Payments: Maintain Business Partner |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Save button after completing your changes.

</details>

**Expected Result (Test Verification):**
> The changes to Business Partner Master Data are saved.

---


## Activity 14: Preparation of Payments: Display Supplier List

> 6 steps total | 3 classifiable | 3 hidden

### Step 150: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Preparation of Payments: Display Supplier List |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
The supplier list lets you search by company code, city, country, bank key, posting block, and deletion flag. It shows suppliers with additional details like bank key, bank account, payment methods, posting block or deletion flag. You can choose a supplier from the displayed list and drill down to the fact sheet of the supplier.

#### Prerequisites
Supplier master data is maintained for the company code.

</details>

---

### Step 151: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Preparation of Payments: Display Supplier List |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

---

### Step 152: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Preparation of Payments: Display Supplier List |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Display Supplier List (F1861).

</details>

---

### Step 153: Company Code

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 120 |
| **Activity** | Preparation of Payments: Display Supplier List |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Go:
Company code: 5410
Note
If the field is not visible, choose Adapt Filters. Select the necessary filters and choose Go.

</details>

**Expected Result (Test Verification):**
> A dropdown list of suppliers for company code 5410 displays.

---

### Step 154: Supplier Number

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 121 |
| **Activity** | Preparation of Payments: Display Supplier List |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

In the Supplier column, choose a supplier number.

</details>

**Expected Result (Test Verification):**
> A dialog box displays.

---

### Step 155: Supplier Number

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 122 |
| **Activity** | Preparation of Payments: Display Supplier List |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the top of the dialog box, choose the supplier number.

</details>

**Expected Result (Test Verification):**
> The system displays a fact sheet on the supplier with information such as general information, contact numbers, minimum order value for purchasing organizations, materials, purchase order, invoices, purchase contract, activities, and evaluations.

---


## Activity 15: Preparation of Payments: Netting of AR/AP Items (Optional)

> 18 steps total | 15 classifiable | 3 hidden

### Step 156: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Preparation of Payments: Netting of AR/AP Items (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you set up a Business Partner (BP) for netting of Account Receivable (AR) and Account Payable (AP) items within one company code.
When you perform a payment run for a business partner set up for netting, the payment amount is the net amount of its open past due AR and AP items.
Note
This task is optional because the created business partner must have the supplier as a customer. Our solution content doesn't deliver any business partners created as supplier and customer, so to perform this activity, you must manually create the Business Partner master records.

#### Prerequisites
The supplier master record has been created.
The customer master record has been created.
Supplier and Customer have the same number.

</details>

---

### Step 157: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Preparation of Payments: Netting of AR/AP Items (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

---

### Step 158: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Preparation of Payments: Netting of AR/AP Items (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Maintain Business Partner (BP).

</details>

**Expected Result (Test Verification):**
> The Maintain Business Partner view displays.

---

### Step 159: Select Supplier

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 123 |
| **Activity** | Preparation of Payments: Netting of AR/AP Items (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Open BP.
Make the following entry:
Business Partner:any BP created as supplier and customer
and choose Enter.

</details>

**Expected Result (Test Verification):**
> The Display Organization:Business Partner # view displays.

---

### Step 160: Change BP role Supplier

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 124 |
| **Activity** | Preparation of Payments: Netting of AR/AP Items (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter the following values:
Display in BP role: Supplier (Fin.Accounting)

</details>

**Expected Result (Test Verification):**
> The Display Organization:Business Partner #, role Supplier (Fin.Accounting) view displays.

---

### Step 161: Edit Supplier

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 125 |
| **Activity** | Preparation of Payments: Netting of AR/AP Items (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Switch between Display and Change button to change the data to update.

</details>

**Expected Result (Test Verification):**
> The Business Partner Master Data can now be edited.

---

### Step 162: General Data

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 126 |
| **Activity** | Preparation of Payments: Netting of AR/AP Items (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Vendor: General Data tab and in General Data section make the following entry:
Customer: <Customer Number> (number is the same as the supplier).

</details>

---

### Step 163: Company Code Data

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 127 |
| **Activity** | Preparation of Payments: Netting of AR/AP Items (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose the Company Code button.

</details>

---

### Step 164: Payments Vendor

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 128 |
| **Activity** | Preparation of Payments: Netting of AR/AP Items (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose the Vendor: Payment Transactions tab.

</details>

**Expected Result (Test Verification):**
> You're on the Vendor: Payment Transactions tab.

---

### Step 165: Clearing Vendor

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 129 |
| **Activity** | Preparation of Payments: Netting of AR/AP Items (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Automatic Payment Transactions section, select:
Clearing w. customer: Selected

</details>

**Expected Result (Test Verification):**
> Clearing is activated.

---

### Step 166: Save

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 130 |
| **Activity** | Preparation of Payments: Netting of AR/AP Items (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Save and if warning is displayed, ignore it by choosing No.

</details>

**Expected Result (Test Verification):**
> Changes are saved.

---

### Step 167: Change BP role Customer

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 131 |
| **Activity** | Preparation of Payments: Netting of AR/AP Items (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter the following values:
Display in BP role: Customer (Fin.Accounting)

</details>

---

### Step 168: General Data

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 132 |
| **Activity** | Preparation of Payments: Netting of AR/AP Items (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose the Customer: General Data tab.

</details>

---

### Step 169: General Data

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 133 |
| **Activity** | Preparation of Payments: Netting of AR/AP Items (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the General Data section, make the following entries: Supplier: <supplier number>
Note
The supplier number is the same as the customer number.

</details>

---

### Step 170: Company Code

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 134 |
| **Activity** | Preparation of Payments: Netting of AR/AP Items (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose the Company Code button.

</details>

---

### Step 171: Payments Customer

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 135 |
| **Activity** | Preparation of Payments: Netting of AR/AP Items (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose the Customer: Payment Transactions tab.

</details>

**Expected Result (Test Verification):**
> You're on the Customer: Payment Transactions tab.

---

### Step 172: Clearing Customer

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 136 |
| **Activity** | Preparation of Payments: Netting of AR/AP Items (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Automatic Payment Transactions section, select:
Clearing w. Vendor: Selected

</details>

**Expected Result (Test Verification):**
> Clearing has been activated.

---

### Step 173: Save

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 137 |
| **Activity** | Preparation of Payments: Netting of AR/AP Items (Optional) |

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


## Activity 16: Preparation of Payments: Available Amounts for Payment Program (Optional)

> 8 steps total | 5 classifiable | 3 hidden

### Step 174: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Preparation of Payments: Available Amounts for Payment Program (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
The payment program checks if the chosen bank accounts have enough funds for payment. For your accounts at the house banks, you can set available amounts separately for incoming and outgoing payments. For outgoing payments, you set the maximum amount that can be paid. For incoming payments, you set the limit up to which payments can be received into a bank account. If this limit is exceeded, the program selects another bank. The available amounts you set determine which bank account makes the payment, so ensure these amounts are updated before each payment run.
The payment program doesn't split amounts. If a bank account doesn't have enough funds for a payment, the program selects another one. If it can't find a bank account with enough funds to cover the entire payment, the payment isn't made.

#### Prerequisites
Two sample bank accounts are created in the system.

</details>

---

### Step 175: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Preparation of Payments: Available Amounts for Payment Program (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Manager.

</details>

---

### Step 176: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Preparation of Payments: Available Amounts for Payment Program (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Enter Available Amounts for Payment Program (S_ALR_87001486).

</details>

**Expected Result (Test Verification):**
> The Determine Work Area: Entry dialog box displays.

---

### Step 177: Company Code

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 138 |
| **Activity** | Preparation of Payments: Available Amounts for Payment Program (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter the following and choose Continue (Enter):
Company Code: <Any company code>

</details>

**Expected Result (Test Verification):**
> The Change View “Available Amounts for Payment Program”: Overview view is displayed.

---

### Step 178: New Entries

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 139 |
| **Activity** | Preparation of Payments: Available Amounts for Payment Program (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose New Entries.

</details>

**Expected Result (Test Verification):**
> The New Entries: Overview of Added Entries view is displayed.

---

### Step 179: House Banks and Account IDs

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 140 |
| **Activity** | Preparation of Payments: Available Amounts for Payment Program (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
For each of the House Banks and Accounts IDs to be defined, enter the following and choose Save:
House Bank: <Any House Bank>
Account ID: <Any Account ID>
Days: <Any>
Currency:<Any>
Available for outgoing payment:<Any Amount>
Scheduled incoming payment: Don’t change

</details>

---

### Step 180: Delete

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 141 |
| **Activity** | Preparation of Payments: Available Amounts for Payment Program (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To delete a row, select the checkbox for the row to delete and choose Delete. In the dialog box, choose Continue.

</details>

**Expected Result (Test Verification):**
> The row is deleted.

---

### Step 181: Save

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 142 |
| **Activity** | Preparation of Payments: Available Amounts for Payment Program (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Save.

</details>

**Expected Result (Test Verification):**
> The entry is deleted and the change is saved.

---


## Activity 17: Invoice Entry without Purchase Order: Invoice Entry Without Purchase Order

> 9 steps total | 6 classifiable | 3 hidden

### Step 182: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Entry without Purchase Order: Invoice Entry Without Purchase Order |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you enter a supplier invoice without reference to a purchase order. Payment is made in local currency or you can pay invoices in foreign currency. For example, for a German company, you can pay invoices in USD, and for the U.S., you can pay invoices in EUR.
Note
By default, the system checks if the corresponding period is open for posting a supplier invoice. To deactivate the period check for material master records, perform the Disable Period Check for Material Master (Optional) step in the Appendix.
If you deactivate the period check, the system no longer performs the check for G/L account postings and postings to assets. However, the check still takes place for direct postings to the material and for invoices with purchase order reference.

</details>

---

### Step 183: Log on

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Entry without Purchase Order: Invoice Entry Without Purchase Order |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad using a personalized user.
Note
Don't use the generic Accounts Payable Accountant user. Create a personalized user based on the business role ID
SAP_BR_AP_ACCOUNTANT.

</details>

---

### Step 184: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Entry without Purchase Order: Invoice Entry Without Purchase Order |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Create Supplier Invoice (F0859).

</details>

**Expected Result (Test Verification):**
> The Manage Supplier Invoices (F0859) view displays.

---

### Step 185: Dialog Box

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 143 |
| **Activity** | Invoice Entry without Purchase Order: Invoice Entry Without Purchase Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
If the Data from Previous Invoice Entry Exist dialog box displays, choose No.

</details>

---

### Step 186: General Information

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 144 |
| **Activity** | Invoice Entry without Purchase Order: Invoice Entry Without Purchase Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Basic Data section, enter the following data:
Transaction:Invoice
Invoicing Party: <supplier>
Company Code:5410
Gross Invoice Amount:1000
Note
If the entry is tax relevant, change the amount according to the tax rate from step 6.
Currency: For example, MYR
Invoice Date:<Today's date>
Posting Date:<Today's date>
Reference:<any>

</details>

---

### Step 187: G/L Account Items

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 145 |
| **Activity** | Invoice Entry without Purchase Order: Invoice Entry Without Purchase Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the G/L Account Items section, choose Add.
Make the following entries:
Debit/Credit: Debit
G/L Account: For example,61061000
Amount1000
Item text: <any text>

</details>

---

### Step 188: Account Assignment

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 146 |
| **Activity** | Invoice Entry without Purchase Order: Invoice Entry Without Purchase Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the G/L Account Items, choose Add. Choose Show Details to expand the selection.
Make the following entries:
Cost Center:<Any cost center>
If the General Ledger account is tax relevant, in the Tax section, enter Tax Date and any other mandatory fields.
Payment section: 

Tax Date: <enter today's date>
Note
The Tax Date field is only visible in countries/regions where it is needed.

</details>

---

### Step 189: Post

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 147 |
| **Activity** | Invoice Entry without Purchase Order: Invoice Entry Without Purchase Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Post.
Note
The supplier invoice number generated is a logistics document number. To find or review the finance document number (Journal Entry), see the Invoice Payment Preparation  View Supplier Line Items task.

</details>

**Expected Result (Test Verification):**
> The Success dialog box displays, showing the document numbers created.

---

### Step 190: Exit

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 148 |
| **Activity** | Invoice Entry without Purchase Order: Invoice Entry Without Purchase Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

---


## Activity 18: Invoice Entry without Purchase Order: Invoice Entry for One-Time Supplier without Purchase Order

> 12 steps total | 9 classifiable | 3 hidden

### Step 191: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Entry without Purchase Order: Invoice Entry for One-Time Supplier without Purchase Order |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you create an invoice without purchase order for a one time supplier.

#### Prerequisites
Business partner master data for a one-time supplier already exists.
The payment method for a one-time supplier is maintained in business partner master data.

</details>

---

### Step 192: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Entry without Purchase Order: Invoice Entry for One-Time Supplier without Purchase Order |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

---

### Step 193: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Entry without Purchase Order: Invoice Entry for One-Time Supplier without Purchase Order |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Create Supplier Invoice - Advanced (MIRO).

</details>

---

### Step 194: Navigation

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 149 |
| **Activity** | Invoice Entry without Purchase Order: Invoice Entry for One-Time Supplier without Purchase Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
If the system prompts you, make the following entries and choose Continue:
Company Code: 5410

</details>

**Expected Result (Test Verification):**
> The Enter Incoming Invoice  screen is displayed.

---

### Step 195: Basic Data

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 150 |
| **Activity** | Invoice Entry without Purchase Order: Invoice Entry for One-Time Supplier without Purchase Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Basic Data tab, enter the following data:
Invoice Date: Today's date
Posting Date: Today's date
Reference: any
Amount: 1000
Currency: MYR
Calculate Tax: Selected
Tax Code: <Input Tax Code>
Note
If you enter a G/L account that is subject to tax, ensure that you enter an appropriate tax code.

</details>

---

### Step 196: Payment

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 151 |
| **Activity** | Invoice Entry without Purchase Order: Invoice Entry for One-Time Supplier without Purchase Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Payment tab, enter the following data:
BaselineDt: Today's date
Pyt Terms: 0001

</details>

---

### Step 197: Details

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 152 |
| **Activity** | Invoice Entry without Purchase Order: Invoice Entry for One-Time Supplier without Purchase Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Details tab, enter the following data:
Inv. Party: 54300273

</details>

---

### Step 198: G/L Account Items

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 153 |
| **Activity** | Invoice Entry without Purchase Order: Invoice Entry for One-Time Supplier without Purchase Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the G/L Account section, make the following entries and press Enter:
G/L Account: 65100000
Amount in doc.curr.: 1000
Cost Center: 54101201

</details>

---

### Step 199: Post

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 154 |
| **Activity** | Invoice Entry without Purchase Order: Invoice Entry for One-Time Supplier without Purchase Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose the Post button.

</details>

**Expected Result (Test Verification):**
> The Address and Bank Data dialog box is displayed.

---

### Step 200: Address and Bank Data

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 155 |
| **Activity** | Invoice Entry without Purchase Order: Invoice Entry for One-Time Supplier without Purchase Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter the address and bank information and choose Continue:
Name: <customer name>
City: <city>
Street: any
PO Box : <post box number>
PO Box Postal Code : <postal code>
Note
For your country, the field validations for the address data may be different. Keep this in mind when entering address data.

Tax Number 3: <any value>
Tax Number 4: <any value>
Tax Number 5: <any value>

</details>

**Expected Result (Test Verification):**
> The Information dialog box displays the new document number.

---

### Step 201: TIN and Phone Number

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 156 |
| **Activity** | Invoice Entry without Purchase Order: Invoice Entry for One-Time Supplier without Purchase Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Menu  Extras  Document Texts. 
Make the following entries:
MY: Customer/Vendor TIN
MY: Customer/Vendor Telephone

</details>

---

### Step 202: Exit

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 157 |
| **Activity** | Invoice Entry without Purchase Order: Invoice Entry for One-Time Supplier without Purchase Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Exit.

</details>

---


## Activity 19: Park and Post Invoice: Park Invoice

> 11 steps total | 5 classifiable | 6 hidden

### Step 203: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Park and Post Invoice: Park Invoice |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, an invoice is parked.

#### Prerequisites
A personalized business userhas been created based on the business role ID: SAP_BR_AP_ACCOUNTANT
Assign the following business catalog to your personalized business user:

</details>

---

### Step 204: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Park and Post Invoice: Park Invoice |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad using a personalized user.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 205: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Park and Post Invoice: Park Invoice |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Create Supplier Invoice (F0859).

</details>

**Expected Result (Test Verification):**
> The Manage Supplier Invoices (F0859) view displays.

---

### Step 206: Park

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 158 |
| **Activity** | Park and Post Invoice: Park Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Follow the steps described in previous Invoice Entry without Purchase Order procedure, except at test step  Post, choose the Park button.
Tip
When using approval workflow with this procedure, the Consumable Purchasing (BNX) test script provides additional information and procedures that you must execute. Follow the preliminary steps described in Activate Flexible Workflow for Supplier Invoice and then use the Create Supplier Invoice procedure for reference.

</details>

**Expected Result (Test Verification):**
> The document is parked.

---

### Step 207: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Park and Post Invoice: Park Invoice |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
### Create new business catalog and assign to business user (OPTIONAL)
The following procedure is optional if all prerequisites are met.

</details>

---

### Step 208: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Park and Post Invoice: Park Invoice |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Administrator.

</details>

---

### Step 209: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Park and Post Invoice: Park Invoice |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Maintain Business Roles (F1492).

</details>

---

### Step 210: New

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 159 |
| **Activity** | Park and Post Invoice: Park Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose New. 
In the New Business Role dialog box, make the following entries and choose Create:
Business Role Description: Accounts Payable Park
Business Role ID: AP_PARK
 Choose Assigned Business Catalogs, and choose Add. Select the following entries and choose OK:
Business Catalog: Accounts Payable - Supplier Invoice Parking
Business Catalog ID: SAP_MM_BC_INV_PARK_PC

Choose Maintain Restrictions.
Choose Write, Read, Value Help.
In the dropdown, select Unrestricted.
Choose Read, Value Help.
In the dropdown, select Unrestricted.
Choose Back.

</details>

---

### Step 211: Save

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 160 |
| **Activity** | Park and Post Invoice: Park Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Save.

</details>

---

### Step 212: Assign

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 161 |
| **Activity** | Park and Post Invoice: Park Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Edit.
Choose Assigned Business Users and choose Add, then select your personalized <User Name> and choose Ok.

</details>

---

### Step 213: Save

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 162 |
| **Activity** | Park and Post Invoice: Park Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Save.

</details>

---


## Activity 20: Park and Post Invoice: Post Invoice

> 14 steps total | 8 classifiable | 6 hidden

### Step 214: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Park and Post Invoice: Post Invoice |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, an invoice is posted.

#### Prerequisites
Create a personalized business userbased on the business role ID: SAP_BR_AP_ACCOUNTANT
Assign the following business catalogto the personalized business user:
Business CatalogBusiness Catalog ID
 | Accounts Payable - Supplier Invoices
 | SAP_MM_BC_INV_PROCESS_PC

An invoice has been parked.

#### Instructions
### Procedure: Post Invoice

</details>

---

### Step 215: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Park and Post Invoice: Post Invoice |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad using a personalized user.

</details>

---

### Step 216: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Park and Post Invoice: Post Invoice |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Supplier Invoices List (F1060A).

</details>

**Expected Result (Test Verification):**
> The Supplier Invoices List (Version 2) (F1060A) view displays.

---

### Step 217: Search

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 163 |
| **Activity** | Park and Post Invoice: Post Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Go or enter a selection criteria before executing the search, for example:
Invoicing Party: <any>
Status: Parked
Company Code: <any>

</details>

**Expected Result (Test Verification):**
> List of invoices display.

---

### Step 218: Select

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 164 |
| **Activity** | Park and Post Invoice: Post Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose any document with status Parked by selecting the row.

</details>

**Expected Result (Test Verification):**
> The Supplier Invoice view displays.

---

### Step 219: Edit

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 165 |
| **Activity** | Park and Post Invoice: Post Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Edit to change any available fields as needed.

</details>

---

### Step 220: Post

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 166 |
| **Activity** | Park and Post Invoice: Post Invoice |

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

### Step 221: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Park and Post Invoice: Post Invoice |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
### Create new business catalog and assign to business user (OPTIONAL)
The following procedure is optional if all prerequisites are met.

</details>

---

### Step 222: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Park and Post Invoice: Post Invoice |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Administrator.

</details>

---

### Step 223: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Park and Post Invoice: Post Invoice |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Maintain Business Roles (F1492).

</details>

---

### Step 224: New

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 167 |
| **Activity** | Park and Post Invoice: Post Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose New and make the following entries:
Business Role Description: Accounts Payable Post
Business Role ID: AP_POST
 Choose Assigned Business Catalogs and choose Add . Select the following entries and then choose Ok:
Business Catalog: Accounts Payable - Supplier Invoices
Business Catalog ID: SAP_MM_BC_INV_PROCESS_PC
Choose Maintain Restrictions.
Choose Write, Read, Value Help.
In the dropdown, select Unrestricted.
Choose Read, Value Help.
In the dropdown, select Unrestricted.
Choose Back.

</details>

---

### Step 225: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 168 |
| **Activity** | Park and Post Invoice: Post Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Save.

</details>

---

### Step 226: Assign

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 169 |
| **Activity** | Park and Post Invoice: Post Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Edit.
Choose Assigned Business Users, and choose Add, then select your personalized User Name and choose OK.

</details>

---

### Step 227: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 170 |
| **Activity** | Park and Post Invoice: Post Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Save.

</details>

---


## Activity 21: Recurring Supplier Invoices: Create Recurring Supplier Invoice

> 13 steps total | 10 classifiable | 3 hidden

### Step 228: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Recurring Supplier Invoices: Create Recurring Supplier Invoice |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you create a recurring invoice, which is a type of invoicing where a supplier or merchant automatically charges a customer for goods or services at regular intervals.
Note
By default, the system checks if the corresponding period is open for posting a supplier invoice. To deactivate the period check for material master records, perform the Disable Period Check for Material Master (Optional) step in the Appendix.
If you deactivate the period check, the system no longer performs the check for G/L account postings and postings to assets. However, the check still takes place for direct postings to the material and for invoices with purchase order reference.

#### Prerequisites
You executed procedures to create a recurring supplier invoice.
Business conditions are met.
Posting periods are open.

</details>

---

### Step 229: Log on

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Recurring Supplier Invoices: Create Recurring Supplier Invoice |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

---

### Step 230: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Recurring Supplier Invoices: Create Recurring Supplier Invoice |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Recurring Supplier Invoices (F4312).

</details>

**Expected Result (Test Verification):**
> The Manage Recurring Supplier Invoices (F4312) view is displayed.

---

### Step 231: Create

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 171 |
| **Activity** | Recurring Supplier Invoices: Create Recurring Supplier Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Create.

</details>

---

### Step 232: General Information

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 172 |
| **Activity** | Recurring Supplier Invoices: Create Recurring Supplier Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Basic Data section, enter the following data:
Document Type:KR
Company Code:5410
Gross Invoice Amount:<gross invoice amount>
Note
 If entry is tax relevant change the amount according to the tax rate from step 6.
Currency: For example, MYR
Reference:<any>
Invoicing Party: 54300001
Recurrence Start Date:<Today’s date>
Currency conversion Rule: For example, Use current exchange rate

</details>

---

### Step 233: G/L Account Items

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 173 |
| **Activity** | Recurring Supplier Invoices: Create Recurring Supplier Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the G/L Account Item section, choose Create and make the following entries:
Debit/Credit: Debit
G/L Account: <account>, for example, 61400000
Item Amount: 100

</details>

---

### Step 234: More Details

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 174 |
| **Activity** | Recurring Supplier Invoices: Create Recurring Supplier Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the G/L Account Items section, choose > to display more details.
Make the following entries and choose Apply:
Tax Code: <Input Tax Code>
Cost Center:<Any cost center>

</details>

---

### Step 235: Payment

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 175 |
| **Activity** | Recurring Supplier Invoices: Create Recurring Supplier Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Payment section, make the following entries:
Terms of Payment: 0001

</details>

---

### Step 236: Recurrence

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 176 |
| **Activity** | Recurring Supplier Invoices: Create Recurring Supplier Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Recurrence section, make the following entries:
Recurrence Pattern: For example, Monthly
Interval in Months:1
Occur Day in a Month:1st
End Recurrence By:End date
End Date:<Today’s date + 3 months>

</details>

---

### Step 237: Create

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 177 |
| **Activity** | Recurring Supplier Invoices: Create Recurring Supplier Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Create.

</details>

**Expected Result (Test Verification):**
> The Manage Recurring Supplier Invoices view is displayed.A Posting Forecast is displayed in the Postings section.

---

### Step 238: Execute

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 178 |
| **Activity** | Recurring Supplier Invoices: Create Recurring Supplier Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Execute. Make the following entries:
Up to Date:<End of Month date>
Note
The supplier invoice number generated is a logistics document number. To find or review the finance document number (Journal Entry), see the View Supplier Line Items task.

</details>

**Expected Result (Test Verification):**
> The Execute Recurrent Posting dialog box is displayed.

---

### Step 239: Execute Until Date

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 179 |
| **Activity** | Recurring Supplier Invoices: Create Recurring Supplier Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Execute:
Up to date: <end of month date>

</details>

---

### Step 240: Copy

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 180 |
| **Activity** | Recurring Supplier Invoices: Create Recurring Supplier Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Once you create and post the recurring supplier invoice, you can copy it. 
Return to the initial view of this app. Select a posted recurring document and choose Copy. Modify any fields in the copied invoice and choose Create.

</details>

**Expected Result (Test Verification):**
> You created a new recurring supplier invoice.

---


## Activity 22: Recurring Supplier Invoices: Review Recurring Supplier Invoice

> 8 steps total | 5 classifiable | 3 hidden

### Step 241: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Recurring Supplier Invoices: Review Recurring Supplier Invoice |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you can review, edit, and execute an existing recurring supplier invoice.

#### Prerequisites
You created a recurring supplier invoice.
Business Conditions are met. Posting periods are open.
Note
By default, the system checks if the corresponding period is open for posting a supplier invoice. To deactivate the period check for material master records, perform the Disable Period Check for Material Master (Optional) step in the Appendix.
If you deactivate the period check, the system no longer performs the check for G/L account postings and postings to assets. However, the check still takes place for direct postings to the material and for invoices with purchase order reference.

</details>

---

### Step 242: Log on

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Recurring Supplier Invoices: Review Recurring Supplier Invoice |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

---

### Step 243: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Recurring Supplier Invoices: Review Recurring Supplier Invoice |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Recurring Supplier Invoices (F4312).

</details>

**Expected Result (Test Verification):**
> The Manage Recurring Supplier Invoice view is displayed.

---

### Step 244: Search

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 181 |
| **Activity** | Recurring Supplier Invoices: Review Recurring Supplier Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the search criteria fields, make the following entries and choose Go:
Company Code: 5410
Invoicing Party: 54300001

</details>

**Expected Result (Test Verification):**
> A list of recurring supplier invoices is displayed according to your search criteria. The Posting Status column shows how many recurring invoices have been posted.

---

### Step 245: Execute

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 182 |
| **Activity** | Recurring Supplier Invoices: Review Recurring Supplier Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
For unposted invoices, select the checkbox for a document and choose Execute.

</details>

**Expected Result (Test Verification):**
> A dialog box is displayed.

---

### Step 246: Enter Data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 183 |
| **Activity** | Recurring Supplier Invoices: Review Recurring Supplier Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Execute:
Up to Date: <End of Month date>Note
A dialog box may appear after execution. Review the message and close the dialog box.

</details>

**Expected Result (Test Verification):**
> A document number is generated.

---

### Step 247: Details

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 184 |
| **Activity** | Recurring Supplier Invoices: Review Recurring Supplier Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Select a document and choose Navigation (>).

</details>

---

### Step 248: Edit

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 185 |
| **Activity** | Recurring Supplier Invoices: Review Recurring Supplier Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Edit to make changes to unposted documents. For posted documents, you can only edit the end date or recurrence.
Once you are done with your changes, choose Save.

</details>

---


## Activity 23: Recurring Supplier Invoices: Schedule Recurring Supplier Invoice Posting

> 9 steps total | 6 classifiable | 3 hidden

### Step 249: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Recurring Supplier Invoices: Schedule Recurring Supplier Invoice Posting |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you schedule a background job for a recurring supplier invoice.

#### Prerequisites
You've created a recurring supplier invoice.
Business Conditions are met. Posting periods are open.
Note
By default, the system checks if the corresponding period is open for posting a supplier invoice. To deactivate the period check for material master records, perform the Disable Period Check for Material Master (Optional) step in the Appendix.
If you deactivate the period check, the system no longer performs the check for G/L account postings and postings to assets. However, the check still takes place for direct postings to the material and for invoices with purchase order reference.

</details>

---

### Step 250: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Recurring Supplier Invoices: Schedule Recurring Supplier Invoice Posting |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

---

### Step 251: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Recurring Supplier Invoices: Schedule Recurring Supplier Invoice Posting |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Schedule Accounts Payable Jobs (F2257).

</details>

**Expected Result (Test Verification):**
> The Application Jobs view is displayed.

---

### Step 252: Create Job

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 186 |
| **Activity** | Recurring Supplier Invoices: Schedule Recurring Supplier Invoice Posting |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Create.

</details>

---

### Step 253: Template Selection

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 187 |
| **Activity** | Recurring Supplier Invoices: Schedule Recurring Supplier Invoice Posting |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Step 2:
Job Template: Schedule Automatic Posting for Recurring Supplier Invoice
Job Name: Schedule Automatic Posting for Recurring Supplier Invoice

</details>

---

### Step 254: Scheduling Options

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 188 |
| **Activity** | Recurring Supplier Invoices: Schedule Recurring Supplier Invoice Posting |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Step 3:
Start Immediately: Select
Recurrence Pattern: Single Run
Note
Choose Define Recurrence Pattern to schedule a regular pattern run. Depending on the chosen pattern, different options become available to populate.

</details>

---

### Step 255: Parameters

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 189 |
| **Activity** | Recurring Supplier Invoices: Schedule Recurring Supplier Invoice Posting |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the General Selection section, make the following entries:
Company Code: 5410
Document Number: <document number>
Note
Add any other entry to fine-tune the selection.
In the Posting Parameters section, make the following entries:
Due Date (Job Run Date /- X Days): <any number>

</details>

---

### Step 256: Check

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 190 |
| **Activity** | Recurring Supplier Invoices: Schedule Recurring Supplier Invoice Posting |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Check to verify that entries are complete and correct.

</details>

---

### Step 257: Schedule

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 191 |
| **Activity** | Recurring Supplier Invoices: Schedule Recurring Supplier Invoice Posting |

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


## Activity 24: Mass Upload: Mass Import for Supplier Invoices

> 11 steps total | 8 classifiable | 3 hidden

### Step 258: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Mass Upload: Mass Import for Supplier Invoices |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This app is used when there are a large number of invoices arriving for the company, such as:
  - Recurring invoices

  - Posting of regular acquisitions

  - Posting of travel expenses

Note
By default, the system checks if the corresponding period is open for posting a supplier invoice. To deactivate the period check for material master records, perform the Disable Period Check for Material Master (Optional) step in the Appendix. 
If you deactivate the period check, the system no longer performs the check for G/L account postings and postings to assets. However, the check still takes place for direct postings to the material and for invoices with purchase order reference.

#### Prerequisites
Create an electronic spreadsheet with the invoice details to be uploaded (with a maximum of 500 items in a single file).
Business Partner (BP) master data exists.

</details>

---

### Step 259: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Mass Upload: Mass Import for Supplier Invoices |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant .

</details>

---

### Step 260: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Mass Upload: Mass Import for Supplier Invoices |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Import Supplier Invoices (F3041)

</details>

**Expected Result (Test Verification):**
> The Import Supplier Invoices (F3041) view displays.

---

### Step 261: Download

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 192 |
| **Activity** | Mass Upload: Mass Import for Supplier Invoices |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
For Destination, select Local. 
Choose Download (Download Template) to download the spreadsheet template and choose:
Template Language: For example, English
Format: For example, *.xlsx, for MS Excel Workbook
Choose Download to continue.

</details>

---

### Step 262: Enter Details

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 193 |
| **Activity** | Mass Upload: Mass Import for Supplier Invoices |

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
Invoice ID: For example, 12345001
Company Code (4): 5410
Transaction (1): 1
Invoicing Party (10): 54300001
Reference (16): <any text with maximum number of 16 characters>
Document Date: <Today's date MM/DD/YYYY>
Posting Date: <Today's date MM/DD/YYYY>
Document Type (2): KR
Document Header Text (25): <any text with maximum number of 25 characters>
Currency: MYR
Gross Invoice Amount in Document Currency: 1190
Date for Determining Tax Rates: <tax calculation dates> (Optional: Depends on country/region setting)
G/L Account Items section
Account (10): For example, 63001000
Item Text (50): <any text with maximum number of 50 characters>
Debit/Credit (1) S=Debit, H=Credit: S
Amount in Document Currency: For example, 1000Note
The Gross Invoice Amount in Document Currency field may have a different value, depending on, where applicable, the chosen Tax Code. 

Tax Code (2): <Input Tax Code>
Cost Center (10): 54101201

</details>

---

### Step 263: Upload

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 194 |
| **Activity** | Mass Upload: Mass Import for Supplier Invoices |

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

### Step 264: Check

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 195 |
| **Activity** | Mass Upload: Mass Import for Supplier Invoices |

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

### Step 265: Review the Log

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 196 |
| **Activity** | Mass Upload: Mass Import for Supplier Invoices |

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

### Step 266: Correct any Errors

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 197 |
| **Activity** | Mass Upload: Mass Import for Supplier Invoices |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Select the item to review and correct any errors.

</details>

**Expected Result (Test Verification):**
> Supplier invoice application is displayed showing details of uploaded item.The Draft Status column changes to a green flag icon after correcting the error and returning to the worklist.

---

### Step 267: Correct any Errors in Supplier Invoice Application

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 198 |
| **Activity** | Mass Upload: Mass Import for Supplier Invoices |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
If the supplier invoice application reveals any errors, correct those errors and return to the worklist.

</details>

---

### Step 268: Post

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 199 |
| **Activity** | Mass Upload: Mass Import for Supplier Invoices |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the checkboxes for the documents to post and choose Post. Tip
To use approval workflow with this app, the Consumable Purchasing (BNX) test script provides additional information and procedures that must be executed. Follow the preliminary step described in Activate Flexible Workflow for Supplier Invoice and then use the Create Supplier Invoice procedure for reference.

</details>

**Expected Result (Test Verification):**
> Items are posted.

---


## Activity 25: Invoice Payment Preparation: View Supplier Line Items

> 8 steps total | 5 classifiable | 3 hidden

### Step 269: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Payment Preparation: View Supplier Line Items |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, all Accounts Payable (AP) line items are listed and you can modify some fields of a document to be paid.

#### Prerequisites
AP invoices are available in the system.

</details>

---

### Step 270: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Payment Preparation: View Supplier Line Items |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

---

### Step 271: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Payment Preparation: View Supplier Line Items |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Supplier Line Items (F0712).

</details>

**Expected Result (Test Verification):**
> The Manage Supplier Line Items (F0712) view displays.

---

### Step 272: Data Entry and Search

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 200 |
| **Activity** | Invoice Payment Preparation: View Supplier Line Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Go: 
Supplier: <any>
Company Code: 5410
Status: Open Items
Open on Key Date: <Today's date>
Item Type: Normal Items
Note
As an option, choose the Gear (Settings) button to add columns to the Items table when the Administrator has added new fields. For more information, see the Add Fields to Items (Optional) preliminary step.
If you add columns to the table, you can save the view as a variant. Additionally, you can use the additional fields as filters in Adapt Filters.

</details>

**Expected Result (Test Verification):**
> Supplier line items are displayed according to your search criteria.

---

### Step 273: Item details

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 201 |
| **Activity** | Invoice Payment Preparation: View Supplier Line Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select a journal entry and choose Manage Journal Etry.

</details>

**Expected Result (Test Verification):**
> Document details are displayed.

---

### Step 274: Edit

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 202 |
| **Activity** | Invoice Payment Preparation: View Supplier Line Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose the Edit button.

</details>

---

### Step 275: Edit Line Items

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 203 |
| **Activity** | Invoice Payment Preparation: View Supplier Line Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select a line item (for example, Posting View Item 000001) and change one or more of the following, as needed:
  - Item Text 
  - Payment Method 
  - House bank 
  - House Bank Account 
  - Baseline Date 
  - Payment Terms
  - And so on

</details>

---

### Step 276: Save

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 204 |
| **Activity** | Invoice Payment Preparation: View Supplier Line Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Save.
Choose Back.

</details>

**Expected Result (Test Verification):**
> Your changes are saved and maintained.

---


## Activity 26: Invoice Payment Preparation: Manage Payment Blocks

> 11 steps total | 8 classifiable | 3 hidden

### Step 277: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Payment Preparation: Manage Payment Blocks |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This activity reviews and releases blocked invoices as part of the logistics invoice verification process. You can block on the supplier level or open item level.
When an invoice is blocked, Financial Accounting can't pay the invoice. Invoices can be blocked either automatically or manually depending on the payment block reason and release in the configuration.

#### Prerequisites
A vendor invoice was blocked for payment either automatically when invoice was created or manually by editing the supplier line items using the Manage Supplier Line Items(F0712)SAP Fiori app.

</details>

---

### Step 278: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Payment Preparation: Manage Payment Blocks |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

---

### Step 279: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Payment Preparation: Manage Payment Blocks |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Payment Blocks (F0593A).

</details>

**Expected Result (Test Verification):**
> The Manage Payment Blocks V2 (F0593A) view displays.

---

### Step 280: Search

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 205 |
| **Activity** | Invoice Payment Preparation: Manage Payment Blocks |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Go:
Company Code: <company code>

</details>

**Expected Result (Test Verification):**
> A list of suppliers is displayed.

---

### Step 281: Select Supplier

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 206 |
| **Activity** | Invoice Payment Preparation: Manage Payment Blocks |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

For one of the suppliers, choose Details (>).

</details>

**Expected Result (Test Verification):**
> The right pane displays supplier details.

---

### Step 282: Block Supplier

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 207 |
| **Activity** | Invoice Payment Preparation: Manage Payment Blocks |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Block Supplier.

</details>

**Expected Result (Test Verification):**
> The Block Supplier dialog box is displayed.

---

### Step 283: Enter Details

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 208 |
| **Activity** | Invoice Payment Preparation: Manage Payment Blocks |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose OK:
Payment Block Reason: <reason for blocking>
Note: <explanatory text for the blocking reason>

</details>

**Expected Result (Test Verification):**
> The Status field changes to Account Blocked.

---

### Step 284: Unblock Supplier

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 209 |
| **Activity** | Invoice Payment Preparation: Manage Payment Blocks |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Unblock Supplier.

</details>

**Expected Result (Test Verification):**
> The Status field changes to Unblocked.

---

### Step 285: Select Item

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 210 |
| **Activity** | Invoice Payment Preparation: Manage Payment Blocks |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Open Items area, select an open item's checkbox and choose the Block Items button.
Note
You can also choose the Details (>) button at the end of the row and then choose the Block Items button in the new right pane.

</details>

**Expected Result (Test Verification):**
> The Block Items dialog box is displayed.

---

### Step 286: Block Item

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 211 |
| **Activity** | Invoice Payment Preparation: Manage Payment Blocks |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose OK:
Payment Block Reason: <reason for blocking>
Note: <explanatory text for the blocking reason>

</details>

**Expected Result (Test Verification):**
> The Status field changes to Item Blocked.

---

### Step 287: Unblock Item

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 212 |
| **Activity** | Invoice Payment Preparation: Manage Payment Blocks |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Open Items area, select an open item's checkbox and choose the Unblock Items button.
Note
You can also choose the Details (>) button at the end of the row and then choose the Unblock Items button in the new right pane.

</details>

**Expected Result (Test Verification):**
> The Status field changes to Unblocked.

---


## Activity 27: Invoice Payment Preparation: View Supplier Balance

> 6 steps total | 3 classifiable | 3 hidden

### Step 288: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Payment Preparation: View Supplier Balance |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you display the supplier balances.

</details>

---

### Step 289: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Payment Preparation: View Supplier Balance |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

---

### Step 290: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Payment Preparation: View Supplier Balance |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Display Supplier Balances (F0701A).

</details>

**Expected Result (Test Verification):**
> The Display Supplier Balances (Version 2) (F0701A) view is displayed.

---

### Step 291: Data Entry and Search

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 213 |
| **Activity** | Invoice Payment Preparation: View Supplier Balance |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Go:
Supplier: <Supplier>
Company Code: 5410(mandatory)
Fiscal Year: <Current Year>

</details>

**Expected Result (Test Verification):**
> Balances are displayed per period for your supplier.

---

### Step 292: View Balances

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 214 |
| **Activity** | Invoice Payment Preparation: View Supplier Balance |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose any of the following tabs to see different views of the supplier balance:
  - Balances

  - Special G/L

  - Compare

</details>

**Expected Result (Test Verification):**
> Different views of supplier balances are displayed.

---

### Step 293: View Period

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 215 |
| **Activity** | Invoice Payment Preparation: View Supplier Balance |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In any row, select an existing amount in the Debit, Credit, or Balance column.

</details>

**Expected Result (Test Verification):**
> The Manage Supplier Line Items view is displayed.

---


## Activity 28: Payment Run

> 1 steps total | 0 classifiable | 1 hidden

### Step 294: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Payment Run |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

---


## Activity 29: Schedule Payment Proposals

> 12 steps total | 9 classifiable | 3 hidden

### Step 295: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Schedule Payment Proposals |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This activity selects the invoices to be paid.

#### Prerequisites
The Define Payment Medium Format Variants (Optional) procedure in the Prerequisites section has been executed.
Review and execute (if necessary), the Available Amounts for Payment Program (Optional) procedure.
The BRF+ Settings procedures, described in the Preliminary Stepstopic, under Prerequisitesare executed. 
Invoices are posted, past due and are open for payment. For more information, see the Business Conditionssection of this document.
Invoices are past due. 
Use Invoice Payment Preparation procedures to change the payment terms or due date of an invoice so it can be paid. 
All steps for the procedures in the Invoice Payment Preparation section must be executed.

</details>

---

### Step 296: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Schedule Payment Proposals |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

---

### Step 297: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Schedule Payment Proposals |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Automatic Payments (F0770).

</details>

**Expected Result (Test Verification):**
> The Manage Automatic Payments (F0770) view displays.

---

### Step 298: Create View

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 216 |
| **Activity** | Schedule Payment Proposals |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Create Parameter.

</details>

**Expected Result (Test Verification):**
> The New Parameter dialog box is displayed.

---

### Step 299: Data Entry

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 217 |
| **Activity** | Schedule Payment Proposals |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Create Parameter:
Run Date: <today's date>
Identification: <any five character description, such as SPAY1>

</details>

**Expected Result (Test Verification):**
> The Automatic Payment Parameters view is displayed.

---

### Step 300: Data Entry

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 218 |
| **Activity** | Schedule Payment Proposals |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries: 
Basic section:
Posting Date: <today's date>
Docs entered up to: <today's date>
Additional Log: ONPayment Controls section:
Company Code: 5410
Next payment date: <today's date + 5 days>
Tip
This is only recommended for testing purposes.
If an invoice isn't overdue, but needs to be included in the payment run, choose a date that is after the invoice's due date.

Payment method: for example, T
Open Item Selection section:
Supplier: <supplier>
Note
For the Payment Method field, verify that the payment method is valid in the supplier master record.
If it is necessary to post a down payment request, add a Free Selection and then enter the following:
Special G/L ind. (BSEG-UMSKZ): F

</details>

---

### Step 301: Single Invoice (Optional)

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 219 |
| **Activity** | Schedule Payment Proposals |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To execute a payment for a single invoice, make the following entries in the Open Item Selection by populating any of the Free Selection # fields available:
Document Number (BKPF-BELNR): <Document Number>

</details>

---

### Step 302: Save the Parameters

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 220 |
| **Activity** | Schedule Payment Proposals |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Save.

</details>

**Expected Result (Test Verification):**
> The system displays the message Parameter has been saved. The status changes to Parameter Created.

---

### Step 303: Schedule Proposal

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 221 |
| **Activity** | Schedule Payment Proposals |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Schedule  Proposal.

</details>

**Expected Result (Test Verification):**
> The Schedule Proposal dialog box is displayed.

---

### Step 304: Data Entry

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 222 |
| **Activity** | Schedule Payment Proposals |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Schedule: 
Start Date: today's date
Start immediately: Select

</details>

**Expected Result (Test Verification):**
> The system displays the message Proposal has been scheduled.
> The status changes to Proposal Created.

---

### Step 305: View the Proposal

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 223 |
| **Activity** | Schedule Payment Proposals |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose the Proposal Processed tab.

</details>

---

### Step 306: Display

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 224 |
| **Activity** | Schedule Payment Proposals |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose the Go button.

</details>

**Expected Result (Test Verification):**
> The proposal is displayed in the list.

---


## Activity 30: Revise Payment Proposal

> 9 steps total | 6 classifiable | 3 hidden

### Step 307: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Revise Payment Proposal |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you review invoices to be paid.
Caution
Make sure that there are no other Payment Run Identification Proposalspending to be executed which might be using the same supplier as proposal created in previous step. If payment proposals exist, they must be processed or deleted, otherwise no payment proposal is generated for your proposal.

</details>

---

### Step 308: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Revise Payment Proposal |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

---

### Step 309: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Revise Payment Proposal |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open the Revise Payment Proposals (F0771) app.

</details>

**Expected Result (Test Verification):**
> The Revise Payment Proposals screen is displayed.

---

### Step 310: Go

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 225 |
| **Activity** | Revise Payment Proposal |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

**Expected Result (Test Verification):**
> A list of all proposals is displayed.

---

### Step 311: Select Identification

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 226 |
| **Activity** | Revise Payment Proposal |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Details (>) for the proposal you want to edit (for example, SPAY1 ).

</details>

**Expected Result (Test Verification):**
> The view Schedule Payment Proposal of the selected Identification is displayed.

---

### Step 312: Edit Payment (Optional)

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 227 |
| **Activity** | Revise Payment Proposal |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Payments tab, select the rows to edit, and choose Edit Payment.

</details>

**Expected Result (Test Verification):**
> The Edit Payment dialog box is displayed.

---

### Step 313: Make Entries (Optional)

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 228 |
| **Activity** | Revise Payment Proposal |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Change desired options and choose OK to continue.
Payment method: <payment method>
House Bank: <house bank>
Account ID: <account>
Payee Bank: <payee bank>
Due Date: <date>

</details>

---

### Step 314: Payment List

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 229 |
| **Activity** | Revise Payment Proposal |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Export to PDF.

</details>

**Expected Result (Test Verification):**
> A new view displays the payment list. You can download or print the form from here.

---

### Step 315: Exceptions

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 230 |
| **Activity** | Revise Payment Proposal |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
If some payments are blocked, you can find them on the Exceptions tab. You may unblock or reallocate and pay them by using the buttons in the view.

</details>

---


## Activity 31: Release Payment Proposal

> 15 steps total | 12 classifiable | 3 hidden

### Step 316: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Release Payment Proposal |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This activity describes how to release the payment proposal.

</details>

---

### Step 317: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Release Payment Proposal |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

---

### Step 318: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Release Payment Proposal |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open the Manage Automatic Payments (F0770) app.

</details>

**Expected Result (Test Verification):**
> The Manage Automatic Payments screen is displayed.

---

### Step 319: Go

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 231 |
| **Activity** | Release Payment Proposal |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

**Expected Result (Test Verification):**
> A list of all payment runs is displayed.

---

### Step 320: Proposal Processing

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 232 |
| **Activity** | Release Payment Proposal |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose the Proposal Processed tab.

</details>

---

### Step 321: Select Proposal

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 233 |
| **Activity** | Release Payment Proposal |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the line of the previously created proposal (for example, SPAY1 ) and choose Schedule Payment.

</details>

**Expected Result (Test Verification):**
> The Schedule Payment dialog box is displayed.

---

### Step 322: Schedule Payment

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 234 |
| **Activity** | Release Payment Proposal |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries:
Start Date:<Today's date>
Start immediately: Select
 and choose Schedule.

</details>

**Expected Result (Test Verification):**
> The system message Payment has been scheduled is displayed. The status changes to Payment Posted. The log shows how many postings or payments were generated.

---

### Step 323: View the payment

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 235 |
| **Activity** | Release Payment Proposal |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose the Payments Processed tab.

</details>

**Expected Result (Test Verification):**
> The status changes to Payment posted.
> Note
> If the status is Payment finished, review if the chosen documents can be paid (execute the steps starting with the Payment and Exceptions header.

---

### Step 324: View Log postings

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 236 |
| **Activity** | Release Payment Proposal |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the line of your payment run Identification and in the Log column, choose Log Details.
Note
If the Log column doesn't show, choose the Settings button. Select the Log field and choose OK.

</details>

**Expected Result (Test Verification):**
> The log shows how many postings were generated.

---

### Step 325: Close Dialog

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 237 |
| **Activity** | Release Payment Proposal |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

**Expected Result (Test Verification):**
> The Log Details dialog box closes.

---

### Step 326: Payments and Exceptions

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 238 |
| **Activity** | Release Payment Proposal |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Details (>) .

</details>

**Expected Result (Test Verification):**
> The view displays a summary of payments and exceptions for the payment run.

---

### Step 327: Navigation

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 239 |
| **Activity** | Release Payment Proposal |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
You can sort the information by payment method, country/region, and so on. Select the view to display in the field below Summary.

</details>

**Expected Result (Test Verification):**
> Amounts are sorted by your selection.

---

### Step 328: Payments

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 240 |
| **Activity** | Release Payment Proposal |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Payments or Exceptions.

</details>

**Expected Result (Test Verification):**
> Details are displayed for payments or exceptions generated (such as payment document, payment order, included items, and so on).

---

### Step 329: Payment List

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 241 |
| **Activity** | Release Payment Proposal |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

On the Payments tab, choose Export to PDF.

</details>

**Expected Result (Test Verification):**
> A view displays the payment list. From here, you can preview, print, or download the list.

---

### Step 330: Payments Navigation

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 242 |
| **Activity** | Release Payment Proposal |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Payments tab, for the desired item, choose Details (>). 
When you're done, choose Back at the top to exit this view.

</details>

**Expected Result (Test Verification):**
> Payment item details are displayed.

---


## Activity 32: Mass Reverse Payment Run (Optional)

> 8 steps total | 5 classifiable | 3 hidden

### Step 331: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Mass Reverse Payment Run (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
Under certain circumstances and only in exceptional situations, you may need to reverse a payment run. A mass reversal might be necessary, for example, if you've executed a payment run by mistake or you entered an incorrect posting date for the payment run.

#### Prerequisites
You can only reverse payment documents in a payment run if you haven't started any follow-on processes. The program prevents any reversal in the following cases:
  - You've already created payment media or batch.

  - The system has already created entries in the payment register or check management.

  - The payments are already undergoing the approval process of SAP Bank Communication Management (BCM).

</details>

---

### Step 332: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Mass Reverse Payment Run (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

---

### Step 333: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Mass Reverse Payment Run (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Schedule Accounts Payable Jobs (F2257).

</details>

**Expected Result (Test Verification):**
> The Application Jobs view displays.

---

### Step 334: Create Job

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 243 |
| **Activity** | Mass Reverse Payment Run (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Create.

</details>

---

### Step 335: Template Selection

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 244 |
| **Activity** | Mass Reverse Payment Run (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Step 2:
Job Template: Reverse Payment Run
Job Name: Reverse Payment Run

</details>

---

### Step 336: Scheduling Options

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 245 |
| **Activity** | Mass Reverse Payment Run (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Step 3:
Start Immediately: Select

</details>

---

### Step 337: Parameters

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 246 |
| **Activity** | Mass Reverse Payment Run (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Check:
Run Date: <date of payment run to be reversed>
Identification: <ID of payment run to be reversed>
Test Run: Deselected
Reversal Reason: <reason for reversal>

</details>

**Expected Result (Test Verification):**
> Verify that the entries are complete and correct.

---

### Step 338: Schedule

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 247 |
| **Activity** | Mass Reverse Payment Run (Optional) |

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


## Activity 33: View Payment List

> 5 steps total | 2 classifiable | 3 hidden

### Step 339: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | View Payment List |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

### Purpose
In this activity, you display the payment list.

### Prerequisite
You executed a payment run.

### Procedure

</details>

---

### Step 340: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | View Payment List |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

---

### Step 341: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | View Payment List |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Display Payment Lists (S_P99_41000099).

</details>

---

### Step 342: Selection

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 248 |
| **Activity** | View Payment List |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter the following:
Program run date: <Date of payment run>
Identification feature: <Identification of payment run>
 Proposal run only: Only select to display data that comes from the payment proposal, not from the payment
Note
Additional fields are available for selection. Enter or modify fields according to your requirements.

</details>

---

### Step 343: Execute

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 249 |
| **Activity** | View Payment List |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Run.
After reviewing the list, choose Exit to return to Payment List view.

</details>

**Expected Result (Test Verification):**
> Payment list displays.

---


## Activity 34: Payment Plans

> 14 steps total | 10 classifiable | 4 hidden

### Step 344: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Payment Plans |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This activity lets you schedule payment runs using different scheduling options according to your payments needs.
After a payment plan has been created and activated, a job is generated and a payment run is executed automatically according to scheduled criteria.
Note
If the customer has bought and implemented Outgoing Payment with BCM Approval Process, the approval process is required. If payment approvals are required, the payment medium is only generated after approvals are executed.

#### Prerequisites
The Define Payment Medium Format Variants (Optional) procedure in the section has been executed.
Review and execute (if necessary), the Available Amounts for Payment Program (Optional) procedure in the Preparation of Paymentssection.
The BRF+ Settingsprocedures under Prerequisites are executed.
Invoices are posted, past due, and are open for payment. For more information, see the Business Conditions section of this document.
Invoices are past due.
Use the Invoice Payment Preparationprocedures to change the payment terms or due date of an invoice so it can be paid.
All steps for the procedures in the Invoice Payment Preparationsection must be executed.Note
When you create a plan, you can group payment plans using categories with the Categoryfield. You must first create categories.
Via the Manage Your Solutionapp or the SAP Central Business Configuration project experience portal, access the Define Payment Plan Categoriesconfiguration step.

</details>

---

### Step 345: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Payment Plans |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

---

### Step 346: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Payment Plans |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Payment Plans (F4806).

</details>

**Expected Result (Test Verification):**
> The Manage Payment Plans view displays.

---

### Step 347: Create View

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 250 |
| **Activity** | Payment Plans |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Create.

</details>

---

### Step 348: General Information

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 251 |
| **Activity** | Payment Plans |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the General Information section, make the following entries:
Plan Name: <Any description>
Note
The app doesn't currently prevent you from creating plans with the same name. Ensure that you use unique names when creating plans.
Company Code: 5410
Category: <leave blank> (see note in Prerequisites above)
Payment Method: <Any outgoing payment method available in your country>
Payment Run ID: <any ID description (five characters max.)>

</details>

---

### Step 349: Selections

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 252 |
| **Activity** | Payment Plans |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Selections section, make the following entries:
Supplier Selection: 54300001

</details>

---

### Step 350: Payment Schedule

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 253 |
| **Activity** | Payment Plans |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Payment Schedule section > Recurrence Pattern area, make the following entries:
Recurrence Type: D (Daily)
Recurrence Frequency: <leave blank>
Note
If you need to make payments every other day, enter 2 in the Recurrence Frequency field. For every third day, enter 3 (and so on for similar recurrence frequencies). You can also use the same logic for monthly and yearly recurrence types.
In the Recurrence Range area, make the following entries:
Start Date: <Today’s date>
End Date: <Today’s date + 3>
In the Date Specifications area, make the following entries:
Posting Date: 01 (Run date)
Docs Entered Up To: 01 (Run date)

</details>

---

### Step 351: Create

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 254 |
| **Activity** | Payment Plans |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Create.

</details>

---

### Step 352: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 255 |
| **Activity** | Payment Plans |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Select your new payment plan and choose Activate.

</details>

**Expected Result (Test Verification):**
> A background job is created.

---

### Step 353: Exit

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 256 |
| **Activity** | Payment Plans |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Go back to the SAP Fiori launchpad main view.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---

### Step 354: Background Job

| | |
|---|---|
| **Type** | `Navigation` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Payment Plans |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Schedule Accounts Payable Jobs (F2257).

</details>

---

### Step 355: Search

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 257 |
| **Activity** | Payment Plans |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

**Expected Result (Test Verification):**
> A list of all available background jobs display,

---

### Step 356: Job Details

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 258 |
| **Activity** | Payment Plans |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Find the created job that uses the Automatic Scheduling of the Payment Program job template with the description containing the payment plan name. For that job, choose Navigate to the job details.

</details>

**Expected Result (Test Verification):**
> Job details are displayed.

---

### Step 357: Payment Run

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 259 |
| **Activity** | Payment Plans |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step executes payments to your suppliers. Think about: how often do you pay suppliers (weekly, monthly)? Do you use bank transfers, checks, or other methods?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
After the job is executed according to scheduling criteria, a payment run is created and executed.
With the Schedule Accounts Payable Jobs app, choose your job then Navigate to the job details. In the Run Details  Payment Run  Identification section, check the payment run ID. Use the Manage Automatic Payments app to review the executed job.

</details>

**Expected Result (Test Verification):**
> The executed payment run can be reviewed.

---


## Activity 35: Single Outgoing Payment

> 1 steps total | 0 classifiable | 1 hidden

### Step 358: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Single Outgoing Payment |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Purpose
This section describes how a manual outgoing payment of bank transfer is created.
After payment approval, the payment medium file is created and sent to Multi-Bank Connectivity (MBC) for further processing. 
Note
For more information, see the Advanced Cash Operations(J78) test script or Basic Cash Operations(BFB) test script. 

Prerequisites
Invoices are posted and are due with one of the following payment methods:
  - F
  - I
  - T
All steps from Invoice Payment Preparationhave been executed.

</details>

---


## Activity 36: Create Single Outgoing Payment (Indirect)

> 9 steps total | 6 classifiable | 3 hidden

### Step 359: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Single Outgoing Payment (Indirect) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
You can use this process to pay a single invoice exact amount without discounts. Depending on the payment method and payment format (and possibly the bank) that is chosen, output can go to either Multi-Bank Connectivity (MBC), file download, or check print.

#### Prerequisites
You executed the Define Payment Medium Format Variants (Optional) preliminary step procedure.
The vendor master record is created and a payment method is assigned. 
Caution
Make sure that there are no other payment run identification proposals pending to be executed using the same supplier. If payment proposals exist, they must be processed or deleted. Otherwise, no payment can be generated.

</details>

---

### Step 360: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Single Outgoing Payment (Indirect) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 361: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Single Outgoing Payment (Indirect) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Supplier Line Items (F0712).

</details>

**Expected Result (Test Verification):**
> The Manage Supplier Line Items (F0712) view displays.

---

### Step 362: Data Entry and Search

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 260 |
| **Activity** | Create Single Outgoing Payment (Indirect) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose the Go button.
Supplier: <any>
Company Code: 5410
Status: Open Items
Open on Key Date: <Today's date>
Item Type: Normal Items
Choose the Go button to display a list of all vendor items .

</details>

**Expected Result (Test Verification):**
> Supplier line items are displayed according to your search criteria.

---

### Step 363: Select

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 261 |
| **Activity** | Create Single Outgoing Payment (Indirect) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To select a document number to pay, select the appropriate checkbox in the first column.

</details>

**Expected Result (Test Verification):**
> The Create Single Payment option activates.

---

### Step 364: Choose Create Manual Payment

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 262 |
| **Activity** | Create Single Outgoing Payment (Indirect) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Create Single Payment.

</details>

**Expected Result (Test Verification):**
> The Create Single Payment view is displayed.

---

### Step 365: Data Entry

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 263 |
| **Activity** | Create Single Outgoing Payment (Indirect) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Create.
Payment Details section:
Value Date: today's date

</details>

**Expected Result (Test Verification):**
> The details of the posted document display.

---

### Step 366: Create

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 264 |
| **Activity** | Create Single Outgoing Payment (Indirect) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Create button.
Caution
 A warning is displayed if the house bank isn't defined in document to be paid. Payment is done using the master data definition. You can choose Accept to continue.

</details>

**Expected Result (Test Verification):**
> Payment run Mxxxx of <date> has been scheduled view displays.

---

### Step 367: Payment

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 265 |
| **Activity** | Create Single Outgoing Payment (Indirect) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To review the payment, see the previous Payment Run procedures.

</details>

**Expected Result (Test Verification):**
> Payment approval and SAP Multi-Bank Connectivity steps can be executed.
> Optional: Review the Payment Approval steps.

---


## Activity 37: Create Single Payment (Direct)

> 9 steps total | 6 classifiable | 3 hidden

### Step 368: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Single Payment (Direct) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This activity posts a down payment request that automatically triggers the payment run, which creates a down payment. Output options are SAP Multi-Bank Connectivity, file download,or check print,dependent upon the payment method and payment format (and possibly the bank) that is chosen.

#### Prerequisites
The vendor master record has been created and bank data and payment methods updated.
Caution
Make sure that there are no other payment run identification proposals pending to be executed using the same supplier. If payment proposals exist, they must be processed or deleted. Otherwise, no payment can be generated.

</details>

---

### Step 369: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Single Payment (Direct) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

---

### Step 370: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Single Payment (Direct) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Create Single Payment (F0743).

</details>

**Expected Result (Test Verification):**
> The Create Single Payment (F0743) view displays.

---

### Step 371: General Information

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 266 |
| **Activity** | Create Single Payment (Direct) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the General Information area, make the following entries:
Company Code: 5410
Supplier: 54300001
Document Date: <Today´s date>
Posting Date: <Today´s date>

</details>

**Expected Result (Test Verification):**
> Supplier details are populated automatically

---

### Step 372: Supplier Details

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 267 |
| **Activity** | Create Single Payment (Direct) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Supplier Details area, make the following entries:
Tax Code: <input tax code>, for example, V9

</details>

---

### Step 373: House Bank Details

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 268 |
| **Activity** | Create Single Payment (Direct) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the House Bank Details area, make the following entries:
House Bank: MYBK1
Account ID: MYAC1
Payment Method: T
Bank Subaccount: Leave default value.

</details>

---

### Step 374: Payment Details

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 269 |
| **Activity** | Create Single Payment (Direct) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Payment Details area, make the following entries:
Amount: For example, 100
Currency: MYR
Note
When a tax code is entered for Supplier Details, choose the Calculate Tax button.

</details>

---

### Step 375: Create the payment

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 270 |
| **Activity** | Create Single Payment (Direct) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Create.

</details>

**Expected Result (Test Verification):**
> The system displays the Payment run M##### of date has been scheduled message.

---

### Step 376: Review Payment

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 271 |
| **Activity** | Create Single Payment (Direct) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To review the payment, refer to the previous Payment Run procedure, using the Manage Automatic Payments (F0770) app.

</details>

**Expected Result (Test Verification):**
> Payment approval and the SAP Multi-Bank Connectivity steps can be executed.
>  Optional: Review the Payment Approval steps.

---


## Activity 38: Online Payments: Free Form Payment Request

> 11 steps total | 8 classifiable | 3 hidden

### Step 377: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Online Payments: Free Form Payment Request |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
Free-form payments can trigger payments without referencing a business transaction. When you create a free-form payment, the bank information of the business partner master data doesn't have to be in the system, nor does the amount of the payment transaction have to be represented by an open item. This activity creates a payment request.

#### Prerequisites
The Define Payment Medium Format Variants (Optional) procedure in the Preliminary Stepssection is executed.
The business partner exists, and bank data and payment method are updated in Business Partner (BP) master data.

</details>

---

### Step 378: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Online Payments: Free Form Payment Request |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

---

### Step 379: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Online Payments: Free Form Payment Request |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open My Free Form Payments (F2564).

</details>

---

### Step 380: Create

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 272 |
| **Activity** | Online Payments: Free Form Payment Request |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Create.

</details>

**Expected Result (Test Verification):**
> The New Payment Request section displays.

---

### Step 381: Type

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 273 |
| **Activity** | Online Payments: Free Form Payment Request |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entry:
Payment Request Type: For Supplier

</details>

---

### Step 382: Business Partner

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 274 |
| **Activity** | Online Payments: Free Form Payment Request |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Payee area, make the following entry:
Supplier: 54300001

</details>

---

### Step 383: Payee

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 275 |
| **Activity** | Online Payments: Free Form Payment Request |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Payee Bank Details area, make the following entry:Remember
 When entering values manually, either enter or select using the drilldown button. Ensure that Payee Bank Country, Payee Bank Key, and Payee Account Number. fields have automatically populated. 
Suplr Bnk Details ID: 0001
Note
Bank Details are found using the Maintain Business Partner (BP) app on the Payment Transactions tab.

</details>

---

### Step 384: Posting Data

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 276 |
| **Activity** | Online Payments: Free Form Payment Request |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Posting Data When entering values area, make the following entry:
Company Code: 5410

</details>

---

### Step 385: House Bank

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 277 |
| **Activity** | Online Payments: Free Form Payment Request |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the House Bank area, make the following entries:
Paying Company Code: 5410
House Bank: MYBK1
Account ID: MYAC1

</details>

---

### Step 386: Payment Data

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 278 |
| **Activity** | Online Payments: Free Form Payment Request |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Payment Data area, make the following entries:
Payt Currency Amount: <any>
Currency: MYR
Payment Methods: <any>
Value Date: <Today's date>

</details>

---

### Step 387: Create the Payment

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 279 |
| **Activity** | Online Payments: Free Form Payment Request |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Create

</details>

**Expected Result (Test Verification):**
> The Payment Request is created and saved.

---


## Activity 39: Online Payments: Review or Edit Free Form Payment Request

> 7 steps total | 4 classifiable | 3 hidden

<!-- Fiori ID note (D2 remediation, revised resolutions file 2026-06-03): the "Process Free Form
     Payments" app referenced in this activity and Activity 40 is F8654 (Cash Management Specialist —
     review/process/release). It was corrected from F2564 on the strength of the revised resolutions
     file's J60 BPD source check. F2564 remains "My Free Form Payments" (create step, AP Accountant,
     Activity 38). See D2-D3-REMEDIATION-NOTE.md. -->

### Step 388: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Online Payments: Review or Edit Free Form Payment Request |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, a free form payment request is reviewed or edited.

#### Prerequisites
A free form payment request has been created.

</details>

---

### Step 389: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Online Payments: Review or Edit Free Form Payment Request |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Cash Management Specialist.

</details>

---

### Step 390: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Online Payments: Review or Edit Free Form Payment Request |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Process Free Form Payments (F8654) .

</details>

**Expected Result (Test Verification):**
> The Process Free Form Payments (F8654) view displays.

---

### Step 391: Search

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 280 |
| **Activity** | Online Payments: Review or Edit Free Form Payment Request |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entry and choose Go: 
Company Code: 5410

</details>

**Expected Result (Test Verification):**
> A list of created requests are displayed according to search criteria.

---

### Step 392: Request

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 281 |
| **Activity** | Online Payments: Review or Edit Free Form Payment Request |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the previously created request (with the Created status).

</details>

**Expected Result (Test Verification):**
> The details of the chosen request display.

---

### Step 393: Edit (Optional)

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 282 |
| **Activity** | Online Payments: Review or Edit Free Form Payment Request |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Before posting, you can change fields, if required. Choose Edit and after completing any changes, choose Save.

</details>

**Expected Result (Test Verification):**
> Changes are saved.

---

### Step 394: Post

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 283 |
| **Activity** | Online Payments: Review or Edit Free Form Payment Request |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Note
Before posting, ensure that any changes made to fields are saved. 
Choose Post and confirm by choosing Post.

</details>

**Expected Result (Test Verification):**
> The request status changes to Posted.

---


## Activity 40: Online Payments: Process Free Form Payment

> 8 steps total | 5 classifiable | 3 hidden

### Step 395: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Online Payments: Process Free Form Payment |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
Free-form payments can trigger payments without referencing a business transaction. After you create and post a free-form payment, you must release it to generate the payment.
Caution
If the customer has bought and implemented Outgoing Payment with BCM Approval Process, the approval process is required.

#### Prerequisites
A free form payment request is created.
Business Partner already exists.
Payment method is updated in business partner master data.

</details>

---

### Step 396: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Online Payments: Process Free Form Payment |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Cash Management Specialist.

</details>

---

### Step 397: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Online Payments: Process Free Form Payment |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Process Free Form Payments (F8654).

</details>

**Expected Result (Test Verification):**
> The Process Free Form Payments (F8654) view displays.

---

### Step 398: Search

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 284 |
| **Activity** | Online Payments: Process Free Form Payment |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter search criteria (for example):
Company Code: 5410
and choose Go

</details>

**Expected Result (Test Verification):**
> A list of payment requests is displayed.

---

### Step 399: Select

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 285 |
| **Activity** | Online Payments: Process Free Form Payment |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Select a request.

</details>

---

### Step 400: Post

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 286 |
| **Activity** | Online Payments: Process Free Form Payment |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Post. In the dialog box, confirm by choosing Post.

</details>

---

### Step 401: Release

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 287 |
| **Activity** | Online Payments: Process Free Form Payment |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Release. In the dialog box, confirm by choosing Release.

</details>

**Expected Result (Test Verification):**
> The request is released, a payment run ID is created, and payment is generated.

---

### Step 402: Log

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 288 |
| **Activity** | Online Payments: Process Free Form Payment |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To check the application log for your payment run ID, use the Automatic Payment Transactions for Payment Requests (F111) app.

</details>

---


## Activity 41: Manual Payment Online: Post Outgoing Payment

> 10 steps total | 6 classifiable | 4 hidden

### Step 403: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Manual Payment Online: Post Outgoing Payment |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
You can post outgoing payments either manually or automatically. The manual posting process is described in the following example. The manual outgoing payment generated in this step doesn't go through an approval process and doesn't create a payment medium.

#### Prerequisites
Review the house bank assignment to G/L account before you start the test so that you can use the proper G/L account in step 3 General Informationin the Proceduresection below..
To review, select the house bank and company code to test and use the Manage Bank Accounts(F1366A)app. In the app, go to House Bank Account ConnectivityHouse Bank Account DataG/L Account Data.

</details>

---

### Step 404: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Manual Payment Online: Post Outgoing Payment |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

---

### Step 405: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Manual Payment Online: Post Outgoing Payment |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Post Outgoing Payments (F1612).

</details>

**Expected Result (Test Verification):**
> The Post Outgoing Payments (F1612) view displays.

---

### Step 406: General Information

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 289 |
| **Activity** | Manual Payment Online: Post Outgoing Payment |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries:
General Information section
Company Code: 5410
Posting Date: <Today's date>
Journal Entry Date: <Today's date>
Value Date: <Today's date>
Reference (optional): <reference>
Journal Entry Type: KZ
Header Text: <header text>
Bank Data section
House Bank / Account: MYBK1/MYAC1 or MYBK2/MYAC2
G/L Account: 11001000 (see Prerequisites above)
Amount / Currency: <amount to pay on existing invoice>, for example, 119,00MYR
Fees: Optional
Assignment: Optional
Exchange Rate: Optional
Amount / CCode Currency: Optional

</details>

**Expected Result (Test Verification):**
> A list of open items is displayed in the Open Items | Standard section.

---

### Step 407: Open Item Selection

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 290 |
| **Activity** | Manual Payment Online: Post Outgoing Payment |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Open Item Selection section, make the following entries: 
Supplier Account: 54300001
and choose the Show Items button.

</details>

---

### Step 408: Select/Deselect

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 291 |
| **Activity** | Manual Payment Online: Post Outgoing Payment |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select an item to pay, and in the Clear column, choose Clear.

</details>

**Expected Result (Test Verification):**
> The item to pay transfers to the Items to be Cleared / Standard section.

---

### Step 409: Post

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 292 |
| **Activity** | Manual Payment Online: Post Outgoing Payment |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Post. Note
The generated payment doesn't require approval.

</details>

**Expected Result (Test Verification):**
> The system displays Journal entry xxxxxxxxxx was successfully posted in company code5410 notification.

---

### Step 410: Display

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 293 |
| **Activity** | Manual Payment Online: Post Outgoing Payment |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

To view the posted document, choose Display.

</details>

**Expected Result (Test Verification):**
> The posted document is displayed.

---

### Step 411: Back

| | |
|---|---|
| **Type** | `Navigation` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Manual Payment Online: Post Outgoing Payment |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose the Back button.

</details>

**Expected Result (Test Verification):**
> The system displays Journal entry has already been posted. You can now post a new payment notification.

---

### Step 412: Dismiss notification

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 294 |
| **Activity** | Manual Payment Online: Post Outgoing Payment |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose OK to dismiss the notification.

</details>

---


## Activity 42: Payment Approval

> 1 steps total | 0 classifiable | 1 hidden

### Step 413: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Payment Approval |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

---


## Activity 43: Bank Payment Approval (Optional based on Cash Management)

> 1 steps total | 0 classifiable | 1 hidden

### Step 414: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Bank Payment Approval (Optional based on Cash Management) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In SAP S/4HANA, a bank communication management (BCM) batch should be approved by two approvers. After the approval process is done, the payment medium is created automatically.
No matter the source of BCM batch, payment run of suppliers/customers or payment run of bank transfer, the BCM batch should go through the approval process.
Caution
If you have implemented Outgoing Payment with SAP Bank Communication Management Approval Process(an additional license is required for SAP Bank Communication Management), the approval process is required.
Note
For more information, see the Advanced Cash Operations(J78)test script.

#### Prerequisites
BCM batches are created successfully for the payment run of bank transfer.
The approvers are maintained for the bank account master data. For more information, see Maintain Payment Approver for Bank Accounts.

#### Procedure
Note
In the Advanced Cash Operations(J78)test script, execute all steps in the Approval of Bank Transfersection.

</details>

---


## Activity 44: Approval by First Approver

> 11 steps total | 8 classifiable | 3 hidden

### Step 415: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Approval by First Approver |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

### Procedure

</details>

---

### Step 416: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Approval by First Approver |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Manager.
Note
The user assigned to Signatory Group G001 in the Prerequisites section, Maintain Payment Approver for Bank Accounts.

</details>

---

### Step 417: Access the SAP Fiori app

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Approval by First Approver |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Approve Bank Payments (F0673A).

</details>

---

### Step 418: Maintain Filters

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 295 |
| **Activity** | Approval by First Approver |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Go.
Paying Company Code: 5410

</details>

---

### Step 419: Review Payment Batch and Items

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 296 |
| **Activity** | Approval by First Approver |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the For Review tab, review to ensure that the batches are correct.

</details>

**Expected Result (Test Verification):**
> All items are correct and the batches can be approved.

---

### Step 420: Select Batch to be Approved

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 297 |
| **Activity** | Approval by First Approver |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the payment batch for approval.
If more than one batch must be approved, select the checkbox for the batches to approve.

</details>

---

### Step 421: Approve

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 298 |
| **Activity** | Approval by First Approver |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Approve. Enter the note and choose OK to confirm the dialog box.

</details>

**Expected Result (Test Verification):**
> The payment is approved and appears on the Reviewed tab.

---

### Step 422: (Optional) Undo Approval

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 299 |
| **Activity** | Approval by First Approver |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Reviewed tab and select the payments to be discarded.
Choose Discard Changes from the top right of the view.
To confirm the dialog box, choose Discard Changes.
Note
This optional step is only necessary when you want to undo the approval.

</details>

**Expected Result (Test Verification):**
> The payment is discarded. it displays on the For Review tab.

---

### Step 423: Submit Reviewed Batch

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 300 |
| **Activity** | Approval by First Approver |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Reviewed tab and select the payments to be submitted. Choose the Approve and Submit button. To confirm the dialog box, choose Submit.

</details>

**Expected Result (Test Verification):**
> The batch is submitted.

---

### Step 424: Submit Verification Token (Optional)

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 301 |
| **Activity** | Approval by First Approver |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the dialog box Confirm Submission of Reviewed Batches, make the following entry and choose Submit.
VerificationToken: < Insert the Passcode from App SAP Authenticator on your mobile phone and insert it here>
Note
This step is only required when you enable two-factor authentication using SAP Cloud Platform Identity Authentication (IAS) for the Approve Bank Payments (F0673A) app.

</details>

**Expected Result (Test Verification):**
> The payment is sent to the Second Approver and no longer appears on the Reviewed tab.

---

### Step 425: Check Batch Status and Next Approver

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 302 |
| **Activity** | Approval by First Approver |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Check the batch status and next approvers via App Monitor Payments (F2388), see step Monitor Payments.

</details>

**Expected Result (Test Verification):**
> The batch status is In Approval. The next approvers is displayed. For example: Cash Manager.

---


## Activity 45: Rejection

> 1 steps total | 0 classifiable | 1 hidden

### Step 426: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Rejection |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Procedure
Review or execute the following steps in the Advanced Cash Operations(J78) test script:
  - Approval of Bank Transfer  - Reject by First Approver (Option)
  - Process Rejected Payment Document (Option)

#### Instructions
### Context
During the bank payment approval process, a bank communication management (BCM) batch is rejected.

</details>

---


## Activity 46: Approval by Second Approver

> 10 steps total | 7 classifiable | 3 hidden

### Step 427: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Approval by Second Approver |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

### Procedure

</details>

---

### Step 428: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Approval by Second Approver |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Cash Manager. Note
The user assigned to Signatory Group G002 in the Prerequisites section, Maintain Payment Approver for Bank Accounts.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 429: Access the SAP Fiori app

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Approval by Second Approver |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Approve Bank Payments (F0673A).

</details>

**Expected Result (Test Verification):**
> The Approve Bank Payments app displays.

---

### Step 430: Maintain Filters

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 303 |
| **Activity** | Approval by Second Approver |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Go.
Paying Company Code: 5410

</details>

---

### Step 431: Review Payment Batch and Items

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 304 |
| **Activity** | Approval by Second Approver |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the For Review tab to ensure if the batches are correct.

</details>

**Expected Result (Test Verification):**
> All items are correct and the batches can be approved.

---

### Step 432: Select Batch to be Approved

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 305 |
| **Activity** | Approval by Second Approver |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the payment batch for approval.
If more than one batch must be approved, select the checkbox for the batches to approve.

</details>

---

### Step 433: Approve

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 306 |
| **Activity** | Approval by Second Approver |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Approve.
Choose OK to confirm the dialog box.

</details>

**Expected Result (Test Verification):**
> The global payment is approved and appears on the Reviewed tab.

---

### Step 434: Submit Reviewed Batch

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 307 |
| **Activity** | Approval by Second Approver |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Reviewed tab and select the payments to be submitted, choose Submit. 
On the dialog box, choose Submit.

</details>

**Expected Result (Test Verification):**
> The payment is submitted.

---

### Step 435: Submit Verification Token (Optional)

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 308 |
| **Activity** | Approval by Second Approver |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Confirm Submission of Reviewed Batches dialog box, make the following entries and choose Submit:
VerificationToken: < Insert the Passcode from App SAP Authenticator on your mobile phone and insert it here>, make the following entry and choose 
Note
This step is only required when you enable two-factor authentication using SAP Cloud Platform Identity Authentication (IAS) for the Approve Bank Payments app.

</details>

**Expected Result (Test Verification):**
> The payment is finally approved and no longer appears on the Reviewed tab.

---

### Step 436: Check Batch Status

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 309 |
| **Activity** | Approval by Second Approver |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Check the batch status and next approvers via App Monitor Payments (F2388), see step Monitor Payments.

</details>

**Expected Result (Test Verification):**
> The batch status is Payment Medium Created. The Reference Number is generated.

---


## Activity 47: Payment Media: Create Payment Media

> 1 steps total | 0 classifiable | 1 hidden

### Step 437: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Payment Media: Create Payment Media |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Prerequisites
The Define Payment Medium Format Variants (Optional) procedure in the Preliminary Stepssection, under Prerequisites, has been executed. This is optional for the Cloud release.
Bank Integration with File Interface(1EG) and/or Bank Integration with SAP Multi-Bank Connectivity(16R) scope items are activated to generate the payment medium.
Payment approvals have been executed.
If you have implemented Outgoing Payment with SAP Bank Communication Management Approval Process (additional license required), the approval process is required.

#### Procedure
If the Full Cash Management is implemented with BCM (Bank Communication Management), after the outgoing payment is executed, and the BCM batch of this outgoing payment is approved (described in the Approval and Bank Integrationstep in Advanced Cash Operations(J78) test script), the payment medium file is created automatically.
If the Basic Cash Management is implemented, after the payment run is executed, the payment medium file is created automatically if the payment method is using the payment medium workbench (PMW) format.
For SAP Multi-Bank Connectivity, review the Bank Integration with SAP Multi-Bank Connectivity(16R) test script.
For Manual File Download, review the Bank Integration with File Interface(1EG) test script.

#### Instructions
### Context
In this activity, you create the payment media automatically.Note
If payment approvals are required, the payment media is only generated after approvals are executed.

</details>

---


## Activity 48: Payment Advices: Print or Email Payment Advice

> 13 steps total | 10 classifiable | 3 hidden

### Step 438: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Payment Advices: Print or Email Payment Advice |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Prerequisites
The email address is updated in Business Partner (BP) master data. Caution
You can also maintain the email in BRF Settings, but if email addresses are maintained in both BRF and BP Master Data, the ones in BRF are used. If the conditions in BRF cannot be met (for example, Company Code is different from payment run), the email is sent to the ones in BP Master Data. We recommend to only maintain it in one place such as BP Master Data. 

Payment Run is executed and the approval process is executed.
The BRF + Settingsprocedures, described in the Preliminary Steps topic, under Prerequisitesare executed.

#### Instructions
### Context
In this activity, you review or print a payment advice. An email is sent automatically after the payment has been approved.
Note
If you have implemented Extended Cash Management (additional license required), the approval process is required. 

### Procedure

</details>

---

### Step 439: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Payment Advices: Print or Email Payment Advice |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 440: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Payment Advices: Print or Email Payment Advice |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Automatic Payments (F0770).

</details>

**Expected Result (Test Verification):**
> The Manage Automatic Payments (F0770) view displays.

---

### Step 441: Go

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 310 |
| **Activity** | Payment Advices: Print or Email Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Note
If necessary, to find the payment run, make a selection in the Run Date field.
Choose Go.

</details>

---

### Step 442: View Payment

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 311 |
| **Activity** | Payment Advices: Print or Email Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose the Payments Processed tab.

</details>

**Expected Result (Test Verification):**
> The Items pane shows payments that are posted, finished, or with payment medium deleted.

---

### Step 443: Payments

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 312 |
| **Activity** | Payment Advices: Print or Email Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To review the payment, for the selected payment run, choose Details (>) at the right of the row.

</details>

---

### Step 444: Select

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 313 |
| **Activity** | Payment Advices: Print or Email Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose the Payments tab.

</details>

---

### Step 445: Open Payment Item

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 314 |
| **Activity** | Payment Advices: Print or Email Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
For a payment item line, choose Details (>) at the right of the row.

</details>

---

### Step 446: Output Items

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 315 |
| **Activity** | Payment Advices: Print or Email Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose the Output Items tab.

</details>

---

### Step 447: Preview

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 316 |
| **Activity** | Payment Advices: Print or Email Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
For an Item ID, in the Display  column, choose Display Document (PDF icon).

</details>

**Expected Result (Test Verification):**
> The PDF document displays in a new browser tab.

---

### Step 448: Print

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 317 |
| **Activity** | Payment Advices: Print or Email Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Print, then close the browser tab.

</details>

---

### Step 449: Email

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 318 |
| **Activity** | Payment Advices: Print or Email Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Output Details section, select a row of the Channel column with a value of EMAIL and choose Send Output.Note
If Status is In Error, review the email address format. After correcting it, select the checkbox and choose Resend.

</details>

**Expected Result (Test Verification):**
> An email is sent.

---

### Step 450: Close

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 319 |
| **Activity** | Payment Advices: Print or Email Payment Advice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Back twice.

</details>

---


## Activity 49: Payment Advices: Schedule Payment Advices (Optional)

> 10 steps total | 7 classifiable | 3 hidden

### Step 451: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Payment Advices: Schedule Payment Advices (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This activity describes how to schedule payment advices to create and send them out via email.
If payment advices were already created and sent in a payment run, this step doesn’t need to be executed.

#### Prerequisites
The email address is updated in Business Partner (BP) master data as described in Maintain Business Partneror under the BRF+ Settings for Payment Advice preliminary step procedure.
The payment run is executed.
The approval process is executed.
You executed the BRF+ Settings for Payment Advice procedure in PrerequisitesPreliminary Steps.

</details>

---

### Step 452: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Payment Advices: Schedule Payment Advices (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

---

### Step 453: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Payment Advices: Schedule Payment Advices (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Schedule Accounts Payable Jobs (F2257).

</details>

**Expected Result (Test Verification):**
> The Application Jobs view displays.

---

### Step 454: Create Job

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 320 |
| **Activity** | Payment Advices: Schedule Payment Advices (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Create.

</details>

---

### Step 455: Template Selection

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 321 |
| **Activity** | Payment Advices: Schedule Payment Advices (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Step 2:
Job Template: Create and Send Payment Advices to Payees
Job Name: Create and Send Payment Advices to Payees

</details>

---

### Step 456: Scheduling Options

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 322 |
| **Activity** | Payment Advices: Schedule Payment Advices (Optional) |

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

### Step 457: Parameters

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 323 |
| **Activity** | Payment Advices: Schedule Payment Advices (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries:
Run Date: <date>
Identification: <Payment Run ID>
Note
To restrict the job execution, you can enter additional criteria with the fields in Further Selections Parameters.

</details>

---

### Step 458: Check

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 324 |
| **Activity** | Payment Advices: Schedule Payment Advices (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Check to verify that entries are complete and correct.

</details>

---

### Step 459: Schedule

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 325 |
| **Activity** | Payment Advices: Schedule Payment Advices (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Schedule.

</details>

**Expected Result (Test Verification):**
> You scheduled the job.

---

### Step 460: Review

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 326 |
| **Activity** | Payment Advices: Schedule Payment Advices (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
After the job is finished, follow the steps in the Print or Email Payment Advice procedure.

</details>

---


## Activity 50: Correspondence

> 18 steps total | 12 classifiable | 6 hidden

### Step 461: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Correspondence |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, open items correspondence is created.

#### Prerequisites
Invoices and payments have been posted.
Business Partner (BP) master data (such as email address, and so on) are updated.
If correspondence SAP09 Internal Document is chosen, a journal entry number is necessary before executing the report. It is recommended to use Procedure B, or use the Manage Journal Entries- Version 2(F0717A)SAP Fiori app to find a journal entry number.

</details>

---

### Step 462: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Correspondence |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

---

### Step 463: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Correspondence |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Create Correspondence (F0744A).

</details>

**Expected Result (Test Verification):**
> The Create Correspondence (Version 2) (F0744A) view displays.

---

### Step 464: Data Entry

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 327 |
| **Activity** | Correspondence |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Parameters tab, make the following entries:
Company Code: 5410
Correspondence: <report>
Note
Select any of the following reports:
  - SAP06 - Account Statement
  - SAP08 - Open Item List
  - SAP09 - Internal Document when using this output, we recommend using Procedure B

</details>

**Expected Result (Test Verification):**
> Depending on the selected report, different fields are displayed below these two fields.

---

### Step 465: Supplier Information

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 328 |
| **Activity** | Correspondence |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Parameters area, make the following entries and press Enter:Note
Depending on the report you selected in the Correspondence field, only certain of the following fields are displayed. Only enter content in the displayed fields.

Supplier: Selected
Supplier: <Any supplier number>
Open at key date: <Any date>
Postings from: <Any date>
Posting to: <Any date>

</details>

**Expected Result (Test Verification):**
> Supplier details are entered.

---

### Step 466: Actions

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 329 |
| **Activity** | Correspondence |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Use the buttons to:
Preview
Send Email
Print.

</details>

**Expected Result (Test Verification):**
> Correspondence is created according to the selected criteria.
> Note
> If the Reference field is populated in the FI document, the reference text is displayed in the form Document number  column. Otherwise, the document number is displayed.
>  The correspondence form language depends on the Business Partner (BP) language settings in the BP master data.

---

### Step 467: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Correspondence |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

### Procedure B

</details>

---

### Step 468: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Correspondence |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a General Ledger Accountant.

</details>

---

### Step 469: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Correspondence |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Journal Entries - Version 2 (F0717A)

</details>

**Expected Result (Test Verification):**
> The Manage Journal Entries view displays.

---

### Step 470: Select Journal Entry

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 330 |
| **Activity** | Correspondence |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step is about recording financial transactions in your books. Think about: who posts journal entries? Are there approval requirements? Do you post adjustments at month-end?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Go.
Company Code: 5410
Ledger Group: empty
Journal Entry Type: (optional) For example, SA
Journal Entry: <empty>
Journal Entry Date: (optional) <date>
Period: (optional) <period>
Fiscal Year: <year of posting document>
Posting Date (optional): <date>

</details>

**Expected Result (Test Verification):**
> Selected journal entries are displayed in the Journal Entries list.

---

### Step 471: Manage Journal Entry

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 331 |
| **Activity** | Correspondence |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step is about recording financial transactions in your books. Think about: who posts journal entries? Are there approval requirements? Do you post adjustments at month-end?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
For a journal entry number, choose Details (>) at the right of the row.

</details>

**Expected Result (Test Verification):**
> The Manage Journal Entries view displays with the document details.

---

### Step 472: Correspondence

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 332 |
| **Activity** | Correspondence |

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

### Step 473: Entry View

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 333 |
| **Activity** | Correspondence |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Parameters area, enter:
Company Code: 5410
Correspondence: SAP09 (Internal Document - Entry View)
Note
Two fields may appear (Journal Entry, Fiscal Year). They should already show values from the journal entry number you chose.

</details>

**Expected Result (Test Verification):**
> Available fields display and are populated automatically.

---

### Step 474: Actions

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 334 |
| **Activity** | Correspondence |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Use the buttons to:
Preview
Send Email
Print.

</details>

**Expected Result (Test Verification):**
> Correspondence is created according to the selected criteria.

---

### Step 475: Exit

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 335 |
| **Activity** | Correspondence |

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

### Step 476: Ledger View

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 336 |
| **Activity** | Correspondence |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Repeat steps 1–5 and select:
Company Code: 5410
Correspondence: SAP09 (Internal Document - Ledger View)

</details>

**Expected Result (Test Verification):**
> Available fields display and are populated automatically.

---

### Step 477: Parameters

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 337 |
| **Activity** | Correspondence |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Advanced Parameters and make the following entry:
Ledger: <Any ledger, for example 0L>

</details>

---

### Step 478: Actions

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 338 |
| **Activity** | Correspondence |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Use the buttons to:
Preview
Send Email
PrintNote
Some steps (such as Send Email) might require additional information to complete the action.

</details>

**Expected Result (Test Verification):**
> Correspondence is created according to the selected criteria.

---


## Activity 51: Incorrect Posting: Reset Cleared Items

> 7 steps total | 4 classifiable | 3 hidden

### Step 479: Information

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
In this activity, you reset a cleared item. 

### Prerequisite
Invoices and payments are posted.

### Procedure

</details>

---

### Step 480: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Incorrect Posting: Reset Cleared Items |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Accounts Payable Accountant.

</details>

---

### Step 481: Access the SAP Fiori App

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

**Expected Result (Test Verification):**
> The Reset Cleared Items (F2223) view displays.

---

### Step 482: Search

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 339 |
| **Activity** | Incorrect Posting: Reset Cleared Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Go:
Company Code: 5410

</details>

**Expected Result (Test Verification):**
> Clearing entries are shown in the lower pane.

---

### Step 483: Execute

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 340 |
| **Activity** | Incorrect Posting: Reset Cleared Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To select a document to process, choose the Details (>) button at the right of the row.

</details>

**Expected Result (Test Verification):**
> The Clearing Entry view displays.

---

### Step 484: Reset

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 341 |
| **Activity** | Incorrect Posting: Reset Cleared Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Reset.

</details>

**Expected Result (Test Verification):**
> The system displays the Clearing XXXXXXX reset notification.

---

### Step 485: Continue

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 342 |
| **Activity** | Incorrect Posting: Reset Cleared Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose OK to continue.

</details>

---


## Activity 52: Incorrect Posting: Reset and Reverse Cleared Items

> 8 steps total | 5 classifiable | 3 hidden

### Step 486: Information

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
In this activity, you reset and reverse a payment. You may need to perform a reversal because a payment was not approved or because the bank could not execute the payment.

#### Prerequisites
Invoices and payments are posted.

</details>

---

### Step 487: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Incorrect Posting: Reset and Reverse Cleared Items |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

---

### Step 488: Access the SAP Fiori App

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

**Expected Result (Test Verification):**
> The Reset Cleared Items (F2223) view displays.

---

### Step 489: Search

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 343 |
| **Activity** | Incorrect Posting: Reset and Reverse Cleared Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Go:
Company Code: 5410

</details>

**Expected Result (Test Verification):**
> Clearing entries are shown in the lower pane.

---

### Step 490: Process

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 344 |
| **Activity** | Incorrect Posting: Reset and Reverse Cleared Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To select a document to process, choose the Details (>) button at the right of the row.

</details>

**Expected Result (Test Verification):**
> The Clearing Entry view displays.

---

### Step 491: Reset and Reverse

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 345 |
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

### Step 492: Make Entries

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 346 |
| **Activity** | Incorrect Posting: Reset and Reverse Cleared Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose OK:
Reversal Reason: Wrong posting
Posting Date: Today's date

</details>

**Expected Result (Test Verification):**
> The system displays the message Document posted XXXXXX in company code XXXX.

---

### Step 493: Continue

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 347 |
| **Activity** | Incorrect Posting: Reset and Reverse Cleared Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose the OK button.

</details>

**Expected Result (Test Verification):**
> The Reset Cleared Items view is displayed.

---


## Activity 53: Additional Information

> 4 steps total | 0 classifiable | 4 hidden

### Step 494: Information

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

### Down Payments: Create Down Payment Request

</details>

---


## Activity 54: Create Down Payment Request

> 8 steps total | 5 classifiable | 3 hidden

### Step 495: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Down Payment Request |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, a down payment request is created.

#### Prerequisites
The Supplier master record has been entered.

</details>

---

### Step 496: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Down Payment Request |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

---

### Step 497: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Down Payment Request |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Manage Supplier Down Payment Requests (F1688).

</details>

**Expected Result (Test Verification):**
> The Manage Supplier Down Payment Requests (F1688) view displays.

---

### Step 498: Create

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 348 |
| **Activity** | Create Down Payment Request |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Create.

</details>

---

### Step 499: Enter Header Data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 349 |
| **Activity** | Create Down Payment Request |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Header area, make the following entries:
Company Code: 5410
Journal Entry date: <Today’s date>
Posting date: <Today’s date>
Journal Entry Type: KZ
Transaction Currency: MYR
Header Text: <header text>

</details>

---

### Step 500: Enter Items Data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 350 |
| **Activity** | Create Down Payment Request |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Items area, enter the following and press Enter: 
Supplier: 54300001
Amount: 1000,00
Trg. Spec. G/L Ind: A (Default value, don't change)
To view more details, choose > (Add Line Item). Enter the following data:
Tax Code: <Input Tax Code>
Note
The posting date is used as the tax calculation date.
Due On: <Today’s date>
and choose Enter.

</details>

---

### Step 501: Post

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 351 |
| **Activity** | Create Down Payment Request |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Post.

</details>

**Expected Result (Test Verification):**
> The Success view displays the journal entry number posted.

---

### Step 502: Other

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 352 |
| **Activity** | Create Down Payment Request |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select your next action on the Success view:
Display
Post Next
Go to Worklist

</details>

---


## Activity 55: Create Down Payment Request with Workflow

> 1 steps total | 0 classifiable | 1 hidden

### Step 503: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Down Payment Request with Workflow |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
The workflow is a general function that allows to define condition-based workflows for approval processes.

#### Prerequisites
You've executed the Business Conditionsand Preliminary Steps.

</details>

---


## Activity 56: Create Team

> 8 steps total | 5 classifiable | 3 hidden

### Step 504: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Team |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you define a team that uniquely identifies the approvers in runtime based on predelivered conditions.

#### Prerequisites
You've executed the Business Conditionsand Preliminary Steps.
Business Partners are created.

</details>

---

### Step 505: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Team |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Manager.

</details>

---

### Step 506: Open the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Team |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Manage Teams and Responsibilities - Supplier Down Payment Requests (F7483).

</details>

**Expected Result (Test Verification):**
> The Manage Teams and Responsibilities view is displayed.

---

### Step 507: Create

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 353 |
| **Activity** | Create Team |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Create.

</details>

**Expected Result (Test Verification):**
> The Team view is displayed.

---

### Step 508: General Information

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 354 |
| **Activity** | Create Team |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the General Information section, make the following entries:
Name: <Any name>
Global ID: <Keep same as Name field>
Description: <Any description>
Status: Enabled
Type: FIAP_DPRV (Supplier Down Payment Request Verification)

</details>

---

### Step 509: Team Owners

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 355 |
| **Activity** | Create Team |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Team Owners section, add the user with the AP Manager role (if not already assigned, choose Create to add it):
Business Partners: <person ID> (from Maintain Business Users preliminary step)

</details>

---

### Step 510: Team Members

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 356 |
| **Activity** | Create Team |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Team Members, section, choose Create.
Select the user who is the approver and choose OK:
Business Partners: <person ID> (from Maintain Business Users preliminary step)
In the Functions column, assign a function for the approver (BP):
Functions: Supplier Down Payment Request Approver

</details>

---

### Step 511: Save

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 357 |
| **Activity** | Create Team |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Create.

</details>

**Expected Result (Test Verification):**
> The team is created.

---


## Activity 57: Create Workflow

> 10 steps total | 7 classifiable | 3 hidden

### Step 512: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Workflow |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you define and activate a supplier down payment request workflow for approval process.

#### Prerequisites
A team is created and responsibilities are assigned.
Note
Make sure that only your workflow is activated or your workflow is first in the order. If not, creating a supplier down payment request fails.

</details>

---

### Step 513: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Workflow |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as Accounts Payable Manager.

</details>

---

### Step 514: Open the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Workflow |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Manage Workflows - Supplier Down Payment Requests (F7100).

</details>

**Expected Result (Test Verification):**
> The Manage Workflows view displays.

---

### Step 515: Create

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 358 |
| **Activity** | Create Workflow |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Create.

</details>

**Expected Result (Test Verification):**
> The New Workflow view displays.

---

### Step 516: Header

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 359 |
| **Activity** | Create Workflow |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Header section, make the following entry:
Workflow Name: <Any name>

</details>

---

### Step 517: Properties

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 360 |
| **Activity** | Create Workflow |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Properties section, make the following entries:
Description: <Any description>
Valid from: <Today’s date>
Valid To: < Today’s date + 1 year>

</details>

---

### Step 518: Workflow Step 1

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 361 |
| **Activity** | Create Workflow |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Steps section, choose Create.
In the Header section, enter the following:
Step Name: <Any name>
Step Type: Manually Verify and Approve
In the Recipients section, enter the following:
Assignment By: Team
Team : <team> (created in subchapter Create Team)
Step to be completed by: One of the recipients
In Step Conditions enter the following:
Company Code equals to: 5410
Choose + (Create another condition) and add:
Total Amount in Company Code Currency >=: 100MYR
In Exception Handling, enter the following:
Reject
Required Action: Do nothing
Action Result: Cancel Workflow
Send Back
Required Action: Do nothing
Action Result: Cancel Workflow
Choose Create.

</details>

---

### Step 519: Workflow Step 2

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 362 |
| **Activity** | Create Workflow |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Create a second workflow step.
In the Steps section, choose Create.
In the Header section, enter the following:
Step Name: <Any name>
Step Type: Post Submitted Document
Choose Create.

</details>

---

### Step 520: Activate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 363 |
| **Activity** | Create Workflow |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Save. 
Choose Activate.

</details>

**Expected Result (Test Verification):**
> The workflow is activated.
> Make sure that only your workflow is activated or your workflow is in the first order. Otherwise, creating a Supplier Down Payment Request with Workflow fails.

---

### Step 521: Order

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 364 |
| **Activity** | Create Workflow |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To change the order of a created workflow, in the Manage Workflows view, select a workflow and choose Define Order. Use the up and down arrows to move the workflow, When done, choose Save.

</details>

---


## Activity 58: Create Supplier Down Payment Request for Approval

> 6 steps total | 3 classifiable | 3 hidden

### Step 522: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Supplier Down Payment Request for Approval |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you start a workflow to send a supplier down payment request for approval.

#### Prerequisites
You execute the preliminary steps.
You assigned the SAP_BR_MANAGERrole to business users.
A team is created and responsibilities are assigned.
A workflow is created and activated.

</details>

---

### Step 523: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Supplier Down Payment Request for Approval |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant

</details>

---

### Step 524: Open the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Supplier Down Payment Request for Approval |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Verify Supplier Down Payment Requests (F7103).

</details>

---

### Step 525: Create

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 365 |
| **Activity** | Create Supplier Down Payment Request for Approval |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Create.
Make the following entries:
Header section:
Company Code: 5410
Journal Entry Date: <Today’s date>
Posting Date: <Today’s date>
Journal Entry Type: KZ
Transaction currency: <currency>
Items section:
Supplier: <any>, for example, 54300001
Trg. Spec. G/L Ind. : A
Amount: 1000
Due on: <due date>
Note
Depending on the country/region, you may need to enter data in other fields (such as tax data, due date and so on). Enter them as needed.

</details>

**Expected Result (Test Verification):**
> A new view displays.

---

### Step 526: Submit

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 366 |
| **Activity** | Create Supplier Down Payment Request for Approval |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Submit.

</details>

**Expected Result (Test Verification):**
> A dialog box appears indicating Journal Entry … submitted successfully.

---

### Step 527: Display

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 367 |
| **Activity** | Create Supplier Down Payment Request for Approval |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Display to view the entry.
After viewing the entry, go back to the main app screen. Look for the recently created entry and choose it to see the details again, then choose Show Approval Status to view status.
Choose Back to go to the previous screen.

</details>

---


## Activity 59: Process Down Payment Request Approval

> 10 steps total | 7 classifiable | 3 hidden

### Step 528: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Process Down Payment Request Approval |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, the approver approves a request.

#### Prerequisites
Preliminary steps are executed.
Business Users are assigned the SAP_BR_MANAGERrole.

</details>

---

### Step 529: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Process Down Payment Request Approval |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Manager.

</details>

---

### Step 530: Open the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Process Down Payment Request Approval |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Verify Supplier Down Payment Requests - Approver Inbox (F7102) or My Inbox - All Items (F0862).

</details>

---

### Step 531: Selection

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 368 |
| **Activity** | Process Down Payment Request Approval |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the All tasks pane, select the supplier down payment request to be approved.

</details>

**Expected Result (Test Verification):**
> Details of the task display in the right pane.

---

### Step 532: Log

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 369 |
| **Activity** | Process Down Payment Request Approval |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Show log.

</details>

**Expected Result (Test Verification):**
> You can review the Workflow log and Task log.

---

### Step 533: Comments (optional)

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 370 |
| **Activity** | Process Down Payment Request Approval |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
If you want to enter a comment, choose Show Details, enter an optional comment and choose Submit.

</details>

---

### Step 534: Other (optional)

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 371 |
| **Activity** | Process Down Payment Request Approval |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Other option available before approving a workflow are:
  - Claim: Item remains in your inbox. When chosen, the button changes to release.

  - Suspend: Choose a date to process. The item disappears from the inbox. This item appears again as the suspend date approaches.

  - Forward: Use this to enter a new processor. This item appears in the new processor’s inbox.

</details>

---

### Step 535: Approve

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 372 |
| **Activity** | Process Down Payment Request Approval |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Approve.

</details>

**Expected Result (Test Verification):**
> The system displays a dialog box.

---

### Step 536: Submit

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 373 |
| **Activity** | Process Down Payment Request Approval |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Optionally, you can add a note.
Choose Submit.

</details>

**Expected Result (Test Verification):**
> The task is processed successfully and no longer appears in the All tasks pane. The request for approval is sent automatically to the second approver.

---

### Step 537: View

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 374 |
| **Activity** | Process Down Payment Request Approval |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To view approvals, use the Verify Supplier Down Payment Requests - Approver Outbox (F7101) app to see the details of the approved items.

</details>

---


## Activity 60: Down Payments: Post Down Payment

> 7 steps total | 4 classifiable | 3 hidden

### Step 538: Information

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
In this activity, a payment for a down payment request is generated.
Depending on your normal payment process for payments, this procedure can also be executed by running automatic payments.
In a test environment where you primarily want to test the process for down payments, it's easier to use the Post Outgoing PaymentSAP Fiori app to generate the same postings.
You can't use both the Post Outgoing Payments(F1612)and the Manage Automatic Payments(F0770)SAP Fiori apps for the same down payment. Therefore, if you want to generate a payment medium (for example, a check), use the Manage Automatic Payments(F0770)app in the second step instead of the Post Outgoing Payments(F1612)app.

#### Prerequisites
A down payment request has been posted.
Choose a down payment request from the previous step.

</details>

---

### Step 539: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Down Payments: Post Down Payment |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

---

### Step 540: Access the SAP Fiori App

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

Open Post Outgoing Payments (F1612).

</details>

**Expected Result (Test Verification):**
> The Post Outgoing Payments (F1612) view displays.

---

### Step 541: Enter Payment Data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 375 |
| **Activity** | Down Payments: Post Down Payment |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries: 
General Information section 
Company Code: 5410
Posting Date: <today's date>
Journal Entry Date: <today's date>
Value Date: <today's date>
Reference (optional): < your reference>
Journal Entry Type: KZ
Header Text: <header text>
Bank Data section:
G/L Account: 11001000
House Bank / Account: MYBK1/MYAC1
Amount / Currency: 100MYR
Note
Adjust the amount if tax relevant.
Fees: Optional
Assignment: Optional
Exchange Rate: Optional
Amount / CCode Currency:Optional
Open Item Selection Account area:
Account Type / Account ID: Supplier
Supplier Account: 54300001
and choose Show Items.

</details>

**Expected Result (Test Verification):**
> A list of open items is displayed in the Open Items section.

---

### Step 542: Select More

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 376 |
| **Activity** | Down Payments: Post Down Payment |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To display only the special G/L transactions, choose Select More, and from the dialog box, select the dropdown menu to include:
Line Item Type:Special G/L
Note
To display the Special G/L indicator, choose Settings. In Columns, select the Special G/L checkbox and choose OK.

</details>

**Expected Result (Test Verification):**
> Document with special G/L transactions is displayed.

---

### Step 543: Select/Deselect

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 377 |
| **Activity** | Down Payments: Post Down Payment |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select a down payment request to pay. On the Clear column, choose Clear.

</details>

**Expected Result (Test Verification):**
> The down payment to pay is transferred to the Items to be Cleared section.

---

### Step 544: Post

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 378 |
| **Activity** | Down Payments: Post Down Payment |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Post.

</details>

**Expected Result (Test Verification):**
> The system displays Success and the Journal entry xxxxxxxxxx was successfully posted in company code #### notification .

---


## Activity 61: Down Payments: Invoice Entry

> 1 steps total | 0 classifiable | 1 hidden

### Step 545: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Down Payments: Invoice Entry |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Prerequisites
A down payment has been posted.
Choose a down payment request from previous step.

#### Procedure
Execute the Invoice Entry without Purchase Ordertest procedure in this document. The invoice amount must be larger than the down payment amount posted in previous procedure.

#### Instructions
### Context
In this activity, an invoice is entered and cleared against a down payment.

</details>

---


## Activity 62: Down Payments: Post Outgoing Payment

> 7 steps total | 4 classifiable | 3 hidden

### Step 546: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Down Payments: Post Outgoing Payment |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
Use this process to make a payment to an invoice where a down payment is applied. The payment should be equal to the amount of the invoice, less the down payment amount.

#### Prerequisites
An invoice was posted (as completed in the previous procedure). A down payment is posted (as described in the Post Down Paymentprocedure). A payment amount should be equal to the invoice amount, less the down payment amount. The open balance of the invoice is equal to the down payment posted.
To generate a payment medium (such as a check), do the following:  - Execute the Clear Open Itemstest procedure. This activity clears the down payment against the invoice to be paid. The down payment amount appears in the Allocated Amountcolumn with a different sign for each document. In the Allocated Amountcolumn of the invoice journal entry, enter the amount that reduces the balance to zero.
  - Access the Manage Automatic PaymentsSAP Fiori app to pay the invoice and clearing document. As a result, a payment is generated for the difference.

</details>

---

### Step 547: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Down Payments: Post Outgoing Payment |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

---

### Step 548: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Down Payments: Post Outgoing Payment |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Post Outgoing Payments (F1612).

</details>

**Expected Result (Test Verification):**
> The Post Outgoing Payments (F1612) view displays.

---

### Step 549: Enter Payment Data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 379 |
| **Activity** | Down Payments: Post Outgoing Payment |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Show Items.
General Information section 
Company Code: 5410
Posting Date: <Today's date>
Journal Entry Date: <Today's date>
Value Date: <Today's date>
Reference (optional): < your reference>
Journal Entry Type: KZ

Bank Data section 
G/L Account: 11001000
House Bank / Account ID: MYBK1/MYAC1
Amount / Currency: Invoice amount less downpayment amount MYR
Fees: Optional
Assignment: Optional
Exchange Rate: Optional
Amount / CCode Currency:Optional
Open Item Selection Account area:
Account Type / Account ID: Supplier
Supplier Account: 54300001
Choose Show Items.

</details>

**Expected Result (Test Verification):**
> A list of open items is displayed in the Open Items section.

---

### Step 550: Select/Deselect

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 380 |
| **Activity** | Down Payments: Post Outgoing Payment |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
From the Open Items section, select the invoice to pay, and in the Clear column, choose Clear.

</details>

**Expected Result (Test Verification):**
> The invoice where the payment is applied is transferred to the Items to be Cleared section.

---

### Step 551: Allocate

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 381 |
| **Activity** | Down Payments: Post Outgoing Payment |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Items to be Cleared section, enter the following:
Allocated Amount: Invoice amount less the down payment amount
and choose Enter

</details>

**Expected Result (Test Verification):**
> The balance is zero.

---

### Step 552: Post

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 382 |
| **Activity** | Down Payments: Post Outgoing Payment |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Post.

</details>

**Expected Result (Test Verification):**
> The system displays the Success view with Journal entry xxxxxxxxxx successfully posted notification.

---


## Activity 63: Down Payments: Clear Open Items

> 11 steps total | 8 classifiable | 3 hidden

### Step 553: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Down Payments: Clear Open Items |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you manually clear open items.

#### Prerequisites
The invoices are posted. Down payments are posted (as described in the previous procedure, Post Down Payment). Payments are applied to an invoice, as described in the previous procedure, Post Outgoing Payment.Note
When the payment medium must be generated, execute this procedure before the previous step, Post Outgoing Payment. For more information, see the Prerequisitesof Post Outgoing Payment

</details>

---

### Step 554: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Down Payments: Clear Open Items |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

---

### Step 555: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Down Payments: Clear Open Items |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Clear Outgoing Payments - Manual Clearing (F1367)

</details>

**Expected Result (Test Verification):**
> The Clear Outgoing Payments (F1367) view displays.

---

### Step 556: Clear Open Items

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 383 |
| **Activity** | Down Payments: Clear Open Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose the Clear Open Items button.

</details>

**Expected Result (Test Verification):**
> The Clear Open Items dialog box is displayed.

---

### Step 557: Enter Supplier Information

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 384 |
| **Activity** | Down Payments: Clear Open Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose OK: 
Company Code: 5410
Supplier: 54300001

</details>

---

### Step 558: Filter

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 385 |
| **Activity** | Down Payments: Clear Open Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the Journal Entry Type column header. Choose Filter.

</details>

**Expected Result (Test Verification):**
> The Define Filters dialog box is displayed.

---

### Step 559: Journal Entry Type

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 386 |
| **Activity** | Down Payments: Clear Open Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step is about recording financial transactions in your books. Think about: who posts journal entries? Are there approval requirements? Do you post adjustments at month-end?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and press Enter:Journal Entry Type: KA

</details>

**Expected Result (Test Verification):**
> A list of open items to be cleared is displayed.

---

### Step 560: Select More

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 387 |
| **Activity** | Down Payments: Clear Open Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To display open items and special G/L transactions, choose Select More and choose:
Line Item Type: Normal Open Items and Special G/L Transactions

</details>

**Expected Result (Test Verification):**
> Normal open items and special G/L transactions are displayed in Open Items section.

---

### Step 561: Open Item Selection

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 388 |
| **Activity** | Down Payments: Clear Open Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Open Items section, select the invoice where you applied the payment in the Post Outgoing Payment procedure. Choose the down payment posted in the Post Down Payment procedure by choosing the Clear button in the Clear column of each Journal entry.

</details>

**Expected Result (Test Verification):**
> When the invoice is chosen, the assigned payment is also selected. In the Items to Be Cleared section, the balance of the open item (invoice) is displayed.
> Down payment is moved to the Items to Be Cleared section. The balance is zero.

---

### Step 562: Simulate (Optional)

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 389 |
| **Activity** | Down Payments: Clear Open Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Before posting, there is the option of simulating the posting.

</details>

**Expected Result (Test Verification):**
> A view showing the posting to be created, when the document is posted, displays.

---

### Step 563: Post

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 390 |
| **Activity** | Down Payments: Clear Open Items |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose the Post button.

</details>

**Expected Result (Test Verification):**
> The system displays Success. The document number, company code, and year created display and option buttons to Display or go to the Payment List are available.

---


## Activity 64: Optional: Interest Calculation: Optional: Schedule Interest Calculation Jobs

> 10 steps total | 7 classifiable | 3 hidden

### Step 564: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Optional: Interest Calculation: Optional: Schedule Interest Calculation Jobs |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you schedule the interest calculation jobs.

#### Prerequisites
Master data for interest calculation (interest indicator) is maintained in the Maintain Business Partnertopic.
Past due invoices exist (at least a month or more overdue).

</details>

---

### Step 565: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Optional: Interest Calculation: Optional: Schedule Interest Calculation Jobs |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

---

### Step 566: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Optional: Interest Calculation: Optional: Schedule Interest Calculation Jobs |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Schedule Interest Calculation Jobs (F4176).

</details>

**Expected Result (Test Verification):**
> The Application Jobs view displays.

---

### Step 567: Create Job

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 391 |
| **Activity** | Optional: Interest Calculation: Optional: Schedule Interest Calculation Jobs |

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

### Step 568: Template Selection

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 392 |
| **Activity** | Optional: Interest Calculation: Optional: Schedule Interest Calculation Jobs |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Step 2: Job Template: Calculate Item Interest for Accounts Payable
Job Name: Calculate Item Interest for Accounts Payable

</details>

---

### Step 569: Scheduling Options

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 393 |
| **Activity** | Optional: Interest Calculation: Optional: Schedule Interest Calculation Jobs |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Step 3:Start Immediately: Selected

</details>

---

### Step 570: Parameters

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 394 |
| **Activity** | Optional: Interest Calculation: Optional: Schedule Interest Calculation Jobs |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Parameters section, make the following entries and choose Schedule: 
Supplier account: for example, 54300001Company Code: 5410
Interest Indicator: for example, 01
Interest Calculation To: <for example, last day of current month>
Test Run: Selected if you want to do a test run; Deselected if you want to do an actual run

</details>

**Expected Result (Test Verification):**
> The Application Jobs view is displayed.

---

### Step 571: View Report

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 395 |
| **Activity** | Optional: Interest Calculation: Optional: Schedule Interest Calculation Jobs |

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

### Step 572: View Report

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 396 |
| **Activity** | Optional: Interest Calculation: Optional: Schedule Interest Calculation Jobs |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Review the document, then choose Back.

</details>

---

### Step 573: Run Actual Report

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 397 |
| **Activity** | Optional: Interest Calculation: Optional: Schedule Interest Calculation Jobs |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
If you performed a test run in step 5, repeat steps 6-8 with Test Run deselected to perform an actual run.

</details>

---


## Activity 65: Optional: Interest Calculation: Optional: Manage Interest Runs

> 8 steps total | 4 classifiable | 4 hidden

### Step 574: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Optional: Interest Calculation: Optional: Manage Interest Runs |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you manage the interest runs. If needed, you can reverse an interest run or resend an interest letter.

</details>

---

### Step 575: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Optional: Interest Calculation: Optional: Manage Interest Runs |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

---

### Step 576: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Optional: Interest Calculation: Optional: Manage Interest Runs |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Interest Runs (F4485).

</details>

---

### Step 577: Enter Criteria

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 398 |
| **Activity** | Optional: Interest Calculation: Optional: Manage Interest Runs |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Go: Company Code: 5410
Supplier: for example, 54300001

</details>

**Expected Result (Test Verification):**
> A list of documents display in the Interest Documents pane.

---

### Step 578: View Interest Document

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 399 |
| **Activity** | Optional: Interest Calculation: Optional: Manage Interest Runs |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
For the row for your interest document, choose Details (>) at the right of the row.

</details>

**Expected Result (Test Verification):**
> The Interest Run view is displayed for that document. The Items Subject to Interest pane shows related journal entry items, while the Output Items pane shows any outputs (for example, print or email) and their status.

---

### Step 579: Back

| | |
|---|---|
| **Type** | `Navigation` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Optional: Interest Calculation: Optional: Manage Interest Runs |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Back.

</details>

---

### Step 580: Reverse Interest Runs (Optional)

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 400 |
| **Activity** | Optional: Interest Calculation: Optional: Manage Interest Runs |

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

### Step 581: Resend Interest Letter (Optional)

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 401 |
| **Activity** | Optional: Interest Calculation: Optional: Manage Interest Runs |

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


## Activity 66: Optional: Interest Calculation: Optional: Display Interest Runs

> 5 steps total | 2 classifiable | 3 hidden

### Step 582: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Optional: Interest Calculation: Optional: Display Interest Runs |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

### Purpose
In this activity, you display the interest runs.

### Procedure

</details>

---

### Step 583: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Optional: Interest Calculation: Optional: Display Interest Runs |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

---

### Step 584: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Optional: Interest Calculation: Optional: Display Interest Runs |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Interest Runs (F4485).

</details>

---

### Step 585: Enter Criteria

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 402 |
| **Activity** | Optional: Interest Calculation: Optional: Display Interest Runs |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Go: Company Code: 5410

</details>

**Expected Result (Test Verification):**
> A list of documents displays in the Interest Documents pane.

---

### Step 586: View Interest Document

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 403 |
| **Activity** | Optional: Interest Calculation: Optional: Display Interest Runs |

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


## Activity 67: Guarantees Received

> 10 steps total | 4 classifiable | 6 hidden

### Step 587: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Guarantees Received |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

### Purpose
This activity describes how to create a guarantee.

### Procedure - Create Guarantee

</details>

---

### Step 588: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Guarantees Received |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

---

### Step 589: Open the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Guarantees Received |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Guarantees Received (F7933).

</details>

---

### Step 590: Create

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 404 |
| **Activity** | Guarantees Received |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Create.

</details>

---

### Step 591: Enter Details

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 405 |
| **Activity** | Guarantees Received |

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
Supplier: <supplier number >
Amount in Transaction Currency: <Amount >
Due On: <today's date + # days>

</details>

**Expected Result (Test Verification):**
> The guarantee is created.Note
> Once a decision is reached and action is taken on the received guarantee, the guarantee can be reversed. For more information, see the following procedure.

---

### Step 592: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Guarantees Received |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

### Procedure - Reverse Guarantee

</details>

---

### Step 593: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Guarantees Received |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

---

### Step 594: Open the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Guarantees Received |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Guarantees Received (F7933).

</details>

---

### Step 595: Enter Details

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 406 |
| **Activity** | Guarantees Received |

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

### Step 596: Reverse

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 407 |
| **Activity** | Guarantees Received |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Confirm the reversal

</details>

**Expected Result (Test Verification):**
> The guarantee is reversed.

---


## Activity 68: Periodic Activities: Check Open Balances

> 1 steps total | 0 classifiable | 1 hidden

### Step 597: Information

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
This activity lists all Accounts Payable line items.

#### Prerequisites
Invoices are created but not paid.

#### Procedure
Follow the instructions in the View Supplier Line Items test procedure.

</details>

---


## Activity 69: Periodic Activities: Create Supplier Balance Confirmation

> 9 steps total | 6 classifiable | 3 hidden

### Step 598: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Periodic Activities: Create Supplier Balance Confirmation |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This activity describes how to create a supplier balance confirmation.

</details>

---

### Step 599: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Periodic Activities: Create Supplier Balance Confirmation |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

---

### Step 600: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Periodic Activities: Create Supplier Balance Confirmation |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Schedule Accounts Payable Jobs (F2257).

</details>

**Expected Result (Test Verification):**
> The Application Jobs view displays.

---

### Step 601: Create Job

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 408 |
| **Activity** | Periodic Activities: Create Supplier Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Create.

</details>

---

### Step 602: Template Selection

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 409 |
| **Activity** | Periodic Activities: Create Supplier Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Step 2:
Job Template: Supplier Balance Confirmation
Job Name: Supplier Balance Confirmation

</details>

---

### Step 603: Scheduling Options

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 410 |
| **Activity** | Periodic Activities: Create Supplier Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Step 3:
Start Immediately: Select
Recurrence Pattern: Single Run

</details>

---

### Step 604: Parameters

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 411 |
| **Activity** | Periodic Activities: Create Supplier Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries:
General Selections section:
Company Code: 5410
Reconciliation Key Date: <Today’s date>, verify the date or enter if necessary
Output Control section:
For no reply, enter:
Description: <any>
Date of Issue: <Today’s date>.
No Reply: Select
For reply, enter:Description: <any>
Date of Issue: <Today’s date>
No Reply: Deselect
Date for Reply: <Today’s date + 7>
Reply To: <any Business Partner>Note
The Business Partner must have a valid address.

</details>

---

### Step 605: Check

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 412 |
| **Activity** | Periodic Activities: Create Supplier Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Check to verify that entries are complete and correct.

</details>

---

### Step 606: Schedule

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 413 |
| **Activity** | Periodic Activities: Create Supplier Balance Confirmation |

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


## Activity 70: Periodic Activities: Manage Supplier Balance Confirmations

> 8 steps total | 5 classifiable | 3 hidden

### Step 607: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Periodic Activities: Manage Supplier Balance Confirmations |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This procedure lets you manage open balance confirmation letters and track the actual status. You can enable the user to check open balances and confirm the amount in the system during the year-end closing to an external auditor.

#### Prerequisites
Invoices are created but aren't paid.
The BRF + Settingsprocedures, described in the Preliminary Steps topic, under Prerequisitesare executed.
Balance Confirmation is created.

</details>

---

### Step 608: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Periodic Activities: Manage Supplier Balance Confirmations |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

---

### Step 609: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Periodic Activities: Manage Supplier Balance Confirmations |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Manage Balance Confirmations - For Suppliers (F2959)

</details>

---

### Step 610: Search

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 414 |
| **Activity** | Periodic Activities: Manage Supplier Balance Confirmations |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Go:
Company Code: <Any Company Code number>

</details>

**Expected Result (Test Verification):**
> A list of balance confirmations displays.

---

### Step 611: Select from List

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 415 |
| **Activity** | Periodic Activities: Manage Supplier Balance Confirmations |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select any row from the balance confirmations list and choose Details (>).

</details>

**Expected Result (Test Verification):**
> Details are displayed.

---

### Step 612: Preview

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 416 |
| **Activity** | Periodic Activities: Manage Supplier Balance Confirmations |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Output Details section, in the Display row, choose Display Document.

</details>

**Expected Result (Test Verification):**
> The document displays.

---

### Step 613: Resend

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 417 |
| **Activity** | Periodic Activities: Manage Supplier Balance Confirmations |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Output Details section, select and flag the checkbox of an item with Completed status and then choose either:
Duplicate: For a resend on a completed item, it creates a new duplicate of the output item. To send again, select the duplicated item and choose Send Output.
or 
Retry: For a resend on an erroneous item, it retries to send the same item again.

</details>

**Expected Result (Test Verification):**
> The document is sent again.

---

### Step 614: Status

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 418 |
| **Activity** | Periodic Activities: Manage Supplier Balance Confirmations |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

To update the status, refresh the page.

</details>

**Expected Result (Test Verification):**
> Status is updated.

---


## Activity 71: Periodic Activities: Print Supplier Balance Confirmation

> 7 steps total | 4 classifiable | 3 hidden

### Step 615: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Periodic Activities: Print Supplier Balance Confirmation |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This procedure allows printing open balance confirmation letters.

#### Prerequisites
Invoices are created but aren't paid.
The Balance Confirmationis created.

</details>

---

### Step 616: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Periodic Activities: Print Supplier Balance Confirmation |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

---

### Step 617: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Periodic Activities: Print Supplier Balance Confirmation |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Manage Balance Confirmations - For Suppliers (F2959).

</details>

**Expected Result (Test Verification):**
> The Manage Supplier Balance Confirmations (F2959) view displays.

---

### Step 618: Search

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 419 |
| **Activity** | Periodic Activities: Print Supplier Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries:
Company Code: <any Company Code number>
and choose Go:

</details>

**Expected Result (Test Verification):**
> A list of balance confirmations displays.

---

### Step 619: Selection

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 420 |
| **Activity** | Periodic Activities: Print Supplier Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Select any row and choose Details (>).

</details>

**Expected Result (Test Verification):**
> Details are displayed.

---

### Step 620: Preview

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 421 |
| **Activity** | Periodic Activities: Print Supplier Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Output Details section, from the Display row, choose Display Document.

</details>

**Expected Result (Test Verification):**
> Document displays.

---

### Step 621: Print

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 422 |
| **Activity** | Periodic Activities: Print Supplier Balance Confirmation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose the Print button.

</details>

**Expected Result (Test Verification):**
> Document prints.

---


## Activity 72: Invoice Management Reporting: Accounts Payable Overview

> 5 steps total | 1 classifiable | 4 hidden

### Step 622: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Accounts Payable Overview |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This procedure guides you through the Account Payable Overview. In this activity, you review an overview of relevant figures and statistics related to the accounts payable process. TheAccounts Payable Overview(F2917)SAP Fiori app offers a central point of entry and an overview of the department.

</details>

---

### Step 623: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Accounts Payable Overview |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Manager.
Note
Once you log on, you can customize fields to be displayed by default. To do so, choose User  Settings  Default Values, then add the Display Currency, Company Code, and Supplier fields. Save your changes.

</details>

---

### Step 624: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Accounts Payable Overview |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Accounts Payable Overview (F2917).

</details>

**Expected Result (Test Verification):**
> The Accounts Payable Overview (F2917) view displays.

---

### Step 625: Edit Criteria

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 423 |
| **Activity** | Invoice Management Reporting: Accounts Payable Overview |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Go:
Display Currency: <Your Company Code currency>
Company Code: <any>
Note
You can also enter values in other fields, such as Supplier, Accounting Clerk, and so on.

</details>

**Expected Result (Test Verification):**
> Relevant figures and statistics display.
> Some of the available cards include: 
>   - Blocked Invoices
>   - Blocked Invoices - Chart View
>   - Posted Invoices
>   - Payables Aging
>   - Cash Discount Utilization
>   - Days Payable Outstanding Indirect
>   - Days Payable Outstanding Direct
>   - Posted Invoices in Current Period
>   - Parked Invoices
>   - Quick Links
>   - Suppliers with Debit Balances
>   - Invoices Blocked in Supplier Master Data
>   - My Inbox
>   - Due Invoices Free for Payment
>   - Invoice Processing Statistics

---

### Step 626: Navigate to Options

| | |
|---|---|
| **Type** | `Navigation` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Accounts Payable Overview |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
There are different, available options for reviewing figures and statistics. 
You can change the global filters if needed. The visible cards can be customized.
Each card mentioned in the prior step provides you with functions to view and manage various accounts payable functions and information.

</details>

**Expected Result (Test Verification):**
> Figures and statistics display according to available options you select.

---


## Activity 73: Invoice Management Reporting: Days Payable Outstanding

> 8 steps total | 5 classifiable | 3 hidden

### Step 627: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Days Payable Outstanding |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you view a report showing days payable outstanding.

</details>

---

### Step 628: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Days Payable Outstanding |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Manager.

</details>

---

### Step 629: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Days Payable Outstanding |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Days Payable Outstanding - Last 12 Months (F1740).

</details>

**Expected Result (Test Verification):**
> The Days Payable Outstanding view displays.

---

### Step 630: Navigation

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 424 |
| **Activity** | Invoice Management Reporting: Days Payable Outstanding |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To change the view, choose the drill-down button or buttons in the first row of the report.Note
If you're using a filter using predefined buttons (such as Accounting Clerk, Company Code, and so on), to display all available values after choosing the desired button, you may need to choose Search without entering any values to see all of them.

</details>

**Expected Result (Test Verification):**
> Different views can be displayed.

---

### Step 631: Detailed Analysis

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 425 |
| **Activity** | Invoice Management Reporting: Days Payable Outstanding |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Jump To button.
Choose Days Payable Outstanding - Detailed Analysis.

</details>

**Expected Result (Test Verification):**
> The Days Payable Outstanding view displays.

---

### Step 632: Selection

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 426 |
| **Activity** | Invoice Management Reporting: Days Payable Outstanding |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To change a view, choose +Add Analysis Step. 
Select any of the displayed options. As you choose more options, more options are displayed. Select your preference and then select the chart type:
  - Time

  - Company Code
  - Customer
  - Country/Region of Supplier
  - Due Period
Note
You can choose the +Add Analysis Step button again to display more analyses.

</details>

**Expected Result (Test Verification):**
> Different views are displayed.

---

### Step 633: Save

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 427 |
| **Activity** | Invoice Management Reporting: Days Payable Outstanding |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Under the Analysis MY button, choose Save As. Enter a name to save your current selection.

</details>

**Expected Result (Test Verification):**
> The view is saved and can be accessed later to view the information with this type of analysis.

---

### Step 634: Open

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 428 |
| **Activity** | Invoice Management Reporting: Days Payable Outstanding |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Under the Unnamed Analysis Path button, choose Open.
Select a previously saved analysis and choose OK.

</details>

**Expected Result (Test Verification):**
> The button displays the name of the selected analysis.

---


## Activity 74: Invoice Management Reporting: Overdue Payables

> 4 steps total | 1 classifiable | 3 hidden

### Step 635: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Overdue Payables |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you view any payables that are overdue.

</details>

---

### Step 636: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Overdue Payables |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Manager.

</details>

---

### Step 637: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Overdue Payables |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Overdue Payables - Today (F1746).

</details>

**Expected Result (Test Verification):**
> The Overdue Payables view displays.

---

### Step 638: Navigation

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 429 |
| **Activity** | Invoice Management Reporting: Overdue Payables |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To change the view, choose the drill-down button or buttons in the first row of the report.

</details>

**Expected Result (Test Verification):**
> Different views can be displayed.

---


## Activity 75: Invoice Management Reporting: Future Payables

> 4 steps total | 1 classifiable | 3 hidden

### Step 639: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Future Payables |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you view the analysis of Future Payables.

</details>

---

### Step 640: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Future Payables |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Manager.

</details>

---

### Step 641: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Future Payables |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Future Payables - Today (F1743).

</details>

**Expected Result (Test Verification):**
> The Future Payables view displays.

---

### Step 642: Navigation

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 430 |
| **Activity** | Invoice Management Reporting: Future Payables |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To change the view, choose the drill-down button or buttons in the first row of the report.

</details>

**Expected Result (Test Verification):**
> Different views can be displayed.

---


## Activity 76: Invoice Management Reporting: Cash Discount Forecast

> 4 steps total | 1 classifiable | 3 hidden

### Step 643: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Cash Discount Forecast |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you view the analysis of Cash Discount Forecast.

#### Prerequisites
You must have at least one invoice in open status using payment terms that give a discount (for example, payment term 0006 (Before End of the month 4% cash discount)).
The app only reports key figures if there are invoices in the system with discounts. If no key figures are shown, create a supplier invoice with a payment term that includes a discount if you pay early (such as payment term 0006). The discounts only appear after the payment run.

</details>

---

### Step 644: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Cash Discount Forecast |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Manager.

</details>

---

### Step 645: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Cash Discount Forecast |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Cash Discount Forecast - Available Amount (F1735).

</details>

**Expected Result (Test Verification):**
> The Cash Discount Forecast view displays.

---

### Step 646: Navigation

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 431 |
| **Activity** | Invoice Management Reporting: Cash Discount Forecast |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To change the view, choose the drill-down button or buttons in the first row of the report.

</details>

**Expected Result (Test Verification):**
> Different views can be displayed.

---


## Activity 77: Invoice Management Reporting: Cash Discount Utilization

> 4 steps total | 1 classifiable | 3 hidden

### Step 647: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Cash Discount Utilization |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you view the analysis of Cash Discount Utilization.

#### Prerequisites
You must have at least one invoice in open status using payment terms that give a discount (for example, payment term 0006 (Before End of the month 4% cash discount)).
The app only reports key figures if there are payments executed where it was possible to utilize the offered discount. If no key figures are shown, create a supplier invoice with a payment term that includes a discount if you pay early (for example payment term 0006) and then pay this invoice. The discounts only appear after the payment run.

</details>

---

### Step 648: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Cash Discount Utilization |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Manager.

</details>

---

### Step 649: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Cash Discount Utilization |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Cash Discount Utilization - Today (F1736).

</details>

**Expected Result (Test Verification):**
> The Cash Discount Utilization view displays.

---

### Step 650: Navigation

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 432 |
| **Activity** | Invoice Management Reporting: Cash Discount Utilization |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To change the view, choose the drill-down button or buttons in the first row of the report.

</details>

**Expected Result (Test Verification):**
> Different views can be displayed.

---


## Activity 78: Invoice Management Reporting: Invoice Processing Analysis

> 4 steps total | 1 classifiable | 3 hidden

### Step 651: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Invoice Processing Analysis |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you view the analysis of Invoice Processing.

</details>

---

### Step 652: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Invoice Processing Analysis |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Manager.

</details>

---

### Step 653: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Invoice Processing Analysis |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Invoice Processing Analysis - Today (F1745).

</details>

**Expected Result (Test Verification):**
> The Invoice Processing Analysis view displays.

---

### Step 654: Navigation

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 433 |
| **Activity** | Invoice Management Reporting: Invoice Processing Analysis |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To change the view, choose the Toggle Filter icon at the right of the view to modify the filters.
Required filters are marked with an asterisk (*).
Note
Additional filters are available.
Above the graph, a dropdown menu provides additional filtering options.
Additional buttons, above the graph are used to change the display layout or view results as a table.

</details>

**Expected Result (Test Verification):**
> Views display according to your selection.

---


## Activity 79: Invoice Management Reporting: Invoice Processing Time

> 4 steps total | 1 classifiable | 3 hidden

### Step 655: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Invoice Processing Time |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you view the analysis of invoice processing time.

</details>

---

### Step 656: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Invoice Processing Time |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Manager.

</details>

---

### Step 657: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Invoice Processing Time |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Invoice Processing Time - Today (F1745).

</details>

**Expected Result (Test Verification):**
> The Invoice Processing Time view is displayed.

---

### Step 658: Navigation

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 434 |
| **Activity** | Invoice Management Reporting: Invoice Processing Time |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To change the view, choose Adapt Filters at the right of the view to modify the filters.
Required filters are marked with an asterisk (*).
Note
Additional filters are available.
Above the graph, a dropdown menu provides additional filtering options.
Additional buttons above the graph are used to change the display layout or view results as a table.

</details>

**Expected Result (Test Verification):**
> Views display according to your selection.

---


## Activity 80: Invoice Management Reporting: Aging Analysis

> 4 steps total | 1 classifiable | 3 hidden

### Step 659: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Aging Analysis |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

### Purpose
In this activity, you view the Aging Analysis.

### Procedure

</details>

---

### Step 660: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Aging Analysis |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Manager.

</details>

---

### Step 661: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Aging Analysis |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Aging Analysis - Payable Amount (F1733).

</details>

**Expected Result (Test Verification):**
> The Aging Analysis view displays.

---

### Step 662: Navigation

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 435 |
| **Activity** | Invoice Management Reporting: Aging Analysis |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To change the view, choose the drilldown button available at the top of the graph or select the text in the first column of the report.
Above the graph are additional buttons you use to change the display layout of the graph.

</details>

**Expected Result (Test Verification):**
> Views displays according to your selection.

---


## Activity 81: Invoice Management Reporting: Aging Report for Accounts Payable

> 4 steps total | 1 classifiable | 3 hidden

### Step 663: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Aging Report for Accounts Payable |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
### Use
In this activity, you view a report that shows the aging for accounts payable. The AP Manager can analyze the payable amounts to suppliers by aging interval. These intervals allow the accounts payable manager to quickly recognize the payments due in the present month, the following month, and so on.

### Procedure

</details>

---

### Step 664: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Aging Report for Accounts Payable |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Manager

</details>

---

### Step 665: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Aging Report for Accounts Payable |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Aging Report for Accounts Payable (F4401).

</details>

---

### Step 666: Filter Selection

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 436 |
| **Activity** | Invoice Management Reporting: Aging Report for Accounts Payable |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
This view provides several filters:  - Company Code
  - G/L Account
  - Account Group
  - Supplier

Choose any of the available filters and set a value according to your reporting needs.

</details>

**Expected Result (Test Verification):**
> The view is filtered according to your selection. When you set a value, a graph and details are shown per supplier and reconciliation account.

---


## Activity 82: Invoice Management Reporting: Automatic and Manual Payments Analysis

> 4 steps total | 1 classifiable | 3 hidden

### Step 667: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Automatic and Manual Payments Analysis |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you view payments done automatically and manually.

</details>

---

### Step 668: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Automatic and Manual Payments Analysis |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Manager.

</details>

---

### Step 669: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Automatic and Manual Payments Analysis |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Automatic and Manual Payments - Payments for Last Year (F1749).

</details>

**Expected Result (Test Verification):**
> The Automatic and Manual Payments view displays.

---

### Step 670: Navigation

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 437 |
| **Activity** | Invoice Management Reporting: Automatic and Manual Payments Analysis |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To change the view, choose the drilldown button available at the top of the graph or select the text in the first column of the report.
Above the graph are more buttons you use to change the display layout of the graph.

</details>

**Expected Result (Test Verification):**
> Different views can be displayed:
>   - By Company
> 
>   - By Currency
> 
>   - By Supplier
> 
>   - By User

---


## Activity 83: Invoice Management Reporting: Supplier Payments Analysis

> 4 steps total | 1 classifiable | 3 hidden

### Step 671: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Supplier Payments Analysis |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you view the supplier payments analysis. The report displays payments that aren't applied to supplier invoices.

</details>

---

### Step 672: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Supplier Payments Analysis |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Manager.

</details>

---

### Step 673: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Supplier Payments Analysis |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Supplier Payment Analysis - Open Payments (F1750).

</details>

**Expected Result (Test Verification):**
> The Supplier Payment Analysis view displays.

---

### Step 674: Navigation

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 438 |
| **Activity** | Invoice Management Reporting: Supplier Payments Analysis |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To change the view, choose the drilldown button available at the top of the graph or select the text in the first column of the report.
Above the graph are additional buttons you use to change the display layout of the graph.

</details>

**Expected Result (Test Verification):**
> Different views can be displayed:
>   - By Company
> 
>   - By Currency
> 
>   - By Supplier
> 
>   - By User

---


## Activity 84: Invoice Management Reporting: Display Item Change Log

> 6 steps total | 3 classifiable | 3 hidden

### Step 675: Information

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
In this activity, you can display, sort, and analyze logged changes for journal entries. The report provides better control and tracks changes performed manually by different users on payable items.

#### Prerequisites
Invoices are created.
Payment is created.
Changes in documents are made before generating this report.

</details>

---

### Step 676: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Invoice Management Reporting: Display Item Change Log |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Manager.

</details>

---

### Step 677: Access the SAP Fiori App

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

Open Display Item Change Log - Supplier (F7795).

</details>

---

### Step 678: Select

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 439 |
| **Activity** | Invoice Management Reporting: Display Item Change Log |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Go:
Document Type: <select any type>
Company Code: 5410
Changed On: <interval of dates>Fiscal Year: <current year>

</details>

---

### Step 679: Results

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 440 |
| **Activity** | Invoice Management Reporting: Display Item Change Log |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
The information of all journal entries is shown per the selection and the changes in each of the changed journal entries can be viewed.

</details>

---

### Step 680: Exit

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 441 |
| **Activity** | Invoice Management Reporting: Display Item Change Log |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Back to exit.

</details>

---


## Activity 85: eDocument Cockpit

> 15 steps total | 10 classifiable | 5 hidden

### Step 681: Information

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
In this procedure, you change or maintain the status of your eDocument.
Note
Ensure that you perform the Preliminary Steps for eDocument Processsteps in the Prerequisitessection.

#### Prerequisites
Starting with the 2208 release, to enable advanced eDocument features (such as eDocument Submit, Cancel, and Reject), new customers must first activate the Document and Reporting Compliancefeatures for your country or region. For more information, see the Document and Reporting Compliance(5XU) test script, in the PrerequisitesPreliminary StepsActivate Document and Reporting Compliance Featurestopic.

</details>

---

### Step 682: Log On

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

### Step 683: Access the App

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

### Step 684: Select eInvoice Document

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 442 |
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

### Step 685: Submit eInvoice

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 443 |
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

### Step 686: Review status

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 444 |
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

### Step 687: Display eDocument

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 445 |
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

### Step 688: Display Source Document

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 446 |
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

### Step 689: Back

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

### Step 690: Review History of eDocument

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 447 |
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

### Step 691: Back

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

### Step 692: Review Application Log

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 448 |
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

### Step 693: Message Dashboard

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 449 |
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

### Step 694: Cancel eDocument

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 450 |
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

### Step 695: Delete eDocument

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 451 |
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


## Activity 86: Generic Withholding Tax Report

> 5 steps total | 2 classifiable | 3 hidden

### Step 696: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Generic Withholding Tax Report |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you run the Generic Withholding Tax Report. The system is delivered with tax forms from a previous year for reference purposes. Ensure that legal change packages for the relevant year are applied as tax laws. Forms are subject to change. The forms for each new year are delivered by SAP Note. Download the SAP Note and apply it when it becomes available (usually, toward the end of the relevant fiscal year).

#### Prerequisites
Vendor invoice for vendor 54300030or 54300031created and payment is cleared. No output unless there are posting to a vendor 54100030or 54100031that has withholding tax settings and the invoices have been paid.

</details>

---

### Step 697: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Generic Withholding Tax Report |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Manager for Malaysia.

</details>

---

### Step 698: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Generic Withholding Tax Report |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Report Generic Withholding Tax - 马来西亚 (S_P00_07000134).

</details>

**Expected Result (Test Verification):**
> The Generic Withholding Tax Reporting view displays.

---

### Step 699: Data Entry

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 452 |
| **Activity** | Generic Withholding Tax Report |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries
Process Type:STD
Country Key:MY
Reporting Period From:<Start date>
Reporting Period To:<Future date>
Company Code:5410
Fiscal Year:<Current Fiscal Year>

</details>

**Expected Result (Test Verification):**
> Entries are made.

---

### Step 700: Execute Report

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 453 |
| **Activity** | Generic Withholding Tax Report |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose the Run button.

</details>

**Expected Result (Test Verification):**
> The report generates.

---


## Activity 87: Additional Information: Appendix: Display Process Flow Accounts Payable

> 6 steps total | 3 classifiable | 3 hidden

### Step 701: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Appendix: Display Process Flow Accounts Payable |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Prerequisites
Documents that generate the accounts payable (AP) process are created. For example:
  - Purchase Order

  - Invoice

  - Payment

  - Clearing

#### Instructions
### Context
This app graphically displays the relationship between individual business objects of the Accounts Payable work area. This shows as a process flow, displaying information about the business object for each stage of the process (such as purchase orders, goods movements, incoming invoices, journal entries and clearing entries). Additionally, it provides the ability to view missing business objects.

### Procedure

</details>

---

### Step 702: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Appendix: Display Process Flow Accounts Payable |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

---

### Step 703: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Appendix: Display Process Flow Accounts Payable |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Display Process Flow - Accounts Payable (F2691).

</details>

---

### Step 704: Data Entry

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 454 |
| **Activity** | Additional Information: Appendix: Display Process Flow Accounts Payable |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Go:
Document Type: Select document type, from the dropdown list, according to the origin of the document:
  - All document types

  - Purchase order

  - Goods movement

  - Incoming invoice

  - Journal entry

  - Clearing entry

Different entry fields are required, depending on which document type you select. For example: 
Document Number: <document number per document type selected>
Note
Entering a document number automatically applies values for other fields.
Company Code: 5410
Fiscal year: Current year

</details>

**Expected Result (Test Verification):**
> A Process Flow displays the stage of the process of the selected document and additional details.

---

### Step 705: Review

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 455 |
| **Activity** | Additional Information: Appendix: Display Process Flow Accounts Payable |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose to display the information about the document in a process flow or a tabular view.

</details>

**Expected Result (Test Verification):**
> The view displays according to your selection.

---

### Step 706: Exit

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 456 |
| **Activity** | Additional Information: Appendix: Display Process Flow Accounts Payable |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Back to exit.

</details>

---


## Activity 88: Additional Information

> 4 steps total | 0 classifiable | 4 hidden

### Step 707: Information

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
By default, the system checks if the corresponding period is open to post a supplier invoice. This activity disables the period check or material master records. Disabling the period check means that the system doesn't perform the check for G/L account postings and postings to assets. The check still occurs for direct postings to the material and for invoices that reference purchase orders.

#### Procedure
Depending on your configuration environment for SAP S/4HANA Cloud Public Edition, choose one of the following options:
Configure Your Solution:  - Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration.
  - Open Manage Your Solution(F1241).
  - If necessary, change the country or region by choosing Set Local Version.
  - Choose Configure Your Solution.
  - Make the following entries: Application Area: Sourcing and Procurement
Sub Application Area: Invoice Processing

  - For the row with Item Name of Incoming Invoice, choose Details (>).
  - For the Disable Period Check for Material Masterrow, choose Configure.
  - Continue with the procedure in the following table. 

SAP Central Business Configuration:  - Log on to the project experience in SAP Central Business Configuration. 
  - In the Product-Specific Configurationphase, navigate to the Configuration Activitiestab. To locate the activity in the tree view, search for the following activity: Disable Period Check for Material Master.
  - Choose Open Documentationfor the found line item to see more details about this configuration activity.
  - Choose the link to navigate directly to the SAP S/4HANA Cloud Public Editionsystem. Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration.
  - Continue with the procedure in the following table.
Test Step #Test Step NameInstructionsResults
 | 1 | Disable Check | In the Disable MM Period Checkpane, make the following entries:
No Check: Selected
 |  | 
 | 2 | Save | Choose Save.
 | The period check is disabled.
 |

#### Instructions
### Appendix: Disable Period Check for Material Master (Optional)

### Appendix: Monitor Payments

### Use
The Monitor Paymentsstep originates from the Advanced Cash Operations(J78) test script. For more information about the process, go to the test script for J78.

</details>

---


## Activity 89: Additional Information: Monitor Payments

> 7 steps total | 4 classifiable | 3 hidden

### Step 708: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Monitor Payments |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
### Context
In the Monitor Payments(F2388)app, you can display an overview of your payment batches. You can view the statuses of batches and individual payments at different processing stages.
In different stages of a BCM batch's lifecycle, the app displays different batch/batch item status.
  - Payment Batch Created: Batch is created and waits for first approval.

  - In Approval: Batch is approved at least once, though not final approval.

  - Payment Medium Created: Batch successfully completes approval process and the payment medium is created.

  - Accepted by Bank: The payment medium has been sent to the bank and the bank sends responds with a payment status message accepting the payment instruction. This can also be fulfilled through Multi-Bank Connectivity (MBC).

  - Stmt. Received: Batch is reconciled by a bank statement.
Note
The Monitor Payments app incorporates SWIFT gpi reason codes to indicate the status of payments. External entities, such as banks, use reason codes to communicate the status of SWIFT gpi payments. Your entity receives these external Status Reason Codesand translates them into internal reason codes. One internal reason code may be mapped to many external reason codes. You, as the key user for configuration, can create reason codes and map them to external reason codes.

### Procedure

</details>

---

### Step 709: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Monitor Payments |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

---

### Step 710: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Monitor Payments |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Monitor Payments (F2388).

</details>

---

### Step 711: Find the Newly Created Batch

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 457 |
| **Activity** | Additional Information: Monitor Payments |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Maintain your filter and choose Go. Choose the New tab.

</details>

**Expected Result (Test Verification):**
> All newly created batches are displayed on the New tab. You can find the batch you created earlier in the process.

---

### Step 712: Verify the Batch Status

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 458 |
| **Activity** | Additional Information: Monitor Payments |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Verify the batch status in the Bank Status Text column. The status should be Payment Batch Created.

</details>

**Expected Result (Test Verification):**
> Note
> If the approval list in bank master data is empty, all payment will be rejected or approved depending on the value customized in the Define Automatic Approval/Rejection for Bank Account Master Data preliminary step in the Advanced Cash Operations (J78) test script.

---

### Step 713: Check Details

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 459 |
| **Activity** | Additional Information: Monitor Payments |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select your cash flow item, and choose > (Details).

</details>

**Expected Result (Test Verification):**
> Detailed information for this batch is displayed.

---

### Step 714: Check Approver

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 460 |
| **Activity** | Additional Information: Monitor Payments |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the header section, choose Approvers to check who are the first approvers for the batch. Close the dialog box when you are done.

</details>

**Expected Result (Test Verification):**
> All approvers used in the first approver step are shown (for example: Accounts Payable Manager).

---


# Appendix: Statistics

| Step Type | Count | Classifiable |
|-----------|-------|-------------|
| Information | 94 | 0 |
| Logon | 77 | 0 |
| Access App | 77 | 0 |
| Process Step | 382 | 382 |
| Data Entry | 16 | 16 |
| Verification | 24 | 24 |
| Action | 38 | 38 |
| Navigation | 6 | 0 |

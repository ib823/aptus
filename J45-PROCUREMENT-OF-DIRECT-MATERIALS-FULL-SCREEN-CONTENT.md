# J45 — Procurement of Direct Materials: Complete Screen-by-Screen Content

> **What the user sees on every screen in the review flow.**
> This document reproduces the exact content shown in the ABEAM assessment tool when a user reviews J45 (Procurement of Direct Materials). For each step it shows the step title, type badge, business context explanation, the full SAP technical reference content (normally collapsed), expected results, and activity context — exactly as rendered on screen.

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
| Total steps | 626 |
| Classifiable (shown by default) | 338 |
| Hidden by default | 288 |
| Unique activities | 78 |

---


## Activity 1: Additional Information

> 9 steps total | 0 classifiable | 9 hidden

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
| Master Data Specialist - Product Data
 | SAP_BR_PRODMASTER_SPECIALIST
 | Master Data - Products/ Product Governance | SAP_BR_PRODMASTER_SPECIALIST/ SAP_CMD_SPT_PR_GOV_PC | 
 | Master Data Specialist - Business Partner Data
 | SAP_BR_BUPA_MASTER_SPECIALIST
 | Master Data - Business Partners/ Business Partner Governance/ Business Partner Governance | SAP_BR_BUPA_MASTER_SPECIALIST/ SAP_CA_SPT_MDG_BP_GOV_PC/ SAP_CMD_SPT_BP_GOV_PC | 

 | Purchaser
 | SAP_BR_PURCHASER
 | Purchasing/ Sourcing and Contracting | SAP_MM_SPT_PURCHASING_PC/ SAP_MM_SPT_SOURCING_PC | 
 | Purchasing Manager
 | SAP_BR_PURCHASING_MANAGER
 | My Inbox | SAP_CORE_SPT_MYINBOX_PC | 
 | Inventory Manager | SAP_BR_INVENTORY_MANAGER
 | Inventory Management | SAP_BR_INVENTORY_MANAGER | 
 | Warehouse Clerk
 | SAP_BR_WAREHOUSE_CLERK
 | Inventory Processing | SAP_BR_WAREHOUSE_CLERK | 
 | Accounts Payable Accountant | SAP_BR_AP_ACCOUNTANT
 | Accounts Payable/ Central Invoice Management - Supplier Invoices/ Central Invoicing - Supplier Invoice | SAP_BR_AP_ACCOUNTANT/ SAP_MM_SPT_CIM_INV_PC/ SAP_MM_SPT_CNTRL_INVOICING_PC | 
 | Configuration Expert - Business Process Configuration
 | SAP_BR_BPC_EXPERT
 | Business Process Configuration/ Business Process Configuration - Finance/ Business Process Configuration - Procurement/ Manage your Solution/ Business Process Configuration - Workflow/ Business Configuration - Feature Management/ Business Process Configuration - Extensibility Explorer/ Business Configuration - Transportation | SAP_BR_BPC_EXPERT/ SAP_FIN_SPT_BPC_EXPERT_PC/ SAP_MM_SPT_BIZ_PROC_CONFIGN_PC/ SAP_CA_SPT_IC_LND_BASE_PC/ SAP_CA_SPT_BPC_WORKFLOW_PC/ SAP_CA_SPT_BPC_FM_PC/ SAP_EI_SPT_BPC_EXT_PC/ SAP_TM_SPT_TRANSPCFG_PC | 
 | Business Process Specialist
 | SAP_BR_BUSINESS_PROCESS_SPEC
 | Business Process Management/ Business Process Management
 | SAP_BR_BUSINESS_PROCESS_SPEC/ SAP_CA_SPT_BPS_PC
 | 
 | Billing Clerk
 | SAP_BR_BILLING_CLERK
 | Billing | SAP_BR_BILLING_CLERK | 
 | Administrator
 | SAP_BR_ADMINISTRATOR | Administration/ Administration - Workforce Master Data/ Administration - License Compliance/ Administration - Data Management/ Administration - Output Control | SAP_BR_ADMINISTRATOR/ SAP_BUM_SPT_ADMINISTRATION_PC/ SAP_EI_SPT_ADM_LC_PC/ SAP_CA_SPT_TDR_PC/ SAP_OC_SPT_ADMINISTRATION_PC | 

### Master Data, Organizational Data, and Other Data
The organizational structure and master data of your company have been created in your system during implementation. The organizational structure reflects the structure of your company. The master data represents materials, customers, and suppliers, for example, depending on the operational focus of your company.
Use your own master data or the following sample data to go through the test procedure:

#### Roles
Create business roles using the following business role templates delivered by SAP and assign them to your individual test users.Name (Role Template)
ID (Role Template)
Name (Launchpad Space)
ID (Launchpad Space)
Master data
Value
Master. data details
Comments

 | Plant
 | 5410 | Plant 1 MY | 
 | Storage Location
 | 541A | Standard storage 1 | Shop floor w/o lean WM

 | Storage Location
 | 541B | Standard storage 2 | Shop floor w/o lean WM

 | Company Code
 | 5410 | Company Code 5410 | 
 | Purchase Organization
 | 5410 | Purch. Org. 5410 | 
 | Purchasing group
 | 001/002 | Group 001/Group 002 | depending on material

 | Supplier
 | 54300001 | Domestic MY Supplier 1 | 
 | Supplier | 54300003 | Domestic MY Supplier 3 | 
 | Material
 | TG0011 | Trading Good 0011,PD,Regular Proc. | 

For more information on creating these master data objects, see the following Master Data Scripts (MDS)
Master Data Script ReferenceMaster Data Script ID
Description

 | BNF
 | Create Product Master of type "Trading Good" - MDS
 | BNE
 | Create Supplier Master - MDS

#### Instructions
### Purpose

### Overview
This purchasing process uses purchase requisitions that are generated either by the Material Requirements Planning (MRP) process or manually by a requester. The conversion from a purchase requisition to a purchase order can either be done manually (in case adoptions are necessary) or automatically (applicable for large volumes). Alternatively, the purchase orders can be generated manually.
The purchase order can be subject to approval before being issued to a supplier. Goods are shipped from the supplier and the goods receipt is created with reference to the corresponding purchase order. Subsequently the invoicing process is triggered. The user can monitor the progress throughout the entire procurement process and can initiate reactive actions if needed.
This document provides a detailed procedure for testing this scope item after solution activation, reflecting the predefined scope of the solution. Each process step, report, or item is covered in its own section, providing the system interactions (test steps) in a table view. Steps that are not in scope of the process but are needed for testing are marked accordingly. Project-specific steps must be added.
### System Access
System
Details

 | System
 | Accessible via SAP Fiori launchpad. Your system administrator provides you with the URL to access the various apps assigned to your role.

### Additional Manual Configuration
Before you can test this scope item, you must have completed the additional configuration steps that are described in the Set-Up Instructions for this scope item. These configuration steps are specific for your implementation and include mandatory settings that are not delivered by SAP and must be created by you. For more information, follow the link to the document: Link to Set-Up Instructions
### Business Conditions
Scope ItemBusiness Condition
 | BNZ - Create New Open MM Posting Period - MDS
 | You have completed the step described in the Create New Open MM Posting Period - MDSmaster data script. Posting Period is up to date.

 | 31N - Situation Handling
 | You install this scope item for the situation handling steps. 

### Preliminary Steps: Open New MM Period
External Process
For this activity, run the following steps from the Create New Open MM Posting Period - MDS(BNZ) to close MM period and open new posting period:
Closing MM Period and Opening New Posting Period

</details>

---


## Activity 2: Additional Information: Preliminary Steps: Create Purchasing Info Record (Optional)

> 12 steps total | 8 classifiable | 4 hidden

### Step 2: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Create Purchasing Info Record (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Note
If the Info Record for the material TG0011and suppliers (54300001, 54300002and 54300003) already exists in the system, you can skip this step. 

### Procedure

</details>

---

### Step 3: Log on

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Create Purchasing Info Record (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Log onto the SAP Fiori launchpad as a Purchaser.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---

### Step 4: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Create Purchasing Info Record (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Purchasing Info Records (F1982) .

</details>

**Expected Result (Test Verification):**
> The Manage Purchasing Info Records screen is displayed.

---

### Step 5: Open New Purchasing Info Record

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 1 |
| **Activity** | Additional Information: Preliminary Steps: Create Purchasing Info Record (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Create.

</details>

**Expected Result (Test Verification):**
> The Purchasing Info Record Screen is displayed.

---

### Step 6: Enter Header Data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 2 |
| **Activity** | Additional Information: Preliminary Steps: Create Purchasing Info Record (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries:
Purchasing Info Record Category: Standard 
Purchasing Organization: 5410
Supplier: 54300001
Material: TG0011
Plant: 5410
Purchasing Group: 002

</details>

**Expected Result (Test Verification):**
> Header data is added.

---

### Step 7: Enter General Information

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 3 |
| **Activity** | Additional Information: Preliminary Steps: Create Purchasing Info Record (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries:
Available From:Today
Available To:31.12.9999

</details>

**Expected Result (Test Verification):**
> General Information is added.

---

### Step 8: Enter Purchasing Data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 4 |
| **Activity** | Additional Information: Preliminary Steps: Create Purchasing Info Record (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries:
Incoterm: EXW
Note
Incoterms and their corresponding versions are grouped in the F4 value help. Selecting an incoterm automatically populates its associated version, which can be subsequently modified or removed if needed.
Incoterm Location 1: VENDOR

</details>

**Expected Result (Test Verification):**
> Purchasing Data is added.

---

### Step 9: Enter Delivery and Quantity Data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 5 |
| **Activity** | Additional Information: Preliminary Steps: Create Purchasing Info Record (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step handles shipping goods to customers. Think about: how are deliveries scheduled? Do you use a logistics provider? Do you track shipments?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries:
Delivery Time in Days: 1
Under Delivery Tolerance in %: 10.0
Over Delivery Tolerance in %: 10.0
Tax Code: <Input Tax Code>
Tax Rate Valid From: Select value from F4 help
Note
If time dependent tax (TDT) is activated, and fields Country/Region Key for company code, Validity Periods and Tax Code are maintained via SSCUI 101016 in SAP S/4HANA Cloud Public Edition or the configuration activity Define Tax Codes for Sales and Purchases in Central Business Configuration, you must maintain the Tax Rate Valid From field in the New Purchasing Info Record screen. If you enter the current date, this date will be adjusted to a valid start date for your tax code according to the SSCUI/configuration activity settings.
If Registration for Indirect Taxation Abroad (RITA) is activated, and tax registration country and tax code are maintained for company code via SSCUI 103464 in SAP S/4HANA Cloud Public Edition or the configuration activity Activate RITA and Maintain Tax Registration Countries in Central Business Configuration, you must maintain the Tax Country field. The default value of this field is the country ID of company code, but you can change it to a valid country ID that is maintained in the SSCUI/configuration activity accordingly.

Order Unit: PC
Standard Order Quantity: 10
Goods-Receipt-Based Invoice Verification: select
No Evaluated Receipt Settlement: select

</details>

**Expected Result (Test Verification):**
> Delivery and Quantity Data is added.

---

### Step 10: Enter Condition Data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 6 |
| **Activity** | Additional Information: Preliminary Steps: Create Purchasing Info Record (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Conditions section, choose Create. 
In the General Information area, make the following entries:
Valid From: Today
Valid To: 12.31.9999
Amount: 300,00
Pricing Unit: 1
Currency: MYR
Choose Apply.

</details>

**Expected Result (Test Verification):**
> Condition Data is added

---

### Step 11: Enter Reference Data (optional)

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 7 |
| **Activity** | Additional Information: Preliminary Steps: Create Purchasing Info Record (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

You can enter reference data.

</details>

**Expected Result (Test Verification):**
> Reference data is added.

---

### Step 12: Create your data

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 8 |
| **Activity** | Additional Information: Preliminary Steps: Create Purchasing Info Record (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Create.

</details>

**Expected Result (Test Verification):**
> The purchasing info record is created.

---

### Step 13: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Create Purchasing Info Record (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Note
TG0011and Supplier 54300002, its net price is 35MYR.

</details>

---


## Activity 3: Additional Information: Preliminary Steps: Create Purchase Requisition

> 9 steps total | 5 classifiable | 4 hidden

### Step 14: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Create Purchase Requisition |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
Purchase Requisition can be created via MRP run (refer to J44 - Material Requirements Planning) or they can be created manually.

</details>

---

### Step 15: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Create Purchase Requisition |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Log on to the SAP Fiori launchpad as a Purchaser.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 16: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Create Purchase Requisition |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Manage Purchase Requisitions - Professional (F2229) .

</details>

**Expected Result (Test Verification):**
> The Manage Purchase Requisitions - Professional screen displays.

---

### Step 17: Create New Purchase Requisition

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 9 |
| **Activity** | Additional Information: Preliminary Steps: Create Purchase Requisition |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step is about how purchase requests are created in your company. Think about: do your staff submit purchase requests? Is there an approval workflow? Do you have spending limits?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Create.

</details>

**Expected Result (Test Verification):**
> The Purchase Requisition screen displays.

---

### Step 18: Enter Document Type

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 10 |
| **Activity** | Additional Information: Preliminary Steps: Create Purchase Requisition |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
From the Document Type drop-down, select Pur. Requisition (NB).

</details>

---

### Step 19: Add Item

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 11 |
| **Activity** | Additional Information: Preliminary Steps: Create Purchase Requisition |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Items section, choose Create then choose Material.

</details>

**Expected Result (Test Verification):**
> The Purchase Requisition screen displays.

---

### Step 20: Enter detail data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 12 |
| **Activity** | Additional Information: Preliminary Steps: Create Purchase Requisition |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter the following values in the General Information section:
Item Category: Standard
Material: TG0011
Plant: 5410
Enter the following values in the Quantity and Date section:
Quantity:10
Delivery Date: default value
Requisition Date: default value
Release Date: default value
Enter the following values in the Contact Information section:
Requirement Tracking Number: For example,  TestTrack
Purchasing Organization:5410
Purchasing Group:001 or 002
Choose Apply. And you automatically go back to the Purchase Requisition screen.

</details>

---

### Step 21: Create your entries

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 13 |
| **Activity** | Additional Information: Preliminary Steps: Create Purchase Requisition |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Create. 
Choose Create to confirm the popup message.

</details>

**Expected Result (Test Verification):**
> A purchase requisition is created.

---

### Step 22: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Create Purchase Requisition |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

### Result
The Purchase Requisition is created.

</details>

---


## Activity 4: Additional Information: Preliminary Steps: Check Flexible Workflow for Purchase Order Approval

> 11 steps total | 4 classifiable | 7 hidden

### Step 23: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Check Flexible Workflow for Purchase Order Approval |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this procedure, you check the flexible workflow for purchase order approval.
When you use the flexible workflow to approve the purchase order, make sure Flexible Workflow for Purchase Order with NB document is activated, and Flexible Workflow for Purchase Order Approval is configured.

#### Procedure
Depending on your configuration environment for SAP S/4HANA Cloud Public Edition, choose one of the following options:
Configure Your Solution:

</details>

---

### Step 24: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Check Flexible Workflow for Purchase Order Approval |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori Launchpad as a Configuration Expert - Business Process Configuration.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori Launchpad is displayed.

---

### Step 25: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Check Flexible Workflow for Purchase Order Approval |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Your Solution (F1241).

</details>

**Expected Result (Test Verification):**
> The Manage Your Solution screen is displayed.

---

### Step 26: Open Configure Your Solution

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Check Flexible Workflow for Purchase Order Approval |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Configure Your Solution.Note
To create country-/region-dependent settings for the intended local version, choose Set Local Version.

</details>

**Expected Result (Test Verification):**
> The Configure Your Solution screen is displayed.

---

### Step 27: Open Active Flexible Workflow

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 14 |
| **Activity** | Additional Information: Preliminary Steps: Check Flexible Workflow for Purchase Order Approval |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Configure Your Solution: Realize Phase screen, search Activate Flexible Workflow for Purchase Orders, then choose Search.
Select the line of the item and go to the next screen.
On the Configure Your Solution - Purchase Order Processing screen, choose Configure on the line of configuration step with name Activate Flexible Workflow for Purchase Orders.

</details>

**Expected Result (Test Verification):**
> The Document Types Purchase order Change screen is displayed.

---

### Step 28: Check Flexible Workflow for PO Approval

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 15 |
| **Activity** | Additional Information: Preliminary Steps: Check Flexible Workflow for Purchase Order Approval |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Verify the following entries: 
  - Purchasing Doc. Type: NB

  - Scenario based workflow: <Selected>

</details>

**Expected Result (Test Verification):**
> The Scenario based workflow is active for Purchase Orders with Document Type: NB.

---

### Step 29: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Check Flexible Workflow for Purchase Order Approval |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

SAP Central Business Configuration:

</details>

---

### Step 30: Log on

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Check Flexible Workflow for Purchase Order Approval |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the project experience in SAP Central Business Configuration.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori Launchpad displays.

---

### Step 31: Open Active Flexible Workflow

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 16 |
| **Activity** | Additional Information: Preliminary Steps: Check Flexible Workflow for Purchase Order Approval |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Go to the Configuration app. To locate the activity in the tree view, search for the following activity: Activate Flexible Workflow for Purchase Orders. Choose Open Documentation for the found line item to see more details about this configuration activity.
 Choose the link to navigate directly to the SAP S/4HANA Cloud Public Edition system. Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration.

</details>

**Expected Result (Test Verification):**
> The Document Types Purchase order Change screen displays.

---

### Step 32: Check Flexible Workflow for PO Approval

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 17 |
| **Activity** | Additional Information: Preliminary Steps: Check Flexible Workflow for Purchase Order Approval |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Verify the following entries: 
  - Purchasing Doc. Type: NB

  - Scenario based workflow: <Selected>

</details>

**Expected Result (Test Verification):**
> The Scenario based workflow is active for Purchase Orders with Document Type: NB.

---

### Step 33: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Check Flexible Workflow for Purchase Order Approval |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
### Result
The Scenario based workflow is active for Document Type: NB.

</details>

---


## Activity 5: Additional Information: Preliminary Steps: Configure Flexible Workflow for Purchase Order

> 6 steps total | 2 classifiable | 4 hidden

### Step 34: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Configure Flexible Workflow for Purchase Order |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this procedure, you configure release conditions for Purchase Order Approval.Note
When you start to process this step, please make sure that the flexible workflow for purchase document type NB has been activated in your system. 
Note
For the Workflow Name and Steps Name, you can translate to other languages via app Workflow Content Translation, for example translate it from English to German.

</details>

---

### Step 35: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Configure Flexible Workflow for Purchase Order |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration.

</details>

**Expected Result (Test Verification):**
> The Fiori launchpad is displayed.

---

### Step 36: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Configure Flexible Workflow for Purchase Order |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Workflows for Purchase Orders (F2872).

</details>

**Expected Result (Test Verification):**
> The Manage Workflows screen is displayed.

---

### Step 37: Create Manage Workflow

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 18 |
| **Activity** | Additional Information: Preliminary Steps: Configure Flexible Workflow for Purchase Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Create, and make the following entries:
Workflow Name: <Test Workflow for Purchase Order>
From the Start Conditions section, add the following preconditions:
Purchasing group of purchase order is: Selected
Purchasing Group: 003
Choose Create another condition, and make the following entries:
Total net amount of purchase order is greater than: Selected
Amount: For example, 5000,00
Currency: MYR
In the Steps area, choose Create and make the following entries:
Step Type: Release of Purchase Order
In the Recipients area, make the following entries:
Assignment By: User
User: Select User from value help (with Employee ID PURCHASING_MANAGER)
Choose OK.
Step to be completed by: One of the recipients.
Choose Create.
Choose Save.

</details>

**Expected Result (Test Verification):**
> The Workflow for Purchase Order is configured.

---

### Step 38: Activate Workflow Item

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 19 |
| **Activity** | Additional Information: Preliminary Steps: Configure Flexible Workflow for Purchase Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the Workflow Item just created, and choose Activate.

</details>

**Expected Result (Test Verification):**
> The Workflow Item is activated.

---

### Step 39: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Configure Flexible Workflow for Purchase Order |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Note
Please make sure default workflow Automatic Release of Purchase Order has been activated.

</details>

---


## Activity 6: Additional Information: Preliminary Steps: Manage Conditions to Restart Flexible Workflow

> 7 steps total | 2 classifiable | 5 hidden

### Step 40: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Manage Conditions to Restart Flexible Workflow |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Procedure
Depending on your configuration environment for SAP S/4HANA Cloud Public Edition, choose one of the following options:
Configure Your Solution:

</details>

---

### Step 41: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Manage Conditions to Restart Flexible Workflow |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori Launchpad is displayed.

---

### Step 42: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Manage Conditions to Restart Flexible Workflow |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

OpenManage Your Solution (F1241).

</details>

**Expected Result (Test Verification):**
> The Manage Your Solution screen is displayed.

---

### Step 43: Open Configure Your Solution

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Manage Conditions to Restart Flexible Workflow |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Configure Your Solution.Note
If country version needs to be added, choose Set Country Version.

</details>

**Expected Result (Test Verification):**
> The Configure Your Solution screen is displayed.

---

### Step 44: Open Active Flexible Workflow

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 20 |
| **Activity** | Additional Information: Preliminary Steps: Manage Conditions to Restart Flexible Workflow |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Configure Your Solution: Realize Phase screen, search Manage Conditions to Restart Flexible Workflow, then choose Search.
Select the line of the item for Item Name Purchase Order Processing, and go to the next screen.On the Purchase Order Processing screen, search for Manage Conditions to Restart Flexible Workflow for Purchase Orders and choose Configure.

</details>

**Expected Result (Test Verification):**
> The Manage Conditions to Restart Flexible Workflow for POs screen is displayed.

---

### Step 45: Conditions to Restart Flexible Workflow

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 21 |
| **Activity** | Additional Information: Preliminary Steps: Manage Conditions to Restart Flexible Workflow |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
You can see that the Purchase Order Attributes have been enabled for the Restart Flexible Workflow for PO and Always Restart for Restart Type.

</details>

**Expected Result (Test Verification):**
> The conditions to Restart Flexible Workflow for Purchase Order have been verified.

---

### Step 46: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Manage Conditions to Restart Flexible Workflow |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Expected Result
| 1
 | Log On | Log on to the project experience in SAP Central Business Configuration. 
 |  | 
 | 2
 | Check Define Rules for Determination of Master Form Template
 | In the Product-Specific Configuration phase, navigate to the Configuration Activitiestab. To locate the activity in the tree view, search for the following activity: Manage Conditions to Restart Flexible Workflow.Choose Open Documentationfor the found line item to see more details about this configuration activity.
Choose the link to navigate directly to the SAP S/4HANA Cloud Public Editionsystem. Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration.
 |  | 
 | 3
 | Conditions to Restart Flexible Workflow 
 | You can see that the Purchase Order Attributeshave been enabled for the Restart Flexible Workflow for POand Always Restart for Restart Type. | The conditions to Restart Flexible Workflow for Purchase Order have been verified.
 | 

### Result
The conditions to Restart Flexible Workflow for Purchase Order has been verified.

#### Instructions
SAP Central Business Configuration:Test Step #
Test Step
Instruction

</details>

---


## Activity 7: Additional Information: Preliminary Steps: Create Ready-to-Use Situation Type for Cash Discount at Risk (Optional)

> 7 steps total | 4 classifiable | 3 hidden

### Step 47: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Create Ready-to-Use Situation Type for Cash Discount at Risk (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this procedure, you create ready-to-use situation type for cash discount at risk.
Note
Please make sure 31N is activated if you want to execute this step.

</details>

---

### Step 48: Log on

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Create Ready-to-Use Situation Type for Cash Discount at Risk (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log onto the SAP Fiori Launchpad using the Business Process Specialist role.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori Launchpad displays.

---

### Step 49: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Create Ready-to-Use Situation Type for Cash Discount at Risk (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Situation Types (F2947) .

</details>

**Expected Result (Test Verification):**
> The Manage Situation Types screen displays.

---

### Step 50: Copy standard template

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 22 |
| **Activity** | Additional Information: Preliminary Steps: Create Ready-to-Use Situation Type for Cash Discount at Risk (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Situation Templates tab and choose Go to display standard situation templates.
Choose situation template with ID: MM_CASHDISCOUNTATRISK and choose Copy.

</details>

**Expected Result (Test Verification):**
> The Situation Type screen displays.

---

### Step 51: Create custom Situation Type

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 23 |
| **Activity** | Additional Information: Preliminary Steps: Create Ready-to-Use Situation Type for Cash Discount at Risk (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Situation Type screen, make the following entries:
ID: Z_MM_CASHDISCOUNTATRISK (for example). 
Name: Cash Discount at Risk; 
Display Sequence: High
Go to section Conditions and make sure that Processing Order 1 is set as Open, and Send Notification is selected. 
On the Used Filters section, remove all values for Criteria Cash Discnt Due Date, and ensure it is blank. 
Go to section Batch Job Scheduling and make the following entries:
Time Zone: Any Data (select a time zone from input help based on your location)
Start Batch Job At: Any Data
Go to section Situation Display. 
Message Details: <default value> 
Go to section Notifications and do the following:
Aggregate Notifications: Select.
Resend Notifications: Select.
Go to section Recipients.
Filter by Member Function: Select Operational Purchasing from the dropdown list.
Go to section Situation Monitoring and select Monitor Instances.

</details>

---

### Step 52: Save Situation Type

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 24 |
| **Activity** | Additional Information: Preliminary Steps: Create Ready-to-Use Situation Type for Cash Discount at Risk (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Create.

</details>

**Expected Result (Test Verification):**
> The Situation Type is created.

---

### Step 53: Enable Situation Type

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 25 |
| **Activity** | Additional Information: Preliminary Steps: Create Ready-to-Use Situation Type for Cash Discount at Risk (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
From the Enable Situation Type dialog box, select Yes.

</details>

**Expected Result (Test Verification):**
> The Situation Type is enabled.

---


## Activity 8: Additional Information: Preliminary Steps: Create Team and Responsibilities (Optional)

> 5 steps total | 2 classifiable | 3 hidden

### Step 54: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Create Team and Responsibilities (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this procedure, you create team and responsibilities for Cash Discount at Risk.

</details>

---

### Step 55: Log on

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Create Team and Responsibilities (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log onto the SAP Fiori Launchpad as a Configuration Expert - Business Process Configuration.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori Launchpad displays.

---

### Step 56: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Create Team and Responsibilities (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Manage Teams and Responsibilities - Procurement (F2412) .

</details>

**Expected Result (Test Verification):**
> The Manage Teams and Responsibilities screen displays.

---

### Step 57: Create team and responsibilities

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 26 |
| **Activity** | Additional Information: Preliminary Steps: Create Team and Responsibilities (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Create and make following entries:
Name: Z_MM_CASHDISCOUNTATRISK
Global ID: Z_MM_CASHDISCOUNTATRISK
Description: for Cash Discount at Risk
Status: Enabled
Type: OPPUR
Go to Team Owners area, the default team owner value will display. If the default team owner does not display, then choose Create, and make the following entries: 
Business Partner: Select from F4 help help. For example: search Last Name for *Bpc_expert* to get the user ID. 
Go to Team Members area, choose Create, and make the following entry:
Business Partner: Select from F4 help. For example: search Last Name for *APAccountant* to get the user ID.
Choose OK.
Functions: Select OP_PURCH from F4 help

</details>

---

### Step 58: Save Team

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 27 |
| **Activity** | Additional Information: Preliminary Steps: Create Team and Responsibilities (Optional) |

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


## Activity 9: Additional Information

> 9 steps total | 0 classifiable | 9 hidden

### Step 59: Information

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
By default, you have completed the creation of master data, including material master data, supplier master data and Info Record.
You can find general information on how to create master data objects in the Master Data Scripts (MDS) BNF and BNE.

#### Instructions
### Preliminary Steps: Master Data Update for Automatic Purchase Order Creation from Purchase Requisition
Note
If you want to perform the step Automatic Purchase Order Creation from Purchase Requisition, run these Preliminary steps.

</details>

---


## Activity 10: Additional Information: Change Material Master Data - Purchasing Data

> 9 steps total | 5 classifiable | 4 hidden

### Step 60: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Change Material Master Data - Purchasing Data |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
The following procedure provides instructions for changing material master data.

</details>

---

### Step 61: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Change Material Master Data - Purchasing Data |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad using the Master Data Specialist - Product Data role.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 62: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Change Material Master Data - Purchasing Data |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Change Material (MM02).

</details>

**Expected Result (Test Verification):**
> The Change Material (Initial Screen) displays.

---

### Step 63: Enter Material Basic Data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 28 |
| **Activity** | Additional Information: Change Material Master Data - Purchasing Data |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Change Material screen, make the following entries:
Material: for example, TG0011
Choose Select View(s).

</details>

**Expected Result (Test Verification):**
> The Select View(s) screen displays.

---

### Step 64: Choose Views

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 29 |
| **Activity** | Additional Information: Change Material Master Data - Purchasing Data |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Select View(s) screen, choose Purchasing and Continue.

</details>

**Expected Result (Test Verification):**
> The Organizational Levels displays.

---

### Step 65: Enter Organizational Levels Data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 30 |
| **Activity** | Additional Information: Change Material Master Data - Purchasing Data |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Organizational Levels screen, make the following entries: 
Plant: <Plant>, for example, 5410
Choose Continue.

</details>

**Expected Result (Test Verification):**
> The Change Material XXXXX (Material general) displays.

---

### Step 66: Select Autom.PO

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 31 |
| **Activity** | Additional Information: Change Material Master Data - Purchasing Data |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Scroll down to the General Data section and select the following: 
Autom.PO: <selected>

</details>

**Expected Result (Test Verification):**
> Autom.PO  is selected.

---

### Step 67: Save your data

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 32 |
| **Activity** | Additional Information: Change Material Master Data - Purchasing Data |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Save.

</details>

**Expected Result (Test Verification):**
> The material master data is updated.

---

### Step 68: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Change Material Master Data - Purchasing Data |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

### Result
The Autom.PO checkbox is selected.

</details>

---


## Activity 11: Additional Information: Change Supplier Master Data - Purchasing Organization Data

> 10 steps total | 7 classifiable | 3 hidden

### Step 69: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Change Supplier Master Data - Purchasing Organization Data |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
The following procedure provides instructions for changing supplier master data.

</details>

---

### Step 70: Log on

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Change Supplier Master Data - Purchasing Organization Data |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad using the Master Data Specialist - Business Partner Data role.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 71: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Change Supplier Master Data - Purchasing Organization Data |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Maintain Business Partner (BP).

</details>

**Expected Result (Test Verification):**
> The Maintain Business Partner screen displays.

---

### Step 72: Enter Business Partner

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 33 |
| **Activity** | Additional Information: Change Supplier Master Data - Purchasing Organization Data |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entry and choose Enter:
  - Find: Business Partner

  - By: Supplier Number

  - Supplier Number: for example,54300001

Choose Start. The Supplier row displays.
Double-click the Supplier Partner row.

</details>

**Expected Result (Test Verification):**
> The Supplier information  screen displays.

---

### Step 73: Switch to Change mode

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 34 |
| **Activity** | Additional Information: Change Supplier Master Data - Purchasing Organization Data |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Ensure you are in Change mode. Otherwise, select Switch Between Display and Change.

</details>

**Expected Result (Test Verification):**
> The Change mode screen displays.

---

### Step 74: Change BP role

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 35 |
| **Activity** | Additional Information: Change Supplier Master Data - Purchasing Organization Data |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Change in BP role field, choose the following value: Supplier (defined)

</details>

---

### Step 75: Open Purchasing Organization Data

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 36 |
| **Activity** | Additional Information: Change Supplier Master Data - Purchasing Organization Data |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Purchasing tab at the top of the screen.

</details>

**Expected Result (Test Verification):**
> The Purchasing Organization sub section screen displays.

---

### Step 76: Enter Purchasing Data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 37 |
| **Activity** | Additional Information: Change Supplier Master Data - Purchasing Organization Data |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Switch Organization.
Make the following entry and choose Enter:
  - Purch. Organization: <Purchasing Organization>, for example, 5410

</details>

---

### Step 77: Select Automatic PO checkbox

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 38 |
| **Activity** | Additional Information: Change Supplier Master Data - Purchasing Organization Data |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
From the Purchasing Data section, scroll down to the Additional Purchasing Data section, make the following entry:
  - Automatic Purchase Order: <selected>

</details>

**Expected Result (Test Verification):**
> The Automatic PO checkbox is selected.

---

### Step 78: Save your data

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 39 |
| **Activity** | Additional Information: Change Supplier Master Data - Purchasing Organization Data |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Save.

</details>

**Expected Result (Test Verification):**
> The Supplier change is saved.

---


## Activity 12: Additional Information: Generate Source List

> 9 steps total | 6 classifiable | 3 hidden

### Step 79: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Generate Source List |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
The following procedure provides instructions for creating source list.
Note
If you have more than one supplier, choose one fixed supplier in the source list.

</details>

---

### Step 80: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Generate Source List |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad using the Purchaser role.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 81: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Generate Source List |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Source Lists (F1859).

</details>

**Expected Result (Test Verification):**
> The Manage Source Lists screen displays.

---

### Step 82: Create Source List

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 40 |
| **Activity** | Additional Information: Generate Source List |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Create.

</details>

**Expected Result (Test Verification):**
> The Source List  screen displays.

---

### Step 83: Enter General Information

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 41 |
| **Activity** | Additional Information: Generate Source List |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Go to General Information area and make the following entries:
  - MaterialTG0011

  - Plant: : for example, <Plant>, for example, 5410

Choose Generate.

</details>

---

### Step 84: : for example,Search these Sources for the Material and Plant

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 42 |
| **Activity** | Additional Information: Generate Source List |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Generated Sources sceen, make the following entries:
  - Valid From: <Current Date>

  - Valid To: <31.12.9999>

Choose Go,

</details>

**Expected Result (Test Verification):**
> The Sources are displayed.

---

### Step 85: Choose Sources

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 43 |
| **Activity** | Additional Information: Generate Source List |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Go to Sources (X)  area.
Choose all lines of items.
Choose Replace Existing.
If you have warning message, choose OK.

</details>

---

### Step 86: Choose a fixed Source

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 44 |
| **Activity** | Additional Information: Generate Source List |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Go to Supplier 54300001 and make the following entry:
  - Status: Fixed Status (Fixed)

</details>

**Expected Result (Test Verification):**
> The Supplier has been assigned to Fixed Supplier.

---

### Step 87: Save your Data

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 45 |
| **Activity** | Additional Information: Generate Source List |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Create.

</details>

**Expected Result (Test Verification):**
> The Source List is created.

---


## Activity 13: Additional Information: Preliminary Steps: Edit User-Specific Parameters for Supplier Invoices (Optional)

> 5 steps total | 1 classifiable | 4 hidden

### Step 88: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Edit User-Specific Parameters for Supplier Invoices (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this procedure, you will edit User-Specific parameters for supplier invoices.

</details>

---

### Step 89: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Edit User-Specific Parameters for Supplier Invoices (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

**Expected Result (Test Verification):**
> The Fiori launchpad is displayed.

---

### Step 90: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Edit User-Specific Parameters for Supplier Invoices (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Edit Supplier Invoice Settings (F3813)

</details>

**Expected Result (Test Verification):**
> The Edit Supplier Invoice Settings  screen is displayed.

---

### Step 91: Set parameter

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 46 |
| **Activity** | Additional Information: Preliminary Steps: Edit User-Specific Parameters for Supplier Invoices (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Check parameter Display Journal Entry: X
Note
If parameter is checked, when invoice is created, system message contains invoice and journal entry number. 
If parameter is unchecked, when invoice is created, system message contains invoice number only. 
When this parameter is changed, for APP Create Supplier Invoice, it will take effective immediately. For APP Create Supplier Invoice – Advanced, user needs to logout and login again to make it take effective.

</details>

**Expected Result (Test Verification):**
> Change has been saved successfully.

---

### Step 92: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Edit User-Specific Parameters for Supplier Invoices (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
### Result
Parameter Display Journal Entry has been set successfully.

</details>

---


## Activity 14: Additional Information: Preliminary Steps for eDocument Process (Optional): Maintain Business Partner Master Data

> 8 steps total | 5 classifiable | 3 hidden

### Step 93: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Maintain Business Partner Master Data |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you add tax information to business partner.

</details>

---

### Step 94: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Maintain Business Partner Master Data |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Master Data Specialist - Business Partner Data Test.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 95: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Maintain Business Partner Master Data |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Maintain Business Partner (BP).

</details>

**Expected Result (Test Verification):**
> The Maintain Business Partner view displays.

---

### Step 96: Enter Business Partner

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 47 |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Maintain Business Partner Master Data |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Hover over the text and choose the Switch Between Display and Change (F6) button to switch to change mode.

</details>

---

### Step 97: Change BP role

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 48 |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Maintain Business Partner Master Data |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Change in BP role field, choose the following value:
Customer (Fin.Accouting) (FLCU00)

</details>

---

### Step 98: Maintain Malaysia Tax numbers

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 49 |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Maintain Business Partner Master Data |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Identification tab, on the Tax Numbers screen, maintain the following data for this business partner:
  - Category: MY3
  - Tax Number Long: <1234567890123>
  - Category: MY4
  - Tax Number Long: <1234567890124> 
  - Category: MY5
  - Tax Number Long: <1234567890125>
  - Category: MY7
  - Tax Number Long: <1234567890127

</details>

---

### Step 99: Save Your Data

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 50 |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Maintain Business Partner Master Data |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Save your entries.

</details>

---

### Step 100: Maintain Classification Code for Buyer-Created Invoices (Optional)

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 51 |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Maintain Business Partner Master Data |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Note
This step is only required if you test the function Buyer Issue Tax of Invoice.
Repeat step 3.
In the Change in BP role field, choose the following value:
Supplier (Fin.Accounting) (defined) (FLVN00)
On the Vendor:Country-Spec.Enh.3 tab, choose from the dropdown list and select an option to classify the transaction with supplier.
Save your entries.

</details>

---


## Activity 15: Additional Information: Preliminary Steps for eDocument Process (Optional): Maintain Company Code Data

> 12 steps total | 6 classifiable | 6 hidden

### Step 101: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Maintain Company Code Data |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This procedure describes how to add tax information to company code by configuration step.

#### Procedure
Depending on your configuration environment for SAP S/4HANA Cloud Public Edition, choose one of the following options:
Configure Your Solution:

</details>

---

### Step 102: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Maintain Company Code Data |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---

### Step 103: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Maintain Company Code Data |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Your Solution (F1241).

</details>

**Expected Result (Test Verification):**
> The Manage Your Solution screen is displayed.

---

### Step 104: Go to Configure Your Solution

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 52 |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Maintain Company Code Data |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Configure Your Solution.

</details>

---

### Step 105: Set local Version

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 53 |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Maintain Company Code Data |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Set Local Version.
In the dropdown list, choose Malsysia, and then choose Set Local Version.

</details>

---

### Step 106: Choose Application Area

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 54 |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Maintain Company Code Data |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries:
  - Application Area: Finance

  - Sub Application Area: Master and Organizational Data

</details>

---

### Step 107: Go to Configuration Details

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 55 |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Maintain Company Code Data |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Configure Your Solution screen, search for the following configuration step: Maintain Additional Parameters. Choose Go.
In the search result, select the configuration activity and go to the next screen.
On the Configure Your Solution - Maintain Additional Parameters screen，go to the configuration step Maintain Additional Parameters and choose Configure.

</details>

**Expected Result (Test Verification):**
> The Maintain Additional Parameters screen is displayed.

---

### Step 108: Create Additional Parameters

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 56 |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Maintain Company Code Data |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Create the following entries:
Company Code: 5410Maintain MY tax numbers for this business partner:
  - Parameter Type: MY_ROC

  - Parameter Value: <1234567890123>

  - Parameter Type: MY_SAL

  - Parameter Value: <1234567890124>

  - Parameter Type: MY_SEV

  - Parameter Value: <1234567890125>

  - Parameter Type: MY_TIN

  - Parameter Value: <1234567890127>

  - Parameter Type: MY_TTR

  - Parameter Value: <1234567890128>

Choose Save.

</details>

**Expected Result (Test Verification):**
> The new Additional Parameters are created.

---

### Step 109: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Maintain Company Code Data |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

SAP Central Business Configuration:

</details>

---

### Step 110: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Maintain Company Code Data |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the project experience in SAP Central Business Configuration.

</details>

---

### Step 111: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Maintain Company Code Data |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Go to the Business Processes Configuration app. To locate the activity in the tree view, search for the following activity: Maintain Additional Parameters.
Choose Open Documentation for the found line item to see more details about this configuration activity.
Choose the link to navigate directly to the SAP S/4HANA Cloud Public Edition system. Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration.

</details>

**Expected Result (Test Verification):**
> The Configuration Your Solution- Maintain Additional Parameters screen is displayed.

---

### Step 112: Create Additional Parameters

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 57 |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Maintain Company Code Data |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Create the following entries:
Company Code: 5410Maintain MY tax numbers for this business partner:
  - Parameter Type: MY_ROC

  - Parameter Value: <1234567890123>

  - Parameter Type: MY_SAL

  - Parameter Value: <1234567890124>

  - Parameter Type: MY_SEV

  - Parameter Value: <1234567890125>

  - Parameter Type: MY_TIN

  - Parameter Value: <1234567890127>

  - Parameter Type: MY_TTR

  - Parameter Value: <1234567890128>

Choose Save.

</details>

**Expected Result (Test Verification):**
> The new Additional Parameters are created.

---


## Activity 16: Additional Information: Preliminary Steps for eDocument Process (Optional): Define Process Communication Through Cloud Services

> 12 steps total | 6 classifiable | 6 hidden

### Step 113: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Define Process Communication Through Cloud Services |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This procedure describes how to define process communication through Cloud services by configuration step. In this activity, you define, for a given company code, if an eDocument process integrates with SAP Document and Reporting Compliance, Cloud edition (using the standard integration or other types of integration) to exchange electronic documents with external communication parties.

#### Procedure
Depending on your configuration environment for SAP S/4HANA Cloud Public Edition, choose one of the following options:
Configure Your Solution:

</details>

---

### Step 114: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Define Process Communication Through Cloud Services |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---

### Step 115: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Define Process Communication Through Cloud Services |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Your Solution (F1241).

</details>

**Expected Result (Test Verification):**
> The Manage Your Solution screen is displayed.

---

### Step 116: Go to Configure Your Solution

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 58 |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Define Process Communication Through Cloud Services |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Configure Your Solution.

</details>

---

### Step 117: Set Local Version

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 59 |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Define Process Communication Through Cloud Services |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Set Local Version.
In the dropdown list, Choose Malsysia, and then choose Set Local Version.

</details>

---

### Step 118: Choose Application Area

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 60 |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Define Process Communication Through Cloud Services |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries:
  - Application Area: Application Platform and Infrastructure

  - Sub Application Area: Legal Compliance

</details>

---

### Step 119: Go to Configuration Details

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 61 |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Define Process Communication Through Cloud Services |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Configure Your Solution screen, search for the following configuration step: Define Process Communication Through Cloud Services. Choose Go.
On the Configure Your Solution - Define Process Communication Through Cloud Services screen, go to the configuration step Define Process Communication Through Cloud Services and choose Configure.

</details>

**Expected Result (Test Verification):**
> The Define Process Communication Through Cloud Services screen is displayed.

---

### Step 120: Create Process Communication Through Cloud Services

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 62 |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Define Process Communication Through Cloud Services |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Create the following entries:
Company Code: 5410
Maintain the entries as following:
  - BUKRS: 5410

  - Process: MYINV

  - SERVICE: D Cloud Edition: Standard Integration

  - BUKRS: 5410

  - Process: MYINVSF

  - SERVICE: D Cloud Edition: Standard Integration

Note
Optional for PEPPOL
Maintain the following entries if you use PEPPOL.
  - BUKRS: 5410

  - Process: MYEUINV

  - SERVICE: X Cloud Edition: Peppol Exchange or Country/Region Scenarios

  - BUKRS: 5410

  - Process: MYEUINVIN

  - SERVICE: X Cloud Edition: Peppol Exchange or Country/Region Scenarios

Choose Save.

</details>

**Expected Result (Test Verification):**
> The new Process Communication Through Cloud Services is created.

---

### Step 121: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Define Process Communication Through Cloud Services |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

SAP Central Business Configuration:

</details>

---

### Step 122: Log on

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Define Process Communication Through Cloud Services |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the project experience in SAP Central Business Configuration.

</details>

---

### Step 123: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Define Process Communication Through Cloud Services |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Go to the Business Processes Configuration app. To locate the activity in the tree view, search for the following activity: Define Process Communication Through Cloud Services.
Choose Open Documentation for the found line item to see more details about this configuration activity.
Choose the link to navigate directly to the SAP S/4HANA Cloud Public Edition system. Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration.

</details>

**Expected Result (Test Verification):**
> The Configuration Your Solution- Define Process Communication Through Cloud Services screen is displayed.

---

### Step 124: Create Process Communication Through Cloud Services

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 63 |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Define Process Communication Through Cloud Services |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Create the following entries:
Company Code: 5410
Maintain the entries as following:
  - BUKRS: 5410

  - Process: MYINV

  - SERVICE: D Cloud Edition: Standard Integration

  - BUKRS: 5410

  - Process: MYINVSF

  - SERVICE: D Cloud Edition: Standard Integration

Note
Optional for PEPPOL
Maintain the following entries if you use PEPPOL.
  - BUKRS: 5410

  - Process: MYEUINV

  - SERVICE: X Cloud Edition: Peppol Exchange or Country/Region Scenarios

  - BUKRS: 5410

  - Process: MYEUINVIN

  - SERVICE: X Cloud Edition: Peppol Exchange or Country/Region Scenarios

Choose Save.

</details>

**Expected Result (Test Verification):**
> The new Process Communication Through Cloud Services is created.

---


## Activity 17: Additional Information: Preliminary Steps for eDocument Process (Optional): Value Mapping Maintenance for Electronic Invoicing (Optional)

> 18 steps total | 12 classifiable | 6 hidden

### Step 125: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Value Mapping Maintenance for Electronic Invoicing (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
To run the step in electronic invoicing, you must maintain the value mapping for eDocument UBL.

</details>

---

### Step 126: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Value Mapping Maintenance for Electronic Invoicing (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Configuration Expert - Business Network Integration.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad dis-plays.

---

### Step 127: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Value Mapping Maintenance for Electronic Invoicing (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Configure Value Mapping (/AIF/VMAP_CONF).

</details>

**Expected Result (Test Verification):**
> The Configure Value Mapping view is displayed.

---

### Step 128: Enter Namespace and Value Mapping

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 64 |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Value Mapping Maintenance for Electronic Invoicing (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entry and choose Execute.
Namespace: /EDOMY
Value Mapping: MY_MATERIAL_CLASSIF, MY_MATGRP_CLASSIF, MY_ACCOUNT_CLASSIF

</details>

---

### Step 129: Switch to Change Mode

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 65 |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Value Mapping Maintenance for Electronic Invoicing (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Display Value Mapping screen, choose Switch Between Display and Change.

</details>

---

### Step 130: Maintain Value Mapping

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 66 |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Value Mapping Maintenance for Electronic Invoicing (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Change Value Mapping screen, click Append, choose append number.
Maintain the following detail:
Classification Code: <value 1>, for example, 017
Maintain all value mappings in next line items.
Choose Save after maintaining the necessary entries.

</details>

---

### Step 131: Back

| | |
|---|---|
| **Type** | `Navigation` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Value Mapping Maintenance for Electronic Invoicing (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Back to go to the screen Configure Value Mapping.

</details>

**Expected Result (Test Verification):**
> The Configure Value Mapping screen displays.

---

### Step 132: Enter Namespace and Value Mapping

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 67 |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Value Mapping Maintenance for Electronic Invoicing (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entry and choose Execute.
Namespace: /EDOMY
Value Mapping: MY_MSICDES

</details>

---

### Step 133: Switch to Change Mode

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 68 |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Value Mapping Maintenance for Electronic Invoicing (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Display Value Mapping screen, choose Switch Between Display and Change.

</details>

---

### Step 134: Maintain Value Mapping

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 69 |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Value Mapping Maintenance for Electronic Invoicing (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Change Value Mapping screen, click Append, choose append number.
Maintain the following details:
MSIC Code: <number of MISC Code>, for example, 01113
MSIC Code Description (Part 1): for example, Malaysia Standard Industrial Classification
MSIC Code Description (Part 2): for example, ABBR_MSIC
Company Code: <value>
Maintain all value mappings in next line items.
Choose Save after maintaining the necessary entries.

</details>

**Expected Result (Test Verification):**
> Value Mapping Data are saved.

---

### Step 135: Back

| | |
|---|---|
| **Type** | `Navigation` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Value Mapping Maintenance for Electronic Invoicing (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Back to go to the screen Configure Value Mapping.

</details>

**Expected Result (Test Verification):**
> The Configure Value Mapping screen displays.

---

### Step 136: Enter Namespace and Value Mapping

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 70 |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Value Mapping Maintenance for Electronic Invoicing (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entry and choose Execute.
Namespace: /EDOMY
Value Mapping: MY_PAYMENT_MODE

</details>

---

### Step 137: Switch to Change Mode

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 71 |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Value Mapping Maintenance for Electronic Invoicing (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Display Value Mapping screen, choose Switch Between Display and Change.

</details>

---

### Step 138: Maintain Value Mapping

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 72 |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Value Mapping Maintenance for Electronic Invoicing (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Change Value Mapping screen, click Append, choose append number.
Maintain the following details:
Payment Mode: <number of code>, for example, 01
Payment Method: <value>, for example, E
Maintain all value mappings in next line items.
Choose Save after maintaining the necessary entries.

</details>

**Expected Result (Test Verification):**
> Value Mapping Data are saved.

---

### Step 139: Back

| | |
|---|---|
| **Type** | `Navigation` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Value Mapping Maintenance for Electronic Invoicing (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Back to go to the screen Configure Value Mapping.

</details>

---

### Step 140: Enter Namespace and Value Mapping

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 73 |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Value Mapping Maintenance for Electronic Invoicing (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Execute.
Namespace: /EDOMY
Value Mapping: MY_TAX_MAP

</details>

---

### Step 141: Switch to Change Mode

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 74 |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Value Mapping Maintenance for Electronic Invoicing (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Display Value Mapping screen, choose Switch Between Display and Change.

</details>

---

### Step 142: Maintain Value Mapping

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 75 |
| **Activity** | Additional Information: Preliminary Steps for eDocument Process (Optional): Value Mapping Maintenance for Electronic Invoicing (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Change Value Mapping screen, click Append, choose append number.
Maintain the following details:
Tax Type: <value>, for example, 01
Tax Code: <value of tax code>, for example, A1
Maintain all value mappings in next line items.
Choose Save after maintaining the necessary entries.

</details>

**Expected Result (Test Verification):**
> Value Mapping Data are saved.

---


## Activity 18: Test Procedures

> 1 steps total | 0 classifiable | 1 hidden

### Step 143: Information

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


## Activity 19: Procurement of Stock Material: Convert Purchase Requisitions to Purchase Orders

> 9 steps total | 5 classifiable | 4 hidden

### Step 144: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Convert Purchase Requisitions to Purchase Orders |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
You perform this activity when you want to convert assigned purchase requisitions to purchase orders.

</details>

---

### Step 145: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Convert Purchase Requisitions to Purchase Orders |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Log on to the SAP Fiori launchpad as a Purchaser.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---

### Step 146: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Convert Purchase Requisitions to Purchase Orders |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Process Purchase Requisitions (F1048A) .
Note
If you want to use the Save Draft feature in this app, you have to use a personalized user.

</details>

**Expected Result (Test Verification):**
> A list of Requisitions is displayed.

---

### Step 147: Search for Purchase Requisition

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 76 |
| **Activity** | Procurement of Stock Material: Convert Purchase Requisitions to Purchase Orders |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter the purchase requisition number and choose Go.

</details>

**Expected Result (Test Verification):**
> The Purchase Requisition is displayed.

---

### Step 148: Select Purchase Requisition

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 77 |
| **Activity** | Procurement of Stock Material: Convert Purchase Requisitions to Purchase Orders |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Select the purchase requisition.

</details>

**Expected Result (Test Verification):**
> The Purchase Requisition has been selected for source assignment.

---

### Step 149: Assign Source to Purchase Requisition

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 78 |
| **Activity** | Procurement of Stock Material: Convert Purchase Requisitions to Purchase Orders |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Show More per Row button on the side of Create RFQ. If the purchase requisition has been assigned the source, then you don't need to assign source again for this step. If the Purchase Requisition hasn't been assigned the source, choose Quick Edit, and then enter a source.

</details>

**Expected Result (Test Verification):**
> The assignment of one source to the requisition is done.

---

### Step 150: Prepare the Purchase Order

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 79 |
| **Activity** | Procurement of Stock Material: Convert Purchase Requisitions to Purchase Orders |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the purchase Requisition where the assigned supplier is displayed and choose Create Purchase Order.

</details>

**Expected Result (Test Verification):**
> The Purchase Order Preview screen is displayed.

---

### Step 151: Create the Purchase Order

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 80 |
| **Activity** | Procurement of Stock Material: Convert Purchase Requisitions to Purchase Orders |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step is about how purchase requests are created in your company. Think about: do your staff submit purchase requests? Is there an approval workflow? Do you have spending limits?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the New Purchase Order screen, make the following entries: 
Purchase Order Type: Standard PO.
Choose Order.

</details>

**Expected Result (Test Verification):**
> The purchase order is created.

---

### Step 152: Back to Process Purchase Requisition

| | |
|---|---|
| **Type** | `Navigation` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Convert Purchase Requisitions to Purchase Orders |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Click on Back to go to Process Purchase Requisitions (F1048A).

</details>

**Expected Result (Test Verification):**
> Purchase Requisition list is displayed again. 
> The Processing Status of Purchase Requisition has been changed to PO created.

---


## Activity 20: Procurement of Stock Material: Create Purchase Order

> 12 steps total | 8 classifiable | 4 hidden

### Step 153: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Create Purchase Order |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this procedure, you create a purchase order for stock material directly.

</details>

---

### Step 154: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Create Purchase Order |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Log on to the SAP Fiori launchpad as a Purchaser.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---

### Step 155: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Create Purchase Order |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Purchase Orders (F0842A).

</details>

**Expected Result (Test Verification):**
> The Manage Purchase Orders  screen is displayed.

---

### Step 156: Start Purchase Order Creation

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 81 |
| **Activity** | Procurement of Stock Material: Create Purchase Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Without making any selection, choose Create.

</details>

**Expected Result (Test Verification):**
> The Purchase Order screen is displayed.

---

### Step 157: Enter Purchase Order Data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 82 |
| **Activity** | Procurement of Stock Material: Create Purchase Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter all of the necessary data.
On the General Information tab, make the following entries:
  - Purchasing Doc. Type: Standard PO (NB)

  - Supplier: 54300001

  - Company Code: 5410

  - Purchasing Organization: 5410

  - Purchasing Group: 001

  - Currency: MYR

On the Delivery and Invoice tab, make the following entries and choose Enter:
  - Payment Terms: 0003

Go to Supplier Contact Data tab, the Supplier Address, Telephone, Fax, Contact Person are shown. 
On the Notes tab, choose > or < to search for Header Text. On the Header text column, enter the free text: xxx for testing. 
On the Items tab, from the Purchase Order Items screen, choose Create and make the following entries:
  - Material: TG0011

  - Plant: 5410

  - Order Quantity: <quantity>

  - Net Order Price: <price>

Navigate to the selected item by clicking on the Chevron (>) or by directly clicking on the item line.
On the General Information tab, make the following entry:
  - Storage Location: 541A

 Go to the Delivery Address tab and then navigate to the Address field. Click on the F4 value help to select the Address Number, and then choose Enter.
Note
This step is optional. If there is no appropriate Address Number in the system for usage, please skip this step. 
From the Purchase Order Item section, choose Process Flow  tab.
The following entries display:
  - Goods Receipt: yes 

  - Invoice Receipt: <selected>

Verify Goods-Receipt-Based Invoice Verification is selected.
 On the tab Tax, check the following entries: 
  - Tax Code: <Default Value>

  - Tax Date: <Default Value> 

On the Schedule Lines tab, make the following entry:
  - Delivery date: <a date in the future>

From the Purchase Order Item section, choose Attachments tab. 
  - Select Doc. Type to Upload: For External Use

Choose Upload to upload an attachment.
Note
If you want your purchase order to be assigned to an approver, choose a quantity and total net amount of purchase order higher than 500MYR (for Purchase Groups = 003)

</details>

**Expected Result (Test Verification):**
> The Purchase Order screen is displayed.

---

### Step 158: Add Freight Cost

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 83 |
| **Activity** | Procurement of Stock Material: Create Purchase Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
From the Purchase Order Item section, choose the Pricing tab.
Choose Create.
In the Add Price Element section, enter one of the following three condition types for freight and choose Enter:
  - FGW1 (Freight / Gr. Weight 1), freight is calculated based on gross weight.

  - FQU1 (Freight / Quantity 1), freight is calculated based on quantity.

  - FVA1 (Freight / Value 1), freight is a fixed value.

If you use FQU1 as an example, enter the following values:  - Condition type:  FQU1

  - Amount20 MYR Per PC

Choose Add, then the freight cost condition will be inserted into the Pricing Element panel.
Choose Apply to go back Purchaser Order screen.

</details>

---

### Step 159: Malaysia One-time Supplier (Optional)

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 84 |
| **Activity** | Procurement of Stock Material: Create Purchase Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To use a one-time supplier to create purchase orders, additional fields need to be filled.
On the General Information tab, make the following entry:
Supplier: 54300273（One-time supplier）
On the Notes tab, make the following entry:
MY: TIN of One-Time Vendor

</details>

**Expected Result (Test Verification):**
> The purchase order for one-time supplier is created.

---

### Step 160: Generate Output Preview (Optional)

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 85 |
| **Activity** | Procurement of Stock Material: Create Purchase Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Click the Output Preview button on the header of the purchase order and select the output option as required.
Note
The Output Preview button is only avaliable when your purchase order is in status Draft, In Approval, Not Yet Sent, or Output Error.

</details>

**Expected Result (Test Verification):**
> An output preview in PDF format is generated.

---

### Step 161: Verify Purchase Order for Completeness and Save Purchase Order

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 86 |
| **Activity** | Procurement of Stock Material: Create Purchase Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Order to save the Purchase Order.

</details>

**Expected Result (Test Verification):**
> A new Purchase Order is created if no error is displayed in the dialog box.

---

### Step 162: Check the Purchase Order

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 87 |
| **Activity** | Procurement of Stock Material: Create Purchase Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open the created purchase order in display mode and check if the values are displayed as text (code).

</details>

**Expected Result (Test Verification):**
> The relevant values are displayed as text and code.

---

### Step 163: Check the 6 Column Facet in the Tab

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 88 |
| **Activity** | Procurement of Stock Material: Create Purchase Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Click on the tab (General Information, Delivery and Invoice, Supplier Contact Data).

</details>

**Expected Result (Test Verification):**
> The tab (General Information,Delivery and Invoice, Supplier Contact Data) will be having the 6 column facet.

---

### Step 164: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Create Purchase Order |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Note
If you do not know who should approve the purchase orders you created, then you can use App Manage Purchase Ordersto display the created purchase order: Go to the Approval Detailstab and check the approvers listed in section Approval Details.

</details>

---


## Activity 21: Procurement of Stock Material: Approve Purchase Order (Optional)

> 7 steps total | 3 classifiable | 4 hidden

### Step 165: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Approve Purchase Order (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this procedure, you release a purchase order. If the total amount of PO > 500MYRand purchase group is 003, then the purchase orders should be approved. To decide which POs need approval, please refer to Configure Flexible Workflow for Purchase Order in Preliminary step.

#### Prerequisites
A purchase order must exist for release.

</details>

---

### Step 166: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Approve Purchase Order (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Purchasing Manager.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---

### Step 167: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Approve Purchase Order (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open My Inbox - All Items (F0862) .

</details>

**Expected Result (Test Verification):**
> A list of existing Purchase Orders is displayed.

---

### Step 168: Search for Purchase Order Status

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 89 |
| **Activity** | Procurement of Stock Material: Approve Purchase Order (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entry and choose Enter:  - Search: <Purchase Order number>

</details>

**Expected Result (Test Verification):**
> The Purchase Order is displayed.

---

### Step 169: Approve Purchase Order

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 90 |
| **Activity** | Procurement of Stock Material: Approve Purchase Order (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the Purchase Order on the left side of the screen and choose Approve at the bottom right.

</details>

**Expected Result (Test Verification):**
> The Submit Decision screen is displayed.

---

### Step 170: Enter Approval Reason

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 91 |
| **Activity** | Procurement of Stock Material: Approve Purchase Order (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter the approval reason if necessary, and then choose Submit.

</details>

**Expected Result (Test Verification):**
> The Purchase Order is approved.

---

### Step 171: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Approve Purchase Order (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Note
If an attachment is uploaded during purchase order creation, in My Inbox App, the attachment can be found under Attachments tab of the purchase order.

</details>

---


## Activity 22: Procurement of Stock Material: Preview Purchase Order (Optional)

> 5 steps total | 2 classifiable | 3 hidden

### Step 172: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Preview Purchase Order (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this procedure, you can preview an existing purchase order.

</details>

---

### Step 173: Log on

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Preview Purchase Order (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Log on to the SAP Fiori launchpad as a Purchaser.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---

### Step 174: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Preview Purchase Order (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Manage Purchase Orders (F0842A).
Note
If you want to use the Save Draft feature in this app, you have to use a personalized user.

</details>

**Expected Result (Test Verification):**
> The Manage Purchase Orders screen is displayed.

---

### Step 175: Select Purchase Order

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 92 |
| **Activity** | Procurement of Stock Material: Preview Purchase Order (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter the Purchase Order number in the Purchase Order search box, and choose Go. Select the row for the Purchase Order you want to preview and use the little arrow on the right side to check the PO detail.

</details>

**Expected Result (Test Verification):**
> The Purchase Order screen is displayed.

---

### Step 176: Preview the Purchase Order

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 93 |
| **Activity** | Procurement of Stock Material: Preview Purchase Order (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Go to the Output Management tab. In the Output Management section, choose Show More per Row and choose Display Document.
Note
When the Relevant and Merge are both selected for the document type SL1 and channel print in SSCUI: 103542 (Define Output Settings for Document Type), you upload the attachments of SL1 document type in Attachments Tab at the item level in App: Manage Purchase Orders, then the output should contain the Attachments as Document along with PO output.
At the Output line item, the number of attachments for the Line item should match the number of attachments we attached.

</details>

**Expected Result (Test Verification):**
> The Purchase Order is opened in PDF format.

---


## Activity 23: Procurement of Stock Material: Change Purchase Order (Optional)

> 8 steps total | 5 classifiable | 3 hidden

### Step 177: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Change Purchase Order (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this procedure, you can change an existing purchase order.

</details>

---

### Step 178: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Change Purchase Order (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Log on to the SAP Fiori launchpad as a Purchaser.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---

### Step 179: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Change Purchase Order (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Manage Purchase Orders (F0842A).
Note
If you want to use the Save Draft feature in this app, you have to use a personalized user.

</details>

**Expected Result (Test Verification):**
> The Manage Purchase Orders screen is displayed.

---

### Step 180: Select Purchase Order

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 94 |
| **Activity** | Procurement of Stock Material: Change Purchase Order (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter the Purchase Order number in the Purchase Order search box, and choose Go. Select the row for the Purchase Order you want to change and use the little arrow on the right side to enter the PO detail, then choose Edit.

</details>

**Expected Result (Test Verification):**
> The Purchase Order screen is shown.
> The Purchase order is opened in change mode.

---

### Step 181: Change Purchase Order

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 95 |
| **Activity** | Procurement of Stock Material: Change Purchase Order (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Change certain field values of the Purchase Order.

</details>

**Expected Result (Test Verification):**
> The Purchase Order values are changed.

---

### Step 182: Check Purchase Order for completeness

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 96 |
| **Activity** | Procurement of Stock Material: Change Purchase Order (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Order.

</details>

**Expected Result (Test Verification):**
> The Purchase Order is complete.

---

### Step 183: Messages (Optional)

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 97 |
| **Activity** | Procurement of Stock Material: Change Purchase Order (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Messages (if possible).

</details>

**Expected Result (Test Verification):**
> If a message is displayed, you must correct the Purchase Order. If no message is displayed, the Purchase Order is complete.

---

### Step 184: Save Purchase Order

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 98 |
| **Activity** | Procurement of Stock Material: Change Purchase Order (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Order to save the Purchase Order.

</details>

**Expected Result (Test Verification):**
> The Purchase Order has been saved. The system displays a success message Purchase order xxx has been saved.

---


## Activity 24: Procurement of Stock Material: Monitor Purchase Order Items (Optional)

> 6 steps total | 3 classifiable | 3 hidden

### Step 185: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Monitor Purchase Order Items (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this procedure, you can monitor each item in purchase orders, but by default only overdue items would be listed in the app.

</details>

---

### Step 186: Log on

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Monitor Purchase Order Items (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Log on to the SAP Fiori launchpad as a Purchaser.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---

### Step 187: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Monitor Purchase Order Items (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Monitor Purchase Order Items (F2358).

</details>

**Expected Result (Test Verification):**
> The Monitor Purchase Order Items screen is displayed.

---

### Step 188: Search for Purchase Orders

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 99 |
| **Activity** | Procurement of Stock Material: Monitor Purchase Order Items (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
The basic filters are displayed. Purchase Order, Display Currency, Material Group, Material, Supplier, Plant, and so on.
Make the above entries accordingly, then choose Go.

</details>

**Expected Result (Test Verification):**
> The search results show the details with the respective filter criteria. 
> You can choose Adapt Filters to select filters.

---

### Step 189: Display Purchase Order

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 100 |
| **Activity** | Procurement of Stock Material: Monitor Purchase Order Items (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the individual line item of the Purchase Order for which you want to display the PO details.

</details>

**Expected Result (Test Verification):**
> The Purchase Order Item screen is shown.

---

### Step 190: Verify data

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 101 |
| **Activity** | Procurement of Stock Material: Monitor Purchase Order Items (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Verify the data displayed on the object page.

</details>

**Expected Result (Test Verification):**
> The data should correspond to the Purchase Order.

---


## Activity 25: Procurement of Stock Material: Execute Mass Changes to Purchase Orders (Optional)

> 8 steps total | 5 classifiable | 3 hidden

### Step 191: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Execute Mass Changes to Purchase Orders (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this procedure, you can apply changes to multiple selected Purchase Orders in bulk.

</details>

---

### Step 192: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Execute Mass Changes to Purchase Orders (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Log on to the SAP Fiori launchpad as a Purchaser.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---

### Step 193: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Execute Mass Changes to Purchase Orders (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Mass Changes to Purchase Orders (F2593) app.

</details>

**Expected Result (Test Verification):**
> The Mass Changes to Purchase Orders screen is displayed.

---

### Step 194: Search for Purchase Orders Items

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 102 |
| **Activity** | Procurement of Stock Material: Execute Mass Changes to Purchase Orders (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Set values to some filters to search Purchase Orders. For example,
  - Material Group

  - Purchasing Organization

  - Purchasing Group

  - Plant

Then choose GO.

</details>

**Expected Result (Test Verification):**
> The search results show the details with the respective filter criteria.

---

### Step 195: Select Purchase Order

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 103 |
| **Activity** | Procurement of Stock Material: Execute Mass Changes to Purchase Orders (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select several POs by clicking the checkbox beside the purchase order number.

</details>

**Expected Result (Test Verification):**
> Purchase Order has been selected.

---

### Step 196: Choose Mass Edit

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 104 |
| **Activity** | Procurement of Stock Material: Execute Mass Changes to Purchase Orders (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
After selecting an individual purchase order, choose Mass Edit.

</details>

**Expected Result (Test Verification):**
> A dialog box will open displaying fields for 2 categories – Header fields, Item fields for which values can be changed.

---

### Step 197: Apply Mass Changes

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 105 |
| **Activity** | Procurement of Stock Material: Execute Mass Changes to Purchase Orders (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Set new values in the given desired fields.
For example: Terms of Payment: Replace Field Value: 0002. 
Choose Apply Mass Changes. Choose Apply to confirm the Apply Mass Changes screen. Choose Close to close the Success screen.

</details>

**Expected Result (Test Verification):**
> New values will be set to desired fields for selected Purchase Orders / Items.

---

### Step 198: Check Application Jobs

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 106 |
| **Activity** | Procurement of Stock Material: Execute Mass Changes to Purchase Orders (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Monitor Mass Changes.
On the Monitor Mass Changes screen, enter the Created At with Today and remove Created By filter as blank. Choose Go and then choose Mass Change Jobs tab. Navigate to the selected Mass Change Job by clicking on the Chevron (>) or by directly clicking on the Mass Change Job line.

</details>

**Expected Result (Test Verification):**
> It will navigate to Monitor Mass Changes screen.
> Verify if the job is successful for the selected Purchase Orders.

---


## Activity 26: Procurement of Stock Material: Post Goods Receipt

> 7 steps total | 4 classifiable | 3 hidden

### Step 199: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Post Goods Receipt |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
Goods ordered by a purchase order arrive at warehouse. The goods receipt is to be posted.

</details>

---

### Step 200: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Post Goods Receipt |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Warehouse Clerk.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---

### Step 201: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Post Goods Receipt |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Post Goods Receipt for Purchasing Document (F0843).

</details>

**Expected Result (Test Verification):**
> The Post Goods Receipt for Purchase Order screen is displayed.

---

### Step 202: Enter Purchase Order

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 107 |
| **Activity** | Procurement of Stock Material: Post Goods Receipt |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Enter the Purchase Order ID and choose Enter.

</details>

**Expected Result (Test Verification):**
> The system displays the data for the goods receipt on the Goods Receipt screen.

---

### Step 203: Enter Delivery Note

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 108 |
| **Activity** | Procurement of Stock Material: Post Goods Receipt |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step handles shipping goods to customers. Think about: how are deliveries scheduled? Do you use a logistics provider? Do you track shipments?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Enter:
  - Delivery Note: xxx

  - Printing:  Individual slip

</details>

---

### Step 204: Select Item

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 109 |
| **Activity** | Procurement of Stock Material: Post Goods Receipt |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
From the Items section, select the goods receipt item to be posted.
Choose Storage Location (for example) 541A.
Note
Select an item with a quantity of two or more pieces.

</details>

**Expected Result (Test Verification):**
> You can see that the Post button is activated.

---

### Step 205: Post

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 110 |
| **Activity** | Procurement of Stock Material: Post Goods Receipt |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Post.

</details>

**Expected Result (Test Verification):**
> The system displays the message Material Document xxx posted.

---


## Activity 27: Procurement of Stock Material: Preview Goods Receipt Slip and Label (Optional)

> 10 steps total | 6 classifiable | 4 hidden

### Step 206: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Preview Goods Receipt Slip and Label (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
### Context
In this step, the material document is previewed.

### Procedure

</details>

---

### Step 207: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Preview Goods Receipt Slip and Label (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Warehouse Clerk.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---

### Step 208: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Preview Goods Receipt Slip and Label (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Material Documents Overview (F1077).

</details>

**Expected Result (Test Verification):**
> The Material Documents Overview is displayed.

---

### Step 209: Search for Goods Receipts Material Document

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 111 |
| **Activity** | Procurement of Stock Material: Preview Goods Receipt Slip and Label (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step records when ordered goods physically arrive at your location. Think about: does someone in your warehouse check deliveries against orders? Do you use a system to track this?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose the Go button.
  - Plant: 5410

  - Material Document: Material document number, in previous step

</details>

**Expected Result (Test Verification):**
> The relevant Material Document item displays.

---

### Step 210: Select Material Document for Goods Receipt

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 112 |
| **Activity** | Procurement of Stock Material: Preview Goods Receipt Slip and Label (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step records when ordered goods physically arrive at your location. Think about: does someone in your warehouse check deliveries against orders? Do you use a system to track this?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the row for which you would like to see the material documents.

</details>

**Expected Result (Test Verification):**
> The Material Document screen displays.

---

### Step 211: Check Goods Receipt Details

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 113 |
| **Activity** | Procurement of Stock Material: Preview Goods Receipt Slip and Label (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step records when ordered goods physically arrive at your location. Think about: does someone in your warehouse check deliveries against orders? Do you use a system to track this?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Check the General Information, Attachments, Item, Document Flow and Process Flow.

</details>

**Expected Result (Test Verification):**
> In the General Information section, you can see the Posting Date, Document Date.

---

### Step 212: Select the Material Document Item

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 114 |
| **Activity** | Procurement of Stock Material: Preview Goods Receipt Slip and Label (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Items section, select the row of material document item that you want to preview.

</details>

**Expected Result (Test Verification):**
> The Material Document Item screen displays.

---

### Step 213: Preview the Material Document Goods Receipt Slip

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 115 |
| **Activity** | Procurement of Stock Material: Preview Goods Receipt Slip and Label (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step records when ordered goods physically arrive at your location. Think about: does someone in your warehouse check deliveries against orders? Do you use a system to track this?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Output Management section, choose Show More per Row, and choose Display Document icon in the item of which Output Type is GOODS_RECEIPT_PO_SLIP.

</details>

**Expected Result (Test Verification):**
> The Goods Receipt Slip is opened in PDF format.

---

### Step 214: Preview the Material Document Goods Receipt Label

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 116 |
| **Activity** | Procurement of Stock Material: Preview Goods Receipt Slip and Label (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step records when ordered goods physically arrive at your location. Think about: does someone in your warehouse check deliveries against orders? Do you use a system to track this?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Output Management section, choose Show More per Row, and choose Display Document icon in the item of which Output Type is GOODS_RECEIPT_LABEL.

</details>

**Expected Result (Test Verification):**
> The Goods Receipt Label is opened in PDF format.

---

### Step 215: Back to Launchpad

| | |
|---|---|
| **Type** | `Navigation` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Preview Goods Receipt Slip and Label (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Home button to go back to the SAP Fiori launchpad.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---


## Activity 28: Procurement of Stock Material: Check Goods Receipt Details (Optional)

> 8 steps total | 4 classifiable | 4 hidden

### Step 216: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Check Goods Receipt Details (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this step, the goods receipt fact sheet is displayed.

</details>

---

### Step 217: Log on

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Check Goods Receipt Details (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Warehouse Clerk.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---

### Step 218: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Check Goods Receipt Details (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Material Documents Overview (F1077) .

</details>

**Expected Result (Test Verification):**
> The Material Documents Overview  screen is displayed.

---

### Step 219: Search for Goods Receipts Material Document

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 117 |
| **Activity** | Procurement of Stock Material: Check Goods Receipt Details (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step records when ordered goods physically arrive at your location. Think about: does someone in your warehouse check deliveries against orders? Do you use a system to track this?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Go:
  - Plant: 5410

  - Material Document: xxx

</details>

**Expected Result (Test Verification):**
> On the Material Documents Overview screen, the relevant Material Documents / Material Document items are shown.

---

### Step 220: Select Material Document for Goods Receipt

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 118 |
| **Activity** | Procurement of Stock Material: Check Goods Receipt Details (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step records when ordered goods physically arrive at your location. Think about: does someone in your warehouse check deliveries against orders? Do you use a system to track this?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the row for which you would like to see the material documents.

</details>

**Expected Result (Test Verification):**
> The list of the Material Documents is displayed.
> The Goods Receipts Details are shown.

---

### Step 221: Check Goods Receipts Details

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 119 |
| **Activity** | Procurement of Stock Material: Check Goods Receipt Details (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step records when ordered goods physically arrive at your location. Think about: does someone in your warehouse check deliveries against orders? Do you use a system to track this?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Check the General Information, and the Material Document Items.

</details>

**Expected Result (Test Verification):**
> In the General Data section, the correct Posting Date, Document Date, and the Delivery Note are shown.

---

### Step 222: Display Document Flow

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 120 |
| **Activity** | Procurement of Stock Material: Check Goods Receipt Details (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Switch to the section Process Flow.

</details>

**Expected Result (Test Verification):**
> The Process Flow shows the Purchase Order and the Material Document as a flow chart.

---

### Step 223: Back to Launchpad

| | |
|---|---|
| **Type** | `Navigation` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Check Goods Receipt Details (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Home to go back to the SAP Fiori launchpad.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---


## Activity 29: Procurement of Stock Material: Reverse Goods Receipt (Optional)

> 7 steps total | 4 classifiable | 3 hidden

### Step 224: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Reverse Goods Receipt (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this step, the goods receipt posted in the previous chapter is reversed.

</details>

---

### Step 225: Log on

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Reverse Goods Receipt (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Warehouse Clerk .

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---

### Step 226: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Reverse Goods Receipt (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Material Documents Overview (F1077) .

</details>

**Expected Result (Test Verification):**
> The Material Documents Overview is displayed.

---

### Step 227: Search for Goods Receipts Material Document

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 121 |
| **Activity** | Procurement of Stock Material: Reverse Goods Receipt (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step records when ordered goods physically arrive at your location. Think about: does someone in your warehouse check deliveries against orders? Do you use a system to track this?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose the Go button.
Plant: 5410
Material Document:xxx

</details>

**Expected Result (Test Verification):**
> The relevant Material Documents / Material Document items are shown.

---

### Step 228: Select Material Document for Goods Receipt

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 122 |
| **Activity** | Procurement of Stock Material: Reverse Goods Receipt (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step records when ordered goods physically arrive at your location. Think about: does someone in your warehouse check deliveries against orders? Do you use a system to track this?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select your Goods Receipt by choosing the relevant row.

</details>

**Expected Result (Test Verification):**
> The list of the Material Documents is displayed.
> The Goods Receipts Details are shown.

---

### Step 229: Choose Reverse

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 123 |
| **Activity** | Procurement of Stock Material: Reverse Goods Receipt (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Reverse.

</details>

**Expected Result (Test Verification):**
> The Reverse Goods Receipt  dialog box is displayed.

---

### Step 230: Post Reverse

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 124 |
| **Activity** | Procurement of Stock Material: Reverse Goods Receipt (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the items you want to reverse in the pop up screen, then choose OK.

</details>

---


## Activity 30: Procurement of Stock Material: Analyze Stock Overview (Optional)

> 6 steps total | 2 classifiable | 4 hidden

### Step 231: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Analyze Stock Overview (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

### Purpose
In this step, the stock overview is displayed.

### Procedure

</details>

---

### Step 232: Log on

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Analyze Stock Overview (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Inventory Manager.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---

### Step 233: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Analyze Stock Overview (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Stock - Single Material (F1076) .

</details>

**Expected Result (Test Verification):**
> The Stock Single Material screen is displayed.

---

### Step 234: Enter Material

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 125 |
| **Activity** | Procurement of Stock Material: Analyze Stock Overview (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter the following entry in the Material field.
Select the material from the interactive value help.
Material: TG0011

</details>

**Expected Result (Test Verification):**
> The Stock Overview for the Material is shown.

---

### Step 235: Change View

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 126 |
| **Activity** | Procurement of Stock Material: Analyze Stock Overview (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
You need to choose the icon Chart View in order to change to a graphical view.

</details>

**Expected Result (Test Verification):**
> A Bar Chart for the stock by Plant / Storage Location is displayed.

---

### Step 236: Back to SAP Fiori Launchpad

| | |
|---|---|
| **Type** | `Navigation` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Analyze Stock Overview (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Home to go back to the SAP Fiori launchpad.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---


## Activity 31: Procurement of Stock Material: Analyze Material Document (Optional)

> 7 steps total | 3 classifiable | 4 hidden

### Step 237: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Analyze Material Document (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

### Purpose
In this step, the material document is displayed.

### Procedure

</details>

---

### Step 238: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Analyze Material Document (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Inventory Manager.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---

### Step 239: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Analyze Material Document (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open the Material Documents Overview (F1077) .

</details>

**Expected Result (Test Verification):**
> The Material Documents Overview screen is displayed.

---

### Step 240: Search for Material Documents

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 127 |
| **Activity** | Procurement of Stock Material: Analyze Material Document (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter the following entries in the data fields.
Select the Go button.
Plant: 5410
Material: TG0011

</details>

**Expected Result (Test Verification):**
> The relevant  Material Document items for the material are shown.

---

### Step 241: Analyze Material Document

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 128 |
| **Activity** | Procurement of Stock Material: Analyze Material Document (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select your Material Document by choosing the according row.

</details>

**Expected Result (Test Verification):**
> The Material Document Details are shown.

---

### Step 242: Check Material Document Details

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 129 |
| **Activity** | Procurement of Stock Material: Analyze Material Document (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Check the General Information and the Material Document Items.

</details>

**Expected Result (Test Verification):**
> The Status of the Material Document is correct; in the section General Data the correct Posting Date, Document Date and the Delivery Note are shown.

---

### Step 243: Back to Launch Pad

| | |
|---|---|
| **Type** | `Navigation` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Analyze Material Document (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the Home button to go back to the SAP Fiori launchpad.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---


## Activity 32: Procurement of Stock Material: Manage Stock (Optional)

> 6 steps total | 3 classifiable | 3 hidden

### Step 244: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Manage Stock (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
Materials must be scrapped as they are damaged and they should not appear any longer in the stock overview.

</details>

---

### Step 245: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Manage Stock (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Inventory Manager.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---

### Step 246: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Manage Stock (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Stock (F1062) .

</details>

**Expected Result (Test Verification):**
> The Manage Stock screen is displayed.

---

### Step 247: Open Stock Overview

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 130 |
| **Activity** | Procurement of Stock Material: Manage Stock (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter the following data in the fields.
Plant: 5410
Material: TG0011

</details>

**Expected Result (Test Verification):**
> The Manage Stock screen is displayed.
> The Stock Overview of the Material is shown.

---

### Step 248: Select stock

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 131 |
| **Activity** | Procurement of Stock Material: Manage Stock (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the icon beside the stock that you want to scrap.

</details>

**Expected Result (Test Verification):**
> The Manage Stock dialog box opens. The Storage Location, Stock Type, and Current Quantity are displayed according to your entries in the previous steps.

---

### Step 249: Scrap Items

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 132 |
| **Activity** | Procurement of Stock Material: Manage Stock (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter the following data in the following data fields and choose the Post button.
Stock Change:Scrapping
Cost Center: for example, R & D
Reason Code: for example, : Quality
Quantity: x

</details>

**Expected Result (Test Verification):**
> The system displays Material document xxx created. The stock has been scrapped.

---


## Activity 33: Additional Information

> 9 steps total | 0 classifiable | 9 hidden

### Step 250: Information

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

#### Content
### Procurement of Stock Material: Create Supplier Invoice

</details>

---


## Activity 34: Option A: Create Supplier Invoice with PO/GR Relation

> 14 steps total | 11 classifiable | 3 hidden

### Step 251: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Option A: Create Supplier Invoice with PO/GR Relation |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you create the supplier invoice with PO/GR relation. You have two options to create the supplier invoice: 
Option A: Create Supplier Invoice with PO/GR relation. 
Option B: Create Supplier Invoice with PO/GR relation (with Invoice Reduction)
You can choose either option A or option B to execute the supplier invoice creation with PO/GR relation. For more information, see the next two tasks.Note
Only choose either option A or B (not both).

</details>

---

### Step 252: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Option A: Create Supplier Invoice with PO/GR Relation |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---

### Step 253: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Option A: Create Supplier Invoice with PO/GR Relation |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Create Supplier Invoice (F0859) .

</details>

**Expected Result (Test Verification):**
> The Create Supplier Invoices screen is displayed.

---

### Step 254: Enter General Data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 133 |
| **Activity** | Option A: Create Supplier Invoice with PO/GR Relation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In case of purchase orders created with local currency in your system, make the following entries.
Transaction: Invoice
Company Code: 5410
Gross Invoice Amount : <XXX>
Currency: MYR
Invoice Date: <Today>
Posting Date: <Today>
Reference: <xxx>(reference invoice number from invoicing party)
Invoice Party:54300001
For now, if you move the mouse to the Invoicing Party in the header of the supplier invoice, then click the Invoicing Party, the Company Date with Address and Contact Details are displayed.
In case of purchase orders created with foreign currency in your system, make the following entries.
Transaction: Invoice
Company Code: 5410
Gross Invoice Amount : <XXX>
Currency: XXX (change the invoice currency, for example from MYR to USD.)
Invoice Date: <Today>
Posting Date: <Today>
Reference: <xxx>(reference invoice number from invoicing party)
Invoice Party:54300001
Select See More at header area, make the following entries. 
Exchange Rate: <XXX>

</details>

**Expected Result (Test Verification):**
> The exchange rate should be changed to MYR according to the customizing settings.
> The exchange rate is changeable.

---

### Step 255: Malaysia One Time Supplier (Optional)

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 134 |
| **Activity** | Option A: Create Supplier Invoice with PO/GR Relation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries on the General Information tab:
Supplier: 54300273 （One-time supplier）
Click on One-time Supplier Data and make the following entries：
Name: <Any value>
City: <Any value>
Tax Number 3: <Any value>
Tax Number 4: <Any value>
Tax Number 5: <Any value>
Click Apply.

</details>

**Expected Result (Test Verification):**
> A supplier invoice with a one-time supplier was created.

---

### Step 256: Enter Purchase Order References

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 135 |
| **Activity** | Option A: Create Supplier Invoice with PO/GR Relation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In Purchasing Document References section, add the references. 
Make the following entries (use a PO you created previously).Reference Document Category: Purchase Order/Scheduling Agreement
Purchase Order: <xxx>

</details>

**Expected Result (Test Verification):**
> All items of the referenced purchase order are added to the Invoice Items section.

---

### Step 257: Add Notes (Optional)

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 136 |
| **Activity** | Option A: Create Supplier Invoice with PO/GR Relation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter notes under the Note tab if you want to add more detailed long text for the supplier invoice.

</details>

---

### Step 258: Select Invoice Items

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 137 |
| **Activity** | Option A: Create Supplier Invoice with PO/GR Relation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the Invoice Items you want to create invoice for.

</details>

**Expected Result (Test Verification):**
> You should see material items and delivery costs items, which refer to the entered purchase order document. Check if items for planned delivery costs have an item text.

---

### Step 259: Check the Invoice Items Data

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 138 |
| **Activity** | Option A: Create Supplier Invoice with PO/GR Relation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Check the Amount, the Quantity, the Tax Code (there may already be a tax code that was copied from the purchase order).

</details>

**Expected Result (Test Verification):**
> The Amount, the Quantity, the Tax Code are consistent.

---

### Step 260: Check Tax Code

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 139 |
| **Activity** | Option A: Create Supplier Invoice with PO/GR Relation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the section Tax, check if there is tax code information and enter the tax amount if the tax code value is greater than zero.

</details>

**Expected Result (Test Verification):**
> In the Tax area, you should see the same tax codes as in the items. 
> If there is no tax, specify the tax code <Input Tax Code>.

---

### Step 261: Block Invoice on Item Level (Optional)

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 140 |
| **Activity** | Option A: Create Supplier Invoice with PO/GR Relation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the invoice item arrow on the right side of the item to navigate to the item details. 
On the next screen, set flag for Manually Blocked. Click Check and on the lower part of the details screen, the Blocking Reasons section shows the text Manual. Click Back to supplier invoice.

</details>

**Expected Result (Test Verification):**
> The item is blocked with a blocking reason.

---

### Step 262: Check the Balance

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 141 |
| **Activity** | Option A: Create Supplier Invoice with PO/GR Relation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Calculate tax by choosing Propose Tax. Check the balance (difference between the calculated amount and the gross amount you entered in step 3).

</details>

**Expected Result (Test Verification):**
> The balance should be zero, or is within the defined tolerance.

---

### Step 263: Simulate Supplier Invoice and Check Messages

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 142 |
| **Activity** | Option A: Create Supplier Invoice with PO/GR Relation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Simulate.
You can check the simulation results in Simulation Overview and Simulation Details area.

</details>

**Expected Result (Test Verification):**
> The supplier invoice is simulated.

---

### Step 264: Post Invoice

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 143 |
| **Activity** | Option A: Create Supplier Invoice with PO/GR Relation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Post.

</details>

**Expected Result (Test Verification):**
> The invoice is posted. The system displays the relevant message.

---


## Activity 35: Option B: Create Supplier Invoice with PO/GR relation (with Invoice Reduction) (Optional)

> 12 steps total | 9 classifiable | 3 hidden

### Step 265: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Option B: Create Supplier Invoice with PO/GR relation (with Invoice Reduction) (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you create the supplier invoice with invoice reduction.

</details>

---

### Step 266: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Option B: Create Supplier Invoice with PO/GR relation (with Invoice Reduction) (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---

### Step 267: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Option B: Create Supplier Invoice with PO/GR relation (with Invoice Reduction) (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Create Supplier Invoice (F0859)

</details>

**Expected Result (Test Verification):**
> The Create Supplier Invoices screen is displayed.

---

### Step 268: Enter General Data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 144 |
| **Activity** | Option B: Create Supplier Invoice with PO/GR relation (with Invoice Reduction) (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries.
Transaction: Invoice
Company Code: 5410
Gross Invoice Amount: XXX(Invoice (overall) amount (incl. Tax) of the (fictive) invoice)
Currency:MYR
Invoice Date: <Today>
Posting Date: <Today>
Reference: <xxx>(reference invoice number from invoicing party) 
Invoicing Party: 54300001

</details>

**Expected Result (Test Verification):**
> The Create Supplier Invoices screen is displayed.

---

### Step 269: Enter Purchase Order References

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 145 |
| **Activity** | Option B: Create Supplier Invoice with PO/GR relation (with Invoice Reduction) (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In Purchasing Document Reference section, add the references.
Make the following entries (use a PO you created previously).
Reference Document Category: Purchase Order/ Scheduling Agreement 
Purchase Order: <xxx>

</details>

**Expected Result (Test Verification):**
> All items of the referenced Purchase Order are added to the Invoice Items section.

---

### Step 270: Select Invoice Items

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 146 |
| **Activity** | Option B: Create Supplier Invoice with PO/GR relation (with Invoice Reduction) (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the Invoice Items you want to create invoice for.

</details>

**Expected Result (Test Verification):**
> You should see material items and delivery costs items, which refer to the entered purchase order document. Check if items for planned delivery costs have an item text.

---

### Step 271: Check the Invoice Items data

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 147 |
| **Activity** | Option B: Create Supplier Invoice with PO/GR relation (with Invoice Reduction) (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Check the Amount, the Quantity, the Tax Code (there may already be a tax code that was copied from the purchase order).

</details>

**Expected Result (Test Verification):**
> The Amount, the Quantity, the Tax Code are consistent.

---

### Step 272: Reduce Invoice

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 148 |
| **Activity** | Option B: Create Supplier Invoice with PO/GR relation (with Invoice Reduction) (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the item to navigate to the details screen.
Choose the Reduce invoice button in the bottom.
On the Reduce Invoice dialog box, make the following entries:
Amount from Supplier: XX (Larger than amount in PO)
Quantity from Supplr.: XX (Larger than quantity in PO)
Choose OK to close the dialog box and choose Back to Supplier Invoice.
If the Payment Terms is 0002 or 0003 in the invoice creation, then you must enter the Baseline Date.
Enter the Baseline Date: <the first day of the last month>

</details>

**Expected Result (Test Verification):**
> Supplier Invoice amount is reduced

---

### Step 273: Check Tax code

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 149 |
| **Activity** | Option B: Create Supplier Invoice with PO/GR relation (with Invoice Reduction) (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the section Tax check if there is tax code information and enter the tax amount, when the tax code value is greater than zero

</details>

**Expected Result (Test Verification):**
> In the Tax area, you should see the same tax codes as in the items.
> If there is no tax, specify tax code <Input Tax Code>

---

### Step 274: Verify the balance

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 150 |
| **Activity** | Option B: Create Supplier Invoice with PO/GR relation (with Invoice Reduction) (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Verify the Gross Invoice Amount that you entered in step 3, against the items plus tax amount (for invoice reduction item, Amount Acc. Suppl. is used for calculation)
If tax code you selected is zero tax, you do not have any tax amount.

</details>

**Expected Result (Test Verification):**
> The balance should be zero (or within the defined tolerance).

---

### Step 275: Simulate Supplier Invoice and Check Messages

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 151 |
| **Activity** | Option B: Create Supplier Invoice with PO/GR relation (with Invoice Reduction) (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Simulate .
You can check the simulation results in the Simulation Overview and Simulation Details area.

</details>

**Expected Result (Test Verification):**
> The supplier invoice is simulated.

---

### Step 276: Post Invoice

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 152 |
| **Activity** | Option B: Create Supplier Invoice with PO/GR relation (with Invoice Reduction) (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Post .

</details>

**Expected Result (Test Verification):**
> The invoice is posted.

---


## Activity 36: Option B: Print Complaint Letter in case of Invoice Reduction (Only relevant for SAP S/4HANA Cloud Public Edition)

> 6 steps total | 3 classifiable | 3 hidden

### Step 277: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Option B: Print Complaint Letter in case of Invoice Reduction (Only relevant for SAP S/4HANA Cloud Public Edition) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
If you want to output these messages you have to start the output manually.

</details>

---

### Step 278: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Option B: Print Complaint Letter in case of Invoice Reduction (Only relevant for SAP S/4HANA Cloud Public Edition) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant .

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 279: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Option B: Print Complaint Letter in case of Invoice Reduction (Only relevant for SAP S/4HANA Cloud Public Edition) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Supplier Invoices List (F1060A) .

</details>

**Expected Result (Test Verification):**
> The Supplier Invoice List screen displays.

---

### Step 280: Search for Supplier Invoice

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 153 |
| **Activity** | Option B: Print Complaint Letter in case of Invoice Reduction (Only relevant for SAP S/4HANA Cloud Public Edition) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entry and choose Go button.
Invoicing Document No.: XXXXXXXX (created in above step)

</details>

**Expected Result (Test Verification):**
> The relevant supplier invoice is displayed.

---

### Step 281: Complaint Letter Overview

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 154 |
| **Activity** | Option B: Print Complaint Letter in case of Invoice Reduction (Only relevant for SAP S/4HANA Cloud Public Edition) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Invoice item by clicking on the row of the invoice to go to Supplier Invoice detail screen. Go to the Output section and choose Show More per Row, and choose Display Document.

</details>

**Expected Result (Test Verification):**
> The complaint letter opens as a PDF file.

---

### Step 282: Print Complaint Letter

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 155 |
| **Activity** | Option B: Print Complaint Letter in case of Invoice Reduction (Only relevant for SAP S/4HANA Cloud Public Edition) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Display page, you can select Print from menu by clicking right mouse.

</details>

**Expected Result (Test Verification):**
> The output items are sent to the printer queue.

---


## Activity 37: Create Supplier Invoice without PO/GR (Optional)

> 9 steps total | 6 classifiable | 3 hidden

### Step 283: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Supplier Invoice without PO/GR (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you create the supplier invoice without purchase order reference. Follow below procedure to create an individual invoice. If need to mass upload supplier invoice, please refer to scope item Accounts Payable(J60).

</details>

---

### Step 284: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Supplier Invoice without PO/GR (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---

### Step 285: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Supplier Invoice without PO/GR (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Create Supplier Invoice (F0859).

</details>

**Expected Result (Test Verification):**
> The Create Supplier Invoice screen displays.

---

### Step 286: Enter General Data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 156 |
| **Activity** | Create Supplier Invoice without PO/GR (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In section General Information, make the following entries:
Transaction: Invoice
Company Code: 5410
Gross Invoice Amount: xxx
Currency: MYR
Invoice Date: Today
Posting Date: Today
Reference: xxx(reference invoice number from invoicing party)

</details>

---

### Step 287: Enter Invoicing Party

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 157 |
| **Activity** | Create Supplier Invoice without PO/GR (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries.
General Data
Invoicing Party: 54300001

</details>

---

### Step 288: Enter G/L Account Item

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 158 |
| **Activity** | Create Supplier Invoice without PO/GR (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Add G/L Account Item.
Make the following entries.
Debit/Credit: Debit
G/L Account: 65008300
Amount: xxx

</details>

**Expected Result (Test Verification):**
> A new row for a GL/ Account Item displays with entry fields for the side of the Account, the G/L Account, and the Amount.

---

### Step 289: Enter G/L Account Item details

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 159 |
| **Activity** | Create Supplier Invoice without PO/GR (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Expand Show Details.
Make the following entries.
Cost Center54101201
Tax Code: If there is no tax, specify tax code <Input Tax Code>

</details>

**Expected Result (Test Verification):**
> Details for a GL/ Account Item display with entry fields for the cost center and the tax code.

---

### Step 290: Simulate Supplier Invoice and Check Messages

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 160 |
| **Activity** | Create Supplier Invoice without PO/GR (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Simulate button.
 If there are no differences(or if the value is within the defined tolerance), the Supplier Invoice is complete to post. 
Check the Gross Invoice Amount against the items plus tax amount 
(if tax code is,<Input Tax Code> you do not have any tax amount)

</details>

**Expected Result (Test Verification):**
> Invoice is consistent.
> In case that an error message is displayed, a correction of the entries is necessary

---

### Step 291: Post Invoice

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 161 |
| **Activity** | Create Supplier Invoice without PO/GR (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the Post button to post the Supplier Invoice.

</details>

**Expected Result (Test Verification):**
> The Invoice is posted.

---


## Activity 38: Procurement of Stock Material: Detect Critical Cash Discount Situations (Optional)

> 1 steps total | 0 classifiable | 1 hidden

### Step 292: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Detect Critical Cash Discount Situations (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
The system automatically detects critical situations, which could lead to the loss of the cash discount. The detection process is automatically triggered by the system on a regular basis and indicates critical cash discount situations to the accounts payable accountant, using the notification functionality on the home screen. This enables the accounts payable accountant to proactively react to situations, where the cash discount is at risk. Therefore, negative financial effects to the business of the company can be avoided.

</details>

---


## Activity 39: Procurement of Stock Material: React to Critical Cash Discount Situations (Optional)

> 7 steps total | 4 classifiable | 3 hidden

### Step 293: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: React to Critical Cash Discount Situations (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this procedure, supplier invoices with payment block are displayed. Blocked for Payment is a dynamic link which is visible only in invoice header when the invoice is blocked for payment. The Tab contains data relevant for explaining the block situation and its possible resolution e.g. Actions to contact supplier/purchaser, Block related statistics etc.
Situation and Notification will be triggered according to Selection Criteria set in preliminary steps. System automatically detects cash discount situations by daily job, and indicates critical situations using the notification functionality on the home screen. This enables Team Member to proactively react to potential cash discount overdue and avoid negative implications to the business processes of the company.
Note
You must perform stepCreate Ready-to-Use Situation Type for Cash Discount at Riskand Create Team and Responsibilities before testing this step.

</details>

---

### Step 294: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: React to Critical Cash Discount Situations (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 295: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: React to Critical Cash Discount Situations (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Supplier Invoices List (F1060A) .

</details>

**Expected Result (Test Verification):**
> The Supplier Invoice List screen displays.

---

### Step 296: Search for Supplier Invoices

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 162 |
| **Activity** | Procurement of Stock Material: React to Critical Cash Discount Situations (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Go.
Invoice Document No.: invoice created above (The Payment Status of Invoice is Blokced for Payment, and the Payment Terms is 0002/0003 in Invoice).

</details>

**Expected Result (Test Verification):**
> The relevant supplier invoice is displayed

---

### Step 297: Check Supplier Invoice Detail

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 163 |
| **Activity** | Procurement of Stock Material: React to Critical Cash Discount Situations (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the list of the Supplier Invoices, select an Invoice Document by clicking the entire row.
If the invoice is blocked for payment, choose Blocked for Payment link to go to Payment status page. You can check the information below:
  - Information

 The system shows: This Invoice is blocked for payment.
  - Actions

Contact Supplier: Supplier contact information.
Contact Purchaser: Purchaser contact information.
  - Blocked Invoice Items

 Showing blocking reason on line item level.
  - Invoice Timeline

 Showing dates, such as invoice document date, invoice posting date, invoice payment due date, cash discount deadline if there is any discount)
  - Statistics of Supplier 

Blocked Invoices Amount by Reason:
Shows amount of invoices blocked for the supplier and particular company code
Blocked Invoices Count by Reason:
Shows count of invoices blocked for the supplier and particular company code
Payment Blocked by Reason:
Shows percentage of block reasons/occurrences

</details>

**Expected Result (Test Verification):**
> The Payment block tab is displayed.

---

### Step 298: Check Supplier Invoices with Cash Discount Notification

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 164 |
| **Activity** | Procurement of Stock Material: React to Critical Cash Discount Situations (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Notifications icon at top right of screen.
Choose notification, for example:
X Supplier Invoices are blocked for payment.
Cash Discount at Risk due to invoice pay

</details>

**Expected Result (Test Verification):**
> The X supplier invoices which at cash discount risk are displayed in Supplier Invoices List.

---

### Step 299: Check Situation Message in Supplier Invoice

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 165 |
| **Activity** | Procurement of Stock Material: React to Critical Cash Discount Situations (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select one invoice in the above list to go to Supplier Invoice page. If notification is triggered for invoice, Situations tab will be added in supplier invoice. You can choose Close Situation and pick a reason for closing this situation.

</details>

**Expected Result (Test Verification):**
> Situation Message is shown and closed.

---


## Activity 40: Procurement of Stock Material: Create Credit Memo (Optional)

> 11 steps total | 7 classifiable | 4 hidden

### Step 300: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Create Credit Memo (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

### Purpose
In this activity, you create the credit memo.

### Procedure

</details>

---

### Step 301: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Create Credit Memo (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---

### Step 302: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Create Credit Memo (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Create Supplier Invoice (F0859) .

</details>

**Expected Result (Test Verification):**
> The Create Supplier Invoice screen displays.

---

### Step 303: Enter General Data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 166 |
| **Activity** | Procurement of Stock Material: Create Credit Memo (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In section General Data, make the following entries:
Transaction: Credit Memo
Company Code: 5410
Gross Invoice Amount:  Invoice amount
Currency: MYR
Invoice Date: Today
Posting Date: Today
Reference: xxx
Invoicing Party: 54300001

</details>

---

### Step 304: Enter Purchase Order References

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 167 |
| **Activity** | Procurement of Stock Material: Create Credit Memo (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In Purchasing Document References section, add the references. 
Make the following entries (use a PO you created previously). 
Reference: Purchase Order
Purchase Order: xxx

</details>

**Expected Result (Test Verification):**
> All items of the referenced Purchase Order are added to the Invoice Items section.

---

### Step 305: Select Invoice Items

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 168 |
| **Activity** | Procurement of Stock Material: Create Credit Memo (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the Invoice Items you want to create credit memo for.

</details>

**Expected Result (Test Verification):**
> You should see material items and delivery costs items, which refer to the entered purchase order document. Check if items for planned delivery costs have an item text.

---

### Step 306: Add Amount and Quantity

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 169 |
| **Activity** | Procurement of Stock Material: Create Credit Memo (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Check the Items that you want to post, and enter the following field entries.
Amount: xxxQuantity: xxx
Then choose the Check button at the bottom right of the screen.

</details>

**Expected Result (Test Verification):**
> The Amount, the Quantity, the Tax Code are consistent.

---

### Step 307: Check Tax

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 170 |
| **Activity** | Procurement of Stock Material: Create Credit Memo (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the section Tax, check if the Tax Amount equals the sum of Amount multiplied by Tax Code value of the selected items in Step 6

</details>

**Expected Result (Test Verification):**
> The section tax is displayed.

---

### Step 308: Simulate Credit memo and Check Messages

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 171 |
| **Activity** | Procurement of Stock Material: Create Credit Memo (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step handles issuing credit notes to customers — for example, when goods are returned or a pricing error occurred. Does your company issue credit memos?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Simulate button.
 If there are no differences(or if the value is within the defined tolerance), the Supplier Invoice is complete to post. 
Check the Gross Invoice Amount against the items plus tax amount 
(if tax code is,<Input Tax Code> you do not have any tax amount)

</details>

**Expected Result (Test Verification):**
> Invoice is consistent.
> In case that an error message is displayed, a correction of the entries is necessary

---

### Step 309: Post Credit Memo

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 172 |
| **Activity** | Procurement of Stock Material: Create Credit Memo (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step handles issuing credit notes to customers — for example, when goods are returned or a pricing error occurred. Does your company issue credit memos?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Select the Post button to post the Credit Memo

</details>

**Expected Result (Test Verification):**
> The Invoice is posted. The system displays the message Invoice xxx posted.

---

### Step 310: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Create Credit Memo (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
### Result
The supplier Invoice is complete to post.

</details>

---


## Activity 41: Procurement of Stock Material: Check Supplier Invoice List (Optional)

> 5 steps total | 2 classifiable | 3 hidden

### Step 311: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Check Supplier Invoice List (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this step, all supplier invoices are displayed.
Payment block tab is a dynamic tab which is visible only in case the invoices blocked for payment (based on payment block status in FI Module)
The Tab contains data relevant for explaining the block situation and its possible resolution e.g. Actions to contact supplier/purchaser, Block related statistics etc.

</details>

---

### Step 312: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Check Supplier Invoice List (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---

### Step 313: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Check Supplier Invoice List (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Supplier Invoices List (F1060A) .

</details>

**Expected Result (Test Verification):**
> The Supplier Invoices list screen is displayed.

---

### Step 314: Search for Supplier Invoices

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 173 |
| **Activity** | Procurement of Stock Material: Check Supplier Invoice List (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Supplier Invoice List screen, make the following entries and choose the Go button.
Invoicing Party: 54300001

</details>

**Expected Result (Test Verification):**
> The relevant Supplier Invoices are shown, grouped by status Posted, Reversal and Reversed.

---

### Step 315: Check Supplier Invoice Detail

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 174 |
| **Activity** | Procurement of Stock Material: Check Supplier Invoice List (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the list of the Supplier Invoices, select an Invoice Document by clicking the entire row.
If the invoice is blocked for payment, you check below information by choosing Blocked for Payment.
  - Information
Showing ‘This Invoice is blocked for payment.’

  - Actions
Contact Supplier: Supplier contact information. 
Contact Purchaser: Purchaser contact information. 

  - Blocked Invoice Items
Showing blocking reason on line item level.

  - Timeline 
Showing dates with focus on cash discount deadline (e.g. invoice document date, invoice posting date, cash discount deadline date if there is any discount)

  - Charts with statistics
1st chart shows the amounts of invoices blocked for the supplier and particular company code 
2nd chart shows count of invoices blocked for the supplier and particular company code 
3rd chart shows the percentage of block reasons/occurrences

</details>

**Expected Result (Test Verification):**
> The invoice document is displayed.

---


## Activity 42: Procurement of Stock Material: Approve Supplier Invoice (Optional)

> 7 steps total | 3 classifiable | 4 hidden

### Step 316: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Approve Supplier Invoice (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

### Purpose
In this step, a supplier invoice is approved.

### Procedure

</details>

---

### Step 317: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Approve Supplier Invoice (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---

### Step 318: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Approve Supplier Invoice (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Supplier Invoices List (F1060A) .

</details>

**Expected Result (Test Verification):**
> The Supplier Invoices list screen is displayed.

---

### Step 319: Filter Supplier Invoice List

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 175 |
| **Activity** | Procurement of Stock Material: Approve Supplier Invoice (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Fill in search criteria fields or leave them blank, and choose Go.

</details>

**Expected Result (Test Verification):**
> The Supplier Invoices list is displayed.

---

### Step 320: Check Supplier Invoice Detail

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 176 |
| **Activity** | Procurement of Stock Material: Approve Supplier Invoice (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the list of the Supplier Invoices, select an Invoice Document by clicking the entire row, which is blocked for payment.

</details>

**Expected Result (Test Verification):**
> The invoice document is displayed.

---

### Step 321: Release the Invoice

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 177 |
| **Activity** | Procurement of Stock Material: Approve Supplier Invoice (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Release.

</details>

**Expected Result (Test Verification):**
> The invoice is released.

---

### Step 322: Back to SAP Fiori Launch Pad

| | |
|---|---|
| **Type** | `Navigation` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Approve Supplier Invoice (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Home to go back to the SAP Fiori launchpad.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---


## Activity 43: Procurement of Stock Material: Reverse Invoice (Optional)

> 8 steps total | 4 classifiable | 4 hidden

### Step 323: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Reverse Invoice (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

### Purpose
In this step, a supplier invoice is reversed.

### Procedure

</details>

---

### Step 324: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Reverse Invoice (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---

### Step 325: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Reverse Invoice (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Supplier Invoices List (F1060A) .

</details>

**Expected Result (Test Verification):**
> The Supplier Invoices list screen is displayed.

---

### Step 326: Search for Supplier Invoices

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 178 |
| **Activity** | Procurement of Stock Material: Reverse Invoice (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Supplier Invoice List screen, make the following entries and choose the Go button.
Invoicing Party: 54300001

</details>

**Expected Result (Test Verification):**
> The relevant Supplier Invoices are shown, grouped by status Posted and Reversal.

---

### Step 327: Check Supplier Invoice Detail

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 179 |
| **Activity** | Procurement of Stock Material: Reverse Invoice (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the list of the Supplier Invoices, select the invoice created in the previous step by clicking on the row to display the invoice.

</details>

**Expected Result (Test Verification):**
> The invoice document is displayed.

---

### Step 328: Reverse the Invoice

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 180 |
| **Activity** | Procurement of Stock Material: Reverse Invoice (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Reverse.

</details>

**Expected Result (Test Verification):**
> The Reverse Invoice dialog box opens.

---

### Step 329: Enter Reason for Reversal

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 181 |
| **Activity** | Procurement of Stock Material: Reverse Invoice (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Reason for Reversal: <Default Value>
Posting Date: <Today>
Choose OK.

</details>

**Expected Result (Test Verification):**
> The Invoice is reversed.

---

### Step 330: Back to SAP Fiori Launch Pad

| | |
|---|---|
| **Type** | `Navigation` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Reverse Invoice (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Home button to go back to the SAP Fiori launchpad.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---


## Activity 44: Procurement of Stock Material: Clear GR / IR (Optional)

> 7 steps total | 3 classifiable | 4 hidden

### Step 331: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Clear GR / IR (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

### Purpose
In this step, one or more postings are cleared.

### Procedure

</details>

---

### Step 332: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Clear GR / IR (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---

### Step 333: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Clear GR / IR (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Clear GR/IR Clearing Account (MR11) .

</details>

**Expected Result (Test Verification):**
> The Maintain GR/IR Clearing Account screen opens.

---

### Step 334: Search for Purchasing Documents

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 182 |
| **Activity** | Procurement of Stock Material: Clear GR / IR (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose the Run (F8) button.
Company Code:5410
Plant: 5410
Purchase Order Date to: <today>

</details>

**Expected Result (Test Verification):**
> The relevant Purchase Orders are shown.

---

### Step 335: Post Clearing

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 183 |
| **Activity** | Procurement of Stock Material: Clear GR / IR (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
If Purchase Orders exist that need clearing, select one and choose Post Clearing (Ctrl + F12).

</details>

**Expected Result (Test Verification):**
> The clearing document is created.

---

### Step 336: Write down Clearing Document Number

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 184 |
| **Activity** | Procurement of Stock Material: Clear GR / IR (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
The clearing document is created. Write down its number as it is needed for the next step.

</details>

---

### Step 337: Back to SAP Fiori Launch Pad

| | |
|---|---|
| **Type** | `Navigation` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Clear GR / IR (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Home button to go back to the SAP Fiori launchpad.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---


## Activity 45: Procurement of Stock Material: Cancel Journal Entry (Optional)

> 7 steps total | 3 classifiable | 4 hidden

### Step 338: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Cancel Journal Entry (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this step, the GR / IR clearing posting is reversed.

</details>

---

### Step 339: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Cancel Journal Entry (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---

### Step 340: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Cancel Journal Entry (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Display/Cancel Account Maintenance Document (MR11SHOW) .

</details>

**Expected Result (Test Verification):**
> The Display / Cancel Account Maintenance Document screen opens

---

### Step 341: Search for Accounting Maintenance Document

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 185 |
| **Activity** | Procurement of Stock Material: Cancel Journal Entry (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose the Overview (Enter) (F9) .
Acct Maint.Document / fiscal year<Journal Entry> / <Fiscal year> from previous step

</details>

**Expected Result (Test Verification):**
> The accounting maintenance document is displayed.
> The Display / Cancel Account Maintenance Document screen is displayed.

---

### Step 342: Reverse Journal Entry

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 186 |
| **Activity** | Procurement of Stock Material: Cancel Journal Entry (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step is about recording financial transactions in your books. Think about: who posts journal entries? Are there approval requirements? Do you post adjustments at month-end?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the line item created in the previous step and choose the Reverse Document.

</details>

**Expected Result (Test Verification):**
> The Reversal Document Post Date screen opens.

---

### Step 343: Reverse Journal Entry

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 187 |
| **Activity** | Procurement of Stock Material: Cancel Journal Entry (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step is about recording financial transactions in your books. Think about: who posts journal entries? Are there approval requirements? Do you post adjustments at month-end?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Reversal Document Posting Date window, the original date is default in Posting Data field, you can manually choose another date via F4 button or choose Current Date, then choose Reverse (Shift+F1).  .

</details>

**Expected Result (Test Verification):**
> The Accounting Maintenance Document is reversed. The reversal document number is displayed.

---

### Step 344: Back to the SAP Fiori launchpad

| | |
|---|---|
| **Type** | `Navigation` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Procurement of Stock Material: Cancel Journal Entry (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Home to go back to the SAP Fiori launchpad.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---


## Activity 46: Monitor Down Payment process: Create Purchase Order Manually for Down Payment

> 5 steps total | 2 classifiable | 3 hidden

### Step 345: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Monitor Down Payment process: Create Purchase Order Manually for Down Payment |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

### Procedure

</details>

---

### Step 346: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Monitor Down Payment process: Create Purchase Order Manually for Down Payment |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Log on to the SAP Fiori Launchpad as a Purchaser.

</details>

---

### Step 347: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Monitor Down Payment process: Create Purchase Order Manually for Down Payment |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Create Purchase Order - Advanced (ME21N) .

</details>

**Expected Result (Test Verification):**
> The Create Purchase Order screen is displayed.

---

### Step 348: Enter Purchase Order data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 188 |
| **Activity** | Monitor Down Payment process: Create Purchase Order Manually for Down Payment |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter all of the necessary data.
Order type: NB Standard PO
Supplier: 54300003
In Header section, on the Org. Data tab, make the following entries:
Purchasing Org.: 5410
Purchasing Group: 002
Company Code: 5410

In Items section, 
Material: TG0011
Plant: 5410
Storage Location: 541A
PO Quantity: 100
Net Price: XMYR
Go to Invoice Tab and enter Tax Code<Input Tax Code>.
Tax Date: <Default Value>
DP Category: Mandatory Down Payment
ERS: deselect
Choose Enter.
Down Payment %: 10
DP Date:　the last day of this Month

</details>

**Expected Result (Test Verification):**
> The Create Purchase Order  screen is displayed.

---

### Step 349: Save Purchase Order

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 189 |
| **Activity** | Monitor Down Payment process: Create Purchase Order Manually for Down Payment |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Save and when the purchase order number is displayed, write it down for further use.

</details>

**Expected Result (Test Verification):**
> A new Purchase Order is created.
> Purchase Order Number is displayed.

---


## Activity 47: Monitor Down Payment process: Monitor Down Payments (Optional)

> 5 steps total | 2 classifiable | 3 hidden

### Step 350: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Monitor Down Payment process: Monitor Down Payments (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

### Purpose
You can monitor down payment for purchase orders.

### Prerequisite
The Purchase Orders for down payment exist.

### Procedure

</details>

---

### Step 351: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Monitor Down Payment process: Monitor Down Payments (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 352: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Monitor Down Payment process: Monitor Down Payments (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Monitor Purchase Order Down Payments (F2877) .

</details>

**Expected Result (Test Verification):**
> The Monitor Purchase Order Down Payments screen displays.

---

### Step 353: Search for Purchase Orders

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 190 |
| **Activity** | Monitor Down Payment process: Monitor Down Payments (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter the following filters values for the PO Down Payments.
Display Currency: MYR
Supplier: 54300003
Choose Go.

</details>

**Expected Result (Test Verification):**
> The down payment PO has been searched.

---

### Step 354: Display Down Payment PO

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 191 |
| **Activity** | Monitor Down Payment process: Monitor Down Payments (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Check the Down Payment Purchase Order for the detail information as Down Payment %, Amount, Release Amount, PO/items, etc.

</details>

---


## Activity 48: Monitor Down Payment process: Create Down Payment Request

> 9 steps total | 5 classifiable | 4 hidden

### Step 355: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Monitor Down Payment process: Create Down Payment Request |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

### Purpose
A down payment request is created.

### Prerequisite
The Purchase Orders for down payment exist.

### Procedure

</details>

---

### Step 356: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Monitor Down Payment process: Create Down Payment Request |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 357: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Monitor Down Payment process: Create Down Payment Request |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Monitor Purchase Order Down Payments (F2877) .

</details>

**Expected Result (Test Verification):**
> The Monitor Purchase Order Down Payments screen displays.

---

### Step 358: Search for Purchase Orders

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 192 |
| **Activity** | Monitor Down Payment process: Create Down Payment Request |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter the following filters values for the PO Down Payments.
Display Currency: MYR
Supplier: 54300003
Choose Go.

</details>

**Expected Result (Test Verification):**
> The down payment PO has been searched.

---

### Step 359: Access the SAP Fiori App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Monitor Down Payment process: Create Down Payment Request |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Highlight the PO which is created in step Create Purchase Order Manually for Down Payment.
Choose Create Down Payment Request  to open Manage Supplier Down Payment Requests screen.

</details>

**Expected Result (Test Verification):**
> The Manage Suppliers Down Payment Requests screen displays.

---

### Step 360: Header

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 193 |
| **Activity** | Monitor Down Payment process: Create Down Payment Request |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose > and make the following entries:
Company Code: 5410
Journal Entry date: Today’s date
Posting date: Today’s date
Journal Entry Type: KZ
Transaction Currency: MYR

</details>

---

### Step 361: Items

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 194 |
| **Activity** | Monitor Down Payment process: Create Down Payment Request |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries:
Supplier: 54300003
Trg. Spec. G/L Ind: A (Default value, do not change)
Amount: <PO total amount * 10%>MYR
Purchasing Document: <Default Value>
Purchasing Doc. Item: <Default Value>
Tax Code: <Default Value>Tax Amount:<Default Value>
Due On: <Default Value>

</details>

---

### Step 362: Post

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 195 |
| **Activity** | Monitor Down Payment process: Create Down Payment Request |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Post.

</details>

**Expected Result (Test Verification):**
> The Success screen is displayed showing the journal entry XXX posted.

---

### Step 363: Other

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 196 |
| **Activity** | Monitor Down Payment process: Create Down Payment Request |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the desired action in the Success screen:
  - Display 
  - Go Back

</details>

---


## Activity 49: Monitor Down Payment process: Create Down Payment

> 7 steps total | 4 classifiable | 3 hidden

### Step 364: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Monitor Down Payment process: Create Down Payment |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
A payment for a down payment request is generated.
Note
Actually, this step refers to the chapter Post Outgoing Paymentin the Accounts Payable(J60)scope item. Please make sure the down payment has not been blocked in any payment run and payment proposal.

#### Prerequisites
A down payment request has been posted.

</details>

---

### Step 365: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Monitor Down Payment process: Create Down Payment |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 366: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Monitor Down Payment process: Create Down Payment |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Post Outgoing Payments (F1612).

</details>

**Expected Result (Test Verification):**
> The Post Outgoing Payments screen displays.

---

### Step 367: Enter Payment Data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 197 |
| **Activity** | Monitor Down Payment process: Create Down Payment |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Show Items.
In the General Information section: 
Company Code: 5410
Posting Date: today's date
Journal Entry Date: today's date
Value Date: today's date
Reference (optional): reference
Journal Entry Type: KZ
 In the Bank Data section: 
G/L Account: 11001000
House Bank / Account: MYBK1/MYAC1
Amount / Currency: <PO total amount * 10% >MYR
Fees: Optional
Assignment: Optional
Exchange Rate: Optional
Amount / Code Currency:Optional

 In the Open Item Selection section: 
Account Type/Account ID: Supplier54300003

</details>

**Expected Result (Test Verification):**
> A list of open items is displayed in the Open Items section.

---

### Step 368: Select More

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 198 |
| **Activity** | Monitor Down Payment process: Create Down Payment |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To display only the special G/L transactions, click Additional Options and choose the Select More button, deselect all entries in Line Item Type field and select:
Line Item Type:Special G/L Transactions
Choose OK.

</details>

**Expected Result (Test Verification):**
> Document with special G/L transactions are displayed.

---

### Step 369: Select/Deselect

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 199 |
| **Activity** | Monitor Down Payment process: Create Down Payment |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select a downpayment which is created in previous step, and in the Clear column, choose Clear.

</details>

**Expected Result (Test Verification):**
> The downpayment to pay is transferred to the Items to be Cleared section.

---

### Step 370: Post

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 200 |
| **Activity** | Monitor Down Payment process: Create Down Payment |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Post.

</details>

**Expected Result (Test Verification):**
> The Success screen is displayed showing the journal entry number is successfully posted.

---


## Activity 50: Monitor Down Payment process: Post Goods Receipt

> 7 steps total | 4 classifiable | 3 hidden

### Step 371: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Monitor Down Payment process: Post Goods Receipt |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This activity posts the goods receipt for the purchase order.

</details>

---

### Step 372: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Monitor Down Payment process: Post Goods Receipt |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Warehouse Clerk.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 373: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Monitor Down Payment process: Post Goods Receipt |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Post Goods Receipt for Purchasing Document (F0843) .

</details>

**Expected Result (Test Verification):**
> The Post Goods Receipt for Purchasing Document screen displays.

---

### Step 374: Search for the Purchase Order

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 201 |
| **Activity** | Monitor Down Payment process: Post Goods Receipt |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Post Goods Receipt for Purchasing Document screen, enter the purchase order number and choose Enter.

</details>

**Expected Result (Test Verification):**
> The purchase order displays.

---

### Step 375: Enter Delivery Note

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 202 |
| **Activity** | Monitor Down Payment process: Post Goods Receipt |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step handles shipping goods to customers. Think about: how are deliveries scheduled? Do you use a logistics provider? Do you track shipments?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries:  - Delivery Note: <note number>

  - Printing: Choose Individual slip from the drop-down list.

And choose Enter.

</details>

---

### Step 376: Select Item

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 203 |
| **Activity** | Monitor Down Payment process: Post Goods Receipt |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the items for which a goods receipt is to be posted.

</details>

---

### Step 377: Post

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 204 |
| **Activity** | Monitor Down Payment process: Post Goods Receipt |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Post.

</details>

**Expected Result (Test Verification):**
> The system message confirms that the goods receipt posted successfully.

---


## Activity 51: Monitor Down Payment process: Create Supplier Invoice for Down Payment (Optional)

> 9 steps total | 6 classifiable | 3 hidden

### Step 378: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Monitor Down Payment process: Create Supplier Invoice for Down Payment (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
The invoice verification is done in this activity and you can do the down payment clearing. Note
If purchase order is not for the down payment and down payment didn’t post for the purchase order successfully, please skip this step directly. Please make sure the down payment has not been blocked in any payment proposal.

#### Prerequisites
Purchase Order for down payment has been created successfully in step: Create Purchase Order Manually for Down Payment.
Down payment has been posted successfully in step: Create Down Payment.

</details>

---

### Step 379: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Monitor Down Payment process: Create Supplier Invoice for Down Payment (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

**Expected Result (Test Verification):**
> The Fiori Launchpad is displayed.

---

### Step 380: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Monitor Down Payment process: Create Supplier Invoice for Down Payment (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Create Supplier Invoice - Advanced (MIRO) .

</details>

**Expected Result (Test Verification):**
> The Create Supplier Invoice Advanced screen is displayed.

---

### Step 381: Enter General Data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 205 |
| **Activity** | Monitor Down Payment process: Create Supplier Invoice for Down Payment (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Enter:
  - Company Code: 5410

  - Transaction: Invoice

  - Invoice date: Today

  - Posting Date:Today

  - Amount: value in PO

  - Calculate Tax: X

  - Reference: <xxx>(reference invoice number from invoicing party)

  - Tax code: same with tax code in PO: <Input Tax Code>

  - Text: <enter text value>

</details>

---

### Step 382: Enter Purchase Order References

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 206 |
| **Activity** | Monitor Down Payment process: Create Supplier Invoice for Down Payment (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
References Document Category: Purchase Order/ Scheduling Agreement
Purchase Order: PO number which is created in step Create Purchase Order Manually for Down Payment. Choose Enter. Choose Continue if there is a dialog about Information appears which relevant Down Payment.

</details>

---

### Step 383: Check the Purchase Order Items data

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 207 |
| **Activity** | Monitor Down Payment process: Create Supplier Invoice for Down Payment (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Check the Amount, the Quantity, and the Tax Code.

</details>

---

### Step 384: Choose Down Payment Clearing (Optional)

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 208 |
| **Activity** | Monitor Down Payment process: Create Supplier Invoice for Down Payment (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Down Payment Clearing and on the Choose Down Payment Clearing screen.
Amount Entered: same with Available Amount
Choose Copy

</details>

---

### Step 385: Simulate Supplier Invoice and Check Messages

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 209 |
| **Activity** | Monitor Down Payment process: Create Supplier Invoice for Down Payment (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Take the amount of the items as input for the Amount field in the Basic Data section. Make sure the invoice balance is 0.

</details>

**Expected Result (Test Verification):**
> The Supplier Invoice is simulated.

---

### Step 386: Post Invoice

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 210 |
| **Activity** | Monitor Down Payment process: Create Supplier Invoice for Down Payment (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Post.

</details>

**Expected Result (Test Verification):**
> The invoice is posted. The system message is shown.

---


## Activity 52: Automatic Purchase Order Creation from Purchase Requisition

> 1 steps total | 0 classifiable | 1 hidden

### Step 387: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Automatic Purchase Order Creation from Purchase Requisition |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Note
When you perform the following steps Automatic Purchase Order Creation from Purchase Requisition, you have to run Master Data update on the Preliminary Step: 
Master Data Update for Automatic Purchase Order Creation from Purchase Requisition

</details>

---


## Activity 53: Create Purchase Requisition

> 9 steps total | 5 classifiable | 4 hidden

### Step 388: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Purchase Requisition |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

### Purpose
Purchase Requisition can be created manually.

### Procedure

</details>

---

### Step 389: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Purchase Requisition |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Log on to the SAP Fiori launchpad as a Purchaser.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 390: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Purchase Requisition |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Manage Purchase Requisitions - Professional (F2229).

</details>

**Expected Result (Test Verification):**
> The Manage Purchase Requisitions – Professional screen displays.

---

### Step 391: Create Purchase Requisition

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 211 |
| **Activity** | Create Purchase Requisition |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step is about how purchase requests are created in your company. Think about: do your staff submit purchase requests? Is there an approval workflow? Do you have spending limits?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Create.

</details>

**Expected Result (Test Verification):**
> The Purchase Requisition screen displays.

---

### Step 392: Enter Document Type

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 212 |
| **Activity** | Create Purchase Requisition |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Enter Document Type: Pur. Requisition (NB).

</details>

---

### Step 393: Add Item

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 213 |
| **Activity** | Create Purchase Requisition |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Automatic Source Determination: <selected>
In the Items section, choose Create then choose Material to add new items to Purchase Requisitions.

</details>

**Expected Result (Test Verification):**
> The Purchase Requisition Item screen appears.

---

### Step 394: Enter Detail Data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 214 |
| **Activity** | Create Purchase Requisition |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter the following values in General Information section:
  - Item Category: Standard 

  - Material: TG0011
  - Plant: 5410

Enter the following values in Quantity and Date section:
  - Quantity: 10

  - Delivery Date: default value 

  - Requisition Date: default value 

  - Release Date: default value

Enter the following values in Contact Information section:
  - Purchasing Organization: 5410, and choose Enter.

  - Purchasing Group: 002, and choose Enter.

Go to Source of Supply area and make sure one source has been assigned.
Choose Apply.
Choose Apply and you will automatically go back to the Purchase Requisition screen.

</details>

---

### Step 395: Save your entries

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 215 |
| **Activity** | Create Purchase Requisition |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Create to confirm the popup message.

</details>

**Expected Result (Test Verification):**
> The purchase requisition is created.

---

### Step 396: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Purchase Requisition |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

### Result
The Purchase Requisition is created.

</details>

---


## Activity 54: Automatic Conversion of Purchase Requisition to Purchase Order

> 8 steps total | 4 classifiable | 4 hidden

### Step 397: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Automatic Conversion of Purchase Requisition to Purchase Order |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

### Procedure

</details>

---

### Step 398: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Automatic Conversion of Purchase Requisition to Purchase Order |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Log on to the SAP Fiori launchpad as a Purchaser.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 399: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Automatic Conversion of Purchase Requisition to Purchase Order |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Schedule Purchasing Jobs - Advanced (F1702).

</details>

**Expected Result (Test Verification):**
> The Application Jobs screen displays

---

### Step 400: Create Job

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 216 |
| **Activity** | Automatic Conversion of Purchase Requisition to Purchase Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Create.

</details>

**Expected Result (Test Verification):**
> The New Job screen displays.

---

### Step 401: Define a Job

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 217 |
| **Activity** | Automatic Conversion of Purchase Requisition to Purchase Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the New Job: Automatic Creation of Purchase Orders from Requisitions screen, make the following entries:
Choose 1 Template Selection and go to 1. Template Selection area to make the following entries:
  - Job Template: <Job Template>, for example, Automatic Creation of Purchase Orders from Requisitions

  - Job Name: <Job Name>, for example, Automatic Creation of Purchase Orders from Requisitions

Choose Step 2 and go to 2. Scheduling Options area to make the following entries:
  - Start Immediately : <selected>

  - Start: <Current Time>

Note
If the job needs to be run on a regular basis, choose Define Recurrence Pattern.
Choose Step 3 and go to 3. Parameters area to make the following entries:
  - Per Requisition:<selected>

  - Per Company Code: <selected>

  - Per Contract: <selected>

Note
Set Parameter settings according to your needs.
Choose Schedule.

</details>

**Expected Result (Test Verification):**
> The job is created.

---

### Step 402: Convert Purchase Requisition to Purchase Order

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 218 |
| **Activity** | Automatic Conversion of Purchase Requisition to Purchase Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Application Jobs screen.
Go to Jobs (X) area and check the status until it changes to Finished.

</details>

**Expected Result (Test Verification):**
> The Job automatically converts Purchase Requisition to Purchase Order.

---

### Step 403: Check Result

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 219 |
| **Activity** | Automatic Conversion of Purchase Requisition to Purchase Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Result.
Choose Preview.

</details>

**Expected Result (Test Verification):**
> The Purchase Order is created.

---

### Step 404: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Automatic Conversion of Purchase Requisition to Purchase Order |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Note
You may go to the Fiori Launchpad main screen. On the Fiori Launchpad main screen, chooseSearchbutton on the top. Choose Purchase Orderfrom the drop-down box, and enter the Purchase Order number in the field Search In: Purchase Orders. Select the Purchase Order you want to display on the Searchscreen.

</details>

---


## Activity 55: Post Goods Receipt

> 8 steps total | 5 classifiable | 3 hidden

### Step 405: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Post Goods Receipt |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This activity posts the receipt of goods with reference to an existing purchase order.

</details>

---

### Step 406: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Post Goods Receipt |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as Warehouse Clerk.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---

### Step 407: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Post Goods Receipt |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Post Goods Receipt for Purchasing Document (F0843).

</details>

**Expected Result (Test Verification):**
> The Post Goods Receipt for Purchasing Document screen is displayed.

---

### Step 408: Search for Purchase Order

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 220 |
| **Activity** | Post Goods Receipt |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Purchasing Document Search.

</details>

**Expected Result (Test Verification):**
> A list of Purchasing Documents displays.

---

### Step 409: Select Purchase Order

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 221 |
| **Activity** | Post Goods Receipt |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select your purchase order (if not in the PO, the storage location must be specified).

</details>

**Expected Result (Test Verification):**
> The system displays the data for the goods receipt on the Goods Receipt screen.

---

### Step 410: Enter Delivery Note

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 222 |
| **Activity** | Post Goods Receipt |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step handles shipping goods to customers. Think about: how are deliveries scheduled? Do you use a logistics provider? Do you track shipments?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Enter:
  - Delivery Note: xxx

</details>

**Expected Result (Test Verification):**
> The Post Goods Receipt screen displays.

---

### Step 411: Select Item

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 223 |
| **Activity** | Post Goods Receipt |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the items for which a goods receipt is to be posted.
Choose Storage Location (for example) 541A.

</details>

---

### Step 412: Post

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 224 |
| **Activity** | Post Goods Receipt |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Post.

</details>

**Expected Result (Test Verification):**
> The system displays the message Material Document <Document No> posted.

---


## Activity 56: Create Supplier Invoice

> 11 steps total | 8 classifiable | 3 hidden

### Step 413: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Supplier Invoice |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you perform the invoice verification.

</details>

---

### Step 414: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Supplier Invoice |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Accounts Payable Accountant.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---

### Step 415: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Supplier Invoice |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Create Supplier Invoice (F0859) .

</details>

**Expected Result (Test Verification):**
> The Create Supplier Invoices screen is displayed.

---

### Step 416: Enter General Data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 225 |
| **Activity** | Create Supplier Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In case of purchase orders created with local currency in your system, make the following entries. 
Transaction: Invoice
Company Code: 5410
Reference: Enter the reference document number of the supplier for example: 12345678
Gross Invoice Amount :  <XXX>
Currency: MYR
Invoice Date: <Today>
Posting Date: <Today>
Baseline Date: <Today> (in Payment tab)
Invoice Party: 54300001

</details>

**Expected Result (Test Verification):**
> The Create Supplier Invoices screen displays.

---

### Step 417: Enter Purchase Order References

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 226 |
| **Activity** | Create Supplier Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In Purchasing Document References, make the following entries (use a PO you created previously) and choose Enter.
Reference Document Category: Purchase Order/ Scheduling Agreement
Purchase Order: <PO number>

</details>

**Expected Result (Test Verification):**
> The Purchase Order References  screen displays.

---

### Step 418: Select Purchase Order Items

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 227 |
| **Activity** | Create Supplier Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Check the selection of the Purchase Order Items.
Confirm the warning messages.

</details>

**Expected Result (Test Verification):**
> All items of the selected Purchase Order are added to the Purchase Order Item table.
> You should see material items and delivery costs items which refer to the entered purchase order document. Check if items for planned delivery costs have an item text.

---

### Step 419: Check the Purchase Order Items Data

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 228 |
| **Activity** | Create Supplier Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Check the Amount, the Quantity, the Tax Code (there may already be a tax code that was copied from the purchase order).

</details>

**Expected Result (Test Verification):**
> The Purchase Order Item's table displays.

---

### Step 420: Check Tax code

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 229 |
| **Activity** | Create Supplier Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the section Tax check if there is tax code information and enter the tax amount.when the tax code value is greater than zero.

</details>

**Expected Result (Test Verification):**
> In the Tax tab, you should see the same tax codes as in the items. 
> If there is no tax, specify the tax code <Input Tax Code>.

---

### Step 421: Check the Balance

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 230 |
| **Activity** | Create Supplier Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Calculate the tax amount from the item amount multiplied by the tax value. Check the balance (difference between the calculated amount and the gross Amount you entered in step 3).

</details>

**Expected Result (Test Verification):**
> The balance should be zero (or within the defined tolerance).

---

### Step 422: Simulate Supplier Invoice and Check Messages

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 231 |
| **Activity** | Create Supplier Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Simulate.
If there are no differences(or if the value is within the defined tolerance), a new screen Simulation appears. You can check the simulation results in Simulation Overview and Simulation Details area.
Check the Gross Invoice Amount against the items plus tax amount (if tax code is <Input Tax Code> , you do not have any tax amount)

</details>

**Expected Result (Test Verification):**
> The supplier invoice is complete to simulate.

---

### Step 423: Post Invoice

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 232 |
| **Activity** | Create Supplier Invoice |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Post.

</details>

**Expected Result (Test Verification):**
> The invoice is posted. The system displays the message that the invoice xxx has been posted and document no. 51xxxxxxxx has been created.

---


## Activity 57: eDocument Cockpit

> 1 steps total | 0 classifiable | 1 hidden

### Step 424: Information

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
In this procedure, you change or maintain the status of your eDocument. Note
Ensure that the Preliminary Steps for eDocument Process step is performed correctly.

Note
Starting with the SAP S/4HANA Cloud Public Edition2408 release, if you are a new customer and want to enable advanced eDocument features such as eDocument Submit, Cancel and Reject, you must first activate the Document and Reporting Compliance features for your country/region. Otherwise, only Display mode is available. For more information, refer to Activate Document and Reporting Compliance Features in the Preliminary Steps section of the test script for scope item Document and Reporting Compliance (5XU).

Test step #
Test step name
Instruction
Expected results

 | 1 | Log On
 | Log on to the SAP Fiori launchpad as a Billing Clerk.
 | The SAP Fiori launchpad displays

 | 2 | Access the App
 | Open eDocument Cockpit(EDOC_COCKPIT).
 | TheeDocument Cockpit view is displayed. 

 | 3 | Select eInvoice Document
 | Make the following entries:
Source Document: <Invoice number from prior steps>
Note
You can also search for your invoice in the Results Overviewsection, choose Malaysia> Malaysia. 

 | The eInvoice screen for your country/region displays.

 | 4 | Submit eInvoice
 | Select the row and choose Submit.

Note
The submission of the eDocument re-quires a connection to the SAP Cloud Platform. 

 | The eDocument status updates with a Message Text: Action successfully executed: SUBMIT.

 | 5 | Review status
 | Review the eDocument status. The possible status of submitted eDocument:
  - Accepted by receiving Access Point

  - eDocument Created

  - Successful Submission to ASP

  - Error at Sending Access Point

  - Sending Requested

  - Error at Receiving Access Point

  - Error Response from ASP

 | The possible status of submitted eDocument can be:
  - Acknowledged by Service
  - Rejected by Service
  - Validation Passed

 | 6 | Display eDocument
 | Select the row for an eDocument with eDocument Created status.
From dropdown for Display, select Display/Preview XML.
Note
From dropdown for Display, select Display PDF.
 | The eDocument in XML format is shown.

 | 7 | Display Source Document
 | Select the row of an eDocument and from the Go todropdown, select Source Document. You can download the PDF file by double click the PDF line.
 | A view displays of the original transaction that generated the eDocument (source document).

 | 8 | Back
 | Choose < (Back)to return to the previous view.
 | 
 | 9 | Review History of eDocument
 | From the Gotodropdown, select Historyto review the eDocument history.
 | The view displays the last process steps and statuses from selected eDocument.

 | 10 | Back
 | When completing your review, choose the Backbutton at the bottom of the view to return to the previous view.
 | 
 | 11 | Review Application Log
 | From the Gotodropdown, select Application Log.
When there are no errors, a No Application Log found for the selected eDocument notification displays at the bottom of the view.
If there are errors, an Application Logdialog box displays with information about the error. Review the message and choose Continueto close the dialog box.
 | 

 | 12 | Message Dashboard
 | If you encounter errors, a dialog box displays information about the error. Review the message and choose Continueto close the dialog box.
 | 

 | 13 | Cancel eDocument
 | To cancel an eDocument, choose the row of an eDocument with Created, Sending Requested, Error at Send. Acc. Point, or Val. Error at Rec. Acc. Pointstatus.
From the buttons above the list, from the Moredropdown, select Cancel eDocument.
 | The status of eDocument changes to eDocument Cancelled and the status icon turns to green color.

 | 14 | Delete eDocument
 | To delete an eDocument, choose a row from the list with a Createdstatus.
Mark the eDocument in status Created.
From the buttons above the list, from the Moredropdown, select Delete eDocument.
 | At the bottom of the view a Number of eDocuments that have been deleted: 1 notification displays.

</details>

---


## Activity 58: Additional Information

> 9 steps total | 0 classifiable | 9 hidden

### Step 425: Information

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
If you wish to accept goods from a supplier conditionally (for example, because a certificate is missing) you initially post the goods to the non-valuated Goods Receipt Blocked stock upon receipt. When the conditions for the acceptance of the delivery have been fulfilled, you release the Goods Receipt Blocked stock to Unrestricted-use stock, Quality Inspection stock or Blocked stock. The valuation and updating of the stock data does not take place until the material is released.

#### Instructions
### Appendix: Process Integration
The process to be test in this test script is part of a chain of integrated processes.

### Succeeding Processes
After completing the activities in this test script, you can continue testing the following business processes:
Process
Business Description

 | Accounts Payable-(J60)
 | Outgoing Payment

### Goods Receipt Blocked Stock

### Prerequisite Process
Before you proceed to test this function, please follow the above detailed process in Step Create Purchase Order. Please note that if Purchase Order needs to be approved, please process the optional Step Approve Purchase Order.

</details>

---


## Activity 59: Additional Information: Post Goods Receipt Blocked Stock

> 6 steps total | 3 classifiable | 3 hidden

### Step 426: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Post Goods Receipt Blocked Stock |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this procedure, you can post the goods to the non-valuated Goods Receipt blocked stock upon receipt.
Caution
If the Goods-Receipt-Based Invoice Verification has been selected in PO creation, then you have to use App:Post Goods Movement to run this step.

</details>

---

### Step 427: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Post Goods Receipt Blocked Stock |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as Warehouse Clerk .

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 428: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Post Goods Receipt Blocked Stock |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Post Goods Receipt for Purchasing Document (F0843)

</details>

**Expected Result (Test Verification):**
> The Post Goods Receipt for Purchasing Document screen displays.

---

### Step 429: Search for Purchase Order

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 233 |
| **Activity** | Additional Information: Post Goods Receipt Blocked Stock |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Search for Purchaser Order number and choose Enter.

</details>

---

### Step 430: Select Item

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 234 |
| **Activity** | Additional Information: Post Goods Receipt Blocked Stock |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the items for which a goods receipt is to be posted. Check the checkbox on the beginning of the item row.

</details>

---

### Step 431: Post to Goods Receipt Blocked Stock

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 235 |
| **Activity** | Additional Information: Post Goods Receipt Blocked Stock |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step records when ordered goods physically arrive at your location. Think about: does someone in your warehouse check deliveries against orders? Do you use a system to track this?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter the number of items to be posted to GR blocked stock in Delivered field. Choose a storage location in Storage Location field.
For example:
Delivered: 1 PC
Storage Location: 541A
 Choose Goods Receipt Blocked Stock from Stock Type drop down list.
 Choose Post.

</details>

**Expected Result (Test Verification):**
> System displays Material Document XXX posted.

---


## Activity 60: Additional Information: Release Goods Receipt Blocked Stock

> 5 steps total | 2 classifiable | 3 hidden

### Step 432: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Release Goods Receipt Blocked Stock |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this procedure, you can release the Goods Receipt Blocked Stock to Unrestricted used stock, stock in Quality Inspection, or Blocked stock.

</details>

---

### Step 433: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Release Goods Receipt Blocked Stock |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as Warehouse Clerk .

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 434: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Release Goods Receipt Blocked Stock |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Post Goods Receipt for Purchasing Document (F0843)

</details>

**Expected Result (Test Verification):**
> The Post Goods Receipt for Purchasing Document screen displays.

---

### Step 435: Search for Purchase Order

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 236 |
| **Activity** | Additional Information: Release Goods Receipt Blocked Stock |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Search for Purchaser Order number and choose Enter.

</details>

---

### Step 436: Release Goods Receipt Blocked Stock

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 237 |
| **Activity** | Additional Information: Release Goods Receipt Blocked Stock |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step records when ordered goods physically arrive at your location. Think about: does someone in your warehouse check deliveries against orders? Do you use a system to track this?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter the number of items to be released from GR blocked stock in Delivered field. Choose a storage location in Storage Location field.
For example:
Delivered: 1 PC
Storage Location: 541A
Choose Stock Type from the drop down list:
GR Blocked Stock to Unrestricted – Use
Note
You can also select other stock type if you would like to release stock to Quality Inspection Stock or Blocked Stock

 Choose Post.

</details>

**Expected Result (Test Verification):**
> System displays Material Document XXX posted.

---


## Activity 61: Additional Information: Setup Mail Notification for Purchase Order Workflow

> 6 steps total | 3 classifiable | 3 hidden

### Step 437: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Setup Mail Notification for Purchase Order Workflow |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
Copy the predelivered email template to the exactly named custom template.

</details>

---

### Step 438: Log onto Fiori Launchpad

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Setup Mail Notification for Purchase Order Workflow |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log onto the SAP Fiori launchpad using the Extensibility Specialist role.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 439: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Setup Mail Notification for Purchase Order Workflow |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Maintain Email Templates - Deprecated (F1306) .

</details>

**Expected Result (Test Verification):**
> The templates displays.

---

### Step 440: Create Email Template

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 238 |
| **Activity** | Additional Information: Setup Mail Notification for Purchase Order Workflow |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Maintain Email Templates screen, choose Predelivered (X), search Template: SWF_CRT_NOTIFY_RECIPIENTS.
Choose email template, choose Copy and then make below entries:
Email Template: _00800238_CRT_ALL
Name: Workflow for Release of Purchase Order 
Choose Copy.
Note
 Following templates are available for purchase order workflow:
Workflow for Release of Purchase Order: 
 00800238_CRT_ALL
 00800238_CRT_19

</details>

**Expected Result (Test Verification):**
> Email Template copied.

---

### Step 441: Adjust the text of the mail template

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 239 |
| **Activity** | Additional Information: Setup Mail Notification for Purchase Order Workflow |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Custom tab. 
Choose Email template, for example YY1__00800238_CRT_ALL then go to Email Template screen.

</details>

**Expected Result (Test Verification):**
> Custom Email Template opened.

---

### Step 442: Choose Language

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 240 |
| **Activity** | Additional Information: Setup Mail Notification for Purchase Order Workflow |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Language, for example English. Then go to Email Template Content screen.
You can edit the Body HTML part and Body Plain Text part as your request then choose Save.

</details>

**Expected Result (Test Verification):**
> The Email Template adjusted.

---


## Activity 62: Additional Information: Setup Mail Notification for Purchase Order Deadline

> 7 steps total | 4 classifiable | 3 hidden

### Step 443: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Setup Mail Notification for Purchase Order Deadline |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
Copy the predelivered email template to the exactly named custom template.

</details>

---

### Step 444: Log onto Fiori Launchpad

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Setup Mail Notification for Purchase Order Deadline |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log onto the SAP Fiori launchpad using the Extensibility Specialist role.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 445: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Setup Mail Notification for Purchase Order Deadline |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Maintain Email Templates - Deprecated (F1306) .

</details>

**Expected Result (Test Verification):**
> The templates displays.

---

### Step 446: Create Email Template

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 241 |
| **Activity** | Additional Information: Setup Mail Notification for Purchase Order Deadline |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Maintain Email Templates screen, choose Predelivered (X), search Template: MMPUR_PO_WFL_DEADLINE_EMAIL.
Choose email template then choose Copy then make below entries:
Prefix: YY1_
Email Template: MMPUR_PO_WFL_DEADLINE_EMAIL
Name: Email Notification for Purchase Order Deadline
Choose Copy.

</details>

**Expected Result (Test Verification):**
> Email Template copied.

---

### Step 447: Adjust the text of the mail template

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 242 |
| **Activity** | Additional Information: Setup Mail Notification for Purchase Order Deadline |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Custom tab. 
Choose Email template, for example YY1_MMPUR_PO_WFL_DEADLINE_EMAIL  then go to Email Template screen.

</details>

**Expected Result (Test Verification):**
> Custom Email Template opened.

---

### Step 448: Choose Language

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 243 |
| **Activity** | Additional Information: Setup Mail Notification for Purchase Order Deadline |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Language, for example English. Then go to Email Template Content screen.
You can edit the Body HTML part and Body Plain Text part as your request then choose Save.

</details>

**Expected Result (Test Verification):**
> The Email Template adjusted.

---

### Step 449: Display the Show Data Fields (Optional)

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 244 |
| **Activity** | Additional Information: Setup Mail Notification for Purchase Order Deadline |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Click Show Data Fields to get the fields available to configure in the email template

</details>

**Expected Result (Test Verification):**
> The Show Data Fields displayed.

---


## Activity 63: Additional Information: Configure Deadline in Manage Workflows for Purchase Orders

> 7 steps total | 3 classifiable | 4 hidden

### Step 450: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Configure Deadline in Manage Workflows for Purchase Orders |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In order to implement the email notifications for deadline purchase order, and inform the approvers about the PO's overdue for approval, then the deadline should be configured in Purchase Order Workflow.

</details>

---

### Step 451: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Configure Deadline in Manage Workflows for Purchase Orders |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration .

</details>

**Expected Result (Test Verification):**
> The Fiori launchpad is displayed.

---

### Step 452: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Configure Deadline in Manage Workflows for Purchase Orders |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Manage Workflows for Purchase Orders (F2872) .

</details>

**Expected Result (Test Verification):**
> The Manage Workflows screen is displayed.

---

### Step 453: Create Manage Workflow

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 245 |
| **Activity** | Additional Information: Configure Deadline in Manage Workflows for Purchase Orders |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Create, and make the following entries:
Workflow Name: <Test Workflow for Purchase Order>
From the Start Conditions section, add the following preconditions:
Purchasing group of purchase order is: Selected
Purchasing Group: 003
Choose Create another condition, and make the following entries:
Total net amount of purchase order is greater than: Selected
Amount: For example, 5000,00
Currency: MYR
In the STEP area, choose Create and make the following entries:
Step Type: Release of Purchase Order
In the RECIPIENTS area, make the following entries:
Assignment By: User
User: Select User from value help (with Employee ID PURCHASING_MANAGER)
Choose OK.
Step to be completed by: One of the recipients.

</details>

**Expected Result (Test Verification):**
> The Workflow for Purchase Order is configured.

---

### Step 454: Setup Deadlines

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 246 |
| **Activity** | Additional Information: Configure Deadline in Manage Workflows for Purchase Orders |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Go to Deadlines section, choose Create, and make the following entries:
If step is not completed by: The below timeline after start of the approval workflow. 
- < for example 2> Minute(s)
Execute the following action: Send mail notification 
E-Mail Template: Email Notification for Purchase Order Deadline 
Go to Recipients, and make the following entries: 
Assignment By: User 
User: Select User from value help (for example: Employee ID PURCHASING_MANAGER) 
Note
This recipients user: for example PURCHASING_MANAGER should assign the email address. 

Choose Create.
Choose Save .

</details>

---

### Step 455: Activate Workflow Item

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 247 |
| **Activity** | Additional Information: Configure Deadline in Manage Workflows for Purchase Orders |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the Workflow Item just created, and choose Activate.

</details>

**Expected Result (Test Verification):**
> The Workflow Item is activated.

---

### Step 456: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Configure Deadline in Manage Workflows for Purchase Orders |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Note
Please make sure default workflow Automatic Release of Purchase Order has been activated.

</details>

---


## Activity 64: Additional Information

> 9 steps total | 0 classifiable | 9 hidden

### Step 457: Information

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

### Free Goods Purchasing

</details>

---


## Activity 65: Additional Information: Change Material Master Data – For Free Goods

> 8 steps total | 5 classifiable | 3 hidden

### Step 458: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Change Material Master Data – For Free Goods |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
The following procedure provides instructions for changing material master data.

</details>

---

### Step 459: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Change Material Master Data – For Free Goods |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad using the Master Data Specialist - Product Data role.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 460: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Change Material Master Data – For Free Goods |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Change Material (MM02).

</details>

**Expected Result (Test Verification):**
> The Change Material (Initial Screen) displays.

---

### Step 461: Enter Material Basic Data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 248 |
| **Activity** | Additional Information: Change Material Master Data – For Free Goods |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Change Material screen, make the following entries:
Material: for example, TG0012
Choose Select View(s).

</details>

**Expected Result (Test Verification):**
> The Select View(s) screen displays.

---

### Step 462: Choose Views

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 249 |
| **Activity** | Additional Information: Change Material Master Data – For Free Goods |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Select View(s) screen, choose Purchasing and Continue.

</details>

**Expected Result (Test Verification):**
> The Organizational Levels displays.

---

### Step 463: Enter Organizational Levels Data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 250 |
| **Activity** | Additional Information: Change Material Master Data – For Free Goods |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Organizational Levels screen, make the following entries: 
Plant: <Plant>, for example, 5410
Choose Continue.

</details>

**Expected Result (Test Verification):**
> The Change Material XXXXX (Material general) displays.

---

### Step 464: Select Autom.PO

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 251 |
| **Activity** | Additional Information: Change Material Master Data – For Free Goods |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Scroll down to the General Data section and select the following: 
Qual.f.FreeGoodsDis.: <2>

</details>

**Expected Result (Test Verification):**
> Autom.PO  is selected.

---

### Step 465: Save your data

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 252 |
| **Activity** | Additional Information: Change Material Master Data – For Free Goods |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Save.

</details>

**Expected Result (Test Verification):**
> The material master data is updated.

---


## Activity 66: Additional Information: Change Supplier Master Data - For Free Goods

> 10 steps total | 7 classifiable | 3 hidden

### Step 466: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Change Supplier Master Data - For Free Goods |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
The following procedure provides instructions for changing supplier master data.

</details>

---

### Step 467: Log on

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Change Supplier Master Data - For Free Goods |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad using the Master Data Specialist - Business Partner Data role.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 468: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Change Supplier Master Data - For Free Goods |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Maintain Business Partner (BP) .

</details>

**Expected Result (Test Verification):**
> The Maintain Business Partner screen displays.

---

### Step 469: Enter Business Partner

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 253 |
| **Activity** | Additional Information: Change Supplier Master Data - For Free Goods |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entry and choose Enter:
Find: Business Partner
By: Supplier Number
Supplier Number: for example, 54300003
Choose Start. The Supplier row displays.
Double-click the Supplier Partner row.

</details>

**Expected Result (Test Verification):**
> The Supplier information  screen displays.

---

### Step 470: Switch to Change mode

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 254 |
| **Activity** | Additional Information: Change Supplier Master Data - For Free Goods |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Ensure you are in Change mode. Otherwise, select Switch Between Display and Change.

</details>

**Expected Result (Test Verification):**
> The Change mode screen displays.

---

### Step 471: Change BP role

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 255 |
| **Activity** | Additional Information: Change Supplier Master Data - For Free Goods |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Change in BP role field, choose the following value:
Supplier (defined)

</details>

---

### Step 472: Open Purchasing Organization Data

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 256 |
| **Activity** | Additional Information: Change Supplier Master Data - For Free Goods |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Purchasing tab at the top of the screen.

</details>

**Expected Result (Test Verification):**
> The Purchasing Organization sub section screen displays.

---

### Step 473: Enter Purchasing Data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 257 |
| **Activity** | Additional Information: Change Supplier Master Data - For Free Goods |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Switch Organization.
Make the following entry and choose Enter:
Purch. Organization: <Purchasing Organization>, for example, 5410

</details>

---

### Step 474: Select Grant Free Goods checkbox

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 258 |
| **Activity** | Additional Information: Change Supplier Master Data - For Free Goods |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
From the Purchasing Data section, scroll down to the Control Data section, make the following entry:
Grant Free Goods: <selected>

</details>

**Expected Result (Test Verification):**
> The Grant Free Goods checkbox is selected.

---

### Step 475: Save your data

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 259 |
| **Activity** | Additional Information: Change Supplier Master Data - For Free Goods |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Save.

</details>

**Expected Result (Test Verification):**
> The Supplier change is saved.

---


## Activity 67: Additional Information

> 9 steps total | 0 classifiable | 9 hidden

### Step 476: Information

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
This process step shows you how to create purchasing info record.

#### Procedure
Test Step #Test Step NameInstructionExpected ResultComments
 | 1
 | Log on
 | Log onto the SAP Fiori launchpad as a Purchaser.
 | The SAP Fiori launchpad is displayed.
 | 
 | 2
 | Access the App
 | Open Create Purchasing Info Record(ME11).
 | The Create Info Record: Manage Purchasing Info Recordsscreen is displayed. 
 | 
 | 3
 | Create New Purchasing Info Record for header data 
 | On Create Info Record: Initial Screen, make the following entries and choose Enter. 
  - Supplier: 54300003

  - Material: TG0012

  - Plant: 5410

  - Purchasing Organization: 5410

  - Standard Info category: select

 | The Purchasing Info RecordScreen is displayed.
 | 
 | 4
 | Enter Purch.Org. Data 
 | ● Delivery Time in Days: 3
●Purch.Group: 001
● Tol. Underdl.: 10.0
● Tol. Overdl.: 10%
● Tax Code: <Input Tax Code>
● Order Unit:PC
● Standard Order Quantity: 10
● Net Price:30 
●Incoterm: EXWNote
Incoterms and their corresponding versions are grouped in the F4 value help. Selecting an incoterm automatically populates its associated version, which can be subsequently modified or removed if needed.

● Incoterm Location 1: VENDOR
 | Purchase Organization data for Purchasing Info Record is added.
 | 
 | 5
 | Maintain Free Goods 
 | Choose Conditionsto go to next screen. 
Highlight Condition Type PPR0with price. 
Choose Free Goods(Ctrl+F1), and make the following entries: 
Supplier: 54300003
Material: TG0012
Plant: 5410
Purchasing Organization: 5410
Valid From: Today 
Valid To: 12/31/9999 
Infotype:0 
Order Unit:PC 
Min Qty: 100 
For:10 
Add. qnty:1 
Calc.Rule: 1
Choose Enter. 
 | The Free Goods condition has been maintained. 
 | 
 | 6
 | Save your data
 | Choose Savetwice. 
 | The purchasing info record is saved.
 |

#### Instructions
### Create Purchasing Info Record

</details>

---


## Activity 68: Additional Information: Create Purchase Order Manually for Free Goods

> 5 steps total | 2 classifiable | 3 hidden

### Step 477: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Create Purchase Order Manually for Free Goods |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

### Procedure

</details>

---

### Step 478: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Create Purchase Order Manually for Free Goods |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Log on to the SAP Fiori launchpad as a Purchaser.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---

### Step 479: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Create Purchase Order Manually for Free Goods |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Create Purchase Order - Advanced (ME21N) .

</details>

**Expected Result (Test Verification):**
> The Create Purchase Order  screen is displayed.

---

### Step 480: Enter Purchase Order data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 260 |
| **Activity** | Additional Information: Create Purchase Order Manually for Free Goods |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter all of the necessary data.
Order type: NB Standard PO
Supplier: 54300003
In Header section, on the Org. Data tab, make the following entries:
Purchasing Org.: 5410
Purchasing Group:002
Company Code: 5410
In Items section,
Material: TG0012
Plant: 5410
Storage Location: 541A
Quantity: 200
Net Price: X MYR
Choose Enter. 
After choosing Enter in PO creation, the result as per the free goods scheme qty 20 PC becomes free automatically in second line item. 
Go to Invoice Tab and enter Tax Code<Input Tax Code>.
Tax Date: <Default Value>

</details>

**Expected Result (Test Verification):**
> The Create Purchase Order  Screen is shown.

---

### Step 481: Save Purchase Order

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 261 |
| **Activity** | Additional Information: Create Purchase Order Manually for Free Goods |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Save and when the purchase order number is displayed, write it down for further use.

</details>

**Expected Result (Test Verification):**
> A new Purchase Order is created.
> Purchase Order Number is displayed.

---


## Activity 69: Additional Information: Quantity Optimization for Purchase Order: Setup a Static Rounding Profile

> 17 steps total | 10 classifiable | 7 hidden

### Step 482: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Setup a Static Rounding Profile |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
The following procedure provides instructions for setup a static Rounding Profile

#### Procedure
Depending on your configuration environment for SAP S/4HANA Cloud Public Edition, choose one of the following options:
Configure Your Solution:

</details>

---

### Step 483: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Setup a Static Rounding Profile |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration .

</details>

**Expected Result (Test Verification):**
> The SAP Fiori Launchpad is displayed.

---

### Step 484: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Setup a Static Rounding Profile |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Your Solution (F1241).

</details>

**Expected Result (Test Verification):**
> The Manage Your Solution screen is displayed.

---

### Step 485: Open Configure Your Solution

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Setup a Static Rounding Profile |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Configure Your Solution.
Note
If country version needs to be added, choose Set Country Version.

</details>

**Expected Result (Test Verification):**
> The Configure Your Solution screen is displayed.

---

### Step 486: Select the Application Area

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 262 |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Setup a Static Rounding Profile |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Configure Your Solution: Realize Phase screen, enter the following search criteria:
Application Area: Logistics
Sub Application Area: Quantity Optimization
Choose Enter

</details>

**Expected Result (Test Verification):**
> A list of items appears.

---

### Step 487: Select Item

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 263 |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Setup a Static Rounding Profile |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the item and choose > to go to the screen Quantity Optimizing and Allowed Logistics Unit of Measure

</details>

**Expected Result (Test Verification):**
> The item is selected and go to the next screen.

---

### Step 488: Select Configuration Step

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 264 |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Setup a Static Rounding Profile |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Configure for Step Name Maintain Rounding Profile, ID:104713

</details>

**Expected Result (Test Verification):**
> The SSC UI screen opens.

---

### Step 489: Create a static Rounding Profile

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 265 |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Setup a Static Rounding Profile |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter an ID for your rounding profile and choose "Create statically F6" (Static)
For example:
Rounding Profile:ZT01
Plant:5410Note
Rounding profile can be setup plant-dependent or independent. Plant-dependent profiles will be chosen prior to plant independent within the application context.

</details>

**Expected Result (Test Verification):**
> The system navigates you to the next screen Create Static Rounding Profile.

---

### Step 490: Define Rounding Profile Values

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 266 |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Setup a Static Rounding Profile |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter a description and profile values as the following:
For example:
Rounding Profile Description:Rounding up to full 5
Thres. Value Round. Value
 | 1 | 5
 | 6 | 10
 | 11 | 15
 | 16 | 20
 | 21 | 25
 | 26 | 30
 | 31 | 35
 | 36 | 40
 | 41 | 45
 | 46 | 50

Note
With this rounding logic, any input quantity will be round up to the next possible "full 5". E.g. an input quantity of 16, 17, 18, 19 or 20 matches the threshold value 16,000. The rounding up value in all cases will be 20,000 - ie. the next possible "full 5".
The system logic will also be able to handle bigger input values even they are not explicitly specific here. That is, if e.g. the current input quantity in the PO item is e,g, 78, the system will be able to round it up to 80 based on the internal algorithm.

</details>

**Expected Result (Test Verification):**
> Your Rounding Profile is successfully defined.

---

### Step 491: Save rounding Profile

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 267 |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Setup a Static Rounding Profile |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Save to save rounding profile.

</details>

**Expected Result (Test Verification):**
> The rounding profile has been saved.

---

### Step 492: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Setup a Static Rounding Profile |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

SAP Central Business Configuration:

</details>

---

### Step 493: Log on

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Setup a Static Rounding Profile |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the project experience in SAP Central Business Configuration.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 494: Open Maintain Rounding Profile

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 268 |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Setup a Static Rounding Profile |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Go to the Configuration app and search for the following activity: Maintain Rounding Profile. 
Choose the line item in the search result to see more details about this configuration activity.
Choose the Go to Activity  button to navigate directly to the SAP S/4HANA Cloud Public Edition system. Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration.

</details>

---

### Step 495: Create static Rounding Profile

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 269 |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Setup a Static Rounding Profile |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter an ID for your rounding profile and choose "Create statically F6" (Static)
For example:
Rounding Profile:ZT01
Plant:5410Note
Rounding profile can be setup plant-dependent or independent. Plant-dependent profiles will be chosen prior to plant independent within the application context.

</details>

---

### Step 496: Define Rounding Profile values

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 270 |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Setup a Static Rounding Profile |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter a description and profile values as the following:
For example:
Rounding Profile Description:Rounding up to full 5
Thres. Value Round. Value
 | 1 | 5
 | 6 | 10
 | 11 | 15
 | 16 | 20
 | 21 | 25
 | 26 | 30
 | 31 | 35
 | 36 | 40
 | 41 | 45
 | 46 | 50

Note
With this rounding logic, any input quantity will be round up to the next possible "full 5". E.g. an input quantity of 16, 17, 18, 19 or 20 matches the threshold value 16,000. The rounding up value in all cases will be 20,000 - ie. the next possible "full 5".
The system logic will also be able to handle bigger input values even they are not explicitly specific here. That is, if e.g. the current input quantity in the PO item is e,g, 78, the system will be able to round it up to 80 based on the internal algorithm.

</details>

---

### Step 497: Save Rounding Profile

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 271 |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Setup a Static Rounding Profile |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Save to save rounding profile.

</details>

**Expected Result (Test Verification):**
> The rounding profile has been saved.

---

### Step 498: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Setup a Static Rounding Profile |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Note
If you encounter setup rounding profile issues, you can create an incident under LO-RFM-MD-QO component.

### Result
The static rounding profile ZT01 has been created.

</details>

---


## Activity 70: Additional Information: Quantity Optimization for Purchase Order: Maintain a Rounding Profile in the Purchasing Info Record

> 19 steps total | 14 classifiable | 5 hidden

### Step 499: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Maintain a Rounding Profile in the Purchasing Info Record |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
The following procedure provides instructions for maintaining the Rounding Profile in the purchasing info record.

</details>

---

### Step 500: Log on

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Maintain a Rounding Profile in the Purchasing Info Record |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Log onto the SAP Fiori launchpad as a Purchaser.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---

### Step 501: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Maintain a Rounding Profile in the Purchasing Info Record |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Purchasing Info Records (F1982).

</details>

**Expected Result (Test Verification):**
> The Manage Purchasing Info Records screen is displayed.

---

### Step 502: Search existed Purchasing Info Record

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 272 |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Maintain a Rounding Profile in the Purchasing Info Record |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries:
Purchasing Info Record Category: Standard
Supplier: 54300002
Material: TG0012
Plant:5410
Choose Go.
If the Purchasing Info Records is not created at plant level, then you can process the Case 1 (Create Purchasing Info Records).
If the purchasing Info Records is created at plant level, then you can process the Case 2: Change Purchasing Info Records.

</details>

**Expected Result (Test Verification):**
> The purchasing info record can be searched.

---

### Step 503: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Maintain a Rounding Profile in the Purchasing Info Record |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Case 1: Create Purchasing Info Records

</details>

---

### Step 504: Open New Purchasing Info Record

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 273 |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Maintain a Rounding Profile in the Purchasing Info Record |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Create

</details>

**Expected Result (Test Verification):**
> The Purchasing Info Record Screen is displayed.

---

### Step 505: Enter Header Data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 274 |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Maintain a Rounding Profile in the Purchasing Info Record |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries:
Purchasing Info Record Category: Standard
Purchasing Organization: 5410
Supplier: 54300002
Material: TG0012
Plant: 5410
Purchasing Group: 002

</details>

**Expected Result (Test Verification):**
> Header data is added.

---

### Step 506: Enter General Information

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 275 |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Maintain a Rounding Profile in the Purchasing Info Record |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries:
Available From:Today
Available To:31.12.9999

</details>

**Expected Result (Test Verification):**
> General Information is added.

---

### Step 507: Enter Purchasing Data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 276 |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Maintain a Rounding Profile in the Purchasing Info Record |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries:
Incoterm: EXW
Note
Incoterms and their corresponding versions are grouped in the F4 value help. Selecting an incoterm automatically populates its associated version, which can be subsequently modified or removed if needed.
Incoterm Location 1: VENDOR

</details>

**Expected Result (Test Verification):**
> Purchasing Data is added.

---

### Step 508: Enter Delivery and Quantity Data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 277 |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Maintain a Rounding Profile in the Purchasing Info Record |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step handles shipping goods to customers. Think about: how are deliveries scheduled? Do you use a logistics provider? Do you track shipments?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries:
Delivery Time in Days: 1
Under Delivery Tolerance in %: 10.0
Over Delivery Tolerance in %: 10.0
Tax Code: <Input Tax Code>
Tax Rate Valid From: Select value from F4 help
Order Unit: PC
Standard Order Quantity: 10
Goods-Receipt-Based Invoice Verification: select
No Evaluated Receipt Settlement: select

</details>

**Expected Result (Test Verification):**
> Delivery and Quantity Data is added.

---

### Step 509: Enter the Rounding Profile

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 278 |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Maintain a Rounding Profile in the Purchasing Info Record |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries (for example):
Round Profile:ZT01
Note
The value help behind the field will show all existing rounding profiles. Choose the rounding profile you have created in the previous configuration step

</details>

**Expected Result (Test Verification):**
> The rounding profile has been added in purchasing info record

---

### Step 510: Enter Condition Data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 279 |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Maintain a Rounding Profile in the Purchasing Info Record |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Conditions section, choose Create.
In the General Information area, make the following entries:
Valid From: Today
Valid To: 12.31.9999
Amount: 30.00
Pricing Unit: 1
Currency: Plant: MYR
Choose Apply.

</details>

**Expected Result (Test Verification):**
> Condition Data is added

---

### Step 511: Enter Reference Data (optional)

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 280 |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Maintain a Rounding Profile in the Purchasing Info Record |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

You can enter reference data.

</details>

**Expected Result (Test Verification):**
> Reference data is added.

---

### Step 512: Create your data

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 281 |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Maintain a Rounding Profile in the Purchasing Info Record |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Create.

</details>

**Expected Result (Test Verification):**
> The purchasing info record is created.

---

### Step 513: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Maintain a Rounding Profile in the Purchasing Info Record |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Case 2: Change Purchasing Info Records

</details>

---

### Step 514: Open Existed Purchasing Info Record

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 282 |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Maintain a Rounding Profile in the Purchasing Info Record |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose this existed Purchasing Info Record, and choose > to go to the next screen.

</details>

**Expected Result (Test Verification):**
> Go to the purchasing info record screen.

---

### Step 515: Choose Edit

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 283 |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Maintain a Rounding Profile in the Purchasing Info Record |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Edit

</details>

**Expected Result (Test Verification):**
> The purchasing info record can be edited.

---

### Step 516: Enter the Rounding Profile

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 284 |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Maintain a Rounding Profile in the Purchasing Info Record |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Go to Tab Delivery and Quantity , and make the following entries (for example):
Round Profile:ZT01
Note
The value help behind the field will show all existing rounding profiles. Choose the rounding profile you have created in the previous configuration step.

</details>

**Expected Result (Test Verification):**
> The rounding profile has been added in purchasing info record.

---

### Step 517: Save your data

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 285 |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Maintain a Rounding Profile in the Purchasing Info Record |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Save.

</details>

**Expected Result (Test Verification):**
> The purchasing info record is saved.

---


## Activity 71: Additional Information: Quantity Optimization for Purchase Order: Create Purchase Order with Quantity Optimization

> 6 steps total | 2 classifiable | 4 hidden

### Step 518: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Create Purchase Order with Quantity Optimization |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

### Procedure

</details>

---

### Step 519: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Create Purchase Order with Quantity Optimization |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Log on to the SAP Fiori launchpad as a Purchaser.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---

### Step 520: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Create Purchase Order with Quantity Optimization |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Create Purchase Order - Advanced (ME21N) .

</details>

**Expected Result (Test Verification):**
> The Create Purchase Order  screen is displayed.

---

### Step 521: Enter Purchase Order data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 286 |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Create Purchase Order with Quantity Optimization |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter all of the necessary data.
Order type: NB Standard PO
Supplier: 54300002
In Header section, on the Org. Data tab, make the following entries:
Purchasing Org.: 5410
Purchasing Group:002
Company Code: 5410
In Items section,
Material: TG0012
Plant: 5410
Storage Location: 541A
Quantity: <7>
Note
After quantity <7> was entered as item quantity, the system will automatically round it up to 10 as per the logic in the used rounding profile.

Respectively other quanties will be rounded up to full 5 as per the rounding profile's logic.
In addition, there will be an info message displayed in the message try (left lowert screen corner).
In the message window section General information you will see a message Order quantity violates rounding rules (See long text).
Once you navigate to the long text you see more details on what the system automatically adjusted. In this example the action Rounding via static rounding profile will be shown as measure taken by the system.
Net Price: XMYR
Choose Enter.
Go to Invoice Tab and enter Tax Code <Input Tax Code> .
Tax Date: <Default Value>

</details>

**Expected Result (Test Verification):**
> The Create Purchase Order  Screen is displayed.

---

### Step 522: Save Purchase Order

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 287 |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Create Purchase Order with Quantity Optimization |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Save and when the purchase order number is displayed, write it down for further use.

</details>

**Expected Result (Test Verification):**
> A new Purchase Order is created.
> Purchase Order Number is displayed.

---

### Step 523: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Create Purchase Order with Quantity Optimization |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Note
Once you have entered a PO Quantity which is then automatically rounded up, the item will not be subject to a 2nd rounding again if you again change the quantity which needed to be rounded as well. Or in other words, the rounding automatism is only triggered once for a PO item. If you need to restart, you need to remove the item and enter it again to have one attempt for executing the quantity optimization.

</details>

---


## Activity 72: Additional Information: Quantity Optimization for Purchase Order: Simulate Quantity Optimizing

> 6 steps total | 2 classifiable | 4 hidden

### Step 524: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Simulate Quantity Optimizing |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

### Procedure

</details>

---

### Step 525: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Simulate Quantity Optimizing |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Log on to the SAP Fiori launchpad as a Purchaser.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---

### Step 526: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Simulate Quantity Optimizing |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Simulate Quantity Optimizing (WLB8).

</details>

**Expected Result (Test Verification):**
> The selection screen for Simulating Quantity Optimizing opens

---

### Step 527: Make Your Selection

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 288 |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Simulate Quantity Optimizing |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Selection screen, make the following entries:
Application Rel.X
Calling Application:A Standard Purchase Order
Choose Continue.

</details>

**Expected Result (Test Verification):**
> The selection screen for Application-Dependent Simulation: Standard Purchase Order opens.

---

### Step 528: Enter the simulate data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 289 |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Simulate Quantity Optimizing |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the selection screen make the following entries:
Material:TG0012
Vendor:54300002
Supplying Plant:<leave empty>
Purch. Organization: 5410
Receiving Plant:5410
Item Category:Standard
Input Quantity:7
Input UoM: PC
Note
You can play with the Quantity, e.g. you may use different quantities to be rounded, even those which are not explicitly defined in the Rounding Profile. The system will extrapolate the rounded quantity.

Start the simulaiton by pressing the "Execute" action button

</details>

**Expected Result (Test Verification):**
> The Rounded Quantity will display the rounding result (here: 10 PC).
> That is, based on the rounding profile ZT01, the input quantity of 7 PC was rounded up to 10 PC.

---

### Step 529: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Quantity Optimization for Purchase Order: Simulate Quantity Optimizing |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Note
If you encounter simulate Quantity Optimizing issues, you can create an incident under LO-RFM-MD-QO component.

</details>

---


## Activity 73: Additional Information: Rework Flexible Workflow for Purchase Orders: Activate Inquiry Workflow for Purchase Orders

> 11 steps total | 4 classifiable | 7 hidden

### Step 530: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Rework Flexible Workflow for Purchase Orders: Activate Inquiry Workflow for Purchase Orders |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this procedure, you activate the Inquiry Workflow for Purchase Orders.

#### Procedure
Depending on your configuration environment for SAP S/4HANA Cloud Public Edition, choose one of the following options:
Configure Your Solution:

</details>

---

### Step 531: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Rework Flexible Workflow for Purchase Orders: Activate Inquiry Workflow for Purchase Orders |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori Launchpad as a Configuration Expert - Business Process Configuration.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori Launchpad is displayed.

---

### Step 532: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Rework Flexible Workflow for Purchase Orders: Activate Inquiry Workflow for Purchase Orders |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Your Solution (F1241).

</details>

**Expected Result (Test Verification):**
> The Manage Your Solution screen is displayed.

---

### Step 533: Open Configure Your Solution

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Rework Flexible Workflow for Purchase Orders: Activate Inquiry Workflow for Purchase Orders |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Configure Your Solution.Note
To create country-/region-dependent settings for the intended local version, choose Set Local Version.

</details>

**Expected Result (Test Verification):**
> The Configure Your Solution screen is displayed.

---

### Step 534: Open Activate Inquiry Workflow for Purchase Orders

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 290 |
| **Activity** | Additional Information: Rework Flexible Workflow for Purchase Orders: Activate Inquiry Workflow for Purchase Orders |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Configure Your Solution: Realize Phase screen, search Activate Inquiry Workflow for Purchase Orders, then choose Search.
Select the line of the item and go to the next screen.
On the Configure Your Solution - Purchase Order Processing screen, choose Configure on the line of configuration step with name Activate Inquiry Workflow for Purchase Orders.

</details>

**Expected Result (Test Verification):**
> The Purchase Order Processing  screen is displayed.

---

### Step 535: Activate Inquiry Workflow for Purchase Orders

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 291 |
| **Activity** | Additional Information: Rework Flexible Workflow for Purchase Orders: Activate Inquiry Workflow for Purchase Orders |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Change State to change Switch State from OFF to On.

</details>

**Expected Result (Test Verification):**
> The Inquiry Workflow for Purchase Orders is activated.

---

### Step 536: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Rework Flexible Workflow for Purchase Orders: Activate Inquiry Workflow for Purchase Orders |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

SAP Central Business Configuration:

</details>

---

### Step 537: Log on

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Rework Flexible Workflow for Purchase Orders: Activate Inquiry Workflow for Purchase Orders |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the project experience in SAP Central Business Configuration.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori Launchpad displays.

---

### Step 538: Open Activate Inquiry Workflow for Purchase Orders

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 292 |
| **Activity** | Additional Information: Rework Flexible Workflow for Purchase Orders: Activate Inquiry Workflow for Purchase Orders |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Go to the Configuration app. To locate the activity in the tree view, search for the following activity: Activate Inquiry Workflow for Purchase Orders.
Choose Open Documentation for the found line item to see more details about this configuration activity.
Choose the link to navigate directly to the SAP S/4HANA Cloud Public Edition system. Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration.

</details>

**Expected Result (Test Verification):**
> The Purchase Order Processing screen displays.

---

### Step 539: Activate Inquiry Workflow for Purchase Orders

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 293 |
| **Activity** | Additional Information: Rework Flexible Workflow for Purchase Orders: Activate Inquiry Workflow for Purchase Orders |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Change State to change Switch State from OFF to On.

</details>

**Expected Result (Test Verification):**
> The Inquiry Workflow for Purchase Orders is activated.

---

### Step 540: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Rework Flexible Workflow for Purchase Orders: Activate Inquiry Workflow for Purchase Orders |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
### Result
 The Inquiry Workflow for Purchase Orders is activated.

</details>

---


## Activity 74: Additional Information: Rework Flexible Workflow for Purchase Orders: Configure Rework Flexible Workflow for Purchase Orders

> 5 steps total | 2 classifiable | 3 hidden

### Step 541: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Rework Flexible Workflow for Purchase Orders: Configure Rework Flexible Workflow for Purchase Orders |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

### Procedure

</details>

---

### Step 542: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Rework Flexible Workflow for Purchase Orders: Configure Rework Flexible Workflow for Purchase Orders |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration.

</details>

**Expected Result (Test Verification):**
> The Fiori launchpad is displayed.

---

### Step 543: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Rework Flexible Workflow for Purchase Orders: Configure Rework Flexible Workflow for Purchase Orders |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Workflows for Purchase Orders (F2872).

</details>

**Expected Result (Test Verification):**
> The Manage Workflows screen is displayed.

---

### Step 544: Create Manage Workflow

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 294 |
| **Activity** | Additional Information: Rework Flexible Workflow for Purchase Orders: Configure Rework Flexible Workflow for Purchase Orders |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Create, and make the following entries:
Workflow Name: <Test Rework Workflow for Purchase Order>
From the Start Conditions section, add the following preconditions:
Purchasing group of purchase order is: Selected
Purchasing Group: 003
Choose Create another condition, and make the following entries:
Total net amount of purchase order is greater than: Selected
Amount: For example, 5000,00
Currency: MYR
In the Steps area, choose Create and make the following entries:
Step Type: Release of Reworkable Purchase Order
In the Recipients area, make the following entries:
Assignment By: User
User: Select User from value help (with Employee ID PURCHASING_MANAGER)
Choose OK.
Step to be completed by: One of the recipients.
Exception Handling:
Rework Requested: 
Required Action: Rework Purchase Order
Recipients: Default: <Role: Determined automatically>
Action result: Repeat step
Note
 Action result should be (after rework): 
● Continue Workflow: Current Workflow shall move to next step
● Repeat Step: repeat the current step of current workflow
● Restart workflow: restart the workflow
Choose Create.
Choose Save.

</details>

**Expected Result (Test Verification):**
> The Workflow for Purchase Order is configured.

---

### Step 545: Activate Workflow Item

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 295 |
| **Activity** | Additional Information: Rework Flexible Workflow for Purchase Orders: Configure Rework Flexible Workflow for Purchase Orders |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the Workflow Item just created, and choose Activate.

</details>

**Expected Result (Test Verification):**
> The Workflow Item is activated.

---


## Activity 75: Additional Information: Rework Flexible Workflow for Purchase Orders: Rework Purchase Order

> 6 steps total | 1 classifiable | 5 hidden

### Step 546: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Rework Flexible Workflow for Purchase Orders: Rework Purchase Order |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Procedure
You can ignore this step if you did not set up the Steps Configure Rework Flexible Workflow for Purchase Orders.

</details>

---

### Step 547: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Rework Flexible Workflow for Purchase Orders: Rework Purchase Order |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Purchasing Manager.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---

### Step 548: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Rework Flexible Workflow for Purchase Orders: Rework Purchase Order |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open My Inbox - All Items (F0862) .

</details>

**Expected Result (Test Verification):**
> A list of already created Purchase Orders is displayed.

---

### Step 549: Rework Purchase Order

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 296 |
| **Activity** | Additional Information: Rework Flexible Workflow for Purchase Orders: Rework Purchase Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the Purchase Order from the left screen and choose Request Rework at the bottom right of the screen.
Enter the rework reason in the Submit Decision dialog then choose Submit.

</details>

**Expected Result (Test Verification):**
> The Purchase Order is requested rework.

---

### Step 550: Back to SAP Fiori launchpad

| | |
|---|---|
| **Type** | `Navigation` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Rework Flexible Workflow for Purchase Orders: Rework Purchase Order |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Home button to go back to the SAP Fiori launchpad.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 551: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Rework Flexible Workflow for Purchase Orders: Rework Purchase Order |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
After this step, the Purchase Order should be edited by the creator with the rework reason.

</details>

---


## Activity 76: Additional Information

> 9 steps total | 0 classifiable | 9 hidden

### Step 552: Information

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

#### Content
### Dunning Reminder for Purchase Orders
With Dunning Reminder for Purchase Order, one can create and send goods delivery reminders to your business partners to remind them of overdue delivery dates. You can print your Dunning Reminder with unfulfilled quantities and overdue dates.

</details>

---


## Activity 77: Additional Information: Output Parameter Determination for Purchase Orders Dunning Reminder

> 9 steps total | 6 classifiable | 3 hidden

### Step 553: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Output Parameter Determination for Purchase Orders Dunning Reminder |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This is the perquisition step for the purchase order dunning reminder steps.

</details>

---

### Step 554: Log onto Fiori Launchpad

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Output Parameter Determination for Purchase Orders Dunning Reminder |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log onto the SAP Fiori launchpad using the Administrator role.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 555: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Output Parameter Determination for Purchase Orders Dunning Reminder |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Output Parameter Determination.

</details>

**Expected Result (Test Verification):**
> The Output Parameter Determination screen displays.

---

### Step 556: Create Output Type for Dunning Reminder

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 297 |
| **Activity** | Additional Information: Output Parameter Determination for Purchase Orders Dunning Reminder |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step sends payment reminders to customers who haven't paid on time. Think about: does your company send overdue payment notices? How many reminder levels?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Output Parameter Determination screen, choose Show Rules for: Purchase Order, and Determination Step :Output Type.
On section Maintain Business Rules, choose Edit and choose Insert New Row (+), then make bellow entries:
Output Type: PURCHASE_ORDER_DUNNING(Output type for Dunning Reminder)
Dispatch Time :1 (Immediately)
Choose Activate 
Choose Yes to Confirm Activation screen.

</details>

**Expected Result (Test Verification):**
> Output type Purchase Order Dunning is created.

---

### Step 557: Create Receiver for Dunning Reminder

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 298 |
| **Activity** | Additional Information: Output Parameter Determination for Purchase Orders Dunning Reminder |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step sends payment reminders to customers who haven't paid on time. Think about: does your company send overdue payment notices? How many reminder levels?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Output Parameter Determination screen, choose Show Rules for: Purchase Order, and Determination Step :Receiver.
On section Maintain Business Rules, choose Edit and choose Insert New Row (+), then make bellow entries:
Output Type:  PURCHASE_ORDER_DUNNING(Output type for Dunning Reminder)
Role: LF
Exclusive Indicator: -(false)
Choose Activate

</details>

**Expected Result (Test Verification):**
> The Receiver for Dunning Reminder is created.

---

### Step 558: Create Channel for Dunning Reminder

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 299 |
| **Activity** | Additional Information: Output Parameter Determination for Purchase Orders Dunning Reminder |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step sends payment reminders to customers who haven't paid on time. Think about: does your company send overdue payment notices? How many reminder levels?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Output Parameter Determination screen, choose Show Rules for: Purchase Order, and Determination Step: Channel.
On section Maintain Business Rules, choose Edit and choose Insert New Row (+), then make bellow entries:
Output Type: PURCHASE_ORDER_DUNNING(Output type for Dunning Reminder)
Role: LF
Channel : PRINT(Printout)
Exclusive Indicator: -(false)
Choose Activate.

</details>

**Expected Result (Test Verification):**
> The channel for dunning reminder is created.

---

### Step 559: Create Printer Settings for Dunning Reminder

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 300 |
| **Activity** | Additional Information: Output Parameter Determination for Purchase Orders Dunning Reminder |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step sends payment reminders to customers who haven't paid on time. Think about: does your company send overdue payment notices? How many reminder levels?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Output Parameter Determination screen, choose Show Rules for: Purchase Order, and Determination Step: Printer Settings.
On section Maintain Business Rules, choose Edit and choose Insert New Row (+), then make bellow entries:
Output Type: PURCHASE_ORDER_DUNNING(Output type for Dunning Reminder)
Role: LF
Purchasing Org.: Blank
Print Queue: DEFAULT
Number of Copies: 1
Choose Activate.

</details>

**Expected Result (Test Verification):**
> The printer settings for dunning reminder is created.

---

### Step 560: Create Form Template for Dunning Reminder

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 301 |
| **Activity** | Additional Information: Output Parameter Determination for Purchase Orders Dunning Reminder |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step sends payment reminders to customers who haven't paid on time. Think about: does your company send overdue payment notices? How many reminder levels?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Output Parameter Determination screen, choose Show Rules for: Purchase Order, and Determination Step: Form Template.
On section Maintain Business Rules, choose Edit and choose Insert New Row (+), then make bellow entries:
Role: LF
Output Type: PURCHASE_ORDER_DUNNING(Output type for Dunning Reminder)
Channel: PRINT(Printout)
Sender Ctry/Reg.: Blank
Form Template: MM_PUR_PO_DUNNING_REMINDER
Choose Activate.

</details>

**Expected Result (Test Verification):**
> The form template for dunning reminder is created.

---

### Step 561: Create Output Relevance for Dunning Reminder

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 302 |
| **Activity** | Additional Information: Output Parameter Determination for Purchase Orders Dunning Reminder |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step sends payment reminders to customers who haven't paid on time. Think about: does your company send overdue payment notices? How many reminder levels?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Output Parameter Determination screen, choose Show Rules for: Purchase Order, and Determination Step :Output Relevance.
On section Maintain Business Rules, choose Edit and choose Insert New Row (+), then make bellow entries:
Output Type: PURCHASE_ORDER_DUNNING(Output type for Dunning Reminder)
Relevance Indicator : X(true)
Choose Activate

</details>

**Expected Result (Test Verification):**
> The Output Relevance for Dunning Reminder is created.

---


## Activity 78: Additional Information: Create Purchase Order for Dunning Reminder

> 5 steps total | 2 classifiable | 3 hidden

### Step 562: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Create Purchase Order for Dunning Reminder |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

### Procedure

</details>

---

### Step 563: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Create Purchase Order for Dunning Reminder |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Log on to the SAP Fiori Launchpad as a Purchaser.

</details>

---

### Step 564: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Create Purchase Order for Dunning Reminder |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Create Purchase Order - Advanced (ME21N) .

</details>

**Expected Result (Test Verification):**
> The Create Purchase Order screen is displayed.

---

### Step 565: Enter Purchase Order data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 303 |
| **Activity** | Additional Information: Create Purchase Order for Dunning Reminder |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter all of the necessary data.
Order type: NB Standard PO
Supplier: 54300001
In Header section, on the Org. Data tab, make the following entries:
Purchasing Organization: 5410
Purchasing Group:002
Company Code: 5410
In Items section,
Material: TG0011
Plant: 5410
Storage Location: 541A
Quantity: 100

Deliv.Date: Today

Net Price: XMYR
Go to Invoice Tab and enter Tax Code V0 .
Tax Date: <Default Value>
Go to Delivery Tab and enter the following entries:
1st Rem./Exped. :3-
2nd Rem./Exped. :2-
3rd Rem./Exped. :1-

</details>

**Expected Result (Test Verification):**
> The Create Purchase Order screen is displayed.

---

### Step 566: Save Purchase Order

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 304 |
| **Activity** | Additional Information: Create Purchase Order for Dunning Reminder |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Save and when the purchase order number is displayed, write it down for further use.

</details>

**Expected Result (Test Verification):**
> A new Purchase Order is created.
> Purchase Order Number is displayed.

---


## Activity 79: Additional Information: Dunning Reminder on Purchase Orders Advanced

> 9 steps total | 5 classifiable | 4 hidden

### Step 567: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Dunning Reminder on Purchase Orders Advanced |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Procedure
Note
If you encounter issues for this step, you can create an incident under MM-PUR-GF-OCcomponent.

</details>

---

### Step 568: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Dunning Reminder on Purchase Orders Advanced |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Log on to the SAP Fiori Launchpad as a Purchaser.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 569: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Dunning Reminder on Purchase Orders Advanced |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Dunning Reminder on Purchase Order - Advanced (ME91FF)

</details>

**Expected Result (Test Verification):**
> The Dunning Reminder on Purchase Order Advanced screen displays

---

### Step 570: Define Purchasing Document Data

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 305 |
| **Activity** | Additional Information: Dunning Reminder on Purchase Orders Advanced |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Dunning Reminder on Purchase Order -Advanced screen, make the following entries:
Purchasing document: <use a PO you created previously>
Choose Execute.

</details>

**Expected Result (Test Verification):**
> The Purchasing Document Data has been defined.

---

### Step 571: Choose Purchase Order

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 306 |
| **Activity** | Additional Information: Dunning Reminder on Purchase Orders Advanced |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Purchase Order: Dunning Reminders screen, select this purchase order.
Choose Generate Messages .

</details>

**Expected Result (Test Verification):**
> The dunning reminder output gets the generated.

---

### Step 572: Check Message Status

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 307 |
| **Activity** | Additional Information: Dunning Reminder on Purchase Orders Advanced |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

The Message Status is changed to Output Generated.

</details>

**Expected Result (Test Verification):**
> Message Status has been changed.

---

### Step 573: Preview the PO Dunning Reminder document

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 308 |
| **Activity** | Additional Information: Dunning Reminder on Purchase Orders Advanced |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step sends payment reminders to customers who haven't paid on time. Think about: does your company send overdue payment notices? How many reminder levels?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Message Details to navigate to the Purchase Order Output screen.
Choose the Output Type with Purchase Order Dunning , and choose Display Document to preview the Dunning Document.
Close the PDF document.

</details>

**Expected Result (Test Verification):**
> The Purchase Order dunning reminder document is opened in PDF format.

---

### Step 574: Choose Back

| | |
|---|---|
| **Type** | `Navigation` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Dunning Reminder on Purchase Orders Advanced |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Back

</details>

---

### Step 575: Choose Save

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 309 |
| **Activity** | Additional Information: Dunning Reminder on Purchase Orders Advanced |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Purchase Order: Dunning Reminders screen, choose Save .

</details>

---


## Activity 80: Additional Information: Schedule Dunning Reminder Output for Purchase Orders (Optional)

> 7 steps total | 4 classifiable | 3 hidden

### Step 576: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Schedule Dunning Reminder Output for Purchase Orders (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Procedure
Note
If you encounter issues for this step, you can create an incident under MM-FIO-PUR-PO-OMcomponent.

</details>

---

### Step 577: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Schedule Dunning Reminder Output for Purchase Orders (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 578: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Schedule Dunning Reminder Output for Purchase Orders (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Schedule Dunning Reminder output for Purchase Orders (F7083)

</details>

**Expected Result (Test Verification):**
> The Application Jobs screen displays

---

### Step 579: Create Job

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 310 |
| **Activity** | Additional Information: Schedule Dunning Reminder Output for Purchase Orders (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Create.

</details>

**Expected Result (Test Verification):**
> The New Job screen displays.

---

### Step 580: Define a Job

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 311 |
| **Activity** | Additional Information: Schedule Dunning Reminder Output for Purchase Orders (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the New Job: Schedule Dunning Reminder output for Purchase Orders screen,
go to 1. Template Selection area, make the following entries:
Job Template: <Job Template>, for example, Schedule Dunning Reminder output for Purchase Orders
Job Name: <Job Name>, for example, Schedule Dunning Reminder output for Purchase Orders
Choose Step 2 and go to 2. Scheduling Options area and make the following entries:
Start Immediately : <selected>
Job Start: <Current Time>
Choose Step 3 and go to 3. Parameters area and make the following entries:
Purchasing document: <use a PO you created previously>
Document Type: <NB>
Set Parameter settings according to your needs.
Choose Schedule.

</details>

**Expected Result (Test Verification):**
> The job is created.

---

### Step 581: Dunning Reminder output for Purchase Orders created

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 312 |
| **Activity** | Additional Information: Schedule Dunning Reminder Output for Purchase Orders (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step sends payment reminders to customers who haven't paid on time. Think about: does your company send overdue payment notices? How many reminder levels?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Application Jobs screen.
Go to Jobs (X) area and check the status until it changes to Finished.

</details>

---

### Step 582: Check Result

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 313 |
| **Activity** | Additional Information: Schedule Dunning Reminder Output for Purchase Orders (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Click on Logs to navigate to the job log.

</details>

---


## Activity 81: Additional Information

> 9 steps total | 0 classifiable | 9 hidden

### Step 583: Information

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
The requirement is to enable the Custom attributes along with workflow task data in task card and in My Inbox with Multi Select mode. Custom attributes allow to expose business-relevant data along with workflow task data. They are usually relevant for taking a decision regarding the task and can be prominently exposed in the Inbox of the user that is processing it.
Note
When you process this step, make sure that you have processed the step Check Flexible Workflow for Purchase Order Approvaland Configure Flexible Workflow for Purchase Orderin the Preliminary Steps.

#### Instructions
### Custom Attributes in Task Cards for Purchase Order Workflow (Optional)

</details>

---


## Activity 82: Additional Information: Maintain CDS Based Custom Attributes for Purchase Order Workflow (Optional)

> 26 steps total | 18 classifiable | 8 hidden

### Step 584: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Maintain CDS Based Custom Attributes for Purchase Order Workflow (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
Custom attributes allow the exposure of business-relevant data along with the workflow task data. They are usually relevant for taking a decision regarding the task and can be exposed in the Inbox of the user processing it. Here you can configure a CDS Entity and a CDS Entity Element for the purchase order Flexible Workflow Scenario. During creation of a task instance the configured CDS Entity Element will be used to retrieve the value displayed to the task processor.

#### Procedure
Depending on your configuration environment for SAP S/4HANA Cloud Public Edition, choose one of the following options:
Configure Your Solution:

</details>

---

### Step 585: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Maintain CDS Based Custom Attributes for Purchase Order Workflow (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori Launchpad as a Configuration Expert - Business Process Configuration.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori Launchpad is displayed.

---

### Step 586: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Maintain CDS Based Custom Attributes for Purchase Order Workflow (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Your Solution (F1241).

</details>

**Expected Result (Test Verification):**
> The Manage Your Solution screen is displayed.

---

### Step 587: Open Configure Your Solution

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Maintain CDS Based Custom Attributes for Purchase Order Workflow (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Configure Your Solution.Note
To create country-/region-dependent settings for the intended local version, choose Set Local Version.

</details>

**Expected Result (Test Verification):**
> The Configure Your Solution screen is displayed.

---

### Step 588: Open Maintain CDS Based Custom Attributes

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 314 |
| **Activity** | Additional Information: Maintain CDS Based Custom Attributes for Purchase Order Workflow (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Configure Your Solution: Realize Phase screen, search Maintain CDS Based Custom Attributes , then choose Search.
Select the line of the item and go to the next screen.
On the Configure Your Solution - Output Control  screen, choose Configure on the line of configuration step with name Maintain CDS Based Custom Attributes .

</details>

**Expected Result (Test Verification):**
> The Maintain CDS Based Custom Attributes  screen is displayed.

---

### Step 589: Create Custom Attributes (Company Code) for PO Flexible Workflow

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 315 |
| **Activity** | Additional Information: Maintain CDS Based Custom Attributes for Purchase Order Workflow (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Click New Entries, and enter the following entries:
● Task/FlexWorkflow: WS00800238
● Step ID: 19
● Name of Attribute: < COMPANYCODE >
• Active: Select
• Description: <Company Code>
• Rank: 60
● CDS Entity: C_PURORDWORKFLOWTASKCARD
● CDS Entity Element: use F4 to choose COMPANYCODE
Choose Enter. 
● XSD Type: <Default Value:xs:string>
● XSD Length: <Default Value:4>
● XSD Decimals: <Default Value:0>
● ABAP type: <Default Value:C Character String>
Choose Save.

</details>

**Expected Result (Test Verification):**
> The custom attribute Company Code has been created for PO flexible workflow.

---

### Step 590: Create Custom Attributes (Purchase Order Creator) for PO Flexible Workflow

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 316 |
| **Activity** | Additional Information: Maintain CDS Based Custom Attributes for Purchase Order Workflow (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step is about how purchase requests are created in your company. Think about: do your staff submit purchase requests? Is there an approval workflow? Do you have spending limits?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Click New Entries, and enter the following entries:
● Task/FlexWorkflow: WS00800238
● Step ID: 19
● Name of Attribute: < CREATEDBYUSER>
• Active: Select
• Description: <Purchase Order Creator >
• Rank: 40
● CDS Entity: C_PURORDWORKFLOWTASKCARD
● CDS Entity Element: use F4 to choose CREATEDBYUSER
Choose Enter. 
● XSD Type: <Default Value:xs:string>
● XSD Length: <Default Value:12>
● XSD Decimals: <Default Value:0>
● ABAP type: <Default Value:C Character String>
Choose Save.

</details>

**Expected Result (Test Verification):**
> The custom attribute Purchase Order Creator has been created for PO flexible workflow.

---

### Step 591: Create Custom Attributes (Purchase Order Date) for PO Flexible Workflow

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 317 |
| **Activity** | Additional Information: Maintain CDS Based Custom Attributes for Purchase Order Workflow (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step is about how purchase requests are created in your company. Think about: do your staff submit purchase requests? Is there an approval workflow? Do you have spending limits?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Click New Entries, and enter the following entries:
● Task/FlexWorkflow: WS00800238
● Step ID: 19
● Name of Attribute: < PURCHASEORDERDATE>
• Active: Select
• Description: <Purchase Order Date>
• Rank: 50
● CDS Entity: C_PURORDWORKFLOWTASKCARD
● CDS Entity Element: use F4 to choosePURCHASEORDERDATE
Choose Enter. 
● XSD Type: <Default Value:xs:date>
● XSD Length: <Default Value:8>
● XSD Decimals: <Default Value:0>
● ABAP type: <Default Value:D Date (YYYYMMDD)>
Choose Save.

</details>

**Expected Result (Test Verification):**
> The custom attribute Purchase Order Date has been created for PO flexible workflow.

---

### Step 592: Create Custom Attributes (Purchase Order Net Value) for PO Flexible Workflow

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 318 |
| **Activity** | Additional Information: Maintain CDS Based Custom Attributes for Purchase Order Workflow (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step is about how purchase requests are created in your company. Think about: do your staff submit purchase requests? Is there an approval workflow? Do you have spending limits?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Click New Entries, and enter the following entries:
● Task/FlexWorkflow: WS00800238
● Step ID: 19
● Name of Attribute: < PURCHASEORDERNETAMOUNT>
• Active: Select
• Description: <Purchase Order Net Value>
• Rank: 100
● CDS Entity: C_PURORDWORKFLOWTASKCARD
● CDS Entity Element: use F4 to choosePURCHASEORDERNETAMOUNT 
Choose Enter. 
● XSD Type: <Default Value:xs:decimal>
● XSD Length: <Default Value:23>
● XSD Decimals: <Default Value:2>
● ABAP type: <Default Value:P Packed number>
Choose Save.

</details>

**Expected Result (Test Verification):**
> The custom attribute Purchase Order Net Value has been created for PO flexible workflow.

---

### Step 593: Create Custom Attributes (Purchase Group) for PO Flexible Workflow

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 319 |
| **Activity** | Additional Information: Maintain CDS Based Custom Attributes for Purchase Order Workflow (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Click New Entries, and enter the following entries:
● Task/FlexWorkflow: WS00800238
● Step ID: 19
● Name of Attribute: < PURCHASINGGROUP>
• Active: Select
• Description: <Purchase Group>
• Rank: 70
● CDS Entity: C_PURORDWORKFLOWTASKCARD
● CDS Entity Element: use F4 to choosePURCHASINGGROUP 
Choose Enter. 
● XSD Type: <Default Value:xs:string>
● XSD Length: <Default Value:3>
● XSD Decimals: <Default Value:0>
● ABAP type: <Default Value:C Character String>
Choose Save.

</details>

**Expected Result (Test Verification):**
> The custom attribute Purchase Group has been created for PO flexible workflow.

---

### Step 594: Create Custom Attributes (Purchasing Organization) for PO Flexible Workflow

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 320 |
| **Activity** | Additional Information: Maintain CDS Based Custom Attributes for Purchase Order Workflow (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Click New Entries, and enter the following entries:
● Task/FlexWorkflow: WS00800238
● Step ID: 19
● Name of Attribute: < PURCHASINGORGANIZATION>
• Active: Select
• Description: <Purchasing Organization>
• Rank: 80
● CDS Entity: C_PURORDWORKFLOWTASKCARD
● CDS Entity Element: use F4 to choosePURCHASINGORGANIZATION 
Choose Enter. 
● XSD Type: <Default Value:xs:string>
● XSD Length: <Default Value:4>
● XSD Decimals: <Default Value:0>
● ABAP type: <Default Value:C Character String>
Choose Save.

</details>

**Expected Result (Test Verification):**
> The custom attribute Purchasing Organization has been created for PO flexible workflow.

---

### Step 595: Create Custom Attributes (Supplier) for PO Flexible Workflow

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 321 |
| **Activity** | Additional Information: Maintain CDS Based Custom Attributes for Purchase Order Workflow (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Click New Entries, and enter the following entries:
● Task/FlexWorkflow: WS00800238
● Step ID: 19
● Name of Attribute: < Supplier>
• Active: Select
• Description: <Supplier Details>
• Rank: 90
● CDS Entity: C_PURORDWORKFLOWTASKCARD
● CDS Entity Element: use F4 to chooseSUPPLIER 
Choose Enter. 
● XSD Type: <Default Value:xs:string>
● XSD Length: <Default Value:10>
● XSD Decimals: <Default Value:0>
● ABAP type: <Default Value:C Character String>
Choose Save.

</details>

**Expected Result (Test Verification):**
> The custom attribute Supplier has been created for PO flexible workflow.

---

### Step 596: Choose Back

| | |
|---|---|
| **Type** | `Navigation` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Maintain CDS Based Custom Attributes for Purchase Order Workflow (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Back to return to the previous screen.

</details>

---

### Step 597: Choose Save.

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 322 |
| **Activity** | Additional Information: Maintain CDS Based Custom Attributes for Purchase Order Workflow (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Save.

</details>

---

### Step 598: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Maintain CDS Based Custom Attributes for Purchase Order Workflow (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

SAP Central Business Configuration:

</details>

---

### Step 599: Log on

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Maintain CDS Based Custom Attributes for Purchase Order Workflow (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the project experience in SAP Central Business Configuration.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori Launchpad displays.

---

### Step 600: Open Maintain CDS Based Custom Attributes

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 323 |
| **Activity** | Additional Information: Maintain CDS Based Custom Attributes for Purchase Order Workflow (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Go to the Configuration app. To locate the activity in the tree view, search for the following activity: Maintain CDS Based Custom Attributes. Choose Open Documentation for the found line item to see more details about this configuration activity.
 Choose the link to navigate directly to the SAP S/4HANA Cloud Public Edition system. Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration.

</details>

**Expected Result (Test Verification):**
> The Maintain CDS Based Custom Attributes screen displays.

---

### Step 601: Create Custom Attributes (Company Code) for PO Flexible Workflow

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 324 |
| **Activity** | Additional Information: Maintain CDS Based Custom Attributes for Purchase Order Workflow (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Click New Entries, and enter the following entries:
● Task/FlexWorkflow: WS00800238
● Step ID: 19
● Name of Attribute: < COMPANYCODE >
• Active: Select
• Description: <Company Code>
• Rank: 60
● CDS Entity: C_PURORDWORKFLOWTASKCARD
● CDS Entity Element: use F4 to choose COMPANYCODE
Choose Enter. 
● XSD Type: <Default Value:xs:string>
● XSD Length: <Default Value:4>
● XSD Decimals: <Default Value:0>
● ABAP type: <Default Value:C Character String>
Choose Save.

</details>

**Expected Result (Test Verification):**
> The custom attribute Company Code has been created for PO flexible workflow.

---

### Step 602: Create Custom Attributes (Purchase Order Creator) for PO Flexible Workflow

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 325 |
| **Activity** | Additional Information: Maintain CDS Based Custom Attributes for Purchase Order Workflow (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step is about how purchase requests are created in your company. Think about: do your staff submit purchase requests? Is there an approval workflow? Do you have spending limits?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Click New Entries, and enter the following entries:
● Task/FlexWorkflow: WS00800238
● Step ID: 19
● Name of Attribute: < CREATEDBYUSER>
• Active: Select
• Description: <Purchase Order Creator >
• Rank: 40
● CDS Entity: C_PURORDWORKFLOWTASKCARD
● CDS Entity Element: use F4 to choose CREATEDBYUSER
Choose Enter. 
● XSD Type: <Default Value:xs:string>
● XSD Length: <Default Value:12>
● XSD Decimals: <Default Value:0>
● ABAP type: <Default Value:C Character String>
Choose Save.

</details>

**Expected Result (Test Verification):**
> The custom attribute Purchase Order Creator has been created for PO flexible workflow.

---

### Step 603: Create Custom Attributes (Purchase Order Date) for PO Flexible Workflow

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 326 |
| **Activity** | Additional Information: Maintain CDS Based Custom Attributes for Purchase Order Workflow (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step is about how purchase requests are created in your company. Think about: do your staff submit purchase requests? Is there an approval workflow? Do you have spending limits?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Click New Entries, and enter the following entries:
● Task/FlexWorkflow: WS00800238
● Step ID: 19
● Name of Attribute: < PURCHASEORDERDATE>
• Active: Select
• Description: <Purchase Order Date>
• Rank: 50
● CDS Entity: C_PURORDWORKFLOWTASKCARD
● CDS Entity Element: use F4 to choosePURCHASEORDERDATE
Choose Enter. 
● XSD Type: <Default Value:xs:date>
● XSD Length: <Default Value:8>
● XSD Decimals: <Default Value:0>
● ABAP type: <Default Value:D Date (YYYYMMDD)>
Choose Save.

</details>

**Expected Result (Test Verification):**
> The custom attribute Purchase Order Date has been created for PO flexible workflow.

---

### Step 604: Create Custom Attributes (Purchase Order Net Value) for PO Flexible Workflow

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 327 |
| **Activity** | Additional Information: Maintain CDS Based Custom Attributes for Purchase Order Workflow (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step is about how purchase requests are created in your company. Think about: do your staff submit purchase requests? Is there an approval workflow? Do you have spending limits?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Click New Entries, and enter the following entries:
● Task/FlexWorkflow: WS00800238
● Step ID: 19
● Name of Attribute: < PURCHASEORDERNETAMOUNT>
• Active: Select
• Description: <Purchase Order Net Value>
• Rank: 100
● CDS Entity: C_PURORDWORKFLOWTASKCARD
● CDS Entity Element: use F4 to choosePURCHASEORDERNETAMOUNT 
Choose Enter. 
● XSD Type: <Default Value:xs:decimal>
● XSD Length: <Default Value:23>
● XSD Decimals: <Default Value:2>
● ABAP type: <Default Value:P Packed number>
Choose Save.

</details>

**Expected Result (Test Verification):**
> The custom attribute Purchase Order Net Value has been created for PO flexible workflow.

---

### Step 605: Create Custom Attributes (Purchase Group) for PO Flexible Workflow

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 328 |
| **Activity** | Additional Information: Maintain CDS Based Custom Attributes for Purchase Order Workflow (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Click New Entries, and enter the following entries:
● Task/FlexWorkflow: WS00800238
● Step ID: 19
● Name of Attribute: < PURCHASINGGROUP>
• Active: Select
• Description: <Purchase Group>
• Rank: 70
● CDS Entity: C_PURORDWORKFLOWTASKCARD
● CDS Entity Element: use F4 to choosePURCHASINGGROUP 
Choose Enter. 
● XSD Type: <Default Value:xs:string>
● XSD Length: <Default Value:3>
● XSD Decimals: <Default Value:0>
● ABAP type: <Default Value:C Character String>
Choose Save.

</details>

**Expected Result (Test Verification):**
> The custom attribute Purchase Group has been created for PO flexible workflow.

---

### Step 606: Create Custom Attributes (Purchasing Organization) for PO Flexible Workflow

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 329 |
| **Activity** | Additional Information: Maintain CDS Based Custom Attributes for Purchase Order Workflow (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Click New Entries, and enter the following entries:
● Task/FlexWorkflow: WS00800238
● Step ID: 19
● Name of Attribute: < PURCHASINGORGANIZATION>
• Active: Select
• Description: <Purchasing Organization>
• Rank: 80
● CDS Entity: C_PURORDWORKFLOWTASKCARD
● CDS Entity Element: use F4 to choosePURCHASINGORGANIZATION 
Choose Enter. 
● XSD Type: <Default Value:xs:string>
● XSD Length: <Default Value:4>
● XSD Decimals: <Default Value:0>
● ABAP type: <Default Value:C Character String>
Choose Save.

</details>

**Expected Result (Test Verification):**
> The custom attribute Purchasing Organization has been created for PO flexible workflow.

---

### Step 607: Create Custom Attributes (Supplier) for PO Flexible Workflow

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 330 |
| **Activity** | Additional Information: Maintain CDS Based Custom Attributes for Purchase Order Workflow (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Click New Entries, and enter the following entries:
● Task/FlexWorkflow: WS00800238
● Step ID: 19
● Name of Attribute: < Supplier>
• Active: Select
• Description: <Supplier Details>
• Rank: 90
● CDS Entity: C_PURORDWORKFLOWTASKCARD
● CDS Entity Element: use F4 to chooseSUPPLIER 
Choose Enter. 
● XSD Type: <Default Value:xs:string>
● XSD Length: <Default Value:10>
● XSD Decimals: <Default Value:0>
● ABAP type: <Default Value:C Character String>
Choose Save.

</details>

**Expected Result (Test Verification):**
> The custom attribute Supplier has been created for PO flexible workflow.

---

### Step 608: Choose Back

| | |
|---|---|
| **Type** | `Navigation` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Maintain CDS Based Custom Attributes for Purchase Order Workflow (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Back to return to the previous screen.

</details>

---

### Step 609: Choose Save.

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 331 |
| **Activity** | Additional Information: Maintain CDS Based Custom Attributes for Purchase Order Workflow (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Save.

</details>

---


## Activity 83: Additional Information: Approve Purchase Order through Task Cards (Optional)

> 7 steps total | 4 classifiable | 3 hidden

### Step 610: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Approve Purchase Order through Task Cards (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
Note
After completing step Maintain CDS based custom attributes for purchase order workflow (Optional), you can process this setup, and the step:Maintain CDS based custom attributes for purchase order workflow (Optional)is a prerequisite for this step. You can ignore this step if you did not set up the Steps:Maintain CDS based custom attributes for purchase order workflow (Optional).

</details>

---

### Step 611: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Approve Purchase Order through Task Cards (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Purchasing Manager.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---

### Step 612: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Approve Purchase Order through Task Cards (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open My Inbox - All Items (F0862) .

</details>

**Expected Result (Test Verification):**
> A list of existing Purchase Orders is displayed.

---

### Step 613: Click Multi Select button

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 332 |
| **Activity** | Additional Information: Approve Purchase Order through Task Cards (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Click on Multi-Select button on left panel.
Select Task Type is Release of Purchase Order. If the Select Task Type pop up screen is not displayed, then you can ignore this step.

</details>

**Expected Result (Test Verification):**
> The Task Summary has been displayed on the right panel. All the custom attributes should be displayed in table view on right panel along with task based custom attributes.
> Sequence should be based on ranking maintained in SSCUI 106664 (Maintain CDS Based Custom Attributes).

---

### Step 614: Select the Purchase Order

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 333 |
| **Activity** | Additional Information: Approve Purchase Order through Task Cards (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the purchase order that you want to approve.

</details>

**Expected Result (Test Verification):**
> The purchase order has been selected for approval.

---

### Step 615: Choose Approve

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 334 |
| **Activity** | Additional Information: Approve Purchase Order through Task Cards (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Approve at the bottom right.

</details>

**Expected Result (Test Verification):**
> The Submit Decision screen is displayed.

---

### Step 616: Enter Approval Reason

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 335 |
| **Activity** | Additional Information: Approve Purchase Order through Task Cards (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter the approval reason if necessary, and then choose Submit.

</details>

**Expected Result (Test Verification):**
> The Purchase Order is approved.

---


## Activity 84: Additional Information: Purchase Order Workflow Review: Configure Purchase Order Flexible Workflow for Review

> 5 steps total | 2 classifiable | 3 hidden

### Step 617: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Purchase Order Workflow Review: Configure Purchase Order Flexible Workflow for Review |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this procedure, you can configure the step Purchase Order Flexible Workflow for Reviewer. For all the purchase order workflow scenarios, along with approvers, reviewers also can be configured separately, and monitor the progress of the workflows during the entire workflow process. Reviewers do not have an option to approve/reject/rework the work items to be reviewed.

</details>

---

### Step 618: Log on

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Purchase Order Workflow Review: Configure Purchase Order Flexible Workflow for Review |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log onto the SAP Fiori launchpad using the role Configuration Expert - Business Process Configuration.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 619: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Purchase Order Workflow Review: Configure Purchase Order Flexible Workflow for Review |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Manage Workflows for Purchase Orders (F2872).

</details>

**Expected Result (Test Verification):**
> The Manage Workflows screen displays.

---

### Step 620: Create Manage Workflow

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 336 |
| **Activity** | Additional Information: Purchase Order Workflow Review: Configure Purchase Order Flexible Workflow for Review |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Create, and make the following entry:
Workflow Name: <Test Workflow for Purchase Order>
In section Start Conditions, add the following preconditions:
  - Purchasing group of purchase order is: Selected
  - Purchasing Group: 003
Choose Create another condition, and make the following entries:
  -  Total net amount of purchase order is greater than: Selected
  - Amount: For example, 50,000
  - Currency: MYR
In the Steps area, choose Create and make the following entry:
Step Type: Release of Purchase Order
 In the Recipients area, make the following entries:
  - Assignment By: User
  - User: Select User from value help (with Employee ID PURCHASING_MANAGER) 
Choose OK.
Step to be completed by: One of the recipients.
Choose Create.
In the Review Steps area, choose Create and make the following entries:
  - Step Type: Review Workflow of Purchase Order
  - Assignment By: User
  - User: Select user from value help (with employee ID), for example, PURCHASER.
Choose OK.
Choose Create.
Choose Save.

</details>

**Expected Result (Test Verification):**
> The workflow for purchase order is configured.

---

### Step 621: Activate Workflow Item

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 337 |
| **Activity** | Additional Information: Purchase Order Workflow Review: Configure Purchase Order Flexible Workflow for Review |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the workflow item you just created, and choose Activate.
Note
Make sure the default workflow Automatic Release of Purchase Order is activated.

</details>

**Expected Result (Test Verification):**
> The workflow item is activated.

---


## Activity 85: Additional Information: Purchase Order Workflow Review: Review Purchase Order Items (Optional)

> 4 steps total | 1 classifiable | 3 hidden

### Step 622: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Purchase Order Workflow Review: Review Purchase Order Items (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this procedure, purchase order workflow reviewers can login to system and review purchase order items.
Note
If you did not execute Configure Purchase Order Flexible Workflow for Review, you can ignore this step.

</details>

---

### Step 623: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Purchase Order Workflow Review: Review Purchase Order Items (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Log on to the SAP Fiori launchpad as a Purchaser.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad is displayed.

---

### Step 624: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Purchase Order Workflow Review: Review Purchase Order Items (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open My Inbox - All Items (F0862)

</details>

**Expected Result (Test Verification):**
> A list of existing purchase orders is displayed.

---

### Step 625: Review Purchase Order Items

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 338 |
| **Activity** | Additional Information: Purchase Order Workflow Review: Review Purchase Order Items (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Review the purchase order items.

</details>

**Expected Result (Test Verification):**
> Your purchase orders are displayed.
> After the purchase order workflow completes, the purchase order items would be invisible in the reviewer's My Inbox.

---


## Activity 86: Additional Information

> 9 steps total | 0 classifiable | 9 hidden

### Step 626: Information

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

#### Content
### Appendix: Relevant Features
Here are listed some important application functionalities related to Purchase Order outputs, Purchase Reports, and Invoice which are not covered in the above test procedures.Function AreaFunctionDetailed InformationComment
 | Purchase Order Output  | Enable Partner Function (Ordering Address) in Purchase Order Output in WebGUI Create Purchase Order - Advanced (ME21N)  | To use SSCUI 102524 Define Partner Schemas, make sure OA (Ordering Address)is maintained in Partner Functionsin Procedure. 
Supplier can have several ordering locations which are captured using the partner function “OA” - Ordering Address in the Partner tab of PO header level in WebGUI Create Purchase Order - Advanced (ME21N). Administrator can use the Fiori App Output Parameter Determination to perform the configurations for the various determination steps for the Rule Purchase Order with Role BA for partner function OA (Ordering Address). When the partner function OA/BA is used, the custom purchase order form should have the address and communication details i.e. telephone, fax and email, of the OA partner function. The PO output document is generated with Supplier Address, Supplier Email ID, Supplier telephone number and supplier fax number of the partner function OA/BA when using Webgui Create Purchase Order - Advanced (ME21N). 
 | 
 | Manage Purchase Orders Application | Enable Partner Functions in Manage Purchase Orders Application | SSCUI: 106258 Enable Partner Functions in Manage Purchase OrdersApplication
In this step, you can use this SSCUI to enable the Partnertab in the App Manage Purchase Orders
In a standard system this configuration step is switched off by default. Once the switch is on, you cannot turn it off.
 | 
 | Purchase Order with DMS Attachments  | Enable purchase order with DMS attachments in WebGUI Create Purchase Order - Advanced (ME21N) | 1: SSCUI: 103542 (Define Output Settings for Document Type) to select Relevant and Merge. 
When Relevant and Merge are both selected for the document type SL1 and channel print in SSCUI: 103542 (Define Output Settings for Document Type), you can upload the attachments of SL1 document type in theAttachmentsTab at the header level in the WebGUI Create Purchase Order - Advanced (ME21N). Then the output should contain the Attachments as Document along with purchase order output.
2: SSCUI: 105346 (Active HDM for Attachment Object Type) for choose Attachment Object Type: PURCHASEORDER
For the printing of purchase order header attachments, please use SSCUI: 105346 (Active HDM for Attachment Object Type) . On the Activate HDM for Attachment Object Type: Changescreen, selectAttachment Object Type: PURCHASEORDERand click on Activate. Then, double-click the Activate Document Frameworkson the left side of the SSCUI screen, and ensure that Deactivateis unchecked for the PURCHASEORDER. Also, double-click theMaintain Defaults and Restricted Document Typeson the left side of the SSCUI screen, and click the Default for the Document Type SL9, and do not click the Default for the Document Type SL1.
3: Create the Purchase Order header Attachments in the WebGUI: Create Purchase Order - Advanced (ME21N) 
When creating the purchase order, you can go to the tab Documenton purchase order head. Click the button Insert Rowto add the existing SL1 or SL9 Document. Or you can click the button Create Documentto create SL1 or SL9 Document.
4: Display the Purchase Order message for the header attachments 
When you create the purchase order header attachments, you can click the Messagebutton for your created purchase order. The output should contain the attachments as document along with the PO output. In the output line item, the number of attachments for the line item should match the number of attachments you attached.
 | 
 | Display Suppliers  | WebGUI: Display Suppliers - Purchasing (MKVZ) | To use generic user Purchaser to display suppliers.  | 
 | Display Purchasing Documents | WebGUI: Display Purchasing Documents by Supplying Plant (ME2W) 
WebGUI: Display Purchasing Documents by Material Group (ME2C)
WebGUI: Display Purchasing Documents by Tracking Number (ME2B)
 | To use generic user Purchaser to display purchasing documents | 
 | Enter Supplier Invoice for Background Verification  | WebGUI: Enter Supplier Invoice for Background Verification | To create supplier invoice in background. | 
 | Supplier Invoice Verification in Background  | WebGUI: Schedule Supplier Invoice Jobs – Advanced
Job Template: Verification in Background
 | To post supplier invoice in background. | 
 | Invoice Verification: Check for duplicate invoices.  | Please refer to note 2721713 - Invoice Verification: Check for duplicate invoices - FAQfor details. | Error message pops up when duplicate invoices are found. |

</details>

---


# Appendix: Statistics

| Step Type | Count | Classifiable |
|-----------|-------|-------------|
| Information | 112 | 0 |
| Logon | 79 | 0 |
| Access App | 81 | 0 |
| Process Step | 198 | 198 |
| Data Entry | 61 | 61 |
| Verification | 44 | 44 |
| Action | 35 | 35 |
| Navigation | 16 | 0 |

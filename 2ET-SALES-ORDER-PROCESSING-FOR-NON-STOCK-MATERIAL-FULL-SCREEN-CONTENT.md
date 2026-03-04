# 2ET — Sales Order Processing for Non-Stock Material: Complete Screen-by-Screen Content

> **What the user sees on every screen in the review flow.**
> This document reproduces the exact content shown in the ABEAM assessment tool when a user reviews 2ET (Sales Order Processing for Non-Stock Material). For each step it shows the step title, type badge, business context explanation, the full SAP technical reference content (normally collapsed), expected results, and activity context — exactly as rendered on screen.

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
| Total steps | 142 |
| Classifiable (shown by default) | 80 |
| Hidden by default | 62 |
| Unique activities | 17 |

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
This section summarizes all the prerequisites for conducting the test in terms of systems, users, master data, organizational data, other test data and business conditions.

#### System Access
| Internal Sales Representative | SAP_BR_INTERNAL_SALES_REP | Internal Sales/ Customer Returns/ Billing | SAP_BR_INTERNAL_SALES_REP/ SAP_SD_SPT_RETURNS_INT_SALES_PC/ SAP_SD_SPT_BILLING_INT_SALES_PC | 
 | Shipping Specialist | SAP_BR_SHIPPING_SPECIALIST | Shipping | SAP_BR_SHIPPING_SPECIALIST | 
 | Billing Clerk
 | SAP_BR_BILLING_CLERK
 | Billing | SAP_BR_BILLING_CLERK | 
 | Credit Controller
 | SAP_BR_CREDIT_CONTROLLER | Credit Management | SAP_BR_CREDIT_CONTROLLER | 
 | Master Data Specialist - Business Partner Data
 | SAP_BR_BUPA_MASTER_SPECIALIST | Master Data - Business Partners/ Business Partner Governance/ Business Partner Governance | SAP_BR_BUPA_MASTER_SPECIALIST/ SAP_CA_SPT_MDG_BP_GOV_PC/ SAP_CMD_SPT_BP_GOV_PC | 
 | Configuration Expert - Business Process Configuration
 | SAP_BR_BPC_EXPERT | Business Process Configuration/ Business Process Configuration - Finance/ Business Process Configuration - Procurement/ Manage your Solution/ Business Process Configuration - Workflow/ Business Configuration - Feature Management/ Business Process Configuration - Extensibility Explorer/ Business Configuration - Transportation | SAP_BR_BPC_EXPERT/ SAP_FIN_SPT_BPC_EXPERT_PC/ SAP_MM_SPT_BIZ_PROC_CONFIGN_PC/ SAP_CA_SPT_IC_LND_BASE_PC/ SAP_CA_SPT_BPC_WORKFLOW_PC/ SAP_CA_SPT_BPC_FM_PC/ SAP_EI_SPT_BPC_EXT_PC/ SAP_TM_SPT_TRANSPCFG_PC | 

### Master Data, Organizational Data, and Other Data
The organizational structure and master data of your company has been created in your system during activation. The organizational structure reflects the structure of your company. The master data represents materials, customers, and vendors, for example, depending on the operational focus of your company.
Use your own master data or the following sample data to go through the test procedure.
Master / Org. Data
Value
Master / Org. Data Details
Comments

 | Material
 | NS0002
 | Non-Stock Material 02 (No MRP planning)
No serial number, no batch
 | If you use ANC procedure to extend the new country content, you need to manually extend the materials according to Master Data Script 31Y
 | Sold-to party
 | 541000035410000554100009 | Domestic MY Customer 3Domestic MY Customer 5Domestic MY Customer 9 | You can test the scope item using another domestic customer.
54100005is for credit management. 
54100009is for customer material record and POD (Proof-of-Delivery)

 | Ship-to party
 | 541000035410000554100009 | Domestic MY Customer 3Domestic MY Customer 5Domestic MY Customer 9 | 
 | Payer
 | 541000035410000554100009 | Customer domestic 03Customer domestic 05Domestic MY Customer 9 | 
 | Plant
 | 5410 | Plant 1 MY | 
 | Storage Location
 | 541A | Std. storage 1 | 
 | Shipping Point
 | 5410 | Shipping Point 5410 | 
 | Sales organization
 | 5410 | Dom. Sales Org | 
 | Distribution channel
 | 10 | Direct Sales | 
 | Division
 | 00 | Product Division 00 | 

For more information about creating master data, see the following Master Data Scripts (MDS)Script documentation.
Master Data Script ReferenceMDS
Description

 | BND
 | Create Customer Master - MDS
 | 31Y
 | Create Product Master of type "Non-Stock Material" - MDS

#### Roles
Create business roles using the following business role templates delivered by SAP and assign them to your individual test users.Name (Role Template)
ID (Role Template)
Name (Launchpad Space)
ID (Launchpad Space)

#### Instructions
### Purpose

### Overview
A non-stock material can be used in the Sales Order. Non-stock materials are not included in inventory management. With creation of a delivery, the goods issue is reflected by a confirmation posting. Non-stock items can be handled along with stock items on one sales order.
This document provides a detailed procedure for testing this scope item after solution activation, reflecting the predefined scope of the solution. Each process step, report, or item is covered in its own section, providing the system interactions (test steps) in a table view. Steps that are not in scope of the process but are needed for testing are marked accordingly. Project-specific steps must be added.
### System Access
System
Details

 | System
 | Accessible via SAP Fiori launchpad. Your system administrator provides you with the URL to access the various apps assigned to your role.

</details>

---


## Activity 2: Additional Information: Preliminary Steps: Set POD Relevance for Delivery Item Category

> 20 steps total | 12 classifiable | 8 hidden

### Step 2: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Set POD Relevance for Delivery Item Category |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This process step shows you how to set POD-Relevance for delivery item category.

#### Prerequisites
To use the optional step Proof of Delivery later on in the process, the delivery item categories need to set as POD-Relevant. Following procedure guide how to set indicator POD-Relevant for delivery item category.
Depending on your configuration environment for SAP S/4HANA Cloud Public Edition, choose one of the following options:
Configure Your Solution:

</details>

---

### Step 3: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Set POD Relevance for Delivery Item Category |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration.

</details>

---

### Step 4: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Set POD Relevance for Delivery Item Category |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Manage Your Solution(F1241) under Implementation Cockpit.

</details>

**Expected Result (Test Verification):**
> The various configuration sections display.

---

### Step 5: Search for a Solution Configuration

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 1 |
| **Activity** | Additional Information: Preliminary Steps: Set POD Relevance for Delivery Item Category |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open the configuration section Configure Your Solution, and in the Search field, enter POD

</details>

**Expected Result (Test Verification):**
> Various configuration activities for POD display.

---

### Step 6: Select a Solution Configuration

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 2 |
| **Activity** | Additional Information: Preliminary Steps: Set POD Relevance for Delivery Item Category |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose application Deliveries.

</details>

**Expected Result (Test Verification):**
> The Configure Your Solution-Deliveries screen displays.

---

### Step 7: Start the Configuration Activity

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 3 |
| **Activity** | Additional Information: Preliminary Steps: Set POD Relevance for Delivery Item Category |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Press Configure beside configuration activity Set POD-Relevance Depending on Delivery Item Category

</details>

**Expected Result (Test Verification):**
> The Change View "Maintain POD Relevance": Overview screen displays.

---

### Step 8: Set POD-Relevant for Item Category

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 4 |
| **Activity** | Additional Information: Preliminary Steps: Set POD Relevance for Delivery Item Category |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose X (Relevant for POD)for item category TAX and TAXN, and press the Save button.

</details>

**Expected Result (Test Verification):**
> Target item category has been set POD-Relevant.

---

### Step 9: Log on

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Set POD Relevance for Delivery Item Category |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the project experience in SAP Central Business Configuration.

</details>

---

### Step 10: Open Set POD-Relevance Depending on Delivery Item Category

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 5 |
| **Activity** | Additional Information: Preliminary Steps: Set POD Relevance for Delivery Item Category |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step handles shipping goods to customers. Think about: how are deliveries scheduled? Do you use a logistics provider? Do you track shipments?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Go to the Business Processes Configuration app. You can search for a configuration activity and navigate directly to the SAP S/4HANA Cloud Public Edition system. Log on to the SAP Fiori Launchpad as a Configuration Expert - Business Process Configuration (SAP_BR_BPC_EXPERT).Search for Set POD-Relevance Depending on Delivery Item Category.

</details>

---

### Step 11: Set POD-Relevant for Item Category

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 6 |
| **Activity** | Additional Information: Preliminary Steps: Set POD Relevance for Delivery Item Category |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose X (Relevant for POD)for item category TAX and TAXN, and press the Save button.

</details>

**Expected Result (Test Verification):**
> Target item category has been set POD-Relevant.

---

### Step 12: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Set POD Relevance for Delivery Item Category |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

SAP Central Business Configuration:

</details>

---

### Step 13: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Set POD Relevance for Delivery Item Category |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration.

</details>

---

### Step 14: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Set POD Relevance for Delivery Item Category |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Manage Your Solution(F1241) under Implementation Cockpit.

</details>

**Expected Result (Test Verification):**
> The various configuration sections display.

---

### Step 15: Search for a Solution Configuration

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 7 |
| **Activity** | Additional Information: Preliminary Steps: Set POD Relevance for Delivery Item Category |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open the configuration section Configure Your Solution, and in the Search field, enter POD

</details>

**Expected Result (Test Verification):**
> Various configuration activities for POD display.

---

### Step 16: Select a Solution Configuration

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 8 |
| **Activity** | Additional Information: Preliminary Steps: Set POD Relevance for Delivery Item Category |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose application Deliveries.

</details>

**Expected Result (Test Verification):**
> The Configure Your Solution-Deliveries screen displays.

---

### Step 17: Start the Configuration Activity

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 9 |
| **Activity** | Additional Information: Preliminary Steps: Set POD Relevance for Delivery Item Category |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Press Configure beside configuration activity Set POD-Relevance Depending on Delivery Item Category

</details>

**Expected Result (Test Verification):**
> The Change View "Maintain POD Relevance": Overview screen displays.

---

### Step 18: Set POD-Relevant for Item Category

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 10 |
| **Activity** | Additional Information: Preliminary Steps: Set POD Relevance for Delivery Item Category |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose X (Relevant for POD)for item category TAX and TAXN, and press the Save button.

</details>

**Expected Result (Test Verification):**
> Target item category has been set POD-Relevant.

---

### Step 19: Log on

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Set POD Relevance for Delivery Item Category |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the project experience in SAP Central Business Configuration.

</details>

---

### Step 20: Open Set POD-Relevance Depending on Delivery Item Category

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 11 |
| **Activity** | Additional Information: Preliminary Steps: Set POD Relevance for Delivery Item Category |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step handles shipping goods to customers. Think about: how are deliveries scheduled? Do you use a logistics provider? Do you track shipments?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Go to the Business Processes Configuration app. You can search for a configuration activity and navigate directly to the SAP S/4HANA Cloud Public Edition system. Log on to the SAP Fiori Launchpad as a Configuration Expert - Business Process Configuration (SAP_BR_BPC_EXPERT).Search for Set POD-Relevance Depending on Delivery Item Category.

</details>

---

### Step 21: Set POD-Relevant for Item Category

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 12 |
| **Activity** | Additional Information: Preliminary Steps: Set POD Relevance for Delivery Item Category |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose X (Relevant for POD)for item category TAX and TAXN, and press the Save button.

</details>

**Expected Result (Test Verification):**
> Target item category has been set POD-Relevant.

---


## Activity 3: Additional Information: Preliminary Steps: Set Relevant for Proof of Delivery in BP Master Data

> 8 steps total | 5 classifiable | 3 hidden

### Step 22: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Set Relevant for Proof of Delivery in BP Master Data |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Prerequisites
To use the optional step Proof of Delivery later on in the process, the customer with indicator POD-Relevant need be used from sales document creation. Customer 54100009has maintained Pod-Relevant as example for test. Following procedure guide how to set indicator POD-Relevant for other test customer if needed.

</details>

---

### Step 23: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Set Relevant for Proof of Delivery in BP Master Data |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad using the Role Master Data Specialist - Business Partner Data (MDG Cloud).

</details>

---

### Step 24: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Preliminary Steps: Set Relevant for Proof of Delivery in BP Master Data |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Maintain Business Partner(BP).

</details>

---

### Step 25: Enter Business Partner

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 13 |
| **Activity** | Additional Information: Preliminary Steps: Set Relevant for Proof of Delivery in BP Master Data |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the entry screen of the Maintain Business Partner App. Make the following entry, and choose Enter.Business Partner: <Customer ID>

</details>

---

### Step 26: Switch to Change Mode

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 14 |
| **Activity** | Additional Information: Preliminary Steps: Set Relevant for Proof of Delivery in BP Master Data |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the screen Display Organization: XXXXXXXX, choose button Switch Between Display and Change.

</details>

---

### Step 27: Goto Sales Area – Shipping Tab

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 15 |
| **Activity** | Additional Information: Preliminary Steps: Set Relevant for Proof of Delivery in BP Master Data |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the screen Change Organization : XXXXXXXX, choose Customer (maintained) in field Change in BP role.

</details>

---

### Step 28: Set POD-Relevant

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 16 |
| **Activity** | Additional Information: Preliminary Steps: Set Relevant for Proof of Delivery in BP Master Data |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Select the checkbox of POD-Relevant.

</details>

---

### Step 29: Save

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 17 |
| **Activity** | Additional Information: Preliminary Steps: Set Relevant for Proof of Delivery in BP Master Data |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Save.

</details>

---


## Activity 4: Additional Information

> 4 steps total | 0 classifiable | 4 hidden

### Step 30: Information

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
In case you have finetuned the access sequence of SAP pre-shipped condition types, the relative condition records should be created accordingly.
You can find general information on how to create your own master data in the following: Master Data Scripts (MDS)Master Data Script ReferenceMaster Data ID Description 
 | BEW | Create Free Goods Condition - MDS

#### Instructions
### Preliminary Steps: Create Condition Records (Optional)

</details>

---


## Activity 5: Test Procedures

> 1 steps total | 0 classifiable | 1 hidden

### Step 31: Information

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
This section describes procedures for each process step that belongs to this scope item.
The Enterprise search function provides a central entry point for finding business objects in your company from different sources using a single search request, You can search for objects such as: Apps, fact sheets for business objects. From the data found, you can go directly to the respective apps and fact sheets to display, edit the data, or find related objects.
How to access and check a fact sheet:
  - Log onto the SAP Fiori launchpad using the respective user example, Internal Sales Representative.

  - Access the Enterprise Search Bar and choose the magnifying glass button in the upper right corner.

  - The Enterprise Search bar is displayed, two filter fields appear left to the search button. Enter your Search Criteria and choose the business object type, example,: Sales orders from dropdown menu in 1st field, enter sales order number in 2nd field and choose Search, The sales order is listed.

  - Choose the sales order number link: the system navigates to the fact sheet screen and sales order related information is integrated and summarized in one SAP Fiori page, You can get detailed data via choosing the corresponding links.

There are fact sheets available for the following objects: (Visible depending on the assigned role)
  - Sales order

  - Quotation

  - Billing document

  - Credit Memo

  - Debit Memo

</details>

---


## Activity 6: Basic Credit Management (BD6) - Set Credit Limit (Optional)

> 1 steps total | 0 classifiable | 1 hidden

### Step 32: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Basic Credit Management (BD6) - Set Credit Limit (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this process, a credit limit is set for the used customer.

#### Procedure
Complete all the activities described in Basic Credit Management(BD6) scope item's test script.

</details>

---


## Activity 7: Sales Quotation (BDG) (Optional)

> 1 steps total | 0 classifiable | 1 hidden

### Step 33: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Sales Quotation (BDG) (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This process step shows you how to generate a standard sales quotation. If you want to generate a sales quotation before creating a sales order, you can implement this optional test script.

#### Procedure
Complete all the activities described in Sales Quotation(BDG) scope item's test script. 
Note
If you want to use the optional link between scope item Sales Quotation(BDG) and Sales Order Processing for Non-Stock Material(2ET), make sure to use consistent master data, such as Business Partner for the customer quotation and for the customer sales order.

</details>

---


## Activity 8: Sales Contract (Optional)

> 1 steps total | 0 classifiable | 1 hidden

### Step 34: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Sales Contract (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This scope item describes the process for a standard sales Contract.

#### Procedure
Complete all the activities described in the test script of Sales Contract Management(I9I) scope item.
Note
If you want to use the optional link between Sales Contract Management(I9I) and Sales Order Processing for Non-Stock Material(2ET) scope items, this reference only works if you use consistent master data (such as Business Partner for the customer quotation and the customer sales order).

</details>

---


## Activity 9: Create Sales Order

> 27 steps total | 16 classifiable | 11 hidden

### Step 35: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Sales Order |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This process step shows you how to create a sales order.

</details>

---

### Step 36: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Sales Order |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Internal Sales Representative.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 37: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Sales Order |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Sales Orders - Version 2(F3893).

</details>

**Expected Result (Test Verification):**
> The Manage Sales Orders - Version 2 screen displays.

---

### Step 38: Create Sales Order

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 18 |
| **Activity** | Create Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step creates a customer order in the system. Think about: how do customer orders come in (phone, email, web portal)? What information is captured?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Manage Sales Orders - Version 2 screen, choose Create.

</details>

---

### Step 39: Enter Data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 19 |
| **Activity** | Create Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Sales Order Screen, Order Type is Standard Order (OR), make the following entries and choose Continue:
Sales Organization: 5410
Distribution Channel: 10
Division:00

</details>

---

### Step 40: Enter Order Details

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 20 |
| **Activity** | Create Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the New: Sales Order screen, make the following entries:
Sold-to Party: 54100003
Ship-to Party: 54100003
Customer References: E.g. Purchase Order
Order Reason: <Order Reason>, for example, Excellent price
Material Number: <NS0002>
Quantity: <Quantity>

Note
 The item category can change to TAXN manually if the item is free of charge for Non-Stock Material Sales Order. 
Note
The item category can change to CTAX manually if the item is Downpayment for Non-Stock Material.

</details>

---

### Step 41: Save Document

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 21 |
| **Activity** | Create Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Create. Make a note of the sales order number: __________.

</details>

**Expected Result (Test Verification):**
> The order is saved and its order confirmation is printed out.

---

### Step 42: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Sales Order |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Internal Sales Representative.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 43: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Sales Order |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Sales Orders - Version 2(F3893).

</details>

**Expected Result (Test Verification):**
> The Manage Sales Orders - Version 2 screen displays.

---

### Step 44: Search for Sales Order

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 22 |
| **Activity** | Create Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step creates a customer order in the system. Think about: how do customer orders come in (phone, email, web portal)? What information is captured?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter search terms in filter bar and choose Go
Example: Enter <sales order number> in the Sales Order field.

</details>

**Expected Result (Test Verification):**
> Sales order is displayed in the result list.

---

### Step 45: Display Sales Order

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 23 |
| **Activity** | Create Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step creates a customer order in the system. Think about: how do customer orders come in (phone, email, web portal)? What information is captured?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose sales order number and choose Display Sales Order - VA03.

</details>

**Expected Result (Test Verification):**
> The Display Sales Orders xxx: Overview screen displays.

---

### Step 46: Check Output Condition

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 24 |
| **Activity** | Create Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Display Standand Orders xxx: Output screen, and choose Header Output Preview.

</details>

---

### Step 47: Display Print Preview

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 25 |
| **Activity** | Create Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Display Standard Orders xxx: Output screen, select the line already created for the print output and choose Display Document.

</details>

**Expected Result (Test Verification):**
> Preview for PDF document displays.

---

### Step 48: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Sales Order |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

### Printing Forms

</details>

---

### Step 49: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Sales Order |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Internal Sales Representative.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 50: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Sales Order |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Sales Orders - Version 2(F3893).

</details>

**Expected Result (Test Verification):**
> The Manage Sales Orders - Version 2 screen displays.

---

### Step 51: Create Sales Order

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 26 |
| **Activity** | Create Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step creates a customer order in the system. Think about: how do customer orders come in (phone, email, web portal)? What information is captured?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Manage Sales Orders - Version 2 screen, choose Create.

</details>

---

### Step 52: Enter Data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 27 |
| **Activity** | Create Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Sales Order Screen, Order Type is Standard Order (OR), make the following entries and choose Continue:
Sales Organization: 5410
Distribution Channel: 10
Division:00

</details>

---

### Step 53: Enter Order Details

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 28 |
| **Activity** | Create Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the New: Sales Order screen, make the following entries:
Sold-to Party: 54100003
Ship-to Party: 54100003
Customer References: E.g. Purchase Order
Order Reason: <Order Reason>, for example, Excellent price
Material Number: <NS0002>
Quantity: <Quantity>

Note
 The item category can change to TAXN manually if the item is free of charge for Non-Stock Material Sales Order. 
Note
The item category can change to CTAX manually if the item is Downpayment for Non-Stock Material.

</details>

---

### Step 54: Save Document

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 29 |
| **Activity** | Create Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Create. Make a note of the sales order number: __________.

</details>

**Expected Result (Test Verification):**
> The order is saved and its order confirmation is printed out.

---

### Step 55: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Sales Order |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Internal Sales Representative.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 56: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Sales Order |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Sales Orders - Version 2(F3893).

</details>

**Expected Result (Test Verification):**
> The Manage Sales Orders - Version 2 screen displays.

---

### Step 57: Search for Sales Order

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 30 |
| **Activity** | Create Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step creates a customer order in the system. Think about: how do customer orders come in (phone, email, web portal)? What information is captured?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter search terms in filter bar and choose Go
Example: Enter <sales order number> in the Sales Order field.

</details>

**Expected Result (Test Verification):**
> Sales order is displayed in the result list.

---

### Step 58: Display Sales Order

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 31 |
| **Activity** | Create Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step creates a customer order in the system. Think about: how do customer orders come in (phone, email, web portal)? What information is captured?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose sales order number and choose Display Sales Order - VA03.

</details>

**Expected Result (Test Verification):**
> The Display Sales Orders xxx: Overview screen displays.

---

### Step 59: Check Output Condition

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 32 |
| **Activity** | Create Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Display Standand Orders xxx: Output screen, and choose Header Output Preview.

</details>

---

### Step 60: Display Print Preview

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 33 |
| **Activity** | Create Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Display Standard Orders xxx: Output screen, select the line already created for the print output and choose Display Document.

</details>

**Expected Result (Test Verification):**
> Preview for PDF document displays.

---

### Step 61: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Sales Order |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Note
It can also be navigated to a fact sheet screen in the Manage Sales Orders- Version 2(F3893)app: 
  - On the Manage Sales Ordersscreen, enter search terms in filter bar and choose Go.
  - In search result, click your sales order number and choose Display Fact sheet.

</details>

---


## Activity 10: Process Sales Order Approval (Optional)

> 1 steps total | 0 classifiable | 1 hidden

### Step 62: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Process Sales Order Approval (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This process step shows you how to review the sales orders that might need to be approved.

#### Procedure
Complete the activities of Process Sales Order Approval described in the test script of Sell from Stock(BD9) scope item.

#### Instructions
Follow the procedure for Process Sales Order Approval steps in the Sell from Stock(BD9) scope item.

</details>

---


## Activity 11: Basic Credit Management (BD6) - Review Blocked Sales Orders (Optional)

> 1 steps total | 0 classifiable | 1 hidden

### Step 63: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Basic Credit Management (BD6) - Review Blocked Sales Orders (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This process step shows you how to review the sales orders that might have been blocked due to the credit limit check.

#### Procedure
Complete all the activities described in Basic Credit Management(BD6) scope item's test script.

</details>

---


## Activity 12: Create Delivery

> 7 steps total | 3 classifiable | 4 hidden

### Step 64: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Delivery |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This process step shows you how to create the delivery.

</details>

---

### Step 65: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Delivery |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Shipping Specialist.

</details>

---

### Step 66: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Delivery |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Create Outbound Deliveries - From Sales Orders(F0869A).

</details>

**Expected Result (Test Verification):**
> The Create Outbound Deliveries-From Sales Orders screen displays.

---

### Step 67: Search for Sales Order

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 34 |
| **Activity** | Create Delivery |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step creates a customer order in the system. Think about: how do customer orders come in (phone, email, web portal)? What information is captured?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Go:
Shipping point:5410
Planned Creation Date: <Delivery selection date>
Sales Document: <Sales Order Number Created Previously>

</details>

---

### Step 68: Create Delivery

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 35 |
| **Activity** | Create Delivery |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step handles shipping goods to customers. Think about: how are deliveries scheduled? Do you use a logistics provider? Do you track shipments?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select your sales order, and choose Create Deliveries.

</details>

**Expected Result (Test Verification):**
> A delivery creation is triggered

---

### Step 69: Check Details

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 36 |
| **Activity** | Create Delivery |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Display Log.

</details>

**Expected Result (Test Verification):**
> The Analyze Delivery Log screen displays.
> A delivery is created successfully with delivery number shown on tab Deliveries.

---

### Step 70: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Delivery |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Note
With the Analyze Outbound Delivery Logsapp, you can display an overview about the logs of all the deliveries, which have been created in your system. You can filter by example created by and Additional settings. If you select the arrow on the right of each delivery log entry you can see its message type, text, and also related sales document.

</details>

---


## Activity 13: Split Outbound Delivery (Optional)

> 8 steps total | 5 classifiable | 3 hidden

### Step 71: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Split Outbound Delivery (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This process step shows you how to split up single or multiple items from an existing, completely picked Outbound Delivery and move them to a new delivery document before posting Goods Issue.

</details>

---

### Step 72: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Split Outbound Delivery (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Shipping Specialist.

</details>

---

### Step 73: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Split Outbound Delivery (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Split Outbound Delivery(VLSP).

</details>

---

### Step 74: Enter Shipping Point

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 37 |
| **Activity** | Split Outbound Delivery (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Split Outbound Delivery screen, make the following entry:
Shipping point: 5410

</details>

---

### Step 75: Enter Outbound Delivery

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 38 |
| **Activity** | Split Outbound Delivery (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step handles shipping goods to customers. Think about: how are deliveries scheduled? Do you use a logistics provider? Do you track shipments?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
To speed up selection, make the following entry on the same screen:
Outbound Delivery: <Outbound Delivery Document Number>

</details>

---

### Step 76: Choose Split Profile

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 39 |
| **Activity** | Split Outbound Delivery (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Split Profile field, make the following entry or select the following value from the list:
Split Profile: 0003 (Delivery Split - LE Components)

</details>

---

### Step 77: Start Selection

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 40 |
| **Activity** | Split Outbound Delivery (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Execute.

</details>

**Expected Result (Test Verification):**
> A list of outbound delivery items for the selected Shipping Point and Outbound Delivery is displayed.

---

### Step 78: Select Items for Split

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 41 |
| **Activity** | Split Outbound Delivery (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the items that should become part of a new delivery that must be split from the current delivery.
 Enter <Split Quantity> and choose Save Split.

</details>

**Expected Result (Test Verification):**
> The selected items are displayed with a new delivery document number. The items not selected for the split still appear with the former document number.

---


## Activity 14: Add Freight Cost (Optional)

> 8 steps total | 5 classifiable | 3 hidden

### Step 79: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Add Freight Cost (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This process step shows you how to want to add the actual freight costs to the Outbound Delivery after you know the exact weights and freight charges.

</details>

---

### Step 80: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Add Freight Cost (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Shipping Specialist.

</details>

---

### Step 81: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Add Freight Cost (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Change Outbound Delivery(VL02N).

</details>

---

### Step 82: Enter Number

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 42 |
| **Activity** | Add Freight Cost (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Change Outbound Delivery screen, enter <outbound delivery number> and choose Enter.

</details>

---

### Step 83: Open Conditions

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 43 |
| **Activity** | Add Freight Cost (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

From the menu, choose Goto  Header Conditions.

</details>

---

### Step 84: In the Condition Type Data

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 44 |
| **Activity** | Add Freight Cost (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

In the Condition Type column, enter YBHD.

</details>

---

### Step 85: Enter Freight Costs

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 45 |
| **Activity** | Add Freight Cost (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Amount column, enter <Freight Costs (such as 100)>.

</details>

**Expected Result (Test Verification):**
> The system distributes the entered amount across the delivery items. The distribution is executed on the basis of the net weight of each item.

---

### Step 86: Save

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 46 |
| **Activity** | Add Freight Cost (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Save your outbound delivery.

</details>

**Expected Result (Test Verification):**
> Freight Costs are added to the Outbound Delivery and later copied to the Invoice.

---


## Activity 15: Post Goods Issue

> 5 steps total | 2 classifiable | 3 hidden

### Step 87: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Post Goods Issue |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This process shows you how to post the goods issue.

</details>

---

### Step 88: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Post Goods Issue |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Shipping Specialist.

</details>

---

### Step 89: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Post Goods Issue |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Change Outbound Delivery(VL02N).

</details>

**Expected Result (Test Verification):**
> The Change Outbound Delivery  screen displays.

---

### Step 90: Enter Outbound Delivery Number

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 47 |
| **Activity** | Post Goods Issue |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step handles shipping goods to customers. Think about: how are deliveries scheduled? Do you use a logistics provider? Do you track shipments?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and Choose Continue.
Outbound Delivery: <delivery number created previously>

</details>

**Expected Result (Test Verification):**
> The Delivery XXX Change: Overview screen displays.

---

### Step 91: Post Good Issue

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 48 |
| **Activity** | Post Goods Issue |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Post Goods Issue.

</details>

**Expected Result (Test Verification):**
> The goods issue is posted.

---


## Activity 16: Proof of Delivery (Optional)

> 9 steps total | 6 classifiable | 3 hidden

### Step 92: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Proof of Delivery (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you record the quantities as confirmed by the respective customer after physical arrival of goods delivered. Thus document the right quantities that should become subject to billing to this customer. 
This is only possible for Outbound Deliveries if the customer master data have been maintained in a way that this customer is "POD-relevant" (on sales area level).

</details>

---

### Step 93: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Proof of Delivery (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Shipping Specialist.

</details>

---

### Step 94: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Proof of Delivery (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Change Outbound Delivery - Proof of Delivery(VLPOD).

</details>

---

### Step 95: Enter Outbound Delivery

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 49 |
| **Activity** | Proof of Delivery (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step handles shipping goods to customers. Think about: how are deliveries scheduled? Do you use a logistics provider? Do you track shipments?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the same screen, make the following entry, and choose Continue:Outbound Delivery: <your Outbound Delivery Document Number>

</details>

**Expected Result (Test Verification):**
> The selected Outbound Delivery Document screen displays, and Overview POD tab becomes active.

---

### Step 96: Quantity Difference

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 50 |
| **Activity** | Proof of Delivery (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
If there is a quantity difference between shipping and receiving, go to step 5 and 6.

</details>

---

### Step 97: Enter POD Delivery Reason (Optional)

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 51 |
| **Activity** | Proof of Delivery (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step handles shipping goods to customers. Think about: how are deliveries scheduled? Do you use a logistics provider? Do you track shipments?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the line with the item for which a differing quantity was reported by the customer, make the following entry or select the following value from the list: Reason: <DFG2(Underdelivery, reason unknown)>

</details>

---

### Step 98: Enter Deviation (Optional)

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 52 |
| **Activity** | Proof of Delivery (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Quantity Difference field, go to Sales Unit (Qty Diffin Sales Un), enter <respective quantity (differs from the expected Delivery Quantity as per the Outbound Delivery Item)>, and choose Enter.

</details>

**Expected Result (Test Verification):**
> The quantity displayed for the respective item in the POD quantity field has been recalculated (Quantity Difference subtracted from Delivery Quantity). 
> The value for POD Status field has changed to B (Differences Reported).

---

### Step 99: Confirm Delivery Proof

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 53 |
| **Activity** | Proof of Delivery (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step handles shipping goods to customers. Think about: how are deliveries scheduled? Do you use a logistics provider? Do you track shipments?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Confirm Proof of Delivery.

</details>

**Expected Result (Test Verification):**
> The POD Date field has been filled with the current date.
> The value for the POD Status field has changed to C (Confirmed).

---

### Step 100: Save

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 54 |
| **Activity** | Proof of Delivery (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Save.

</details>

**Expected Result (Test Verification):**
> The Outbound Delivery document is saved with confirmation for actually delivered quantities. 
> These will be used for the consecutive billing step.

---


## Activity 17: Create Billing Document

> 12 steps total | 8 classifiable | 4 hidden

### Step 101: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Billing Document |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

### Procedure
In this activity, you handle the billing.

</details>

---

### Step 102: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Billing Document |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Billing Clerk.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 103: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Billing Document |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open the Create Billing Documents(F0798).

</details>

**Expected Result (Test Verification):**
> The Create Billing Documents screen displays.

---

### Step 104: Define Billing Setting

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 55 |
| **Activity** | Create Billing Document |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Billing Settings in the bottom bar, you can make the following settings as below:   - Set billing date and type before billing: ON
  - Create separate billing document for each item of billing due list: OFF
  - Automatically post billing documents: ON
  - Display billing documents after creation: ON
  - Choose delivery items to be billed and select quantities: OFF

</details>

---

### Step 105: Search for Billing Due List

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 56 |
| **Activity** | Create Billing Document |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the search condition, use criteria if necessary.

</details>

**Expected Result (Test Verification):**
> Sales document displays in the result.

---

### Step 106: Select Item for Billing

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 57 |
| **Activity** | Create Billing Document |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select row of SD Document created previously, and choose the Create Billing Documents.

</details>

**Expected Result (Test Verification):**
> The Create Billing Documents screen displays.

---

### Step 107: Maintain Billing Date

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 58 |
| **Activity** | Create Billing Document |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose billing type Invoice (F2) and maintain billing date, for example current date, then choose OK.

</details>

**Expected Result (Test Verification):**
> The system generates an invoice for billing.

---

### Step 108: Save Billing Document

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 59 |
| **Activity** | Create Billing Document |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Save you entries. 
Make a note of the billing document number: __________.

</details>

**Expected Result (Test Verification):**
> To access the accounting data, navigate to Process Flow and click Journal Entry and navigate to Display Journal Entries
>   - Material: Non-Stock Material (NLAG)
> 
>   - Debited Accounts: 54100003
> 
> Rcvbls Domestic MY Customer 3
>   - Credited Accounts: 
> 41910000 Billed Rev Domestic Prod 
> 22001000 Output tax accrued
>  52590000 (optional) Freight Revenue/Rec.
> 
>   - 44002000 Sales Disc Domestic (if item category TAXN has been used)

---

### Step 109: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Billing Document |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Billing Documents(F2250).

</details>

**Expected Result (Test Verification):**
> The Display Billing Documents screen displays.

---

### Step 110: Enter Billing Number

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 60 |
| **Activity** | Create Billing Document |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Billing Document field, enter <respective invoice number> and choose Enter.

</details>

**Expected Result (Test Verification):**
> The Invoice xxx Display: Overview of Billing Items screen displays.

---

### Step 111: Check Output Condition

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 61 |
| **Activity** | Create Billing Document |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Invoice xxx Display: Overview of Billing Items screen, choose Menu→ More→ Goto→ Header → Output.

</details>

**Expected Result (Test Verification):**
> The Invoice XXX Display: Output screen displays.

---

### Step 112: Display Print Preview

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 62 |
| **Activity** | Create Billing Document |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Invoice xxx Display: Output screen, select the line already created for the print output and choose Display PDF Document.

</details>

**Expected Result (Test Verification):**
> Preview for PDF document displays.

---


## Activity 18: Create Pro Forma Invoice (Optional)

> 28 steps total | 18 classifiable | 10 hidden

### Step 113: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Pro Forma Invoice (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This process step shows you how to create Pro Forma invoice with reference to delivery.

</details>

---

### Step 114: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Pro Forma Invoice (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Billing Clerk.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpads displays.

---

### Step 115: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Pro Forma Invoice (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Create Billing Documents - VF01(VF01).

</details>

**Expected Result (Test Verification):**
> The Create Billing document screen displays.

---

### Step 116: Choose Individual Billing Document

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 63 |
| **Activity** | Create Pro Forma Invoice (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter delivery document created previously and choose Create Billing Documents.

</details>

---

### Step 117: Maintain Billing Type and Billing Date

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 64 |
| **Activity** | Create Pro Forma Invoice (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Pro Forma Invoice for Delivery (F8) billing type and billing date, for example current date, then press OK .

</details>

**Expected Result (Test Verification):**
> The draft pro forma invoice is created.

---

### Step 118: Save Pro Forma Invoice

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 65 |
| **Activity** | Create Pro Forma Invoice (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Billing Document screen, click Save.
The draft billing document with ID Sxxxxxxxx turns into a saved billing document with ID xxxxxxxx. Make a note of the billing document number: __________.

</details>

**Expected Result (Test Verification):**
> Pro forma invoice is generated.

---

### Step 119: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Pro Forma Invoice (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Billing Clerk.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpads displays.

---

### Step 120: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Pro Forma Invoice (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Billing Documents(F0797).

</details>

**Expected Result (Test Verification):**
> The Manage Billing Document screen displays.

---

### Step 121: Enter Invoice

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 66 |
| **Activity** | Create Pro Forma Invoice (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Input the pro-forma invoice number recorded in previous step. Choose Enter.

</details>

**Expected Result (Test Verification):**
> The billing document created in previous step displays.

---

### Step 122: Display Billing Document

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 67 |
| **Activity** | Create Pro Forma Invoice (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the billing document item, and choose Display.

</details>

**Expected Result (Test Verification):**
> The billing document displays.

---

### Step 123: Check Output Condition

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 68 |
| **Activity** | Create Pro Forma Invoice (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Billing Document screen, choose the last assignment block: Output Items.

</details>

**Expected Result (Test Verification):**
> There is one entry in the item with the BILLING_DOCUMENT output type.

---

### Step 124: Display Print Preview

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 69 |
| **Activity** | Create Pro Forma Invoice (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

On the Billing Document screen, choose Preview.

</details>

**Expected Result (Test Verification):**
> Preview for PDF document displays.

---

### Step 125: Update New Attachment (Optional)

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 70 |
| **Activity** | Create Pro Forma Invoice (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Edit mode, add, delete, and update the attachments. 
Save your changes by pressing Save in the footer bar.

</details>

---

### Step 126: Update New Text (optional)

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 71 |
| **Activity** | Create Pro Forma Invoice (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Edit mode, you can add, delete, and update these texts. 
Save your changes by pressing Save in the footer bar.

</details>

---

### Step 127: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Pro Forma Invoice (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Note
Alternatively, it is supported to create Pro Forma (type F5) with reference to sales order.

### Manage Billing Documents Procedures

</details>

---

### Step 128: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Pro Forma Invoice (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Billing Clerk.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpads displays.

---

### Step 129: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Pro Forma Invoice (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Create Billing Documents - VF01(VF01).

</details>

**Expected Result (Test Verification):**
> The Create Billing document screen displays.

---

### Step 130: Choose Individual Billing Document

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 72 |
| **Activity** | Create Pro Forma Invoice (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter delivery document created previously and choose Create Billing Documents.

</details>

---

### Step 131: Maintain Billing Type and Billing Date

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 73 |
| **Activity** | Create Pro Forma Invoice (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Pro Forma Invoice for Delivery (F8) billing type and billing date, for example current date, then press OK .

</details>

**Expected Result (Test Verification):**
> The draft pro forma invoice is created.

---

### Step 132: Save Pro Forma Invoice

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 74 |
| **Activity** | Create Pro Forma Invoice (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Billing Document screen, click Save.
The draft billing document with ID Sxxxxxxxx turns into a saved billing document with ID xxxxxxxx. Make a note of the billing document number: __________.

</details>

**Expected Result (Test Verification):**
> Pro forma invoice is generated.

---

### Step 133: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Pro Forma Invoice (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Billing Clerk.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpads displays.

---

### Step 134: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Pro Forma Invoice (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Billing Documents(F0797).

</details>

**Expected Result (Test Verification):**
> The Manage Billing Document screen displays.

---

### Step 135: Enter Invoice

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 75 |
| **Activity** | Create Pro Forma Invoice (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Input the pro-forma invoice number recorded in previous step. Choose Enter.

</details>

**Expected Result (Test Verification):**
> The billing document created in previous step displays.

---

### Step 136: Display Billing Document

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 76 |
| **Activity** | Create Pro Forma Invoice (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the billing document item, and choose Display.

</details>

**Expected Result (Test Verification):**
> The billing document displays.

---

### Step 137: Check Output Condition

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 77 |
| **Activity** | Create Pro Forma Invoice (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Billing Document screen, choose the last assignment block: Output Items.

</details>

**Expected Result (Test Verification):**
> There is one entry in the item with the BILLING_DOCUMENT output type.

---

### Step 138: Display Print Preview

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 78 |
| **Activity** | Create Pro Forma Invoice (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

On the Billing Document screen, choose Preview.

</details>

**Expected Result (Test Verification):**
> Preview for PDF document displays.

---

### Step 139: Update New Attachment (Optional)

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 79 |
| **Activity** | Create Pro Forma Invoice (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Edit mode, add, delete, and update the attachments. 
Save your changes by pressing Save in the footer bar.

</details>

---

### Step 140: Update New Text (optional)

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 80 |
| **Activity** | Create Pro Forma Invoice (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Edit mode, you can add, delete, and update these texts. 
Save your changes by pressing Save in the footer bar.

</details>

---


## Activity 19: Additional Information

> 4 steps total | 0 classifiable | 4 hidden

### Step 141: Information

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
This process step shows you how to define the schedule background job for creation outbound deliveries.

#### Procedure
Test Step #Test Step NameInstructionExpected ResultComments
 | 1
 | Log On
 | Log on to the SAP Fiori launchpad as a Shipping Specialist.
 | The SAP Fiori launchpad displays.
 | 
 | 2
 | Access the App
 | Open Schedule Delivery Creation(F2228).
 | The Application Jobs displays. The app must be started with the history of application jobs.
 | 
 | 3
 | Create Delivery Creation Schedule
 | Choose Newto define a new job.
 | The New Job view displays. Job Template should default as Schedule Delivery Creation.
 | 
 | 4
 | Job Parameters
 | Define scheduling options and parameter section for batch job if necessary, then choose Check.
 | The system displays the notification Go ahead and schedule the job.
 | 
 | 5
 | Schedule
 | Choose Schedule.
 | A delivery creation job is scheduled. The view backs to Application Jobs.
 | 
 | 6
 | Check Delivery Creation Job Log
 | In the Application Jobsview, after job item status turn to Finish, choose Statussymbol in Logcolumn.Note
Choose Magnifier, the job list refreshes.

 | The view goes to job log details.
 |

#### Instructions
### Appendix: Process Integration
The process to be tested in this test script is part of a chain of integrated processes.

### Succeeding Processes
After completing the activities in this test script, you can continue testing the following business processes:
Process
Business Condition

 | Accounts Receivable (J59)
 | Posting a Customer Invoice in Accounting, and so on.
Using the master data from this document, complete the following activities described in the test script:
Posting a Customer Invoice in Accounting
Overdue Receivables, Display Customer Balances
Manage Customer Line Items

 | Sales Period End Closing Operations (BKK) (optional)
 | This scope item describes the collection of periodic activities such as day ending activities, or reporting.
Using the master data from this document, complete all the activities described in the Test Script of the scope item:
Review Incomplete SAP Digital Documents (deliveries),
Review Sales Documents blocked for billing
Review Log of collective invoice creation

### Appendix: Scheduling Job Creation (Optional)

### Scheduling Job for Delivery Creation (Optional)

### Scheduling Job for Goods Issue Deliveries (Optional)

### Purpose
This process step shows you how to define the schedule background job for goods issue for deliveries.

### Procedure
Test Step #Test Step NameInstructionExpected ResultComments
 | 1
 | Log On
 | Log on to the SAP Fiori launchpad as a Shipping Specialist.
 | The SAP Fiori launchpad displays.
 | 
 | 2
 | Access the App
 | Open Schedule Goods Issue for Deliveries(F2259).
 | The Application Jobsdisplays. The app must be started with the history of application jobs.
 | 
 | 3
 | Create Goods Issue Deliveries Schedule
 | Choose Newto define a new job.
 | The New Jobview displays. Job Template should default as Schedule goods issue for Deliveries.
 | 
 | 4
 | Job Parameters
 | Define scheduling options and parameter section for batch job if necessary, then choose Check.
 | The system displays the notification Go ahead and schedule the job.
 | 
 | 5
 | Schedule
 | Choose Schedule.
 | A schedule goods issue for deliveries job is scheduled. The view back to Application Jobs.
 | 
 | 6
 | Check Goods Issue Deliveries Job Log
 | In the Application Jobsview, after job item status turn to Finish, choose Statussymbol in Logcolumn.Note
Choose Magnifier, the job list refreshes.

 | The view goes to job log details.
 | 

### Scheduling Job for Billing Creation (Optional)

### Purpose
This process step shows you how to define the schedule background job for creation billing documents.

### Procedure
Test Step #Test Step NameInstructionExpected ResultComments
 | 1
 | Log On
 | Log on to the SAP Fiori launchpad as a Billing Clerk. 
 | The SAP Fiori launchpad displays.
 | 
 | 2
 | Access the App
 | Open Schedule Billing Creation(F1519).
 | The Application Jobsdisplays. The app must be started with the history of application jobs.
 | 
 | 3
 | Create Billing Creation Schedule
 | Choose Newto define a new job for billing creation.
 | The New Jobview displays. Job Template should default as Schedule Billing Creation.
 | 
 | 4
 | Job Parameters
 | Define scheduling options and parameter section for batch job if necessary, then choose Check.
 | The system displays the notification Go ahead and schedule the job.
 | 
 | 5
 | Schedule
 | Choose Schedule.
 | A billing creation job is scheduled. View backs to Application Jobs.
 | 
 | 6
 | Check Billing Creation Job Log
 | In the Application Jobsview, after job item status turn to Finish, choose Job Log.Note
Choose the Magnifier,the job list refreshes.

 | The view goes to log details.
 | 

### Scheduling Job for Billing Release (Optional)

### Purpose
This process step shows you how to define the schedule background job for release billing documents to accounting.

### Procedure
Test Step #Test Step NameInstructionExpected ResultComments
 | 1
 | Log On
 | Log on to the SAP Fiori launchpad as a Billing Clerk.
 | The SAP Fiori launchpad displays.
 | 
 | 2
 | Access the App
 | Open Schedule Billing Release(F1518).
 | The Application Jobsdisplays. The app starts with the history of application jobs.
 | 
 | 3
 | Create Billing Release Schedule
 | Choose Newto define a new job for billing creation.
 | The New Jobview displays. Job Template should default as Schedule Billing Release.
 | 
 | 4
 | Job Parameters
 | Define scheduling options and parameter section for batch job if necessary, then choose Check.
 | The system displays the notification Go ahead and schedule the job.
 | 
 | 5
 | Schedule
 | Choose Schedule.
 | A billing release job is scheduled. The view back to Application Jobs.
 | 
 | 6
 | Check Billing Release Job Log
 | In the view Application Jobs, after job item status turn to Finish, choose Job Log.Note
Choose the Magnifier,the job list refreshes.

 | The view goes to log details.
 |

</details>

---

### Step 142: Information

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
This process step shows you how to define the schedule background job for when and how billing documents are sent to customer.

#### Procedure
Test Step #Test Step NameInstructionExpected ResultComments
 | 1
 | Log On
 | Log on to the SAP Fiori launchpad as a Billing Clerk.
 | The SAP Fiori launchpad displays.
 | 
 | 2
 | Access the App
 | Open Schedule Billing Output(F1510).
 | The Application Jobs displays. The app shall be started with the history of application jobs.
 | 
 | 3
 | Create Billing Output Schedule
 | Choose Newto define a new job for billing creation.
 | The New Jobview displays. Job Template should default as Schedule Billing Output.
 | 
 | 4
 | Job Parameters
 | Define scheduling options and parameter section for batch job if necessary, then choose Check.
 | The system displays the notification Go ahead and schedule the job.
 | 
 | 5
 | Schedule
 | Choose Schedule.
 | A billing output job is scheduled. The view back to Application Jobs.
 | 
 | 6
 | Check Billing Output Job Log
 | In the view Application Jobs, after job item status turns to Finish, choose Job Log.Note
Choose the Magnifier,the job list refreshes.

 | The view goes to log details.
 |

#### Instructions
### Scheduling Job for Billing Output (Optional)

</details>

---


# Appendix: Statistics

| Step Type | Count | Classifiable |
|-----------|-------|-------------|
| Information | 25 | 0 |
| Logon | 19 | 0 |
| Access App | 18 | 0 |
| Process Step | 43 | 43 |
| Data Entry | 16 | 16 |
| Action | 9 | 9 |
| Verification | 12 | 12 |

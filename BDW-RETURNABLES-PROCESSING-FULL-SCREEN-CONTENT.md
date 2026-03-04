# BDW — Returnables Processing: Complete Screen-by-Screen Content

> **What the user sees on every screen in the review flow.**
> This document reproduces the exact content shown in the ABEAM assessment tool when a user reviews BDW (Returnables Processing). For each step it shows the step title, type badge, business context explanation, the full SAP technical reference content (normally collapsed), expected results, and activity context — exactly as rendered on screen.

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
| Total steps | 250 |
| Classifiable (shown by default) | 129 |
| Hidden by default | 121 |
| Unique activities | 27 |

---


## Activity 1: Additional Information

> 6 steps total | 0 classifiable | 6 hidden

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
| Internal Sales Representative
 | SAP_BR_INTERNAL_SALES_REP | Internal Sales/ Customer Returns/ Billing | SAP_BR_INTERNAL_SALES_REP/ SAP_SD_SPT_RETURNS_INT_SALES_PC/ SAP_SD_SPT_BILLING_INT_SALES_PC | 
 | Shipping Specialist
 | SAP_BR_SHIPPING_SPECIALIST | Shipping | SAP_BR_SHIPPING_SPECIALIST | 
 | Warehouse Clerk
 | SAP_BR_WAREHOUSE_CLERK | Inventory Processing | SAP_BR_WAREHOUSE_CLERK | 
 | Billing Clerk
 | SAP_BR_BILLING_CLERK
 | Billing | SAP_BR_BILLING_CLERK | 
 | Inventory Manager | SAP_BR_INVENTORY_MANAGER | Inventory Management | SAP_BR_INVENTORY_MANAGER | 
 | Returns and Refund Clerk
 | SAP_BR_RETURNS_REFUND_CLERK | Customer Returns | SAP_BR_RETURNS_REFUND_CLERK | 

### Master Data, Organizational Data, and Other Data
The organizational structure and master data of your company has been created in your system during activation. The organizational structure reflects the structure of your company. The master data represents materials, customers, and vendors, for example, depending on the operational focus of your company. Use your own master data or the following sample data to go through the test procedure.
Data
Sample Value
Details
Comments

 | Material
 | TG11
 | Trading Good for Reg. Trading (MRP planning)
no Serial no.; no batch
 | See sections Business Conditions and Preliminary Steps.

 | Material
 | TG12
 | Trading Good for Reg. Trading (reorder point planning)
no Serial no.; no batch
 | See sections Business Conditions and Preliminary Steps.

 | Material
 | TG21
 | Trad.Good 21,Reorder Point,Batch-FIFO
No serial number, batch controlled (FIFO strategy)
 | Only use if you have activated the building block Batch Management (BLG) (BLH)(BLP).
See sections Business Conditionsand Preliminary Steps.

 | Material
 | TG22
 | Trad.Good 22,Reorder Point,Batch-ExpD
No serial number, batch controlled (Exp. Date)
 | Only use if you have activated the building block Batch Management (BLG) (BLH)(BLP).
See sections Business Conditions and Preliminary Steps.

 | Material
 | RP001
 | Empties,ND
 | 
 | Material
 | CM-FL-V00
 | Forklift 
 | Only use if you have activated the scope item Make-to-Order Production with Variant Configuration (1YT).

 | Sold-to Party
 | 54100001
 | Domestic MY Customer 1
 | 
 | Ship-to Party
 | 54100001
 | Domestic MY Customer 1
 | 
 | Payer
 | 54100001
 | Domestic MY Customer 1
 | 
 | Plant
 | 5410
 | Plant 1 MY
 | 
 | Storage Location
 | 541A
 |  | 
 | Shipping Point
 | 5410
 |  | 
 | Sales Organization
 | 5410
 |  | 
 | Distribution Channel
 | 10
 |  | 
 | Division
 | 00
 |  | 

For more information on creating master data objects, see the following Master Data Scripts (MDS)
Master Data Script ReferenceMDS
Description

 | BNF 
 | Create Product Master of type "Trading Good" - MDS

 | 65B 
 | Create Product Master of type "Returnable Packaging" - MDS
 | BND 
 | Create Customer Master - MDS

### Business Conditions
Before this scope item can be tested, the following business conditions must be met.
Scope Item
Business Condition

 | J45 - Procurement of Direct Materials
 | Material must be available in stock.
For trading goods (HAWA) or returnable materials (LEIH), perform one of the following activities:
  - Execute the Procurement without QM test script Procurement of Direct Materials(J45)

  - Create stock using FLP Tile Post Goods Movement (for details see section Preliminary Steps).

 | BNZ - Create New Open MM Posting Period - MDS
 | You have completed the step described in the Create New Open MM Posting Period - MDS(BNZ) master data script. Posting Period is up to date.

#### Roles
Create business roles using the following business role templates delivered by SAP and assign them to your individual test users.Name (Role Template)
ID (Role Template)
Name (Launchpad Space)
ID (Launchpad Space)

#### Instructions
### Purpose

### Overview
This scope item enables the shipping of standard pallets and their return. When you create a standard sales order, the delivery is automatically created based on this sales order. During the picking and shipping steps of this process, a pallet (returnable packaging) is added to the delivery. During the billing process, pallets can also be returned to manufacturers using a pallet return order with pallet return delivery and goods receipt, or a pallet return delivery without reference and goods receipt.
If customers do not return pallets, you can issue debit memo requests. Triggered by billing, the system issues debit memos based on such debit memo requests. Once this has been carried out, you can synchronize the consignment stock quantity and value, and then post a manual goods issue for the unreturned pallet.
This document provides a detailed procedure for testing this scope item after solution activation, reflecting the predefined scope of the solution. Each process step, report, or item is covered in its own section, providing the system interactions (test steps) in a table view. Steps that are not in scope of the process but are needed for testing are marked accordingly. Project-specific steps must be added.
### System Access
System
Details

 | System
 | Accessible via SAP Fiori launchpad. Your system administrator provides you with the URL to access the various apps assigned to your role.

</details>

---

### Step 2: Information

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
This process step shows you how to set initial stock to execute this scope item.

#### Procedure
Test Step #
Test Step Name
Instruction

#### Expected Result
Comments

 | 1 | Log On
 | Log on to the SAP Fiori launchpad as a Warehouse Clerk (Retail).
 | The SAP Fiori launchpad displays.
 | 
 | 2 | Access the App
 | Open Post Goods Movement(MIGO). It only displays this way if it was your last transaction. So, the action for the user should be to select Reference Document for MIGO Transaction > Other.
 | The Goods Receipt Otherscreen displays. | 

 | 3 | Enter Movement Type | Make the following entry and choose Enter.  - Executable Action in Transaction MIGO: Goods Receipt

 |  | 
 | 4 | EditMaterial
 | On the Goods Receipt Other Screen: Materialtab, make the following entry, and choose Enter:
  - Material : <Material Number>.

 |  | 
 | 5 | EditQuantity Data
 | On the Goods Receipt Other Screen: Quantitytab, make the following entry, and choose Enter:
  - Qty in Unit of Entry: 1000

  - Unit of Entry: <PC>

 |  | 
 | 6 | Enter the Goods Receipt Other Screen: Where Tab
 | On the Goods Receipt Other Screen: Wheretab, make the following entries and choose Enter:
  - Movement Type: 561(Receipt per initial entry of stock balances into unrestricted use)

  - Plant: <Enter a Plant>

  - Storage Location: <Enter a Storage Location>

 |  | 
 | 7 | Enter the Goods Receipt Other Screen: Batch Tab
 | 
On the Goods Receipt Other Screen: Batchtab, make the following entry and choose Enter:
  - Date of Manufacture: <Enter the Current Date or a Date in the Past>

 | Only relevant for batch relevant materials. | 

 | 8
 | Save Your Entries
 | Choose Post.
 |  | 

### Financial Postings
Material
Debited Accounts
Credited Accounts

 | Trading Good (HAWA)
 | 13600000
Inventory TradingGd
 | 39912000
Inv Init SF&amp;Fin Bal

### Preliminary Steps: Create Condition Records (Optional)

### Purpose
In case you have finetuned the access sequence of SAP pre-shipped condition types, the relative condition records should be created accordingly.
You can find general information on how to create your own master data in the following: Master Data Scripts (MDS)Master Data Script ReferenceMaster Data ID Description 
 | BEW | Create Free Goods Condition - MDS

#### Instructions
### Preliminary Steps: Set Initial Stock for Material

</details>

---


## Activity 2: Test Procedures

> 1 steps total | 0 classifiable | 1 hidden

### Step 3: Information

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
The enterprise search function provides a central entry point for finding business objects in your company from different sources using a single search request. You can search for objects such as: apps, fact sheets for business objects. From the data found, you can go directly to the respective apps and fact sheets to display, edit the data or find related objects. 
How to access and check a fact sheet:
  - Log on to the SAP Fiori launchpad as a respective user, for example, Internal Sales Representative. 
  - Access the Enterprise Search Barby choosing the magnifying glass icon in the upper right corner.
  - The Enterprise Search bar displays two filter fields next to the search icon: all dropdown menu and a search field. Enter your Search Criteria and choose the business object type, for example, select Sales ordersfrom the dropdown menu, and enter a sales order number in the search field and choose Search, the sales order lists.
  - Choose the sales order number link. The system navigates to the fact sheet screen and sales order related information is integrated and summarized in one Fiori page. You can get detailed data by choosing the corresponding links.
There are fact sheets available for the following objects (visible depending on the assigned role):
  - Sales order

  - Quotation

  - Billing document

  - Credit Memo

  - Debit Memo

  - Customer 360 Fact sheet

</details>

---


## Activity 3: Additional Information

> 6 steps total | 0 classifiable | 6 hidden

### Step 4: Information

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

### Sales Process Including Returnable Materials

</details>

---


## Activity 4: Display Pallets Stock

> 24 steps total | 8 classifiable | 16 hidden

### Step 5: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Display Pallets Stock |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This process step shows you how to display the pallet stock.

</details>

---

### Step 6: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Display Pallets Stock |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Warehouse Clerk.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori Launchpad displays.

---

### Step 7: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Display Pallets Stock |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Display Stock Overview(MMBE).

</details>

**Expected Result (Test Verification):**
> The Stock Overview: Company Code/plant/Storage Location/Batch screen displays.

---

### Step 8: Enter Material Data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 1 |
| **Activity** | Display Pallets Stock |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries:
  - Material : <Material Number> For example, RP001

  - Plant: 5410

  - Display Version: 01

</details>

**Expected Result (Test Verification):**
> The Stock Overview: Basic List screen displays.

---

### Step 9: Choose Execute

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 2 |
| **Activity** | Display Pallets Stock |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Execute.

</details>

---

### Step 10: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Display Pallets Stock |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Note
If you can't find Display Stock Overviewapp, open Show/Hide Group Panel in the SAP Fiori launchpad, choose Tile Catalog, and navigate to Display Stock Overviewunder Material Management - Warehouse Management and add it to My Homegroup.

</details>

---


## Activity 5: Create Sales Order

> 29 steps total | 16 classifiable | 13 hidden

### Step 11: Information

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
This process step shows you how to create a sales order for a customer and a standard product.

</details>

---

### Step 12: Log On

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

### Step 13: Access the App

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

---

### Step 14: Create Sales Order

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 3 |
| **Activity** | Create Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step creates a customer order in the system. Think about: how do customer orders come in (phone, email, web portal)? What information is captured?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On Manage Sales Orders - Version 2 screen, choose Create.

</details>

**Expected Result (Test Verification):**
> The Create Sales Order: Initial screen displays.

---

### Step 15: Enter Sales Document Type

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 4 |
| **Activity** | Create Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Create:
  - Order Type: <Sales Order Type> For example, OR(Standard Order) 

  - Distribution Channel: 10

  - Sales Organization: 5410

  - Division: 00

</details>

---

### Step 16: Enter Customer Information

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 5 |
| **Activity** | Create Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries: 
  - Sold-to Party: <Sold-to Party> For example, 54100001

</details>

---

### Step 17: Enter Order Details

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 6 |
| **Activity** | Create Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Enter: 
  - Customer Reference: <Reference>
  - Cust. Ref. Date: <Date>
  - Material: <Material Number> For example, TG11

  - Order Quantity: <Quantity> For example, 5

  - Order Reason: <Order Reason>, for example, Good Service

  - Optional: Item: 20, Material: RP001, Order Quantity: 4PC.

</details>

---

### Step 18: Save

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 7 |
| **Activity** | Create Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Save.

</details>

**Expected Result (Test Verification):**
> The standard sales order is saved.
> Note
> Please ignore any dialog boxes.

---

### Step 19: Log On

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

### Step 20: Access the App

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
> The Manage Sales Order - Version 2 screen displays.

---

### Step 21: Search for Sales Order

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 8 |
| **Activity** | Create Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step creates a customer order in the system. Think about: how do customer orders come in (phone, email, web portal)? What information is captured?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter search term(s) in filter bar and choose Go
For example, enter sales order number in Sales Order field.

</details>

**Expected Result (Test Verification):**
> Sales order is displayed in result list.

---

### Step 22: Navigate to Sales Order Screen

| | |
|---|---|
| **Type** | `Navigation` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Sales Order |

**What this step does:**
> This step creates a customer order in the system. Think about: how do customer orders come in (phone, email, web portal)? What information is captured?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose > on the right side of the Sales Order item and navigate to Display Standard Orders xxx: Overview screen.

</details>

**Expected Result (Test Verification):**
> The Display Sales Order xxx: Overview screen displays.

---

### Step 23: Check Output Condition

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 9 |
| **Activity** | Create Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Display Standard Orders xxx: Overview screen, choose  Extras   Output  Header  Edit.

</details>

---

### Step 24: Display Print Preview

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 10 |
| **Activity** | Create Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Display Standard Orders xxx: Overview screen, choose Header Output Preview.

</details>

**Expected Result (Test Verification):**
> Preview for PDF document displays.

---

### Step 25: Information

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
If you have installed the scope item Rebate Processing: Free Goods in your system and you use material TG11and customer 54100001, the following warning may appear: Minimum quantity 1.000 PC of free goods has not been reached. To skip this warning, choose Enter.

### Printing form - Output Management

</details>

---

### Step 26: Log On

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

### Step 27: Access the App

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

---

### Step 28: Create Sales Order

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 11 |
| **Activity** | Create Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step creates a customer order in the system. Think about: how do customer orders come in (phone, email, web portal)? What information is captured?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On Manage Sales Orders - Version 2 screen, choose Create.

</details>

**Expected Result (Test Verification):**
> The Create Sales Order: Initial screen displays.

---

### Step 29: Enter Sales Document Type

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 12 |
| **Activity** | Create Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Create:
  - Order Type: <Sales Order Type> For example, OR(Standard Order) 

  - Distribution Channel: 10

  - Sales Organization: 5410

  - Division: 00

</details>

---

### Step 30: Enter Customer Information

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 13 |
| **Activity** | Create Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries: 
  - Sold-to Party: <Sold-to Party> For example, 54100001

</details>

---

### Step 31: Enter Order Details

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 14 |
| **Activity** | Create Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Enter: 
  - Customer Reference: <Reference>
  - Cust. Ref. Date: <Date>
  - Material: <Material Number> For example, TG11

  - Order Quantity: <Quantity> For example, 5

  - Order Reason: <Order Reason>, for example, Good Service

  - Optional: Item: 20, Material: RP001, Order Quantity: 4PC.

</details>

---

### Step 32: Save

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 15 |
| **Activity** | Create Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Save.

</details>

**Expected Result (Test Verification):**
> The standard sales order is saved.
> Note
> Please ignore any dialog boxes.

---

### Step 33: Log On

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

### Step 34: Access the App

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
> The Manage Sales Order - Version 2 screen displays.

---

### Step 35: Search for Sales Order

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 16 |
| **Activity** | Create Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step creates a customer order in the system. Think about: how do customer orders come in (phone, email, web portal)? What information is captured?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter search term(s) in filter bar and choose Go
For example, enter sales order number in Sales Order field.

</details>

**Expected Result (Test Verification):**
> Sales order is displayed in result list.

---

### Step 36: Navigate to Sales Order Screen

| | |
|---|---|
| **Type** | `Navigation` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Sales Order |

**What this step does:**
> This step creates a customer order in the system. Think about: how do customer orders come in (phone, email, web portal)? What information is captured?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose > on the right side of the Sales Order item and navigate to Display Standard Orders xxx: Overview screen.

</details>

**Expected Result (Test Verification):**
> The Display Sales Order xxx: Overview screen displays.

---

### Step 37: Check Output Condition

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 17 |
| **Activity** | Create Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Display Standard Orders xxx: Overview screen, choose  Extras   Output  Header  Edit.

</details>

---

### Step 38: Display Print Preview

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 18 |
| **Activity** | Create Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Display Standard Orders xxx: Overview screen, choose Header Output Preview.

</details>

**Expected Result (Test Verification):**
> Preview for PDF document displays.

---

### Step 39: Information

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
It can also be navigated to a factsheet screen in the Manage Sales Orders- Version 2(F3893)app:
  - On the Manage Sales Orderscreen, enter search terms in filter bar and choose Go.
  - In search result, choose your Sales Order Number, and choose More Links.

</details>

---


## Activity 6: Create Attachment for Sales Order (Optional)

> 2 steps total | 0 classifiable | 2 hidden

### Step 40: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Attachment for Sales Order (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This process step shows you how to create attachment for a sales order.

#### Procedure
Test Step #
Test Step Name
Instruction

#### Expected Result
Comments

 | 1
 | Log On
 | Log on to the SAP Fiori launchpad as an Internal Sales Representative.
 | The SAP Fiori launchpad displays.
 | 
 | 2
 | Access the App
 | Open Manage Sales Orders(F1873). 
 | The Manage Sales Ordersscreen displays.
 | 
 | 3
 | Navigate to Change Sales Order Screen
 | On the Manage Sales Ordersscreen, enter the respective order number created in previous step and choose Go.
Click the sales order number and choose Change Sales Order - VA02. 
 |  | 
 | 4
 | Create Attachment for Sales Order
 | Choose Services for Objecton the top right corner of screen, choose Create Attachment. | The File Uploadscreen displays. 
 | 
 | 5
 | Import File
 | Choose OKin the File Uploaddialog box.
In the Openview, choose local path and file, and choose Open.
 | The attachment was successfully created.
 | 
 | 6
 | Check Attachment
 | Choose Services for Objecton top right corner of screen, choose Attachment List.
 | Attachment brings up on the Service: Attachment listscreen.
 |

</details>

---


## Activity 7: Create Delivery

> 6 steps total | 3 classifiable | 3 hidden

### Step 41: Information

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
This process step shows you how to create a delivery.

#### Procedure
Test Step #
Test Step Name
Instruction

#### Expected Result
Comments

 | 1
 | Log On
 | Log on to the SAP Fiori launchpad as a Shipping Specialist.
 |  | 
 | 2
 | Access the App
 | Open Create Outbound Deliveries- From Sales Orders(F0869A). 
 | The Create Outbound Deliveries-From Sales Ordersscreen displays.
 | 
 | 3
 | Search Sales Order
 | Make the following entries and choose Go:
  - Shipping point: 5410

  - Planned Creation Date: <Delivery selection date>

  - Order: Sales order number created previously

 |  | 
 | 4
 | Create Delivery
 | Select your sales order items and choose Create Deliveries. 
 | A delivery is triggered to create. 
 | 
 | 5 
 | Check Details
 | Choose Display Log.
 | The Analyze Delivery Logscreen displays. A delivery is created successfully with delivery number shown on tabDeliveries.
 | 

Note
With the Analyze Outbound Delivery Logsapp, you can display an overview about the logs of all delivery creation in system. You can search for logs according to different filter criteria, for example, Created byand additional settings. Detailed log information is listed via selecting the arrow on the right of each delivery log entry: 
If delivery is created successfully, delivery number is shown on tab Deliveries, else, you can display the exact message type, text and also the related sales document on tab Messages.

### Printing form

</details>

---

### Step 42: Log On

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

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 43: Access the App

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

Open Change Outbound Delivery(VL02N)

</details>

**Expected Result (Test Verification):**
> The Change Outbound Delivery(VL02N) screen displays

---

### Step 44: Issue Delivery Output

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 19 |
| **Activity** | Create Delivery |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step handles shipping goods to customers. Think about: how are deliveries scheduled? Do you use a logistics provider? Do you track shipments?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Change Outbound Delivery(VL02N) screen, enter the Delivery number and click Continue. 
From the Delivery xxxxxxxx Change: Overview screen, choose Menu  Extras  Delivery Output  Outbound Control.

</details>

**Expected Result (Test Verification):**
> The Delivery: Output screen is displayed.

---

### Step 45: Print Preview

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 20 |
| **Activity** | Create Delivery |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Delivery: Output screen, select the line with the Delivery_Pick_List output type, and choose Display PDF Document.

</details>

**Expected Result (Test Verification):**
> A preview of the print document is displayed.

---

### Step 46: Print Delivery Pick List

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 21 |
| **Activity** | Create Delivery |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step handles shipping goods to customers. Think about: how are deliveries scheduled? Do you use a logistics provider? Do you track shipments?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

From the preview of the document, choose Print.

</details>

**Expected Result (Test Verification):**
> The delivery pick list is printed.

---


## Activity 8: Create Attachment for Delivery (Optional)

> 2 steps total | 0 classifiable | 2 hidden

### Step 47: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Attachment for Delivery (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This process step shows you how to create attachment for delivery.

#### Procedure
Test Step #
Test Step Name
Instruction

#### Expected Result
Comments

 | 1
 | Log On
 | Log on to the SAP Fiori launchpad as a Shipping Specialist.
 | The SAP Fiori launchpad displays.
 | 
 | 2
 | Access the App
 | Open Change Outbound Delivery(VL02N).
 | The Display Outbound Delivery: Initialscreen displays.
 | 
 | 3
 | Enter Outbound Delivery Number
 | In the Outbound Deliveryfield, enter <the outbound delivery number created in previous step>and choose Continue.
 | The Display Outbound Delivery xxx: Overviewscreen displays.
 | 
 | 4
 | Create Delivery Attachment
 | Choose Services for Objecton the top right corner of screen, choose Services for Objectand then choose Create Attachment.
 | The File Uploadscreen displays.
 | 
 | 5
 | Import File
 | Choose OKin the File Uploaddialog box.
In the Openview, choose local path and file, and choose Open.
 | The attachment was successfully created.
 | 
 | 6
 | Check Attachment
 | Choose Services for Object, then choose Attachment List.
 | Attachment shows up on Service: Attachment Listscreen.
 |

</details>

---


## Activity 9: Add Delivery Item for Pallet

> 6 steps total | 3 classifiable | 3 hidden

### Step 48: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Add Delivery Item for Pallet |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This process step shows you how to add a pallet item to the delivery.

</details>

---

### Step 49: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Add Delivery Item for Pallet |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Shipping Specialist.

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
| **Activity** | Add Delivery Item for Pallet |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Change Outbound Delivery(VL02N).

</details>

**Expected Result (Test Verification):**
> The Change Outbound Delivery screen displays.

---

### Step 51: Enter Outbound Delivery

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 22 |
| **Activity** | Add Delivery Item for Pallet |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step handles shipping goods to customers. Think about: how are deliveries scheduled? Do you use a logistics provider? Do you track shipments?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Enter:
  - Outbound Delivery: <Outbound Delivery>

</details>

---

### Step 52: Enter delivery details

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 23 |
| **Activity** | Add Delivery Item for Pallet |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step handles shipping goods to customers. Think about: how are deliveries scheduled? Do you use a logistics provider? Do you track shipments?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Delivery 8xxxxxx Change: Overview screen, on the Picking tab, make the following entries and choose Enter:
  - Material: <Material number>RP001

  - Plant: <Plant> For example, 5410

  - Storage Location: <Storage location> For example, 541A

  - Delivery Quantity:  screen<Delivery Qty> For example, 3

</details>

---

### Step 53: Save

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 24 |
| **Activity** | Add Delivery Item for Pallet |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Save.

</details>

**Expected Result (Test Verification):**
> Pallets have been added to the delivery document.

---


## Activity 10: Execute Picking

> 10 steps total | 7 classifiable | 3 hidden

### Step 54: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Execute Picking |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
The picking process involves taking goods from a storage location and staging the right quantity in a picking area where the goods are prepared for shipping. This process step shows you how to pick deliveries.

</details>

---

### Step 55: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Execute Picking |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Shipping Specialist.

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
| **Activity** | Execute Picking |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Manage Outbound Deliveries - VL06O(VL06O_CLOUD).

</details>

---

### Step 57: Choose Picking

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 25 |
| **Activity** | Execute Picking |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose For Picking.

</details>

---

### Step 58: Enter Shipping Point

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 26 |
| **Activity** | Execute Picking |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries, and choose Execute:  - Shipping Point: 5410

Under the Picking Data tab, select  - Only Picking Without WM: X

</details>

---

### Step 59: Change Outbound Deliveries

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 27 |
| **Activity** | Execute Picking |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose your delivery number, and choose Change Outbound Deliveries.

</details>

---

### Step 60: Check Batch Split

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 28 |
| **Activity** | Execute Picking |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Picking tab, check if batch split exists in the Batch Split Indicator column.

</details>

---

### Step 61: Enter Picked Quantity

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 29 |
| **Activity** | Execute Picking |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
- If batch spilt exists, choose Batch Split Exists to expand sub item(s), enter <quantity equal to Deliv. Qty> in Picked Qty field for sub item.

  - If batch split doesn't exist, enter <quantity equal to Deliv. Qty> in Picked Qty field for picking related item(s).

</details>

---

### Step 62: Choose Enter

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 30 |
| **Activity** | Execute Picking |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Enter.

</details>

---

### Step 63: Save

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 31 |
| **Activity** | Execute Picking |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Save.

</details>

**Expected Result (Test Verification):**
> The delivery has been decided.

---


## Activity 11: Check Batches (Optional)

> 1 steps total | 0 classifiable | 1 hidden

### Step 64: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Check Batches (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This process step shows you how to check the batch number assigned to the material.

#### Prerequisites
Execute this step if batch management is used, such as TG21and TG22.

#### Procedure
Test Step #
Test Step Name
Instruction

#### Expected Result
Comments

 | 1
 | Log On
 | Log on to the SAP Fiori launchpad as a Shipping Specialist.
 | The SAP Fiori launchpad displays.  | 
 | 2
 | Access the App
 | Open Change Outbound Delivery(VL02N).
 |  | 
 | 3
 | Enter Outbound Delivery Number
 | In the Outbound Deliveryfield, enter <outbound delivery number>, and choose Enter.
 |  | 
 | 4
 | Check Batch Number Assignment
 | If Expand Batch Splitexists, go to the Batchfield, and check the batch number assignment.
 | Batch numbers are assigned to the materials.
 | 
 | 5
 | Save Document
 | Choose Save.
 |  |

</details>

---


## Activity 12: Post Goods Issue

> 11 steps total | 5 classifiable | 6 hidden

### Step 65: Information

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
This process step shows you how to post goods issues for delivery.

#### Procedure
Test Step #
Test Step Name
Instruction

#### Expected Result
Comments

 | 1
 | Log On
 | Log on to the SAP Fiori launchpad as a Shipping Specialist.
 |  | 
 | 2
 | Access the App
 | Open Manage Outbound Deliveries- VL06O(VL06O_CLOUD). 
 |  | 
 | 3
 | Open Outbound Delivery Monitor
 | Choose For Goods Issue.
Make the following entries and choose ExecuteShipping Point: 5410
 |  | 
 | 4
 | Post Good Issue
 | Select your outbound delivery note, and choose Post Goods Issues.
Select today’s date from the dialog box, and choose Continue.
 | A message confirms the goods issue has been posted. 
 | 

### Financial Posting
MaterialDebited Accounts
Credited Accounts
Cost Element / CO Object

 | Trading Good (HAWA)
 | 54083000
Inv Chg COGS w/CE
 | 13600000
Inventory TradingGd
 | none

Note
When the bundling functionality in context of IFRS15 is tested, the financial document in IFRS ledger (Ledger Group 2L) with the adjusted revenue amount displays.
To check the financial document, use the Warehouse Clerkrole, and access the Display Material Document List- Deprecated(MB51)app.

### Printing Form

</details>

---

### Step 66: Log On

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

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 67: Access the App

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

Open Display Outbound Delivery(VL03N).

</details>

**Expected Result (Test Verification):**
> The Display Outbound Delivery(VL03N) screen displays.

---

### Step 68: Issue Delivery Output

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 32 |
| **Activity** | Post Goods Issue |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step handles shipping goods to customers. Think about: how are deliveries scheduled? Do you use a logistics provider? Do you track shipments?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Outbound Delivery field, enter <Outbound Delivery Number>, and choose Continue. 
On the Delivery xxxxxxxx Display: Overview screen, choose Menu  Extras  Delivery Output  Output Control.

</details>

**Expected Result (Test Verification):**
> The Delivery: Output screen displays.

---

### Step 69: Print Preview

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 33 |
| **Activity** | Post Goods Issue |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Delivery: Output screen, select the line with the Output Type Delivery Note, and choose Display Document.

</details>

**Expected Result (Test Verification):**
> A preview of the print document is displayed.

---

### Step 70: Print Delivery Note

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 34 |
| **Activity** | Post Goods Issue |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step handles shipping goods to customers. Think about: how are deliveries scheduled? Do you use a logistics provider? Do you track shipments?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

From the preview of the document, choose Print.

</details>

**Expected Result (Test Verification):**
> The delivery note is printed.

---


## Activity 13: Display Pallets Stock

> 24 steps total | 8 classifiable | 16 hidden

### Step 71: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Display Pallets Stock |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This process step shows you how to display the pallet stock.

</details>

---

### Step 72: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Display Pallets Stock |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Warehouse Clerk.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori Launchpad displays.

---

### Step 73: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Display Pallets Stock |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Display Stock Overview(MMBE).

</details>

**Expected Result (Test Verification):**
> The Stock Overview: Company Code/plant/Storage Location/Batch screen displays.

---

### Step 74: Enter Material Data

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 35 |
| **Activity** | Display Pallets Stock |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries:
  - Material: <Material Number> For example, RP001

  - Plant: <Plant>

  - Display Version: 01

</details>

**Expected Result (Test Verification):**
> The Stock Overview: Basic List screen displays.

---

### Step 75: Choose Execute

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 36 |
| **Activity** | Display Pallets Stock |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Execute.

</details>

---

### Step 76: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Display Pallets Stock |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Note
If you can't find Display Stock Overviewapp, open Show/Hide Group Panel in the SAP Fiori launchpad, choose Tile Catalog, and navigate to Display Stock Overviewunder Material Management - Warehouse Management and add it to My Homegroup.

</details>

---


## Activity 14: Create Billing Documents

> 32 steps total | 24 classifiable | 8 hidden

### Step 77: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Billing Documents |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This process step shows you how to create a billing document.

#### Instructions
### Create Billing Document

</details>

---

### Step 78: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Billing Documents |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log onto the SAP Fiori launchpad as a Billing Clerk.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 79: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Billing Documents |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Create Billing Documents(F0798).

</details>

**Expected Result (Test Verification):**
> The Create Billing Document screen displays.

---

### Step 80: Define Billing Setting

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 37 |
| **Activity** | Create Billing Documents |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Billing Settings in the right bottom of the screen.
Keep the settings below.
  - Set Billing Data and type before billing: ON
  - Create separate Billing Documents for Each item of Billing Due List: ON.
  - Automatically Post Billing Documents: ON
  - Display Billing Document after creation: ON.
  - Choose delivery item to be billed and select quantities: OFF.

</details>

---

### Step 81: Search for billing list

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 38 |
| **Activity** | Create Billing Documents |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the search condition, use criteria if necessary.

</details>

**Expected Result (Test Verification):**
> Sales document(s) will display in the result.

---

### Step 82: Choose Individual Billing Document

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 39 |
| **Activity** | Create Billing Documents |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select a row of delivery document created previously and choose button Create Billing Documents.

</details>

**Expected Result (Test Verification):**
> There is one window Create Billing Documents(F0798) displaying.

---

### Step 83: Maintain Billing Date

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 40 |
| **Activity** | Create Billing Documents |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Invoice (F2) billing type and maintain billing date, for example current date, then press button OK.

</details>

**Expected Result (Test Verification):**
> The draft billing document is created. 
> Note
> The item with pallets is not relevant for billing, ignore the log information Item category LF CB10 cannot be invoiced with billing type F2.

---

### Step 84: Save Billing Document

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 41 |
| **Activity** | Create Billing Documents |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Billing Document screen, click Save. The draft billing document with ID Sxxxxxxxx turns into a saved billing document with ID xxxxxxxx, make a note of the billing document number: __________.

</details>

**Expected Result (Test Verification):**
> Final billing document is generated.

---

### Step 85: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Billing Documents |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Manage Billing Documents(F0797) under Sales  Billing Documents

</details>

**Expected Result (Test Verification):**
> The screen Manage Billing Document will display.

---

### Step 86: Search the billing document created in previous step

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 42 |
| **Activity** | Create Billing Documents |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Input the Billing document number recorded in previous step. Choose Enter.

</details>

**Expected Result (Test Verification):**
> The billing document created in previous step will display.

---

### Step 87: Display the billing document

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 43 |
| **Activity** | Create Billing Documents |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the billing document item, and choose Display.

</details>

**Expected Result (Test Verification):**
> The billing document shall be displayed.

---

### Step 88: Check Output Condition

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 44 |
| **Activity** | Create Billing Documents |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Billing Document(F1901) screen, choose the last assignment block, Output Items.

</details>

**Expected Result (Test Verification):**
> There is one entry in the item and the output type is BILLING_DOCUMENT.

---

### Step 89: Display Print Preview

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 45 |
| **Activity** | Create Billing Documents |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Billing Document(F1901) screen choose Preview.

</details>

**Expected Result (Test Verification):**
> Preview for PDF document displays.

---

### Step 90: Cancel Billing Document (Optional)

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 46 |
| **Activity** | Create Billing Documents |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select certain Billing document and choose Cancel Billing Docs

</details>

**Expected Result (Test Verification):**
> There is log display - Billing Document Canceled.

---

### Step 91: Update new Attachment (Optional)

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 47 |
| **Activity** | Create Billing Documents |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Edit mode, add, delete and update the attachments. Save your changes by pressing Save in the footer bar.

</details>

---

### Step 92: Update new Text (optional)

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 48 |
| **Activity** | Create Billing Documents |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Edit mode, you can add, delete and update these texts. Save your changes by pressing Save in the footer bar.

</details>

---

### Step 93: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Billing Documents |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
### Financial posting:
MaterialDebited Accounts
Credited Accounts
Cost Element / CO Object

 | Trading Good (HAWA)
 | 12100000 Rcvbls Domestic 
 | 41000000 Rev Domestic Prod
22000000 Output tax 
 | none

### Manage billing documents

</details>

---

### Step 94: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Billing Documents |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log onto the SAP Fiori launchpad as a Billing Clerk.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 95: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Billing Documents |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Create Billing Documents(F0798).

</details>

**Expected Result (Test Verification):**
> The Create Billing Document screen displays.

---

### Step 96: Define Billing Setting

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 49 |
| **Activity** | Create Billing Documents |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Billing Settings in the right bottom of the screen.
Keep the settings below.
  - Set Billing Data and type before billing: ON
  - Create separate Billing Documents for Each item of Billing Due List: ON.
  - Automatically Post Billing Documents: ON
  - Display Billing Document after creation: ON.
  - Choose delivery item to be billed and select quantities: OFF.

</details>

---

### Step 97: Search for billing list

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 50 |
| **Activity** | Create Billing Documents |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the search condition, use criteria if necessary.

</details>

**Expected Result (Test Verification):**
> Sales document(s) will display in the result.

---

### Step 98: Choose Individual Billing Document

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 51 |
| **Activity** | Create Billing Documents |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select a row of delivery document created previously and choose button Create Billing Documents.

</details>

**Expected Result (Test Verification):**
> There is one window Create Billing Documents(F0798) displaying.

---

### Step 99: Maintain Billing Date

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 52 |
| **Activity** | Create Billing Documents |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Invoice (F2) billing type and maintain billing date, for example current date, then press button OK.

</details>

**Expected Result (Test Verification):**
> The draft billing document is created. 
> Note
> The item with pallets is not relevant for billing, ignore the log information Item category LF CB10 cannot be invoiced with billing type F2.

---

### Step 100: Save Billing Document

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 53 |
| **Activity** | Create Billing Documents |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Billing Document screen, click Save. The draft billing document with ID Sxxxxxxxx turns into a saved billing document with ID xxxxxxxx, make a note of the billing document number: __________.

</details>

**Expected Result (Test Verification):**
> Final billing document is generated.

---

### Step 101: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Billing Documents |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Manage Billing Documents(F0797) under Sales  Billing Documents

</details>

**Expected Result (Test Verification):**
> The screen Manage Billing Document will display.

---

### Step 102: Search the billing document created in previous step

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 54 |
| **Activity** | Create Billing Documents |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Input the Billing document number recorded in previous step. Choose Enter.

</details>

**Expected Result (Test Verification):**
> The billing document created in previous step will display.

---

### Step 103: Display the billing document

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 55 |
| **Activity** | Create Billing Documents |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the billing document item, and choose Display.

</details>

**Expected Result (Test Verification):**
> The billing document shall be displayed.

---

### Step 104: Check Output Condition

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 56 |
| **Activity** | Create Billing Documents |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Billing Document(F1901) screen, choose the last assignment block, Output Items.

</details>

**Expected Result (Test Verification):**
> There is one entry in the item and the output type is BILLING_DOCUMENT.

---

### Step 105: Display Print Preview

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 57 |
| **Activity** | Create Billing Documents |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Billing Document(F1901) screen choose Preview.

</details>

**Expected Result (Test Verification):**
> Preview for PDF document displays.

---

### Step 106: Cancel Billing Document (Optional)

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 58 |
| **Activity** | Create Billing Documents |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select certain Billing document and choose Cancel Billing Docs

</details>

**Expected Result (Test Verification):**
> There is log display - Billing Document Canceled.

---

### Step 107: Update new Attachment (Optional)

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 59 |
| **Activity** | Create Billing Documents |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Edit mode, add, delete and update the attachments. Save your changes by pressing Save in the footer bar.

</details>

---

### Step 108: Update new Text (optional)

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 60 |
| **Activity** | Create Billing Documents |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Edit mode, you can add, delete and update these texts. Save your changes by pressing Save in the footer bar.

</details>

---


## Activity 15: Create Attachment for Billing (Optional)

> 2 steps total | 0 classifiable | 2 hidden

### Step 109: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Attachment for Billing (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This process step shows you how to create an attachment for a billing document.

#### Procedure
Test Step #
Test Step Name
Instruction

#### Expected Result
Comments

 | 1
 | Log On
 | Log on to the SAP Fiori launchpad as a Billing Clerk.
 | The SAP Fiori launchpad displays.
 | 
 | 2
 | Access the App
 | Open Manage Billing Documents(F0797).
 | The Manage Billing Documentscreen displays.
 | 
 | 3
 | Search Billing
 | Make the following entry, and choose Enter:
Billing Document: <Billing Document Number Created Previously>
 |  | 
 | 4
 | Choose Billing Number
 | On the Manage Billing Documentsscreen, select your billing document created in the previous step, and choose Display.
 | The Billing Documentscreen displays.
 | 

 | 5
 | Edit
 | On the Billing Documentsscreen, choose Edit.
 | 
 | 

 | 6
 | Create Billing Attachment
 | Scroll down and choose Uploadin the ATTACHMENTSsection.
 | The Open Filescreen displays.
 | 
 | 7
 | Import File
 | In the Openwindow, select a local path or file and choose Open.
Choose Save.
 | The attachment is successfully created.
 | 
 | 8
 | Check Attachment
 | In the ATTACHMENTSsection, you can see the uploaded document. Choose the document you want to open.
 |  |

</details>

---


## Activity 16: Post Incoming Payment

> 2 steps total | 0 classifiable | 2 hidden

### Step 110: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Post Incoming Payment |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Procedure
Complete all activities described in the test script of the scope item: Accounts Receivable(J59) (Chapter Posting Incoming Payments) using the master data from this document.

</details>

---


## Activity 17: Delivery Process for Returnable Materials (Optional)

> 1 steps total | 0 classifiable | 1 hidden

### Step 111: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Delivery Process for Returnable Materials (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In parallel with chapter Sales Process Including Returnable Materials, if pallets are sent to your customer without accompanying with goods , execute the following activities.

</details>

---


## Activity 18: Create Outbound Delivery without Order Reference (Optional)

> 6 steps total | 3 classifiable | 3 hidden

### Step 112: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Outbound Delivery without Order Reference (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This step can be used if the pallets are sent to customer without accompanying with goods. Technically speaking, the delivery type LO does not require an order to be created first before the delivery can take place. This process step shows you how to create outbound delivery without order reference.

#### Prerequisites
You can only send pallets to customer if you own enough of them.

</details>

---

### Step 113: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Outbound Delivery without Order Reference (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Shipping Specialist.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 114: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Outbound Delivery without Order Reference (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Create Outbound Delivery - Without Order Reference(VL01NO).

</details>

**Expected Result (Test Verification):**
> The Create Outbound Delivery without Order Reference screen displays.

---

### Step 115: Enter Shipping Point

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 61 |
| **Activity** | Create Outbound Delivery without Order Reference (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Enter:
  - Shipping Point: <Shipping Point> For example, 5410.

  - Delivery Type: <LO> Delivery w/o Ref.

  - Sales Organization: <Sales Organization> For example, 5410.

  - Distribution Channel: <Distribution Channel>
  - Division: <Division>

</details>

---

### Step 116: Enter Delivery Details

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 62 |
| **Activity** | Create Outbound Delivery without Order Reference (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step handles shipping goods to customers. Think about: how are deliveries scheduled? Do you use a logistics provider? Do you track shipments?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Enter: 
  - Ship-to Party: <Ship-to party> For example, 54100001

  - Planned GI: <Today's Date>
  - Material: <Material number> For example, RP001

  - Deli. Qty: <Quantity to be Delivered> For example, 1

</details>

---

### Step 117: Post Goods Issue

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 63 |
| **Activity** | Create Outbound Delivery without Order Reference (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Post Goods Issue.
Note
Please ignore any pop-up information.

</details>

---


## Activity 19: Additional Information

> 6 steps total | 0 classifiable | 6 hidden

### Step 118: Information

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

### Return Process for Returnable Materials

</details>

---


## Activity 20: Create Pallets Return Sales Order

> 6 steps total | 3 classifiable | 3 hidden

### Step 119: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Pallets Return Sales Order |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This process step shows you how to create a return sales order for pallets.

</details>

---

### Step 120: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Pallets Return Sales Order |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as an Internal Sales Representative.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 121: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Pallets Return Sales Order |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Create Sales Orders - VA01(VA01).

</details>

**Expected Result (Test Verification):**
> The Create Sales Documents screen displays.

---

### Step 122: Enter Sales Document Type

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 64 |
| **Activity** | Create Pallets Return Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Enter:
  - Sales Document Type: <Sales order type> For example, CBG0 (Return pack./empties)

  - Sales organization: <Sales organization>

  - Distribution channel: <Distribution channel>

  - Division: <Division>

</details>

---

### Step 123: Enter Order Details

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 65 |
| **Activity** | Create Pallets Return Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Enter: 
  - Sold-to party: <Sold to party> For example, 54100001

  - Material : <Material number> For example, RP001

  - Order Quantity: <Quantity> For example, 1

</details>

---

### Step 124: Save

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 66 |
| **Activity** | Create Pallets Return Sales Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Save.
Note
Please ignore any pop-up windows.

</details>

**Expected Result (Test Verification):**
> A return delivery document is created as well.

---


## Activity 21: Create Attachment for Sales Order (Optional)

> 2 steps total | 0 classifiable | 2 hidden

### Step 125: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Attachment for Sales Order (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This process step shows you how to upload an attachment for a sales order.

#### Procedure
Test Step #
Test Step Name
Instruction

#### Expected Result
Comments

 | 1
 | Log On
 | Log on to the SAP Fiori launchpad as a Returns and Refund Clerk.
 | The SAP Fiori launchpad displays.
 | 
 | 2
 | Access the App
 | Open Manage Customer Returns(F1708). 
 | The Manage Customer Returnsscreen displays.
 | 
 | 3
 | Navigate to Display Return Order Screen
 | On the Manage Customer Returnsscreen, enter the respective order number created in previous step in the Customer Returnsfield and choose Go.
Choose the return order line that displays. 
 |  | 
 | 4
 | Create Attachment
 | From the top menu bar, choose Services for Objectand Create Attachment.Note
If Services for Objectdoes not display, select Moreto expand the dropdown list. 

 | The Import filescreen displays.
 | 
 | 5
 | Import File
 | Choose OKin the File Uploadpop-up screen.
In the Openview, choose local path and file, and choose Open.
 | The attachment was successfully created.
 | 
 | 6
 | Check Attachment
 | Choose Services for Objecton the top menu bar and choose Attachment List.
Note
If Services for Objectdoes not display, select the Moredropdown list. 
 | Attachment shows up in the Service: Attachment listview.
 |

</details>

---


## Activity 22: Post Goods Receipt

> 22 steps total | 12 classifiable | 10 hidden

### Step 126: Information

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
This process step shows you how to post a goods receipt.

</details>

---

### Step 127: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Post Goods Receipt |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Shipping Specialist.

</details>

---

### Step 128: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Post Goods Receipt |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Manage Outbound Deliveries - VL06O(VL06O_CLOUD).

</details>

**Expected Result (Test Verification):**
> The  Outbound Delivery Monitor screen displays.

---

### Step 129: Choose Goods Issue

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 67 |
| **Activity** | Post Goods Receipt |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose For Goods Issue.

</details>

---

### Step 130: Enter Shipping point

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 68 |
| **Activity** | Post Goods Receipt |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Execute:
  - Shipping point: <Shipping point> For example,5410

</details>

---

### Step 131: Post Goods Receipt

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 69 |
| **Activity** | Post Goods Receipt |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step records when ordered goods physically arrive at your location. Think about: does someone in your warehouse check deliveries against orders? Do you use a system to track this?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Mark the relevant delivery and choose post Good Issue . Select today’s date and choose Continue in the dialog box.

</details>

**Expected Result (Test Verification):**
> The goods receipt is posted

---

### Step 132: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Post Goods Receipt |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Shipping Specialist.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori Launchpad displays.

---

### Step 133: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Post Goods Receipt |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Display Outbound Delivery(VL03N)

</details>

**Expected Result (Test Verification):**
> The Display Outbound Delivery(VL03N) screen displays

---

### Step 134: Issue Delivery Output

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 70 |
| **Activity** | Post Goods Receipt |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step handles shipping goods to customers. Think about: how are deliveries scheduled? Do you use a logistics provider? Do you track shipments?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Display Outbound Delivery(VL03N) screen, enter the Delivery number and click Continue. 
From the Delivery xxxxxxxx Display: Overview screen, choose More  Extras  Delivery Output  Output Control

</details>

**Expected Result (Test Verification):**
> The Delivery: Output screen is displayed.

---

### Step 135: Print Preview

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 71 |
| **Activity** | Post Goods Receipt |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Delivery: Output screen, select the line with the Output Type Delivery Note and choose Display PDF Document.

</details>

**Expected Result (Test Verification):**
> A preview of the print document is displayed.

---

### Step 136: Print Delivery Note

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 72 |
| **Activity** | Post Goods Receipt |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step handles shipping goods to customers. Think about: how are deliveries scheduled? Do you use a logistics provider? Do you track shipments?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

From the preview of the document, choose Print.

</details>

**Expected Result (Test Verification):**
> The delivery note is printed.

---

### Step 137: Information

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

### Printing form

</details>

---

### Step 138: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Post Goods Receipt |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Shipping Specialist.

</details>

---

### Step 139: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Post Goods Receipt |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Manage Outbound Deliveries - VL06O(VL06O_CLOUD).

</details>

**Expected Result (Test Verification):**
> The  Outbound Delivery Monitor screen displays.

---

### Step 140: Choose Goods Issue

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 73 |
| **Activity** | Post Goods Receipt |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose For Goods Issue.

</details>

---

### Step 141: Enter Shipping point

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 74 |
| **Activity** | Post Goods Receipt |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Execute:
  - Shipping point: <Shipping point> For example,5410

</details>

---

### Step 142: Post Goods Receipt

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 75 |
| **Activity** | Post Goods Receipt |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step records when ordered goods physically arrive at your location. Think about: does someone in your warehouse check deliveries against orders? Do you use a system to track this?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Mark the relevant delivery and choose post Good Issue . Select today’s date and choose Continue in the dialog box.

</details>

**Expected Result (Test Verification):**
> The goods receipt is posted

---

### Step 143: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Post Goods Receipt |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Shipping Specialist.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori Launchpad displays.

---

### Step 144: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Post Goods Receipt |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Display Outbound Delivery(VL03N)

</details>

**Expected Result (Test Verification):**
> The Display Outbound Delivery(VL03N) screen displays

---

### Step 145: Issue Delivery Output

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 76 |
| **Activity** | Post Goods Receipt |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step handles shipping goods to customers. Think about: how are deliveries scheduled? Do you use a logistics provider? Do you track shipments?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Display Outbound Delivery(VL03N) screen, enter the Delivery number and click Continue. 
From the Delivery xxxxxxxx Display: Overview screen, choose More  Extras  Delivery Output  Output Control

</details>

**Expected Result (Test Verification):**
> The Delivery: Output screen is displayed.

---

### Step 146: Print Preview

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 77 |
| **Activity** | Post Goods Receipt |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Delivery: Output screen, select the line with the Output Type Delivery Note and choose Display PDF Document.

</details>

**Expected Result (Test Verification):**
> A preview of the print document is displayed.

---

### Step 147: Print Delivery Note

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 78 |
| **Activity** | Post Goods Receipt |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step handles shipping goods to customers. Think about: how are deliveries scheduled? Do you use a logistics provider? Do you track shipments?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

From the preview of the document, choose Print.

</details>

**Expected Result (Test Verification):**
> The delivery note is printed.

---


## Activity 23: Display Pallets Stock

> 24 steps total | 8 classifiable | 16 hidden

### Step 148: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Display Pallets Stock |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

### Purpose
In this activity, you display the pallet stock.

### Procedure

</details>

---

### Step 149: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Display Pallets Stock |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Warehouse Clerk.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 150: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Display Pallets Stock |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Display Stock Overview(MMBE).

</details>

**Expected Result (Test Verification):**
> The Stock Overview: Company Code/plant/Storage Location/Batch screen displays.

---

### Step 151: Enter Material number

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 79 |
| **Activity** | Display Pallets Stock |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries:
  - Material: <Material Number> For example, RP001

  - Plant: <Plant>

  - Display Version: 01

</details>

**Expected Result (Test Verification):**
> The Stock Overview: Basic List screen displays.

---

### Step 152: Choose Execute

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 80 |
| **Activity** | Display Pallets Stock |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Execute.

</details>

---

### Step 153: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Display Pallets Stock |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Note
If you can't find Display Stock Overviewapp, open Show/Hide Group Panel in the SAP Fiori launchpad, choose Tile Catalog, and navigate to Display Stock Overviewunder Material Management - Warehouse Management and add it to My Homegroup.

</details>

---


## Activity 24: Return Process for Returnable Materials (Second Variant)

> 1 steps total | 0 classifiable | 1 hidden

### Step 154: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Return Process for Returnable Materials (Second Variant) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Note
In parallel with chapter Return Process for Returnable Materials, if pallets are returned to your plant without first notifying by customer, execute the following activities.

</details>

---


## Activity 25: Create Outbound Delivery w/o Order Reference

> 6 steps total | 3 classifiable | 3 hidden

### Step 155: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Outbound Delivery w/o Order Reference |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This step can be used if the customer returns the pallet without first notifying the vendor of the return. Technically speaking, the delivery type CBG5 does not require that an order is first created before the return delivery can take place.

#### Prerequisites
You can only return pallets if the customer owns enough of them.

</details>

---

### Step 156: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Outbound Delivery w/o Order Reference |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Shipping Specialist.

</details>

---

### Step 157: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Outbound Delivery w/o Order Reference |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Create Outbound Delivery - Without Order Reference(VL01NO).

</details>

**Expected Result (Test Verification):**
> The Create Outbound Delivery Without Order Reference screen displays.

---

### Step 158: Enter Shipping Point

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 81 |
| **Activity** | Create Outbound Delivery w/o Order Reference |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Enter: 
  - Shipping Point: <Shipping Point> For example, 5410

  - Delivery Type: CBG5Pallet returns

  - Sales Organizaiton: <Sales Organization>For example, 5410

  - Distribution channel: <Distribution Channel>

  - Division: <Division>

</details>

**Expected Result (Test Verification):**
> The Pallet returns Create: Overview screen displays.

---

### Step 159: Enter Delivery Details

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 82 |
| **Activity** | Create Outbound Delivery w/o Order Reference |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step handles shipping goods to customers. Think about: how are deliveries scheduled? Do you use a logistics provider? Do you track shipments?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Enter:
  - Ship-to party: <Ship-to party> For example, 54100001

  - Planned GI: <today's date> Pallet returns

  - Material : <Material Number> For example, RP001

  - Deli.Qty: <Quantity to be returned> For example, 1

</details>

---

### Step 160: Post Goods Receipt

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 83 |
| **Activity** | Create Outbound Delivery w/o Order Reference |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step records when ordered goods physically arrive at your location. Think about: does someone in your warehouse check deliveries against orders? Do you use a system to track this?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Post Goods Receipt(MIGO_GR).
Note
Please ignore any pop-up information.

</details>

---


## Activity 26: Create Attachment for Delivery (Optional)

> 2 steps total | 0 classifiable | 2 hidden

### Step 161: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Attachment for Delivery (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This process step shows you how to create attachment for delivery.

#### Procedure
Test Step #
Test Step Name
Instruction

#### Expected Result
Comments

 | 1
 | Log On
 | Log on to the SAP Fiori launchpad as a Shipping Specialist.
 | The SAP Fiori launchpad displays.
 | 
 | 2
 | Access the App
 | Open Change Outbound Delivery(VL02N).
 | The Display Outbound Delivery: Initialscreen displays.
 | 
 | 3
 | Enter Outbound Delivery Number
 | In the Outbound Deliveryfield, enter <the outbound delivery number created in previous step>and choose Continue.
 | The Display Outbound Delivery xxx: Overviewscreen displays.
 | 
 | 4
 | Create Delivery Attachment
 | Choose Services for Objecton the top right corner of screen, choose Services for Objectand then choose Create Attachment.
 | The File Uploadscreen displays.
 | 
 | 5
 | Import File
 | Choose OKin the File Uploaddialog box.
In the Openview, choose local path and file, and choose Open.
 | The attachment was successfully created.
 | 
 | 6
 | Check Attachment
 | Choose Services for Object, then choose Attachment List.
 | Attachment shows up on Service: Attachment Listscreen.
 |

</details>

---


## Activity 27: Additional Information

> 6 steps total | 0 classifiable | 6 hidden

### Step 162: Information

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
### Billing of Returnable Materials Which Were Not Returned

</details>

---


## Activity 28: Create Pallets Issue Order

> 27 steps total | 14 classifiable | 13 hidden

### Step 163: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Pallets Issue Order |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you create a pallets issue order for unreturned pallets. The customer has not returned one or more pallets. The reason could be that they have been broken or simply forgotten.

</details>

---

### Step 164: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Pallets Issue Order |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log onto the SAP Fiori launchpad as an Internal Sales Representative.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori Launchpad displays.

---

### Step 165: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Pallets Issue Order |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Sales Orders(F1873).

</details>

**Expected Result (Test Verification):**
> The Manage Sales Orders screen displays.

---

### Step 166: Create Sales Order

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 84 |
| **Activity** | Create Pallets Issue Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step creates a customer order in the system. Think about: how do customer orders come in (phone, email, web portal)? What information is captured?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Manage Sales Orders screen, choose Create, then choose Create Sales Order - VA01.

</details>

---

### Step 167: Enter the Order type CCLN (Ret. Packaging Issue)

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 85 |
| **Activity** | Create Pallets Issue Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Create Sales Order: Initial Screen, make the following entries and choose Continue:
Order Type: CCLN
Sales Organization: 5410
Distribution Channel: 10
Division:00

</details>

---

### Step 168: Enter Order Details

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 86 |
| **Activity** | Create Pallets Issue Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Create Sales Order: Overview screen, make the following entries:
Sold to party: For example, 54100001
Ship to party: For example, 54100001
Cust. Reference: <PO number>
Order reason: <Order Reason>
Material Number: <Material number>, for example, RP001
Quantity: <Quantity>

</details>

**Expected Result (Test Verification):**
> PO number: Enter a customer purchase order number as reference
> Order reason : for example, Excellent price
> Quantity: for example, 1 PC

---

### Step 169: Save Document

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 87 |
| **Activity** | Create Pallets Issue Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Save. Make a note of the sales order number: __________. The Delivery document number: __________.
Note
If you have installed the scope item Free Goods Processing in your system and you use material TG11 and customer 54100001, the following warning may appear: Minimum quantity 1.000 PC of free goods has not been reached. To skip this warning, choose Enter.

</details>

**Expected Result (Test Verification):**
> The order is saved and the order confirmation is printed out. Meanwhile，the Delivery document is automatically generated.

---

### Step 170: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Pallets Issue Order |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log onto the SAP Fiori launchpad as an Internal Sales Representative.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori Launchpad displays.

---

### Step 171: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Pallets Issue Order |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Sales Orders(F1873).

</details>

**Expected Result (Test Verification):**
> The Manage Sales Orders screen displays.

---

### Step 172: Search for Sales Order

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 88 |
| **Activity** | Create Pallets Issue Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step creates a customer order in the system. Think about: how do customer orders come in (phone, email, web portal)? What information is captured?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter search term(s) in filter bar and choose Go.
For example, enter sales order number in field Sales Order.

</details>

**Expected Result (Test Verification):**
> Sales order is displayed in result list.

---

### Step 173: Navigate to Sales Order Screen

| | |
|---|---|
| **Type** | `Navigation` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Pallets Issue Order |

**What this step does:**
> This step creates a customer order in the system. Think about: how do customer orders come in (phone, email, web portal)? What information is captured?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Click sales order number and choose Display Sales order.

</details>

**Expected Result (Test Verification):**
> The Display Sales Order xxx: Overview screen displays.

---

### Step 174: Check Output Condition

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 89 |
| **Activity** | Create Pallets Issue Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Display Standard Orders xxx: Overview screen, choose Extras  Output  Header  Edit .

</details>

---

### Step 175: Display Print Preview

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 90 |
| **Activity** | Create Pallets Issue Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Display Standard Orders xxx: Overview screen, choose Header Output Preview.

</details>

**Expected Result (Test Verification):**
> Preview for PDF document displays.

---

### Step 176: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Pallets Issue Order |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

### Printing form

</details>

---

### Step 177: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Pallets Issue Order |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log onto the SAP Fiori launchpad as an Internal Sales Representative.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori Launchpad displays.

---

### Step 178: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Pallets Issue Order |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Sales Orders(F1873).

</details>

**Expected Result (Test Verification):**
> The Manage Sales Orders screen displays.

---

### Step 179: Create Sales Order

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 91 |
| **Activity** | Create Pallets Issue Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step creates a customer order in the system. Think about: how do customer orders come in (phone, email, web portal)? What information is captured?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Manage Sales Orders screen, choose Create, then choose Create Sales Order - VA01.

</details>

---

### Step 180: Enter the Order type CCLN (Ret. Packaging Issue)

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 92 |
| **Activity** | Create Pallets Issue Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Create Sales Order: Initial Screen, make the following entries and choose Continue:
Order Type: CCLN
Sales Organization: 5410
Distribution Channel: 10
Division:00

</details>

---

### Step 181: Enter Order Details

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 93 |
| **Activity** | Create Pallets Issue Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Create Sales Order: Overview screen, make the following entries:
Sold to party: For example, 54100001
Ship to party: For example, 54100001
Cust. Reference: <PO number>
Order reason: <Order Reason>
Material Number: <Material number>, for example, RP001
Quantity: <Quantity>

</details>

**Expected Result (Test Verification):**
> PO number: Enter a customer purchase order number as reference
> Order reason : for example, Excellent price
> Quantity: for example, 1 PC

---

### Step 182: Save Document

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 94 |
| **Activity** | Create Pallets Issue Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Save. Make a note of the sales order number: __________. The Delivery document number: __________.
Note
If you have installed the scope item Free Goods Processing in your system and you use material TG11 and customer 54100001, the following warning may appear: Minimum quantity 1.000 PC of free goods has not been reached. To skip this warning, choose Enter.

</details>

**Expected Result (Test Verification):**
> The order is saved and the order confirmation is printed out. Meanwhile，the Delivery document is automatically generated.

---

### Step 183: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Pallets Issue Order |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log onto the SAP Fiori launchpad as an Internal Sales Representative.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori Launchpad displays.

---

### Step 184: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Pallets Issue Order |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Sales Orders(F1873).

</details>

**Expected Result (Test Verification):**
> The Manage Sales Orders screen displays.

---

### Step 185: Search for Sales Order

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 95 |
| **Activity** | Create Pallets Issue Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step creates a customer order in the system. Think about: how do customer orders come in (phone, email, web portal)? What information is captured?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Enter search term(s) in filter bar and choose Go.
For example, enter sales order number in field Sales Order.

</details>

**Expected Result (Test Verification):**
> Sales order is displayed in result list.

---

### Step 186: Navigate to Sales Order Screen

| | |
|---|---|
| **Type** | `Navigation` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Pallets Issue Order |

**What this step does:**
> This step creates a customer order in the system. Think about: how do customer orders come in (phone, email, web portal)? What information is captured?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Click sales order number and choose Display Sales order.

</details>

**Expected Result (Test Verification):**
> The Display Sales Order xxx: Overview screen displays.

---

### Step 187: Check Output Condition

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 96 |
| **Activity** | Create Pallets Issue Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Display Standard Orders xxx: Overview screen, choose Extras  Output  Header  Edit .

</details>

---

### Step 188: Display Print Preview

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 97 |
| **Activity** | Create Pallets Issue Order |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Display Standard Orders xxx: Overview screen, choose Header Output Preview.

</details>

**Expected Result (Test Verification):**
> Preview for PDF document displays.

---

### Step 189: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Pallets Issue Order |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Note
It can also be navigated to a factsheet screen in app Manage Sales Orders(F1873):
1. On Manage Sales Orders(F1873)screen, enter search terms in filter bar and choose Go.
2. In search result, click your sales order number and choose Display Fact sheet.

</details>

---


## Activity 29: Post Goods Issue

> 11 steps total | 5 classifiable | 6 hidden

### Step 190: Information

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
This process step shows you how to post a goods issue.

</details>

---

### Step 191: Log On

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

**Expected Result (Test Verification):**
> The SAP Fiori Launchpad displays.

---

### Step 192: Access the App

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
> The Change Outbound Delivery(VL02N) screen displays.

---

### Step 193: Change Outbound Delivery

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 98 |
| **Activity** | Post Goods Issue |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step handles shipping goods to customers. Think about: how are deliveries scheduled? Do you use a logistics provider? Do you track shipments?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and Choose Continue.
Outbound Delivery: delivery number created previously

</details>

**Expected Result (Test Verification):**
> The Delivery XXX Change: Overview
> screen displays.

---

### Step 194: Post Good Issue

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 99 |
| **Activity** | Post Goods Issue |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Post Goods Issue

</details>

**Expected Result (Test Verification):**
> The goods issue is posted.

---


## Activity 30: Create Billing Document

> 12 steps total | 8 classifiable | 4 hidden

### Step 195: Information

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

#### Purpose
This process step shows you how to create a billing document.

#### Instructions
### Create Billing Document

</details>

---

### Step 196: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Billing Document |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log onto the SAP Fiori launchpad as a Billing Clerk.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 197: Access the App

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

Open Create Billing Documents(F0798).

</details>

**Expected Result (Test Verification):**
> The Create Billing Document screen displays.

---

### Step 198: Define Billing Setting

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 100 |
| **Activity** | Create Billing Document |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Billing Settings in the right bottom bar.
There are five settings, we should maintain these settings as bellow: 
  - Set billing date and type before billing: ON
  - Create separate billing document for each item of billing due list: OFF
  - Automatically post billing documents: ON
  - Display billing documents after creation: ON
  - Choose delivery items to be billed and select quantities: OFF

</details>

---

### Step 199: Search for Billing List

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 101 |
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
> Sales document(s) will display in the result.

---

### Step 200: Select Item(s) for Billing

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 102 |
| **Activity** | Create Billing Document |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select row(s) of delivery document created previously and choose button Create Billing Documents.

</details>

**Expected Result (Test Verification):**
> There is one window Create Billing Documents(F0798) displaying.

---

### Step 201: Maintain Billing Date

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 103 |
| **Activity** | Create Billing Document |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose billing type Invoice (F2)  and maintain billing date, for example current date, then choose OK button .

</details>

**Expected Result (Test Verification):**
> The draft billing document with ID Sxxxxxxxx will be displayed.

---

### Step 202: Save Billing Document

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 104 |
| **Activity** | Create Billing Document |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Save you entries. Make a note of the billing document number: __________.

</details>

**Expected Result (Test Verification):**
> The system generates an invoice for billing.
> Material : EMPTIES,ND (LEIH)
>  Debited Accounts: 10100001; Rcvbls Domestic DE 1 
> 
> Credited Accounts: 41000000; Revenue Domestic - Product; 22000000; Output tax (MWS)
> Cost Element / CO Object: none

---

### Step 203: Access the App

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

Open Display Billing Document.

</details>

**Expected Result (Test Verification):**
> The Display Billing Document screen displays.

---

### Step 204: Enter Billing Number

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 105 |
| **Activity** | Create Billing Document |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Billing Document(F1901) field, enter the respective invoice number and choose Enter.

</details>

**Expected Result (Test Verification):**
> The Invoice xxx Display: Overview of Billing Items screen displays.

---

### Step 205: Check Output Condition

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 106 |
| **Activity** | Create Billing Document |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Invoice xxx Display: Overview of Billing Items screen choose Menu  Goto  Header  Output.

</details>

**Expected Result (Test Verification):**
> The Invoice XXX Display: Output screen displays.

---

### Step 206: Display Print Preview

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 107 |
| **Activity** | Create Billing Document |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Invoice xxx Display: Output screen select the line already created for the print output and choose Display PDF Document.

</details>

**Expected Result (Test Verification):**
> Preview for PDF document displays.

---


## Activity 31: Create Attachment for Billing (Optional)

> 2 steps total | 0 classifiable | 2 hidden

### Step 207: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Attachment for Billing (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This process step shows you how to create an attachment for a billing document.

#### Procedure
Test Step #
Test Step Name
Instruction

#### Expected Result
Comments

 | 1
 | Log On
 | Log on to the SAP Fiori launchpad as a Billing Clerk.
 | The SAP Fiori launchpad displays.
 | 
 | 2
 | Access the App
 | Open Manage Billing Documents(F0797).
 | The Manage Billing Documentscreen displays.
 | 
 | 3
 | Search Billing
 | Make the following entry, and choose Enter:
Billing Document: <Billing Document Number Created Previously>
 |  | 
 | 4
 | Choose Billing Number
 | On the Manage Billing Documentsscreen, select your billing document created in the previous step, and choose Display.
 | The Billing Documentscreen displays.
 | 

 | 5
 | Edit
 | On the Billing Documentsscreen, choose Edit.
 | 
 | 

 | 6
 | Create Billing Attachment
 | Scroll down and choose Uploadin the ATTACHMENTSsection.
 | The Open Filescreen displays.
 | 
 | 7
 | Import File
 | In the Openwindow, select a local path or file and choose Open.
Choose Save.
 | The attachment is successfully created.
 | 
 | 8
 | Check Attachment
 | In the ATTACHMENTSsection, you can see the uploaded document. Choose the document you want to open.
 |  | 

### Purpose
This process step shows you how to create an attachment for a billing document.

### Procedure
Test Step #
Test Step Name
Instruction
Expected Result
Comments

 | 1
 | Log On
 | Log on to the SAP Fiori launchpad as a Billing Clerk.
 | The SAP Fiori launchpad displays.
 | 
 | 2
 | Access the App
 | Open Manage Billing Documents(F0797).
 | The Manage Billing Documentscreen displays.
 | 
 | 3
 | Search Billing
 | Make the following entry, and choose Enter:
Billing Document: <Billing Document Number Created Previously>
 |  | 
 | 4
 | Choose Billing Number
 | On the Manage Billing Documentsscreen, select your billing document created in the previous step, and choose Display.
 | The Billing Documentscreen displays.
 | 

 | 5
 | Edit
 | On the Billing Documentsscreen, choose Edit.
 | 
 | 

 | 6
 | Create Billing Attachment
 | Scroll down and choose Uploadin the ATTACHMENTSsection.
 | The Open Filescreen displays.
 | 
 | 7
 | Import File
 | In the Openwindow, select a local path or file and choose Open.
Choose Save.
 | The attachment is successfully created.
 | 
 | 8
 | Check Attachment
 | In the ATTACHMENTSsection, you can see the uploaded document. Choose the document you want to open.
 |  |

</details>

---


## Activity 32: Post Incoming Payment

> 2 steps total | 0 classifiable | 2 hidden

### Step 208: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Post Incoming Payment |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Procedure
Complete all activities described in the test script of the scope item: Accounts Receivable(J59) (Chapter Posting Incoming Payments) using the master data from this document.

</details>

---


## Activity 33: Display Pallets Stock

> 24 steps total | 8 classifiable | 16 hidden

### Step 209: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Display Pallets Stock |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This process step shows you how to display the pallet stock.

</details>

---

### Step 210: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Display Pallets Stock |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Warehouse Clerk.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 211: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Display Pallets Stock |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Display Stock Overview(MMBE).

</details>

**Expected Result (Test Verification):**
> The Stock Overview: Company Code/plant/Storage Location/Batch screen displays.

---

### Step 212: Enter Material number

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 108 |
| **Activity** | Display Pallets Stock |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries:
  - Material : <Material Number> For example, RP001

  - Plant: <Plant>

  - Display Version: 01

</details>

**Expected Result (Test Verification):**
> The Stock Overview: Basic List screen displays.

---

### Step 213: Choose Execute

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 109 |
| **Activity** | Display Pallets Stock |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Execute.

</details>

---

### Step 214: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Display Pallets Stock |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Note
If you can't find Display Stock Overviewapp, open Show/Hide Group Panel in the SAP Fiori launchpad, choose Tile Catalog, and navigate to Display Stock Overviewunder Material Management - Warehouse Management and add it to My Homegroup.

</details>

---


## Activity 34: Additional Information

> 6 steps total | 0 classifiable | 6 hidden

### Step 215: Information

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
### Appendix: Process Integration
The process to be tested in this test script is part of a chain of integrated processes. 

### Succeeding Processes
After completing the activities in this test script, you can continue testing the following test scripts:
Scope Item
Business Condition

 | BKK - Sales Order Fulfillment Monitoring and Operations(optional)
 | Complete the following activities:
  - Review Incomplete Sales Orders

  - Review Incomplete SD Documents (deliveries)

  - Review Outbound Deliveries for Goods Issue

  - Review List Blocked (for accounting) Billing Documents)

</details>

---


## Activity 35: Additional Information: Scheduling Job (alternative): Job Scheduling for Delivery Creation (Alternative)

> 7 steps total | 4 classifiable | 3 hidden

### Step 216: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Scheduling Job (alternative): Job Scheduling for Delivery Creation (Alternative) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This process step shows you how to schedule a background job for creating outbound deliveries.
This app can be used as an alternative instead of the manual creation of outbound deliveries.

</details>

---

### Step 217: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Scheduling Job (alternative): Job Scheduling for Delivery Creation (Alternative) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Shipping Specialist.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 218: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Scheduling Job (alternative): Job Scheduling for Delivery Creation (Alternative) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Schedule Delivery Creation(F2228).

</details>

**Expected Result (Test Verification):**
> The Application Jobs screen displays. The app automatically shows the history of application jobs.

---

### Step 219: Create Delivery Creation Schedule

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 110 |
| **Activity** | Additional Information: Scheduling Job (alternative): Job Scheduling for Delivery Creation (Alternative) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step handles shipping goods to customers. Think about: how are deliveries scheduled? Do you use a logistics provider? Do you track shipments?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Create to define a new job.

</details>

**Expected Result (Test Verification):**
> The New Job screen displays. The Job Template should be Schedule Delivery Creation for Sales Orders.

---

### Step 220: Job Parameters

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 111 |
| **Activity** | Additional Information: Scheduling Job (alternative): Job Scheduling for Delivery Creation (Alternative) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Define scheduling options and parameters for the batch job if necessary, then choose Check.

</details>

**Expected Result (Test Verification):**
> The system displays the message Go ahead and schedule the job.

---

### Step 221: Schedule

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 112 |
| **Activity** | Additional Information: Scheduling Job (alternative): Job Scheduling for Delivery Creation (Alternative) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Schedule.

</details>

**Expected Result (Test Verification):**
> A delivery creation job is scheduled. Screen goes back to Application Jobs.

---

### Step 222: Check Delivery Creation Job Log

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 113 |
| **Activity** | Additional Information: Scheduling Job (alternative): Job Scheduling for Delivery Creation (Alternative) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> This step handles shipping goods to customers. Think about: how are deliveries scheduled? Do you use a logistics provider? Do you track shipments?

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Application Jobs screen, after job item’s status turned to Finish, choose Status symbol in the Log column.
Note
Choose the Magnifier, and the job list will refresh.

</details>

**Expected Result (Test Verification):**
> The job log details displays.

---


## Activity 36: Additional Information: Scheduling Job (alternative): Job Scheduling for Goods Issue Deliveries (Alternative)

> 7 steps total | 4 classifiable | 3 hidden

### Step 223: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Scheduling Job (alternative): Job Scheduling for Goods Issue Deliveries (Alternative) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This process step shows you how to schedule a background job for goods issue posting with reference to outbound deliveries. 
This app can be used as an alternative instead of the manual goods issue posting for outbound deliveries.

</details>

---

### Step 224: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Scheduling Job (alternative): Job Scheduling for Goods Issue Deliveries (Alternative) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Shipping Specialist.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 225: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Scheduling Job (alternative): Job Scheduling for Goods Issue Deliveries (Alternative) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Schedule Goods Issue for Deliveries(F2259).

</details>

**Expected Result (Test Verification):**
> The Application Jobs screen displays. The app automatically shows the history of application jobs.

---

### Step 226: Create Goods Issue Deliveries Schedule

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 114 |
| **Activity** | Additional Information: Scheduling Job (alternative): Job Scheduling for Goods Issue Deliveries (Alternative) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose New to define a new job.

</details>

**Expected Result (Test Verification):**
> The New Job screen displays. The Job Template should be defaulted as Schedule goods issue for Deliveries.

---

### Step 227: Job Parameters

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 115 |
| **Activity** | Additional Information: Scheduling Job (alternative): Job Scheduling for Goods Issue Deliveries (Alternative) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Define scheduling options and parameters for the batch job if necessary, then choose Check.

</details>

**Expected Result (Test Verification):**
> The system displays the message Go ahead and schedule the job.

---

### Step 228: Schedule

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 116 |
| **Activity** | Additional Information: Scheduling Job (alternative): Job Scheduling for Goods Issue Deliveries (Alternative) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Schedule.

</details>

**Expected Result (Test Verification):**
> A schedule goods issue for deliveries job is scheduled. The screen goes back to Application Jobs.

---

### Step 229: Check Goods Issue Deliveries Job Log

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 117 |
| **Activity** | Additional Information: Scheduling Job (alternative): Job Scheduling for Goods Issue Deliveries (Alternative) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Application Jobs screen, after job item’s status turned to Finish, choose Status symbol in the Log column. 
Note
Choose the Magnifier, and the job list will refresh.

</details>

**Expected Result (Test Verification):**
> The job log details are displayed.

---


## Activity 37: Additional Information: Scheduling Job (alternative): Job Scheduling for Billing Creation (Alternative)

> 7 steps total | 4 classifiable | 3 hidden

### Step 230: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Scheduling Job (alternative): Job Scheduling for Billing Creation (Alternative) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This process step shows you how to schedule a background job for creation billing documents.
This app can be used as an alternative instead of the manual creation of billing documents.

</details>

---

### Step 231: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Scheduling Job (alternative): Job Scheduling for Billing Creation (Alternative) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Billing Clerk.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 232: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Scheduling Job (alternative): Job Scheduling for Billing Creation (Alternative) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Schedule Billing Creation(F1519).

</details>

**Expected Result (Test Verification):**
> The Application Jobs screen displays. The app automatically shows the history of application jobs.

---

### Step 233: Create Billing Creation Schedule

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 118 |
| **Activity** | Additional Information: Scheduling Job (alternative): Job Scheduling for Billing Creation (Alternative) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Create to define a new job for billing creation.

</details>

**Expected Result (Test Verification):**
> The New Job screen displays. Job Template should default as Schedule Billing Creation.

---

### Step 234: Job Parameters

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 119 |
| **Activity** | Additional Information: Scheduling Job (alternative): Job Scheduling for Billing Creation (Alternative) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Define scheduling options and parameters for the batch job if necessary.
Choose Check.

</details>

**Expected Result (Test Verification):**
> The system displays the message Go ahead and schedule the job.

---

### Step 235: Schedule

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 120 |
| **Activity** | Additional Information: Scheduling Job (alternative): Job Scheduling for Billing Creation (Alternative) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Schedule.

</details>

**Expected Result (Test Verification):**
> A billing creation job is scheduled. Screen goes back to Application Jobs.

---

### Step 236: Check Billing Creation Job Log

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 121 |
| **Activity** | Additional Information: Scheduling Job (alternative): Job Scheduling for Billing Creation (Alternative) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Application Jobs screen, after job item’s status turned to Finish, choose Job Log. 
Note
Choose the Magnifier, and the job list will refresh.

</details>

**Expected Result (Test Verification):**
> The log details display.

---


## Activity 38: Additional Information: Scheduling Job (alternative): Job Scheduling for Billing Release (Alternative)

> 7 steps total | 4 classifiable | 3 hidden

### Step 237: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Scheduling Job (alternative): Job Scheduling for Billing Release (Alternative) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This process step shows you how to schedule a background job for release billing documents to accounting. 
This app can be used as an alternative instead of the manual release to accounting for billing documents.

</details>

---

### Step 238: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Scheduling Job (alternative): Job Scheduling for Billing Release (Alternative) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Billing Clerk.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 239: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Scheduling Job (alternative): Job Scheduling for Billing Release (Alternative) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Schedule Billing Release(F1518).

</details>

**Expected Result (Test Verification):**
> The Application Jobs screen displays. The app automatically shows the history of application jobs.

---

### Step 240: Create Billing Release Schedule

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 122 |
| **Activity** | Additional Information: Scheduling Job (alternative): Job Scheduling for Billing Release (Alternative) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Create to define a new job for billing creation.

</details>

**Expected Result (Test Verification):**
> The New Job screen displays. Job Template defaultly should be Schedule Billing Release.

---

### Step 241: Job Parameters

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 123 |
| **Activity** | Additional Information: Scheduling Job (alternative): Job Scheduling for Billing Release (Alternative) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Define scheduling options and parameters for the batch job if necessary.
Choose Check.

</details>

**Expected Result (Test Verification):**
> The system displays the message Go ahead and schedule the job.

---

### Step 242: Schedule

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 124 |
| **Activity** | Additional Information: Scheduling Job (alternative): Job Scheduling for Billing Release (Alternative) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Schedule.

</details>

**Expected Result (Test Verification):**
> A billing release job is scheduled. Return to Application Jobs.

---

### Step 243: Check Billing Release Job Log

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 125 |
| **Activity** | Additional Information: Scheduling Job (alternative): Job Scheduling for Billing Release (Alternative) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Application Jobs screen, after job item’s status turned to Finish, choose Job Log. 
Note
Choose Magnifier, and the job list will refresh.

</details>

**Expected Result (Test Verification):**
> The log details displays.

---


## Activity 39: Additional Information: Scheduling Job (alternative): Job Scheduling for Billing Output (Alternative)

> 7 steps total | 4 classifiable | 3 hidden

### Step 244: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Scheduling Job (alternative): Job Scheduling for Billing Output (Alternative) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This process step shows you how to schedule a background job for when and how billing documents are sent to customer.

</details>

---

### Step 245: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Scheduling Job (alternative): Job Scheduling for Billing Output (Alternative) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Billing Clerk.

</details>

**Expected Result (Test Verification):**
> The SAP Fiori launchpad displays.

---

### Step 246: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Scheduling Job (alternative): Job Scheduling for Billing Output (Alternative) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Schedule Billing Output(F1510).

</details>

**Expected Result (Test Verification):**
> The Application Jobs screen displays. The app automatically shows the history of application jobs.

---

### Step 247: Create Billing Output Schedule

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 126 |
| **Activity** | Additional Information: Scheduling Job (alternative): Job Scheduling for Billing Output (Alternative) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Create to define a new job for billing creation.

</details>

**Expected Result (Test Verification):**
> The New Job screen displays. Job Template should default as Schedule Billing Output.

---

### Step 248: Job Parameters

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 127 |
| **Activity** | Additional Information: Scheduling Job (alternative): Job Scheduling for Billing Output (Alternative) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Define scheduling options and parameters for the batch job if necessary.
Choose Check.

</details>

**Expected Result (Test Verification):**
> The system displays the message Go ahead and schedule the job.

---

### Step 249: Schedule

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 128 |
| **Activity** | Additional Information: Scheduling Job (alternative): Job Scheduling for Billing Output (Alternative) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Schedule.

</details>

**Expected Result (Test Verification):**
> A billing release job is scheduled. Return to Application Jobs.

---

### Step 250: Check Billing Output Job Log

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 129 |
| **Activity** | Additional Information: Scheduling Job (alternative): Job Scheduling for Billing Output (Alternative) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Application Jobs screen, after job item’s status turned to Finish, choose Job Log.
Note
Choose Magnifier, and the job list will refresh.

</details>

**Expected Result (Test Verification):**
> The log details display.

---


# Appendix: Statistics

| Step Type | Count | Classifiable |
|-----------|-------|-------------|
| Information | 50 | 0 |
| Logon | 32 | 0 |
| Access App | 35 | 0 |
| Data Entry | 28 | 28 |
| Action | 19 | 19 |
| Process Step | 58 | 58 |
| Navigation | 4 | 0 |
| Verification | 24 | 24 |

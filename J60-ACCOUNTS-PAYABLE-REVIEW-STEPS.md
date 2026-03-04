# J60 — Accounts Payable: Complete Review Step Guide

## Overview

| Metric | Count |
|--------|-------|
| **Total steps** | 714 |
| **Steps you review** (classifiable) | 454 |
| **Technical steps hidden by default** | 260 |
| **Activities (sections)** | 86 |
| **Estimated review time** | ~8 hours (at ~1 min/step) |

When a user selects "Accounts Payable" (J60) in Scope Selection and navigates to Review, ABEAM loads the full hierarchy from the SAP Best Practices XLSX test script. Steps are grouped into **86 activities**. Non-classifiable steps (Log On, Access App, Information) are hidden by default — the user sees only the 454 steps requiring their input.

For each classifiable step, the user must choose:
- **Matches** — SAP's standard process fits how we work
- **Needs Adjustment** — We can use SAP but need configuration changes
- **Doesn't Match** — Our process is different, needs a custom solution
- **Not Relevant** — This step doesn't apply to our business

---

## Pre-Review Briefing

Before starting the detailed review, ABEAM shows a briefing page with:

### What happens in accounts payable
When your company receives an invoice from a supplier, it needs to be matched against the purchase order and goods receipt, approved for payment, and scheduled for disbursement. SAP manages this entire flow with three-way matching, payment proposals, and automatic bank file generation.

### What SAP provides
Automated invoice matching (PO, goods receipt, invoice), payment scheduling with configurable terms, multiple payment methods (bank transfer, check, direct debit), dunning management for overdue items, and integration with your bank for electronic payments.

### Questions to discuss before starting
1. How many vendor invoices do you process per month?
2. Do you currently use three-way matching (PO, receipt, invoice)?
3. What payment methods do you use (bank transfer, check, other)?
4. How often do you run payment cycles (daily, weekly, bi-weekly)?
5. Do you have any early payment discount arrangements with vendors?
6. How do you handle invoice exceptions or discrepancies today?

---

## Complete Step-by-Step Breakdown

Legend:
- ✓ = **Classifiable** — user must review and classify this step
- ○ = **Technical** — hidden by default (Log On, Access App, Information, Navigation)

---

### Section 1: Preliminary Setup & Configuration

#### Activity 1: Additional Information
> 4 steps, **0 classifiable** — entirely informational

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1 | INFORMATION | Information | ○ |
| 2 | INFORMATION | Information | ○ |
| 3 | INFORMATION | Information | ○ |
| 4 | INFORMATION | Information | ○ |

#### Activity 2: Define Payment Medium Format Variants (Optional)
> 2 steps, **0 classifiable**

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1 | INFORMATION | Information | ○ |
| 2 | INFORMATION | Information | ○ |

#### Activity 3: BRF+ Settings for Payment Advice
> 25 steps, **22 classifiable** — Configure output rules for payment advice documents

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1 | INFORMATION | Information | ○ |
| 2 | LOGON | Log On | ○ |
| 3 | ACCESS_APP | Access the SAP Fiori App | ○ |
| 4 | PROCESS_STEP | Output Type | ✓ |
| 5 | PROCESS_STEP | Add Rules | ✓ |
| 6 | PROCESS_STEP | Activate | ✓ |
| 7 | PROCESS_STEP | Receiver | ✓ |
| 8 | PROCESS_STEP | Add Rules | ✓ |
| 9 | PROCESS_STEP | Activate | ✓ |
| 10 | PROCESS_STEP | Channel | ✓ |
| 11 | PROCESS_STEP | Add Rules | ✓ |
| 12 | PROCESS_STEP | Activate | ✓ |
| 13 | PROCESS_STEP | Printer Settings | ✓ |
| 14 | PROCESS_STEP | Add Rules | ✓ |
| 15 | PROCESS_STEP | Activate | ✓ |
| 16 | PROCESS_STEP | Email Settings | ✓ |
| 17 | PROCESS_STEP | Add Rules | ✓ |
| 18 | PROCESS_STEP | Activate | ✓ |
| 19 | PROCESS_STEP | Output Relevance | ✓ |
| 20 | PROCESS_STEP | Add Rules | ✓ |
| 21 | PROCESS_STEP | Activate | ✓ |
| 22 | PROCESS_STEP | Form Template | ✓ |
| 23 | PROCESS_STEP | Add Rules | ✓ |
| 24 | PROCESS_STEP | Activate Rules | ✓ |
| 25 | PROCESS_STEP | Email Recipient | ✓ |

#### Activity 4: BRF+ Settings for Supplier Balance Confirmation
> 29 steps, **26 classifiable** — Configure output rules for supplier balance confirmations

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1 | INFORMATION | Information | ○ |
| 2 | LOGON | Log On | ○ |
| 3 | ACCESS_APP | Access the SAP Fiori App | ○ |
| 4 | PROCESS_STEP | Output Type | ✓ |
| 5 | PROCESS_STEP | Add Rules | ✓ |
| 6 | PROCESS_STEP | Activate | ✓ |
| 7 | PROCESS_STEP | Receiver | ✓ |
| 8 | PROCESS_STEP | Add Rules | ✓ |
| 9 | PROCESS_STEP | Activate | ✓ |
| 10 | PROCESS_STEP | Channel | ✓ |
| 11 | PROCESS_STEP | Add Rules | ✓ |
| 12 | PROCESS_STEP | Insert New Row | ✓ |
| 13 | DATA_ENTRY | Enter Details | ✓ |
| 14 | PROCESS_STEP | Activate | ✓ |
| 15 | PROCESS_STEP | Form Template | ✓ |
| 16 | PROCESS_STEP | Add Rules | ✓ |
| 17 | PROCESS_STEP | Activate Rules | ✓ |
| 18 | PROCESS_STEP | Output Relevance | ✓ |
| 19 | PROCESS_STEP | Add Rules | ✓ |
| 20 | PROCESS_STEP | Activate | ✓ |
| 21 | PROCESS_STEP | Printer Settings | ✓ |
| 22 | PROCESS_STEP | Add Rules | ✓ |
| 23 | PROCESS_STEP | Activate | ✓ |
| 24 | PROCESS_STEP | Email Settings | ✓ |
| 25 | PROCESS_STEP | Add Rules | ✓ |
| 26 | PROCESS_STEP | New Row | ✓ |
| 27 | DATA_ENTRY | Enter Details | ✓ |
| 28 | PROCESS_STEP | Activate | ✓ |
| 29 | VERIFICATION | Confirm | ✓ |

#### Activity 5: BRF+ Settings for Item Interest Calculation
> 24 steps, **21 classifiable** — Configure output rules for interest calculation documents

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4–24 | PROCESS_STEP | Determine Output Type / Maintain Business Rules / Activate (repeated for 7 output types) | ✓ ×21 |

#### Activity 6: BRF+ Settings for Payment List
> 21 steps, **18 classifiable** — Configure output rules for payment list documents

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4–21 | PROCESS_STEP | Output Type / Add Rules / Activate (for Receiver, Channel, Printer, Form, Output Relevance) | ✓ ×18 |

#### Activity 7: Add Fields to Items (Optional)
> 9 steps, **6 classifiable** — Extend invoice items with custom fields

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Create New Extension | ✓ |
| 5 | PROCESS_STEP | Create New Extension | ✓ |
| 6 | DATA_ENTRY | Enter Properties | ✓ |
| 7 | PROCESS_STEP | Add Fields | ✓ |
| 8 | ACTION | Save | ✓ |
| 9 | PROCESS_STEP | Publish | ✓ |

#### Activity 8: Maintain Business Users
> 9 steps, **6 classifiable** — Assign AP roles to business users

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Search | ✓ |
| 5 | PROCESS_STEP | Select | ✓ |
| 6 | PROCESS_STEP | Person ID | ✓ |
| 7 | PROCESS_STEP | Assign | ✓ |
| 8 | PROCESS_STEP | Assign | ✓ |
| 9 | ACTION | Save | ✓ |

#### Activity 9: Maintain Business Partner Master Data (eDocument)
> 8 steps, **5 classifiable** — Configure vendor master data for e-invoicing

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Switch to Change mode | ✓ |
| 5 | PROCESS_STEP | Change BP role | ✓ |
| 6 | PROCESS_STEP | Maintain Malaysia Tax numbers | ✓ |
| 7 | ACTION | Save Your Data | ✓ |
| 8 | PROCESS_STEP | Maintain Classification Code for Buyer-Created Invoices (Optional) | ✓ |

#### Activity 10: Maintain Company Code Data (eDocument)
> 4 steps, **3 classifiable**

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1 | INFORMATION | Information | ○ |
| 2 | PROCESS_STEP | Company Code | ✓ |
| 3 | PROCESS_STEP | Create Additional Data | ✓ |
| 4 | ACTION | Save | ✓ |

#### Activity 11: Test Procedures
> 1 step, **0 classifiable** — header info only

---

### Section 2: Vendor Master Data & Payment Preparation

#### Activity 12: Maintain Business Partner (Vendor)
> 15 steps, **12 classifiable** — Set up and manage vendor payment details

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Select Supplier | ✓ |
| 5 | PROCESS_STEP | Select Partner | ✓ |
| 6 | PROCESS_STEP | Change BP role | ✓ |
| 7 | PROCESS_STEP | Edit Supplier | ✓ |
| 8 | PROCESS_STEP | Company Code Data | ✓ |
| 9 | DATA_ENTRY | Enter Accounting Clerk | ✓ |
| 10 | ACTION | Save | ✓ |
| 11 | PROCESS_STEP | Payment Methods | ✓ |
| 12 | PROCESS_STEP | Payment Methods | ✓ |
| 13 | ACTION | Save | ✓ |
| 14 | PROCESS_STEP | Navigation | ✓ |
| 15 | ACTION | Save Supplier | ✓ |

#### Activity 13: Display Supplier List
> 6 steps, **3 classifiable** — View and search vendor master data

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Company Code | ✓ |
| 5 | PROCESS_STEP | Supplier Number | ✓ |
| 6 | PROCESS_STEP | Supplier Number | ✓ |

#### Activity 14: Netting of AR/AP Items (Optional)
> 18 steps, **15 classifiable** — Offset receivables against payables for same business partner

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Select Supplier | ✓ |
| 5 | PROCESS_STEP | Change BP role Supplier | ✓ |
| 6 | PROCESS_STEP | Edit Supplier | ✓ |
| 7 | PROCESS_STEP | General Data | ✓ |
| 8 | PROCESS_STEP | Company Code Data | ✓ |
| 9 | PROCESS_STEP | Payments Vendor | ✓ |
| 10 | PROCESS_STEP | Clearing Vendor | ✓ |
| 11 | ACTION | Save | ✓ |
| 12 | PROCESS_STEP | Change BP role Customer | ✓ |
| 13 | PROCESS_STEP | General Data | ✓ |
| 14 | PROCESS_STEP | General Data | ✓ |
| 15 | PROCESS_STEP | Company Code | ✓ |
| 16 | PROCESS_STEP | Payments Customer | ✓ |
| 17 | PROCESS_STEP | Clearing Customer | ✓ |
| 18 | ACTION | Save | ✓ |

#### Activity 15: Available Amounts for Payment Program (Optional)
> 8 steps, **5 classifiable** — Configure bank account available amounts for payment scheduling

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Company Code | ✓ |
| 5 | PROCESS_STEP | New Entries | ✓ |
| 6 | PROCESS_STEP | House Banks and Account IDs | ✓ |
| 7 | PROCESS_STEP | Delete | ✓ |
| 8 | ACTION | Save | ✓ |

---

### Section 3: Invoice Entry

#### Activity 16: Invoice Entry Without Purchase Order
> 9 steps, **5 classifiable** — Post a vendor invoice that isn't linked to a purchase order

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Dialog Box | ✓ |
| 5 | INFORMATION | General Information | ○ |
| 6 | PROCESS_STEP | G/L Account Items | ✓ |
| 7 | PROCESS_STEP | Account Assignment | ✓ |
| 8 | ACTION | Post | ✓ |
| 9 | PROCESS_STEP | Exit | ✓ |

#### Activity 17: Invoice Entry for One-Time Supplier
> 12 steps, **9 classifiable** — Post an invoice for a vendor you won't use again

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Navigation | ✓ |
| 5 | PROCESS_STEP | Basic Data | ✓ |
| 6 | PROCESS_STEP | Payment | ✓ |
| 7 | PROCESS_STEP | Details | ✓ |
| 8 | PROCESS_STEP | G/L Account Items | ✓ |
| 9 | ACTION | Post | ✓ |
| 10 | PROCESS_STEP | Address and Bank Data | ✓ |
| 11 | PROCESS_STEP | TIN and Phone Number | ✓ |
| 12 | PROCESS_STEP | Exit | ✓ |

#### Activity 18: Park Invoice
> 11 steps, **5 classifiable** — Save an invoice as draft for later posting

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Park | ✓ |
| 5–7 | INFO/LOGON/APP | (technical) | ○ |
| 8 | PROCESS_STEP | New | ✓ |
| 9 | ACTION | Save | ✓ |
| 10 | PROCESS_STEP | Assign | ✓ |
| 11 | ACTION | Save | ✓ |

#### Activity 19: Post Invoice (from parked)
> 14 steps, **8 classifiable** — Approve and post a previously parked invoice

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Search | ✓ |
| 5 | PROCESS_STEP | Select | ✓ |
| 6 | PROCESS_STEP | Edit | ✓ |
| 7 | ACTION | Post | ✓ |
| 8–10 | INFO/LOGON/APP | (technical) | ○ |
| 11 | PROCESS_STEP | New | ✓ |
| 12 | PROCESS_STEP | Activate | ✓ |
| 13 | PROCESS_STEP | Assign | ✓ |
| 14 | PROCESS_STEP | Activate | ✓ |

#### Activity 20: Create Recurring Supplier Invoice
> 13 steps, **9 classifiable** — Set up automatic periodic invoices for regular vendors

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Create | ✓ |
| 5 | INFORMATION | General Information | ○ |
| 6 | PROCESS_STEP | G/L Account Items | ✓ |
| 7 | PROCESS_STEP | More Details | ✓ |
| 8 | PROCESS_STEP | Payment | ✓ |
| 9 | PROCESS_STEP | Recurrence | ✓ |
| 10 | PROCESS_STEP | Create | ✓ |
| 11 | ACTION | Execute | ✓ |
| 12 | ACTION | Execute Until Date | ✓ |
| 13 | PROCESS_STEP | Copy | ✓ |

#### Activity 21: Review Recurring Supplier Invoice
> 8 steps, **5 classifiable**

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Search | ✓ |
| 5 | ACTION | Execute | ✓ |
| 6 | DATA_ENTRY | Enter Data | ✓ |
| 7 | PROCESS_STEP | Details | ✓ |
| 8 | PROCESS_STEP | Edit | ✓ |

#### Activity 22: Schedule Recurring Supplier Invoice Posting
> 9 steps, **6 classifiable** — Automate recurring invoice posting on a schedule

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Create Job | ✓ |
| 5 | PROCESS_STEP | Template Selection | ✓ |
| 6 | PROCESS_STEP | Scheduling Options | ✓ |
| 7 | PROCESS_STEP | Parameters | ✓ |
| 8 | VERIFICATION | Check | ✓ |
| 9 | PROCESS_STEP | Schedule | ✓ |

#### Activity 23: Mass Import for Supplier Invoices
> 11 steps, **8 classifiable** — Bulk upload invoices from spreadsheet

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Download | ✓ |
| 5 | DATA_ENTRY | Enter Details | ✓ |
| 6 | PROCESS_STEP | Upload | ✓ |
| 7 | VERIFICATION | Check | ✓ |
| 8 | VERIFICATION | Review the Log | ✓ |
| 9 | PROCESS_STEP | Correct any Errors | ✓ |
| 10 | PROCESS_STEP | Correct any Errors in Supplier Invoice Application | ✓ |
| 11 | ACTION | Post | ✓ |

---

### Section 4: Invoice Payment Preparation

#### Activity 24: View Supplier Line Items
> 8 steps, **5 classifiable** — Review what you owe each vendor

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Data Entry and Search | ✓ |
| 5 | PROCESS_STEP | Item details | ✓ |
| 6 | PROCESS_STEP | Edit | ✓ |
| 7 | PROCESS_STEP | Edit Line Items | ✓ |
| 8 | ACTION | Save | ✓ |

#### Activity 25: Manage Payment Blocks
> 11 steps, **8 classifiable** — Block or unblock vendors/items from payment

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Search | ✓ |
| 5 | PROCESS_STEP | Select Supplier | ✓ |
| 6 | PROCESS_STEP | Block Supplier | ✓ |
| 7 | DATA_ENTRY | Enter Details | ✓ |
| 8 | PROCESS_STEP | Unblock Supplier | ✓ |
| 9 | PROCESS_STEP | Select Item | ✓ |
| 10 | PROCESS_STEP | Block Item | ✓ |
| 11 | PROCESS_STEP | Unblock Item | ✓ |

#### Activity 26: View Supplier Balance
> 6 steps, **3 classifiable** — Check total amounts owed to a vendor

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Data Entry and Search | ✓ |
| 5 | PROCESS_STEP | View Balances | ✓ |
| 6 | PROCESS_STEP | View Period | ✓ |

---

### Section 5: Payment Run (Automated Batch Payments)

#### Activity 27: Payment Run (header)
> 1 step, **0 classifiable** — informational

#### Activity 28: Schedule Payment Proposals
> 12 steps, **9 classifiable** — Create a batch payment run selecting which invoices to pay

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Create View | ✓ |
| 5 | PROCESS_STEP | Data Entry | ✓ |
| 6 | PROCESS_STEP | Data Entry | ✓ |
| 7 | PROCESS_STEP | Single Invoice (Optional) | ✓ |
| 8 | ACTION | Save the Parameters | ✓ |
| 9 | PROCESS_STEP | Schedule Proposal | ✓ |
| 10 | PROCESS_STEP | Data Entry | ✓ |
| 11 | PROCESS_STEP | View the Proposal | ✓ |
| 12 | PROCESS_STEP | Display | ✓ |

#### Activity 29: Revise Payment Proposal
> 9 steps, **6 classifiable** — Edit the payment proposal before execution

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Go | ✓ |
| 5 | PROCESS_STEP | Select Identification | ✓ |
| 6 | PROCESS_STEP | Edit Payment (Optional) | ✓ |
| 7 | PROCESS_STEP | Make Entries (Optional) | ✓ |
| 8 | PROCESS_STEP | Payment List | ✓ |
| 9 | PROCESS_STEP | Exceptions | ✓ |

#### Activity 30: Release Payment Proposal
> 15 steps, **12 classifiable** — Approve and execute the payment batch

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Go | ✓ |
| 5 | PROCESS_STEP | Proposal Processing | ✓ |
| 6 | PROCESS_STEP | Select Proposal | ✓ |
| 7 | PROCESS_STEP | Schedule Payment | ✓ |
| 8 | PROCESS_STEP | View the payment | ✓ |
| 9 | ACTION | View Log postings | ✓ |
| 10 | PROCESS_STEP | Close Dialog | ✓ |
| 11 | PROCESS_STEP | Payments and Exceptions | ✓ |
| 12 | PROCESS_STEP | Navigation | ✓ |
| 13 | PROCESS_STEP | Payments | ✓ |
| 14 | PROCESS_STEP | Payment List | ✓ |
| 15 | PROCESS_STEP | Payments Navigation | ✓ |

#### Activity 31: Mass Reverse Payment Run (Optional)
> 8 steps, **5 classifiable** — Undo an entire payment batch

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Create Job | ✓ |
| 5 | PROCESS_STEP | Template Selection | ✓ |
| 6 | PROCESS_STEP | Scheduling Options | ✓ |
| 7 | PROCESS_STEP | Parameters | ✓ |
| 8 | PROCESS_STEP | Schedule | ✓ |

#### Activity 32: View Payment List
> 5 steps, **2 classifiable** — View executed payment batches

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Selection | ✓ |
| 5 | ACTION | Execute | ✓ |

#### Activity 33: Payment Plans
> 14 steps, **9 classifiable** — Create payment schedules (installment plans)

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Create View | ✓ |
| 5 | INFORMATION | General Information | ○ |
| 6 | PROCESS_STEP | Selections | ✓ |
| 7 | PROCESS_STEP | Payment Schedule | ✓ |
| 8 | PROCESS_STEP | Create | ✓ |
| 9 | PROCESS_STEP | Activate | ✓ |
| 10 | PROCESS_STEP | Exit | ✓ |
| 11 | NAVIGATION | Background Job | ○ |
| 12 | PROCESS_STEP | Search | ✓ |
| 13 | PROCESS_STEP | Job Details | ✓ |
| 14 | ACTION | Payment Run | ✓ |

---

### Section 6: Single Payments (Manual)

#### Activity 34: Single Outgoing Payment (header)
> 1 step, **0 classifiable** — informational

#### Activity 35: Create Single Outgoing Payment (Indirect)
> 9 steps, **6 classifiable** — Pay a single vendor from open items

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Data Entry and Search | ✓ |
| 5 | PROCESS_STEP | Select | ✓ |
| 6 | PROCESS_STEP | Choose Create Manual Payment | ✓ |
| 7 | PROCESS_STEP | Data Entry | ✓ |
| 8 | PROCESS_STEP | Create | ✓ |
| 9 | PROCESS_STEP | Payment | ✓ |

#### Activity 36: Create Single Payment (Direct)
> 9 steps, **5 classifiable** — Create a payment directly to a vendor

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | INFORMATION | General Information | ○ |
| 5 | PROCESS_STEP | Supplier Details | ✓ |
| 6 | PROCESS_STEP | House Bank Details | ✓ |
| 7 | PROCESS_STEP | Payment Details | ✓ |
| 8 | PROCESS_STEP | Create the payment | ✓ |
| 9 | VERIFICATION | Review Payment | ✓ |

---

### Section 7: Online Payments

#### Activity 37: Free Form Payment Request
> 11 steps, **8 classifiable** — Create an ad-hoc payment not linked to an invoice

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Create | ✓ |
| 5 | PROCESS_STEP | Type | ✓ |
| 6 | PROCESS_STEP | Business Partner | ✓ |
| 7 | PROCESS_STEP | Payee | ✓ |
| 8 | ACTION | Posting Data | ✓ |
| 9 | PROCESS_STEP | House Bank | ✓ |
| 10 | PROCESS_STEP | Payment Data | ✓ |
| 11 | PROCESS_STEP | Create the Payment | ✓ |

#### Activity 38: Review or Edit Free Form Payment Request
> 7 steps, **4 classifiable**

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Search | ✓ |
| 5 | PROCESS_STEP | Request | ✓ |
| 6 | PROCESS_STEP | Edit (Optional) | ✓ |
| 7 | ACTION | Post | ✓ |

#### Activity 39: Process Free Form Payment
> 8 steps, **5 classifiable** — Execute and release an ad-hoc payment

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Search | ✓ |
| 5 | PROCESS_STEP | Select | ✓ |
| 6 | ACTION | Post | ✓ |
| 7 | PROCESS_STEP | Release | ✓ |
| 8 | PROCESS_STEP | Log | ✓ |

#### Activity 40: Post Outgoing Payment (Manual Online)
> 10 steps, **5 classifiable** — Manual payment posting with open item selection

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | INFORMATION | General Information | ○ |
| 5 | PROCESS_STEP | Open Item Selection | ✓ |
| 6 | PROCESS_STEP | Select/Deselect | ✓ |
| 7 | ACTION | Post | ✓ |
| 8 | PROCESS_STEP | Display | ✓ |
| 9 | NAVIGATION | Back | ○ |
| 10 | PROCESS_STEP | Dismiss notification | ✓ |

---

### Section 8: Payment Approval

#### Activity 41: Payment Approval (header)
> 1 step, **0 classifiable** — informational

#### Activity 42: Bank Payment Approval (Optional, Cash Management)
> 1 step, **0 classifiable** — informational

#### Activity 43: Approval by First Approver
> 11 steps, **8 classifiable** — First-level payment approval workflow

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Maintain Filters | ✓ |
| 5 | VERIFICATION | Review Payment Batch and Items | ✓ |
| 6 | PROCESS_STEP | Select Batch to be Approved | ✓ |
| 7 | PROCESS_STEP | Approve | ✓ |
| 8 | PROCESS_STEP | (Optional) Undo Approval | ✓ |
| 9 | VERIFICATION | Submit Reviewed Batch | ✓ |
| 10 | PROCESS_STEP | Submit Verification Token (Optional) | ✓ |
| 11 | VERIFICATION | Check Batch Status and Next Approver | ✓ |

#### Activity 44: Rejection
> 1 step, **0 classifiable** — informational

#### Activity 45: Approval by Second Approver
> 10 steps, **7 classifiable** — Second-level payment approval

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Maintain Filters | ✓ |
| 5 | VERIFICATION | Review Payment Batch and Items | ✓ |
| 6 | PROCESS_STEP | Select Batch to be Approved | ✓ |
| 7 | PROCESS_STEP | Approve | ✓ |
| 8 | VERIFICATION | Submit Reviewed Batch | ✓ |
| 9 | PROCESS_STEP | Submit Verification Token (Optional) | ✓ |
| 10 | VERIFICATION | Check Batch Status | ✓ |

---

### Section 9: Payment Media & Advices

#### Activity 46: Create Payment Media
> 1 step, **0 classifiable** — informational

#### Activity 47: Print or Email Payment Advice
> 13 steps, **10 classifiable** — Generate and send payment notifications to vendors

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Go | ✓ |
| 5 | PROCESS_STEP | View Payment | ✓ |
| 6 | PROCESS_STEP | Payments | ✓ |
| 7 | PROCESS_STEP | Select | ✓ |
| 8 | PROCESS_STEP | Open Payment Item | ✓ |
| 9 | PROCESS_STEP | Output Items | ✓ |
| 10 | VERIFICATION | Preview | ✓ |
| 11 | PROCESS_STEP | Print | ✓ |
| 12 | PROCESS_STEP | Email | ✓ |
| 13 | PROCESS_STEP | Close | ✓ |

#### Activity 48: Schedule Payment Advices (Optional)
> 10 steps, **7 classifiable** — Automate payment advice generation

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Create Job | ✓ |
| 5 | PROCESS_STEP | Template Selection | ✓ |
| 6 | PROCESS_STEP | Scheduling Options | ✓ |
| 7 | PROCESS_STEP | Parameters | ✓ |
| 8 | VERIFICATION | Check | ✓ |
| 9 | PROCESS_STEP | Schedule | ✓ |
| 10 | VERIFICATION | Review | ✓ |

---

### Section 10: Correspondence

#### Activity 49: Correspondence
> 18 steps, **12 classifiable** — Send letters and communications to vendors

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Data Entry | ✓ |
| 5 | PROCESS_STEP | Supplier Information | ✓ |
| 6 | PROCESS_STEP | Actions | ✓ |
| 7–9 | INFO/LOGON/APP | (technical) | ○ |
| 10 | PROCESS_STEP | Select Journal Entry | ✓ |
| 11 | PROCESS_STEP | Manage Journal Entry | ✓ |
| 12 | PROCESS_STEP | Correspondence | ✓ |
| 13 | PROCESS_STEP | Entry View | ✓ |
| 14 | PROCESS_STEP | Actions | ✓ |
| 15 | PROCESS_STEP | Exit | ✓ |
| 16 | PROCESS_STEP | Ledger View | ✓ |
| 17 | PROCESS_STEP | Parameters | ✓ |
| 18 | PROCESS_STEP | Actions | ✓ |

---

### Section 11: Error Correction

#### Activity 50: Reset Cleared Items
> 7 steps, **4 classifiable** — Undo a clearing (payment matching) that was done incorrectly

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Search | ✓ |
| 5 | ACTION | Execute | ✓ |
| 6 | PROCESS_STEP | Reset | ✓ |
| 7 | PROCESS_STEP | Continue | ✓ |

#### Activity 51: Reset and Reverse Cleared Items
> 8 steps, **5 classifiable** — Undo a clearing AND reverse the accounting postings

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Search | ✓ |
| 5 | PROCESS_STEP | Process | ✓ |
| 6 | PROCESS_STEP | Reset and Reverse | ✓ |
| 7 | PROCESS_STEP | Make Entries | ✓ |
| 8 | PROCESS_STEP | Continue | ✓ |

---

### Section 12: Down Payments

#### Activity 52: Create Down Payment Request
> 8 steps, **5 classifiable** — Request an advance payment to a vendor

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Create | ✓ |
| 5 | DATA_ENTRY | Enter Header Data | ✓ |
| 6 | DATA_ENTRY | Enter Items Data | ✓ |
| 7 | ACTION | Post | ✓ |
| 8 | PROCESS_STEP | Other | ✓ |

#### Activity 53: Create Down Payment Request with Workflow
> 1 step, **0 classifiable** — informational

#### Activity 54: Create Team (for approval workflow)
> 8 steps, **4 classifiable** — Set up an approval team

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Create | ✓ |
| 5 | INFORMATION | General Information | ○ |
| 6 | PROCESS_STEP | Team Owners | ✓ |
| 7 | PROCESS_STEP | Team Members | ✓ |
| 8 | ACTION | Save | ✓ |

#### Activity 55: Create Workflow (for down payment approval)
> 10 steps, **7 classifiable** — Configure approval workflow

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Create | ✓ |
| 5 | PROCESS_STEP | Header | ✓ |
| 6 | PROCESS_STEP | Properties | ✓ |
| 7 | PROCESS_STEP | Workflow Step 1 | ✓ |
| 8 | PROCESS_STEP | Workflow Step 2 | ✓ |
| 9 | PROCESS_STEP | Activate | ✓ |
| 10 | PROCESS_STEP | Order | ✓ |

#### Activity 56: Create Supplier Down Payment Request for Approval
> 6 steps, **3 classifiable**

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Create | ✓ |
| 5 | PROCESS_STEP | Submit | ✓ |
| 6 | PROCESS_STEP | Display | ✓ |

#### Activity 57: Process Down Payment Request Approval
> 10 steps, **7 classifiable** — Approve/reject a down payment request

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Selection | ✓ |
| 5 | PROCESS_STEP | Log | ✓ |
| 6 | PROCESS_STEP | Comments (optional) | ✓ |
| 7 | PROCESS_STEP | Other (optional) | ✓ |
| 8 | PROCESS_STEP | Approve | ✓ |
| 9 | PROCESS_STEP | Submit | ✓ |
| 10 | PROCESS_STEP | View | ✓ |

#### Activity 58: Post Down Payment
> 7 steps, **4 classifiable** — Execute the advance payment

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | DATA_ENTRY | Enter Payment Data | ✓ |
| 5 | PROCESS_STEP | Select More | ✓ |
| 6 | PROCESS_STEP | Select/Deselect | ✓ |
| 7 | ACTION | Post | ✓ |

#### Activity 59: Down Payment — Invoice Entry
> 1 step, **0 classifiable** — informational

#### Activity 60: Down Payment — Post Outgoing Payment
> 7 steps, **4 classifiable** — Pay the remaining balance after down payment

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | DATA_ENTRY | Enter Payment Data | ✓ |
| 5 | PROCESS_STEP | Select/Deselect | ✓ |
| 6 | PROCESS_STEP | Allocate | ✓ |
| 7 | ACTION | Post | ✓ |

#### Activity 61: Clear Open Items (Down Payment)
> 11 steps, **8 classifiable** — Match down payment against final invoice

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Clear Open Items | ✓ |
| 5 | DATA_ENTRY | Enter Supplier Information | ✓ |
| 6 | PROCESS_STEP | Filter | ✓ |
| 7 | PROCESS_STEP | Journal Entry Type | ✓ |
| 8 | PROCESS_STEP | Select More | ✓ |
| 9 | PROCESS_STEP | Open Item Selection | ✓ |
| 10 | PROCESS_STEP | Simulate (Optional) | ✓ |
| 11 | ACTION | Post | ✓ |

---

### Section 13: Interest Calculation (Optional)

#### Activity 62: Schedule Interest Calculation Jobs
> 10 steps, **7 classifiable** — Calculate interest on overdue vendor balances

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Create Job | ✓ |
| 5 | PROCESS_STEP | Template Selection | ✓ |
| 6 | PROCESS_STEP | Scheduling Options | ✓ |
| 7 | PROCESS_STEP | Parameters | ✓ |
| 8 | PROCESS_STEP | View Report | ✓ |
| 9 | PROCESS_STEP | View Report | ✓ |
| 10 | ACTION | Run Actual Report | ✓ |

#### Activity 63: Manage Interest Runs
> 8 steps, **4 classifiable**

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | DATA_ENTRY | Enter Criteria | ✓ |
| 5 | PROCESS_STEP | View Interest Document | ✓ |
| 6 | NAVIGATION | Back | ○ |
| 7 | ACTION | Reverse Interest Runs (Optional) | ✓ |
| 8 | PROCESS_STEP | Resend Interest Letter (Optional) | ✓ |

#### Activity 64: Display Interest Runs
> 5 steps, **2 classifiable**

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | DATA_ENTRY | Enter Criteria | ✓ |
| 5 | PROCESS_STEP | View Interest Document | ✓ |

---

### Section 14: Guarantees

#### Activity 65: Guarantees Received
> 10 steps, **4 classifiable** — Track bank guarantees from vendors

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Create | ✓ |
| 5 | DATA_ENTRY | Enter Details | ✓ |
| 6–8 | INFO/LOGON/APP | (technical) | ○ |
| 9 | DATA_ENTRY | Enter Details | ✓ |
| 10 | PROCESS_STEP | Reverse | ✓ |

---

### Section 15: Periodic Activities

#### Activity 66: Check Open Balances
> 1 step, **0 classifiable** — informational

#### Activity 67: Create Supplier Balance Confirmation
> 9 steps, **6 classifiable** — Generate and send balance confirmation letters to vendors

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Create Job | ✓ |
| 5 | PROCESS_STEP | Template Selection | ✓ |
| 6 | PROCESS_STEP | Scheduling Options | ✓ |
| 7 | PROCESS_STEP | Parameters | ✓ |
| 8 | VERIFICATION | Check | ✓ |
| 9 | PROCESS_STEP | Schedule | ✓ |

#### Activity 68: Manage Supplier Balance Confirmations
> 8 steps, **5 classifiable**

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Search | ✓ |
| 5 | PROCESS_STEP | Select from List | ✓ |
| 6 | VERIFICATION | Preview | ✓ |
| 7 | PROCESS_STEP | Resend | ✓ |
| 8 | PROCESS_STEP | Status | ✓ |

#### Activity 69: Print Supplier Balance Confirmation
> 7 steps, **4 classifiable**

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Search | ✓ |
| 5 | PROCESS_STEP | Selection | ✓ |
| 6 | VERIFICATION | Preview | ✓ |
| 7 | PROCESS_STEP | Print | ✓ |

---

### Section 16: Reporting & Analytics

#### Activity 70: Accounts Payable Overview
> 5 steps, **1 classifiable** — Dashboard view of your AP status

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Edit Criteria | ✓ |
| 5 | NAVIGATION | Navigate to Options | ○ |

#### Activity 71: Days Payable Outstanding
> 8 steps, **5 classifiable** — Analyze how long you take to pay vendors

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Navigation | ✓ |
| 5 | PROCESS_STEP | Detailed Analysis | ✓ |
| 6 | PROCESS_STEP | Selection | ✓ |
| 7 | ACTION | Save | ✓ |
| 8 | PROCESS_STEP | Open | ✓ |

#### Activity 72: Overdue Payables
> 4 steps, **1 classifiable** — View invoices past their due date

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Navigation | ✓ |

#### Activity 73: Future Payables
> 4 steps, **1 classifiable** — Project upcoming payment obligations

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Navigation | ✓ |

#### Activity 74: Cash Discount Forecast
> 4 steps, **1 classifiable** — Predict available cash discounts

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Navigation | ✓ |

#### Activity 75: Cash Discount Utilization
> 4 steps, **1 classifiable** — Track how well you're capturing early payment discounts

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Navigation | ✓ |

#### Activity 76: Invoice Processing Analysis
> 4 steps, **1 classifiable** — Analyze invoice processing efficiency

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Navigation | ✓ |

#### Activity 77: Invoice Processing Time
> 4 steps, **1 classifiable** — Track how long invoices take to process

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Navigation | ✓ |

#### Activity 78: Aging Analysis
> 4 steps, **1 classifiable** — Analyze payables by age bucket

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Navigation | ✓ |

#### Activity 79: Aging Report for Accounts Payable
> 4 steps, **1 classifiable** — Detailed AP aging report

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Filter Selection | ✓ |

#### Activity 80: Automatic and Manual Payments Analysis
> 4 steps, **1 classifiable** — Compare automated vs manual payment volumes

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Navigation | ✓ |

#### Activity 81: Supplier Payments Analysis
> 4 steps, **1 classifiable** — Analyze payment patterns by supplier

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Navigation | ✓ |

#### Activity 82: Display Item Change Log
> 6 steps, **3 classifiable** — View audit trail of changes to AP items

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Select | ✓ |
| 5 | PROCESS_STEP | Results | ✓ |
| 6 | PROCESS_STEP | Exit | ✓ |

---

### Section 17: E-Invoicing & Tax

#### Activity 83: eDocument Cockpit
> 15 steps, **10 classifiable** — Manage electronic invoices (e-invoicing compliance)

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Select eInvoice Document | ✓ |
| 5 | PROCESS_STEP | Submit eInvoice | ✓ |
| 6 | VERIFICATION | Review status | ✓ |
| 7 | PROCESS_STEP | Display eDocument | ✓ |
| 8 | PROCESS_STEP | Display Source Document | ✓ |
| 9 | NAVIGATION | Back | ○ |
| 10 | VERIFICATION | Review History of eDocument | ✓ |
| 11 | NAVIGATION | Back | ○ |
| 12 | VERIFICATION | Review Application Log | ✓ |
| 13 | PROCESS_STEP | Message Dashboard | ✓ |
| 14 | PROCESS_STEP | Cancel eDocument | ✓ |
| 15 | PROCESS_STEP | Delete eDocument | ✓ |

#### Activity 84: Generic Withholding Tax Report
> 5 steps, **2 classifiable** — Generate tax withholding reports

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Data Entry | ✓ |
| 5 | ACTION | Execute Report | ✓ |

---

### Section 18: Appendix & Monitoring

#### Activity 85: Display Process Flow Accounts Payable
> 6 steps, **3 classifiable** — View the end-to-end AP process flow diagram

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Data Entry | ✓ |
| 5 | VERIFICATION | Review | ✓ |
| 6 | PROCESS_STEP | Exit | ✓ |

#### Activity 86: Monitor Payments
> 7 steps, **4 classifiable** — Track payment batch status and approver assignment

| # | Type | Step | Classify? |
|---|------|------|-----------|
| 1–3 | INFO/LOGON/APP | (technical) | ○ |
| 4 | PROCESS_STEP | Find the Newly Created Batch | ✓ |
| 5 | VERIFICATION | Verify the Batch Status | ✓ |
| 6 | VERIFICATION | Check Details | ✓ |
| 7 | VERIFICATION | Check Approver | ✓ |

---

## Summary by Business Area

| Business Area | Activities | Classifiable Steps | Key Decision |
|---------------|-----------|-------------------|--------------|
| **Setup & BRF+ Configuration** | 1–11 | 107 | Do you need custom output rules for payment documents? |
| **Vendor Master Data** | 12–15 | 35 | How do you manage vendor payment details and netting? |
| **Invoice Entry** | 16–23 | 55 | How do invoices arrive? PO-based, non-PO, recurring, bulk upload? |
| **Payment Preparation** | 24–26 | 16 | How do you review and block/unblock payments? |
| **Payment Run** | 27–33 | 43 | How often do you run payments? What approval is needed? |
| **Single Payments** | 34–40 | 33 | Do you make ad-hoc or manual payments? |
| **Payment Approval** | 41–45 | 15 | Do you need 1-level or 2-level payment approval? |
| **Payment Media & Advices** | 46–48 | 17 | Do you send payment advice to vendors? Print or email? |
| **Correspondence** | 49 | 12 | What vendor communications do you send? |
| **Error Correction** | 50–51 | 9 | How do you handle payment errors and reversals? |
| **Down Payments** | 52–61 | 42 | Do you make advance payments to vendors? |
| **Interest Calculation** | 62–64 | 13 | Do you calculate interest on overdue vendor balances? |
| **Guarantees** | 65 | 4 | Do you track bank guarantees from vendors? |
| **Periodic Activities** | 66–69 | 15 | Do you send balance confirmations to vendors? |
| **Reporting** | 70–82 | 19 | Which AP analytics dashboards do you need? |
| **E-Invoicing & Tax** | 83–84 | 12 | Do you need e-invoicing compliance? Withholding tax? |
| **Appendix & Monitoring** | 85–86 | 7 | Process flow visualization and payment monitoring |

**Total: 86 activities, 454 classifiable steps**

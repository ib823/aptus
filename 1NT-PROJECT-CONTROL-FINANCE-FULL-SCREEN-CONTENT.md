# 1NT — Project Control - Finance: Complete Screen-by-Screen Content

> **What the user sees on every screen in the review flow.**
> This document reproduces the exact content shown in the ABEAM assessment tool when a user reviews 1NT (Project Control - Finance). For each step it shows the step title, type badge, business context explanation, the full SAP technical reference content (normally collapsed), expected results, and activity context — exactly as rendered on screen.

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
| Total steps | 147 |
| Classifiable (shown by default) | 58 |
| Hidden by default | 89 |
| Unique activities | 36 |

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
| Project Financial Controller
 | SAP_BR_PROJ_FIN_CONTROLLER | Project Control - Finance | SAP_BR_PROJ_FIN_CONTROLLER | 
 | 
Configuration Expert - Business Process Configuration | SAP_BR_BPC_EXPERT | Business Process Configuration/ Business Configuration - Feature Management/ Business Process Configuration - Workflow/ Manage your Solution/ Business Process Configuration - Extensibility Explorer/ Business Process Configuration - Finance/ Business Process Configuration - Procurement/ Business Configuration - Transportation | SAP_BR_BPC_EXPERT/ SAP_CA_SPT_BPC_FM_PC/ SAP_CA_SPT_BPC_WORKFLOW_PC/ SAP_CA_SPT_IC_LND_BASE_PC/ SAP_EI_SPT_BPC_EXT_PC/ SAP_FIN_SPT_BPC_EXPERT_PC/ SAP_MM_SPT_BIZ_PROC_CONFIGN_PC/ SAP_TM_SPT_TRANSPCFG_PC | 

 | General Ledger Accountant
 | SAP_BR_GL_ACCOUNTANT | General Ledger | SAP_BR_GL_ACCOUNTANT | 
 | Cost Accountant - Overhead
 | 
SAP_BR_OVERHEAD_ACCOUNTANT | Overhead Accounting | SAP_BR_OVERHEAD_ACCOUNTANT | 
 | Analytics Specialist
 | 
SAP_BR_ANALYTICS_SPECIALIST | Analytics/ Analytics | SAP_CA_SPT_ANALYTICS_PC/ SAP_CORE_SPT_ANALYTICS_PC | 
 | Business Process Specialist
 | SAP_BR_BUSINESS_PROCESS_SPEC | Business Process Management/ Business Process Management | SAP_BR_BUSINESS_PROCESS_SPEC/ SAP_CA_SPT_BPS_PC | 

### Master Data, Organizational Data, and Other Data
The organizational structure and master data of your company has been created in your system during activation. The organizational structure reflects the structure of your company. The master data represents materials, customers, and vendors, for example, depending on the operational focus of your company.
Use your own master data or the following sample data to go through the test procedure.
Data
Sample Value
Details
Comments

 | Controlling Area 
 | A000
 | Controlling Area A000 | 
 | Company Code
 | 5410
 | Company Code 5410
 | 
 | Plant
 | 5410
 | Plant 1 MY
 | 
 | Cost Center
 | 54101501
54101601
54101321
 | R&D Cost center
Marketing Cost Center
Services/Consltg
 | 
 | Activity Types
 | 8
 | Consulting
 | 
 | Cost Rate
 | Actual and planned cost rates are maintained for the following combination of cost centers and activity types:
  - Cost centers: 54101321, 54101101

Activity types: 8
 |  | Cost Rates are defined time-dependent

 | G/L Account
 | 61005000
 | Trav. Expense – Ground transportation
 | 
 | Continued | 61007000
 | Trav. Expense – Airfare, Rail, Mileage
 | 
 | Continued | 61003000
 | Travel Expenses – Hotel and Accommodation
 | 
 | Continued | 61008000
 | Travel Expenses – Miscellaneous
 | 
 | Continued | 10010000
 | Petty Cash
 | 
 | Profit Center
 | YB600
YB110
 | Shared Services
Product A
 | 
 | Functional Area
 | YB25
YB75
 | Consulting/Services
Other expenses
 | 

You can find general information on how to create master data objects in the following Master Data Scripts (MDS):
Master Data Script ReferenceMDS
Description

 | 3KW
 | Create CO Cost Rates

 | BHD
 | Create Purchasing Info Record
 | BNG
 | Create G/L Account and Cost Element
 | BNH
 | Create Profit Center
 | BNI
 | Create Asset
 | BNM
 | Create Cost Center and Cost Center Group
 | BNN
 | Create Activity Type and Activity Type Group

### Business Conditions
Before this scope item can be tested, the following business conditions must be met.
Scope Item ID
Business Condition

 | 4RF - Project Control - Resourcing and Procurement
 | To plan demand of consumables or services for the project, the Project Control - Resourcing and Procurement(4RF) scope item must be activated.

 | J62- Asset AccountingAsset Accounting
 | To perfom the step 'Release Projects' for Investment Project, you need to execute the step 'Year End Closing' of the Asset Accounting(J62)test script to define the asset accounting specific company code settings.

 |  | 
 | BNI - Create Asset
 | During the execution of this scope item, asset master records will be created for assets under construction and the assets to which final settlement is performed. To create the assets, use the Create Asset(BNI) master data script using the data specified in this test script.
 | BNA- Period-End Closing - ProjectsPeriod-End Closing - Projects
 | To execute the settlement related activities for the project, the Period-End Closing - Projects(BNA)scope item must be activated.
 | 3F7 - Joint Venture Accounting
 | To execute the joint venture attributes in the project, the Joint Venture Accounting(3F7) scope item must be activated.

 | 1NJ - 
 | To enable notifications for business users with the Project Financial Controller role, you need to define teams and their responsibilities. To define teams and their responsibilities, the (1NJ) scope item must be activated.

 | 31N - Situation Handling
 | To monitor budget threshold for the project, you need to configure the situation type using a template. To be able to do that, the Situation Handling(31N) scope item must be activated.

### Preliminary Steps

### Setting Up Custom Fields for Project (Optional)

### Purpose
In this step, you can maintain custom fields in the project header section.

### Procedure
To execute this activity, carry out the relevant steps from the Key User Extensibilitytopic in the Extend and Integrate Your SAP S/4HANA Cloud Public Editionguide to create and maintain custom fields that can be used to enhance applications.
The Business Context to be used is Project Header and Project Element.

#### Roles
Create business roles using the following business role templates delivered by SAP and assign them to your individual test users.Name (Role Template)
ID (Role Template)
Name (Launchpad Space)
ID (Launchpad Space)

#### Instructions
### Purpose

### Overview
For many purposes, companies run projects to plan and coordinate the work, staff employees, and track project progress and costs. In this scenario, a Work Breakdown Structure (WBS) as an accounting structure is created. Planned project costs (uploaded by the project financial controller) can be captured in SAP Analytics Cloud. After releasing all or part of the project, the project is executed. Time can be recorded, and project-related purchasing can be performed. In finance, allocations or general journal entries can be done with regard to project WBS elements. The project financial controller monitors the project costs through overview pages and detailed project reporting. At period end, depending on the type of project, different period-end closing activities such as overhead application or settlement can be executed for a project. Afterwards, the financial controller completes and closes project parts and then closes the complete project.
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
In this activity, you can maintain, check and update the actual cost rates.

#### Procedure
Test Step #Test Step NameInstructionExpected Result
 | 1
 | Log on
 | Log on to the Fiori Launchpad as a Cost Accountant - Overhead
 |  | 
 | 2
 | Access the SAP Fiori App
 | Open Manage Cost Rates- Services(F3161)
 | The Manage Cost Rates - Services screen is displayed.
 | 
 | 3
 | Check Actual Cost Rates
 | Make the following entries and choose Go.
Company Code: 5410
Valid On: Today
Cost Center: 54101321and 54101101
Activity Type: 8
Currency: MYR
Check if there is a valid cost rate for given cost center, activity type, and period.
 | The actual cost rates for given cost centre, activity type and period are checked for valid values.
Note
You can skip the next step if there is a valid cost rate for given cost center, activity type, and period.
 | 
 | 4
 | Maintain Additional Actual Cost Rates
 | Choose Addand make the following entries:
Company Code:5410
Cost Center: 54101321
Activity Type: 8
WBS Element: <this is an optional entry>
From Fiscal Year: Current Year
From Period: Current Period
Rate: 100
Currency: MYR
Per:1
Activity Unit: H
Choose Save.
 | The pop-up screen Create Cost Rates-Company Code 5410appears.
Additional cost rates are created.
 | 
 | 4
 | Maintain Additional Actual Cost Rates
 | Choose Addand make the following entries:
Company Code:5410
Cost Center: 54101101
Activity Type: 8
WBS Element: <this is an optional entry>
From Fiscal Year: Current Year
From Period: Current Period
Rate: 100
Currency: MYR
Per:1
Activity Unit: H
Choose Save.
 | The pop-up screen Create Cost Rates-Company Code 5410appears.
Additional cost rates are created.
 |

#### Instructions
### Maintain Cost Rates

### Maintain Financial Statement Versions

### Procedure
To execute this activity, run the preliminary step Maintain Financial Statement Versionsfrom the Period-End Closing - Projects(BNA)test script. 

### Create Project Coding Mask
Note
If you are planning to use project coding mask for your projects, remember the following:
  - You need to define the coding key before you create the project and determine exactly what your coding mask should be.

  - Coding mask cannot be created if project with same key already exists.

  - Coding mask once created can be deleted, if a project with the same key does not exist.

With Define Project Coding Mask, you will be able to define the Coding Keys which determine the naming/nomenclature of the projects created in the scope items, namely, 1NT- Project Control - Finance, 35E- Project Control – Research and Development Projectsand 35F- Project Control – Capital Projects. The usage of Project Coding Mask is not supported for the scope items such as J11- Customer Project Management - Project-Based Servicesand 1A8- Internal Project Management - Project-Based Services.

### Purpose
The Define Project Coding Maskapp is used to create the coding mask for the project structure. The coding mask applies to the external identification of project definitions as well as WBS elements. 

### Procedure
Depending on your configuration environment for SAP S/4HANA Cloud Public Edition, choose one of the following options:
Configure Your Solution:
Test Step #Test Step NameInstructionExpected Result
 | 1 | Log on
 | Log on to the Fiori Launchpad as a 
Configuration Expert - Business Process Configuration |  | 
 | 2 | Access the SAP Fiori App
 | Open Manage Your Solution(F1241).
 | The Manage Your Solutionscreen is displayed.
 | 
 | 3 | Navigate to Project Coding Mask SSCUI
 | Choose the link Configure Your Solution.
Make the following entries:
Application Area: Enterprise Portfolio & Project Management
Sub Application Area: Project Financials Control
Click on the line item displayed in the Configuration Itemssection 
Select Define Project Coding Maskand choose Configure
 | The Change View "Project Number Editing'': Overview screen is displayed.
 | 
 | 4 | Create a Coding Mask Entry
 | Perform the following actions to create the coding mask:Choose New Entries
Enter the following details:
PrjID: A
Coding mask: /XXXXXX-00
Description: Test Coding Mask for Key A
Lck: <Select/Deselect>
Choose Save.
Note
  - This step is optional.

  - Once the coding mask is created, deletion is not possible.

  - You cannot create commercial or internal projects in the project services processes, namely:   - Customer Project Management (J11) 

  - Internal Project Management (1A8) 

that begins with any coding key defined for coding masks.

 | Project Coding Mask will be saved. 
 | 

SAP Central Business Configuration:
Test Step #Test Step NameInstructionExpected Result
 | 1 | Log on
 | Log on to the project experience in SAP Central Business Configuration.
 |  | 
 | 2 | Navigate to Project Coding Mask SSCUI
 | Go to the Business Processes Configurationapp. To locate the activity in the tree view, search for the following activity: Define Project Coding Mask.
Choose Open Documentationfor the found line item to see more details about this configuration activity.
Choose the link to navigate directly to the SAP S/4HANA Cloud Public Editionsystem. Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration.
 | The Change View "Project Number Editing": Overview screen is displayed.
 | 
 | 3 | Create a Coding Mask Entry
 | Perform the following actions to create the coding mask:Choose New Entries
Enter the following details:
PrjID: A
Coding mask: /XXXXXX-00
Description: Test Coding Mask for Key A
Lck: <Select/Deselect>
Choose Save.
Note
  - This step is optional.

  - Once the coding mask is created, deletion is not possible.

  - You cannot create commercial or internal projects in the project services processes, namely:   - Customer Project Management (J11) 

  - Internal Project Management (1A8) 

that begins with any coding key defined for coding masks.

 | Project Coding Mask will be saved. 
 |

</details>

---

### Step 3: Information

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
Project Type is generally used to group or classify projects, it is primarily used for the reporting. The Create Project Types for WBS Elementsapp is used to create the project type.

#### Procedure
Depending on your configuration environment for SAP S/4HANA Cloud Public Edition, choose one of the following options:
Configure Your Solution:
Test Step #
Test Step Name
Instruction
Expected Result

 | 1 | Log on
 | Log on to the Fiori Launchpad as a Configuration Expert - Business Process Configuration.
 |  | 

 | 2 | Access App
 | Open Manage Your Solution(F1241).
 | The Manage Your Solution screen is displayed.
 | 

 | 3 | Navigate to Create Project Types for WBS Elements SSCUI
 | Choose the link Configure your solution.
Make the following entries
Application Area: Enterprise Portfolio & Project Management
Sub Application Area: Project Financials Control
Click on the line item displayed in the worklist section 
Select Create Project Types for WBS Elementsand choose Configure
 | The Create Project Types for WBS Elements app is displayed.
 | 

 | 4 | Create a Project Type

 | Perform the following actions to create the project type:
Choose New Entries
Enter the details as mentioned in the following example :
Example
Typ: RD
Description: RD Projects
Choose Save.
 | Project Type is saved.
 | 

SAP Central Business Configuration:
Test Step #
Test Step Name
Instruction
Expected Result

 | 1 | Log on
 | Log on to the project experience in SAP Central Business Configuration. 
 |  | 

 | 2 | Open Create Project Types for WBS Elements SSCUI
 | Go to the Business Processes Configurationapp. To locate the activity in the tree view, search for the following activity: Create Project Types for WBS Elements.
Choose Open Documentationfor the found line item to see more details about this configuration activity.
Choose the link to navigate directly to the SAP S/4HANA Cloud Public Editionsystem. Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration.
 |  | 

 | 3 | Create a Project Type

 | Perform the following actions to create the project type:
Choose New Entries
Enter the details as mentioned in the following example :
Example
Typ: RD
Description: RD Projects
Choose Save.
 | Project Type is saved.
 |

#### Instructions
### Create Project Types for WBS Elements (Optional)
Note
This is an optional step. Before creating a Project Type, you must consider the following guidelines.
The Project Type key is unique. Determine exactly what your Project Type key should be as you cannot edit/delete project type key once created.
Project Type does not influence program control or screen selection, instead, it is used as a filtering criteria for projects.

</details>

---

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

#### Purpose
The Maintain Budget Availability Profileapp is used to create the Budget Availability control profile.

#### Prerequisites
If you intend to use Project Budget, make sure that you activate the non-standard scope item Predictive Commitments Management(2I3) which is a prerequisite for budgeting. Once activated, commitment management ledger 0E is active and applicable for all company codes and countries/regions. These commitments are updated in Extension Ledger 0E (predelivered) in ACDOCA table. Commitments are reduced by various business transactions such as goods receipt. The default content for Project Budgeting utilizes profiles PS001 and you can either update this profile or create your own profile via SSCUI Maintain Budget Availability Control Profile for Projects. 
Ensure that you perform the Preliminary Stepsof this document to update the following: 
  - Maintain Financial statement YPS2 
  - Tag ACT_COST which is mandatory for G/Ls relevant for Budget check. Note that currently Commitment/Budget do not work for Purchase order without material. 
  - Maintain Financial Statement Visions (FSV)
  - Assign Semantic Tags for FSV 
  - Set Report Relevancy 
  - Replicate Runtime Hierarchy. Make sure G/Ls relevant for Budget are part of this structure. 
To view commitments in the report, an open purchase order and/or requisition must exist. For details on creating purchase orders, refer to Consumable Purchasing (BNX).

#### Procedure
Depending on your configuration environment for SAP S/4HANA Cloud Public Edition, choose one of the following options:
Configure Your Solution:
Test Step #
Test Step Name
Instruction
Expected Result

 | 1 | Log on
 | Log on to the Fiori Launchpad as a Configuration Expert - Business Process Configuration.
 | 
 | 

 | 2 | Access the SAP Fiori App
 | Open Manage Your Solution(F1241).
 | The Manage Your Solutionscreen is displayed.
 | 

 | 3 | Navigate to Maintain Budget Availability Control Profile for Projects
 | Choose the link Configure your solution.
Make the following entries:
Application Area:Finance
Sub Application Area:Overhead Cost Management
Click on the line item with Item Name Budget Management from the worklist section.
Select Maintain Budget Availability Control Profile for Projects and choose Configure
 | The Maintain Budget Availability Profileapp is displayed.
 | 

 | 4 | Create an Availability Control Profile Entry
 | Perform the following actions to create the availability control profile:
Choose New Entries
Enter the details similar to the following example:
Example
Profile: ZS001
Availy Ctrl Type: Project System
Budget Availy Ctrl: Profile Name : Default Bdgt Availability prfl
Time Range: Annual Budget / Overall Budget
Budget Currency: Global Currency/Project Currency
Press Enter.
Note
  - Overall Budgetneeds to be selected if you want to perform the budget check across Fiscal years whereas Annual Budgetneeds to be selected if you want to perform the check per Fiscal year.

  - Gobal Currencyneeds to be selected if you want to calculate the financials at controlling area level whereas Project Currencyneeds to be selected if you want to check financials at project level.

For this newly created Availability Control Profile, maintain the Semantic Tags and Tolerance Limits.
Select the AVC profile and choose Semantic Tags and maintain entries as shown in the following example:
Choose New Entries
Example
Sem. Tag: ACT_COST
Semantic Tag Name: Actual Cost
% of Budget used Before First Notification: 80%
% Increment for Further Notifications: 5%
Press Enter.
Select the Semantic tag and choose Tolerance Limitsand maintain entries as shown in the following example:
Choose New Entries
Example
Acty Grp: All Activity Groups
MsgType: Warning/Error
%: 90.00
Press Enter.
Choose Save.
 |  | 

SAP Central Business Configuration:
Test Step #
Test Step Name
Instruction
Expected Result

 | 1 | Log on
 | Log on to the project experience in SAP Central Business Configuration.
 | 
 | 

 | 2 | Navigate to Maintain Budget Availability Profile SSCUI
 | Go to the Business Processes Configurationapp. To locate the activity in the tree view, search for the following activity: Maintain Budget Availability Profile using Self Service.
Choose Open Documentationfor the found line item to see more details about this configuration activity.
Choose the link to navigate directly to the SAP S/4HANA Cloud Public Editionsystem. Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration.
 | The Maintain Budget Availability Profilescreen is displayed.
 | 

 | 3 | Create an Availability Control Profile Entry
 | Perform the following actions to create the availability control profile:
Choose New Entries
Enter the details similar to the following example:
Example
Profile: ZS001
Availy Ctrl Type: Project System
Budget Availy Ctrl: Profile Name : Default Bdgt Availability prfl
Time Range: Annual Budget / Overall Budget
Budget Currency: Global Currency/Project Currency
Press Enter.
Note
  - Overall Budgetneeds to be selected if you want to perform the budget check across Fiscal years whereas Annual Budgetneeds to be selected if you want to perform the check per Fiscal year.

  - Gobal Currencyneeds to be selected if you want to calculate the financials at controlling area level whereas Project Currencyneeds to be selected if you want to check financials at project level.

For this newly created Availability Control Profile, maintain the Semantic Tags and Tolerance Limits.
Select the AVC profile and choose Semantic Tags and maintain entries as shown in the following example:
Choose New Entries
Example
Sem. Tag: ACT_COST
Semantic Tag Name: Actual Cost
% of Budget used Before First Notification: 80%
% Increment for Further Notifications: 5%
Press Enter.
Select the Semantic tag and choose Tolerance Limitsand maintain entries as shown in the following example:
Choose New Entries
Example
Acty Grp: All Activity Groups
MsgType: Warning/Error
%: 90.00
Press .
Choose Save.
 |  |

#### Instructions
### Maintain Budget Availability Profile using Self Service Configuration (SSC) UI app (Optional)
Note
This is an optional step. Before creating a Budget Availability Profile, you must consider the following guidelines.
There are various restrictions when you try to change the budget availability control settings. If commitments or actual costs are already posted, you can no longer activate the checks.

</details>

---


## Activity 2: Additional Information: Manage Teams and Responsibilities for Projects (Optional)

> 5 steps total | 2 classifiable | 3 hidden

### Step 5: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Manage Teams and Responsibilities for Projects (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this procedure, you define teams which are responsible for handling multiple projects across organisations.Note
For details on the process of setting up teams and Setting Up (1NJ)guide.

You can also define your own   - Map Function Profiles to Standard Team Category
  - Classify Functions for Standard Team Category
  - Map Custom 
  - Define Team Types

</details>

---

### Step 6: Log on

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Manage Teams and Responsibilities for Projects (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on on to the SAP Fiori launchpad as a Business Process Specialist.

</details>

---

### Step 7: Access the App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Manage Teams and Responsibilities for Projects (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Manage Teams and Responsibilities(F2412) .
Choose Create.

</details>

**Expected Result (Test Verification):**
> The Team screen is displyed.

---

### Step 8: Maintain the Team details

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 1 |
| **Activity** | Additional Information: Manage Teams and Responsibilities for Projects (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following entries and choose Save:
In the General Information tab:
  - Name: Team_EPPM

  - Description:Team of EPPM

  - Status: Enabled

  - Type:SEPPM_PFC

In the Team Members tab:
Choose  + Add, and maintain the following values:
  - Business Partner: use the search function to find the business partner of Project Financial Controller

  - Functions: Project Financial Controller

</details>

---

### Step 9: Create the team

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 2 |
| **Activity** | Additional Information: Manage Teams and Responsibilities for Projects (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Create.

</details>

**Expected Result (Test Verification):**
> The team is created

---


## Activity 3: Additional Information: Manage Situation Types (Optional)

> 6 steps total | 4 classifiable | 2 hidden

### Step 10: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Manage Situation Types (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
To monitor budget threshold for the project, you need to configure the situation type. In this procedure, you configure the situation type by using template.Note
For details on situations and the process to set up situation types, see the Setting Up Situation Handling(31N)guide.

</details>

---

### Step 11: Log on

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Additional Information: Manage Situation Types (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Configuration Expert - Business Process Configuration

</details>

---

### Step 12: Open Manage Situation Types

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 3 |
| **Activity** | Additional Information: Manage Situation Types (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Situation Types(F2947) app.

</details>

**Expected Result (Test Verification):**
> The Manage Situation Types screen is displayed.

---

### Step 13: Select the Template to Copy

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 4 |
| **Activity** | Additional Information: Manage Situation Types (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Situation Templates section, enter the ID EPPM_PROJBUDGETTHRESHOLDEXCEEDED and choose Go.Select EPPM_PROJBUDGETTHRESHOLDEXCEEDED, then choose Copy.

</details>

**Expected Result (Test Verification):**
> The Situation Type screen is displayed.

---

### Step 14: Maintain the Situation

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 5 |
| **Activity** | Additional Information: Manage Situation Types (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Instructions
Make the following entries and choose Save:
Admin InformationID: <ID Name>
Name: <ID Description>
Example
ID: Z_BUDGET THRESHOLD
Name: Budget Consumption Situation
Situation Display
Short Description:
Details:
Notification:
Resend Notifications: YES
Conditions
Maintain the values against the corresponding attributes/ filters to configure the conditions and use this function.
Recipients
: Choose Create and maintain the team created through the 'Manage Teams and Responsibilities' app and maintain the value Project Financial Controller in the field Member Functions if you intend to send notifications triggered by the situation Management to the Project Financial Controller, who is part of central project management team responsible for multiple projects.
: Choose and select "Get the Project Responsible users (Project Financial Controller and Project Manager)" shown in the Rule list if you intend to trigger notifications to the project specific team defined in the project brief application.

</details>

**Expected Result (Test Verification):**
> The situation type is maintained

---

### Step 15: Enable The Situation Type

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 6 |
| **Activity** | Additional Information: Manage Situation Types (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Enable, it will change from NO to YES.

</details>

---


## Activity 4: Test Procedures

> 1 steps total | 0 classifiable | 1 hidden

### Step 16: Information

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


## Activity 5: Create Project

> 10 steps total | 5 classifiable | 5 hidden

### Step 17: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Project |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you can create projects of the following type based on the business requirement, with the project definition and WBS element using the Fiori app Project Control - Enterprise Projects(F3215):
  - Overhead Project

  - Investment Project

  - Project with Revenue

  - Statistical Project

Overhead Projectsprofile is used to support the planning and monitoring of project-related costs ranging from simple, internal order such as projects to hierarchical projects accounting structures, such as R&D projects. The user can plan and post costs for the project, monitor the project, and finally close the project. Overhead projects allow the settlement of costs to different G/L accounts and costs centers based on the settlement rule created. 
Investment projectsprofile is used in Capital Investment scenarios with the purpose of supporting companies to manage and control the enterprise-wide project related investments. Capital Investment projects are used to capture the costs of assets under construction (AuC) during the construction phase and create the final asset once this phase is completed. Capital investment Projects are mostly undertaken by asset and product centric companies. 
Projects with Revenueallows revenue G/L journal entries postings after release. The profitability segment characteristics can be maintained in the settlement rule, however running the settlement is not required anymore due to the direct attribution of cost postings.
Statistical projectsare used for statistical cost postings and project cost reporting purposes only. Therefore, in statistical projects, no overhead calculations or settlements can be executed. At the WBS element level, you must set the cost center to which the costs are actually posted by default.
For hierarchical project accounting requirements, you can also create a hierarchical project structure by calling up the Project Planning application from the Project Control app.

</details>

---

### Step 18: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Project |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori Launchpad as a Project Financial Controller.

</details>

---

### Step 19: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Project |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Project Control - Enterprise Projects(F3215).

</details>

**Expected Result (Test Verification):**
> The Project Control screen is displayed.

---

### Step 20: Create Project: Definition

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 7 |
| **Activity** | Create Project |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Create.
Make entries as shown in the following example in the Header and General Information sections:
Header
Example
Project Name: Overhead Project
Project ID:  O.000001
Project Profile: Overhead Project
Planned Start: Today (MM/dd/yyyy)
Planned Finish: Today + 3 months (MM/dd/yyyy)
General information:
Responsible Cost Center: <Example:54101501(R&D)>
Profit Center: <YB600 (Shared Services)>
Project Currency: MYR(Automatically filled based on the cost center) Note
You can specify the currency at project level different from controlling area currency, to run project specific financial reports.

Project Manager : the Project Manager ID
Priority: the priority suitable for project
Project Type: Project Type created in Create Project Types for WBS Elements (Optional)
Attachments: Choose Upload to upload project relevant documents from your local drive. Note
To rename the existing attachment, choose the Edit icon present next to the attachment and change the file name according to the requirement and choose Rename.

Choose Create.
A success message tells you that the project is created.

</details>

**Expected Result (Test Verification):**
> Project is created with the provided definition parameters.
> WBS Element ID: <O.000001>
> Project Name: <Overhead Project>

---

### Step 21: Add Values to the Project

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 8 |
| **Activity** | Create Project |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Once the project is created, from the header section, choose Edit.
Make the following entries:
General Information
Plant: 5410
Functional Area: YB75 (Other expenses)
Control
Investment Profile: Example: 000001 - Model with AuC, summary settlement Note
The investment profile field is relevant only for investment projects and the profile can be selected based on the business requirement. 
If you need settlement to multiple AuCs, select investment profile YS0001 - Model for AuC per source structure/assignment.

Costing Sheet: 5410PI
The following are optional entries, maintain them according to your requirements.
Budget Availability Control Profile: Select the Budget Availability Profile created using SSCUI as mentioned in Preliminary Step (Maintain Budget Availability Profile using Self Service Configuration (SSC) UI app (Optional)) Example
ZS001

Note
If project currency is maintained, you can assign an availability control profile where the budget currency is maintained as Global Currency or Project Currency
If project currency is not maintained, you can only assign an availability control profile where the budget currency is maintained as Global Currency.
Budget Availability Control Profile is Active: Selected
  - You can define your own budget availability control profile using the Maintain Budget Availability Profile SSCUI.

  - As soon as you have planned budget for your project and activated the budget availability control, the hierarchy changes are no longer possible.

Note
You would be able to see Joint Venture (JV) attributes under the section Joint Venture Accounting during project creation, if the Joint Venture accounting functionality has been activated in the system. For the detailed explanation on JV attributes, you can refer to the scope item 3F7-Joint Venture Accounting.
Block Functions
Time Recording: <Selected/Not Selected>
Activity Allocation: <Selected/Not Selected>
Purchasing: <Selected/Not Selected>
Concur Expense Posting: <Selected/Not Selected>
Other Expense Posting: <Selected/Not Selected>Note
  -  Setting up the block functions at Project Header level will not impact the complete project hierarchy.

  - The Block functions need to be set at the individual Work Package level to enable the functionality.

  - Even if the user blocks purchasing for a WBS Element, the system can still generate purchasing documents if the account assignment category in the purchase document is "Q" (Project Make-to-Order) and the account is associated with that WBS Element.
To resolve this issue, refer to the following Knowledge Base Article (KBA) note and apply the resolution mentioned in it. https://me.sap.com/notes/3459521

Choose Save.
A system message tells you that the project has been saved.

</details>

**Expected Result (Test Verification):**
> Project updates with all the provided parameters.Note
> In case you have entered a budget availability control profile and activated the budget availability control, all postings resulting into commitments or actual costs will be checked against the available budget of the work packages used as account assignment object. In case the work package itself does not have any budget, the next higher level budget carrying work package will be used for the budget availability check. Depending on the tolerance limits defined for the availability control profile, the system can raise warning or error messages. Depending on the Time Range defined for the availability control profile, you will be able to check the budget consumption for a particular fiscal year or across fiscal years. This setting is valid for all kind of expense postings and expected expense postings (for example, purchase requisition or purchase orders) to a work package. Warning messages from budget availability check are not shown in case of automatic periodic postings and certain goods movement.

---

### Step 22: Update settlement rule to Project. (Only Applicable for Project with Revenue)

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 9 |
| **Activity** | Create Project |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
From the header section, choose Settlement Rule.
On the Maintain Settlement Rule: Overview screen, make the following entries:
Cat: PSG
Choose Enter.
Maintain the required information and choose Continue.
Choose Save and then Back.

</details>

**Expected Result (Test Verification):**
> The Program WBS_SETTLEMENT screen appears with the system message that the Settlement Rule is saved

---

### Step 23: Navigate to Project Planning

| | |
|---|---|
| **Type** | `Navigation` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Project |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Once the project is created, from the header section, choose Related Apps. A pop-up screen appears
From the pop-up screen, select Project Planning to go to the Project Planning app. Note
By default, the project will open in the Display mode. To edit the project, choose Edit.

</details>

**Expected Result (Test Verification):**
> The Project Planning app is opened and you can make further entries.

---

### Step 24: Create WBS Elements under Project

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 10 |
| **Activity** | Create Project |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Project Structure view, select Project WBS created in the above step, and choose Create.
ID: <Example: O.0000011>
Name: WBS Element for project planning
Profit Center: <This data is pre-populated from the first WBS level>
Responsible Cost Center: <This data is pre-populated from first WBS level>
Planned Start: Today
Planned Finish: Today + 3 months
In the Project Structure view, select the project created in the above step, and choose Create .
ID: <Example: O.0000012>
Name: WBS Element for project execution
Profit Center: <This data is pre-populated from the first work package level>
Responsible Cost Center: <This data is pre-populated from first workpackage level>
Planned Start: Today
Planned Finish: Today + 3 months
Create WBS element structure based on your requirements.Note
You can also create WBS Elements by making use of the Copy functionality available in the Project Planing Application.

You can also include WBS Elements of another project by making use of the Include functionality available in the project planning application (while including the WBS Elements, the existing demands and settlement rules of the source WBS Element are not included).

</details>

**Expected Result (Test Verification):**
> Project with WBS Element structure is updated with the provided parameters.

---

### Step 25: Save Project Structure

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 11 |
| **Activity** | Create Project |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Save.

</details>

**Expected Result (Test Verification):**
> Project with WBS Element structure is saved

---

### Step 26: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Project |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Note
By following the above procedure, you can also create projects such as the Investment Project, Project with Revenue and Statistical Project based on the business requirement by selecting the appropriate project profiles and their respective project attributes as mentioned in the following table:

Project Attributes Overview: 
 | Project Name
 | Project ID
 | Project Profile
 | Responsible Cost Centre
 | Profit Center
 | Functional Area

 | Investment Project
 | I.000001
 | Investment Project (YP02)
 | 54101301(Manufacturing 1) | YB110 (Product A)
 | YB75(Other expenses)

 | Project with Revenue 
 | R.000001
 | Project with Revenue (YP05)
 | 54101501(R&D)
 | YB600 (Shared Services)
 | YB25 (Consulting/Services)

 | Statistical Project
 | S.000001
 | Statistical Project (YP04)
 | 54101501(R&D)
 | YB600 (Shared Services)
 | YB75(Other expenses)

</details>

---


## Activity 6: Create Project Using Copy Functionality (Optional)

> 4 steps total | 1 classifiable | 3 hidden

### Step 27: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Project Using Copy Functionality (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you can create an overhead project by copying the WBS element structure from the existing project.

</details>

---

### Step 28: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Project Using Copy Functionality (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori Launchpad as a Project Financial Controller.

</details>

---

### Step 29: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Create Project Using Copy Functionality (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Project Control - Enterprise Projects(F3215).

</details>

**Expected Result (Test Verification):**
> The Project Control screen is displayed.

---

### Step 30: Create Project

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 12 |
| **Activity** | Create Project Using Copy Functionality (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Standard section, make the following entries and choose Go.
Project : <Refer the respective Project created in the chapter Create Project >
Example
O.000001 (for Overhead Project)

Select the project displayed in the list view and choose Copy
 Make the following entries in the Copy Project pop-up screen:
Project ID:O.000XX (For Example:O.00002)
Project Name:Overhead Project
Planned Start:Today
OR 
Planned Finish:Today + 3 months
Also Copy
 Demand:<Example: Selected>
Settlement Rule:<Example: Selected>
Note
You can choose the Demand and Settlement Rule check boxes if you would like to copy the existing demands and settlement rule from the source project
 Choose Copy
Note
You can either maintain the Planned Start or the Planned Finish Dates, but not both of them.

In the Project Overview screen, the details of the reference project is displayed. Make changes if required.
Choose Save

</details>

**Expected Result (Test Verification):**
> Project is created with the provided definition parameters.
> WBS Element ID: O.000XX
> Description: Overhead Project.

---


## Activity 7: Project Review (Optional)

> 1 steps total | 0 classifiable | 1 hidden

### Step 31: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Project Review (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, the Project Financial Controllersends a notification to the Project Managerabout the project created and also reminds the Project Managerabout the upcoming steering commitee meetings during the later stages of the project.

#### Procedure
To execute this activity, perform the steps in Project Review(1YF) test script, using the project from this document

</details>

---


## Activity 8: Update Project (Optional)

> 1 steps total | 0 classifiable | 1 hidden

### Step 32: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Update Project (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you can make changes to the projects based on the business requirement,using the Fiori apps Project Control and Mass Changes to Projects.
You can modify project attributes such as the Profit Center, Cost Center and Project dates/timelines for single or multiple projects by making use of the following mentioned application:
  - Mass Changes to Projects

</details>

---


## Activity 9: Mass Changes to Projects and Work Packages (Optional)

> 5 steps total | 2 classifiable | 3 hidden

### Step 33: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Mass Changes to Projects and Work Packages (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you can edit the project attributes such as Profit Center, Responsible Cost Center and Project Manager for the project. You can make the changes either for a single project or multiple projects in a single instance.

</details>

---

### Step 34: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Mass Changes to Projects and Work Packages (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori Launchpad as a Project Financial Controller.

</details>

---

### Step 35: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Mass Changes to Projects and Work Packages (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Mass Changes to Projects(F3891)

</details>

---

### Step 36: Choose Project

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 13 |
| **Activity** | Mass Changes to Projects and Work Packages (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
From the Worklist displayed, select the projects or WBS Elements created and choose Mass Change icon to carry out the changes.

</details>

**Expected Result (Test Verification):**
> The Mass Change pop-up screen appears.

---

### Step 37: Maintain Values

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 14 |
| **Activity** | Mass Changes to Projects and Work Packages (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Make the following changes
Processing Status: <Replace Field Value>
Priority: <Replace Field Value>
Project Manager :<Replace Field Value>
Choose Apply.
Enter the description for Job Name and choose ConfirmNote
The Mass change fields can be extended using extensibility. 
You can also make the changes to the attributes of work packages.
A job is scheduled for the mass changes made. However, the changes might not appear immediately and require some time to reflect.

</details>

**Expected Result (Test Verification):**
> The Mass Change pop-up window is displayed with some project attributes.
> Once the changes are saved, a success message is displayed.

---


## Activity 10: Capture Planned Costs

> 10 steps total | 4 classifiable | 6 hidden

### Step 38: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Capture Planned Costs |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you upload planned costs to WBS elements.
Note
You will be able to use the Analytics Cloud functionality to input planned costs to the project by executing the 2YG (https://rapid.sap.com/bp/scopeitems/2YG) test script.

</details>

---

### Step 39: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Capture Planned Costs |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Project Financial Controller

</details>

---

### Step 40: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Capture Planned Costs |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Import Financial Plan Data(F1711).

</details>

**Expected Result (Test Verification):**
> The Import Financial Plan Data screen is displayed.

---

### Step 41: Download Template; Fill the planned costs in the CSV file

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 15 |
| **Activity** | Capture Planned Costs |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Download Templates. A pop-up window appears.
In the pop-up window, choose , (Comma) from the Separator for .csv files dropdown and then choose Project Planning; the template CSV file will be downloaded to the local machine.
Choose Close.
Access / open the file and fill the plan values.
Make sure to save the file in CSV (Comma delimited) (*.csv) format .
Note
Remember the location of the file stored.

</details>

**Expected Result (Test Verification):**
> CSV file is saved with the plan costs.

---

### Step 42: Import Planned Cost Data

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 16 |
| **Activity** | Capture Planned Costs |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Browse. Select the CSV file from the local system which has the planned cost data already maintained for the project created above.
Choose Import Source File.

</details>

**Expected Result (Test Verification):**
> The plan data has been imported successfully.

---

### Step 43: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Capture Planned Costs |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Adapt the Project Planning Template
A template table is provided for your reference with sample values as follows:
Category
General Ledger Fiscal Year
Posting Period
Company Code
Project Definition
Work Breakdown Structure Element (WBS Element)
Account Number
Amount in Global Currency
Global Currency

 | X
 | X
 | X | X | X
 |  |  |  | 
 | PLN
 | <current year>
Example
2018
 | <current month>Example
4

 | 5410
 | O.000001
 | O.0000011 | 61005000
 | 1000
 | USD

</details>

---

### Step 44: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Capture Planned Costs |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Project Financial Controller

</details>

---

### Step 45: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Capture Planned Costs |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Import Financial Plan Data(F1711).

</details>

**Expected Result (Test Verification):**
> The Import Financial Plan Data screen is displayed.

---

### Step 46: Download Template; Fill the planned costs in the CSV file

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 17 |
| **Activity** | Capture Planned Costs |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Download Templates. A pop-up window appears.
In the pop-up window, choose , (Comma) from the Separator for .csv files dropdown and then choose Project Planning; the template CSV file will be downloaded to the local machine.
Choose Close.
Access / open the file and fill the plan values.
Make sure to save the file in CSV (Comma delimited) (*.csv) format .
Note
Remember the location of the file stored.

</details>

**Expected Result (Test Verification):**
> CSV file is saved with the plan costs.

---

### Step 47: Import Planned Cost Data

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 18 |
| **Activity** | Capture Planned Costs |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Browse. Select the CSV file from the local system which has the planned cost data already maintained for the project created above.
Choose Import Source File.

</details>

**Expected Result (Test Verification):**
> The plan data has been imported successfully.

---


## Activity 11: Capture Project Budget

> 1 steps total | 0 classifiable | 1 hidden

### Step 48: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Capture Project Budget |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you post planned Budget to WBS elements.
Note
You will be able to use the Analytics Cloud functionality to input planned budget to the project by executing the 2YG (https://rapid.sap.com/bp/scopeitems/2YG) test script.

</details>

---


## Activity 12: Upload Project Budget (Optional)

> 12 steps total | 6 classifiable | 6 hidden

### Step 49: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Upload Project Budget (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you post planned Budget to WBS elements.
Note
You will be able to use the Analytics Cloud functionality to input planned budget to the project by executing the 2YG (https://rapid.sap.com/bp/scopeitems/2YG) test script.

</details>

---

### Step 50: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Upload Project Budget (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Project Financial Controller .
.

</details>

---

### Step 51: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Upload Project Budget (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Import Financial Plan Data(F1711).

</details>

**Expected Result (Test Verification):**
> The Import Financial Plan Data screen is displayed.

---

### Step 52: Download Template; Fill the planned Budget in the CSV file

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 19 |
| **Activity** | Upload Project Budget (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Download Templates. A pop-up window appears.
In the pop-up window, choose , (Comma) from the Separator for .csv files dropdown and then choose Project Budgeting; the template CSV file will be downloaded to the local machine.
Choose Close
Access/open the file and fill the planned budget values.
Make sure to save the file in CSV (Comma delimited) (*.csv).
Note
Remember the location of the files stored.

</details>

**Expected Result (Test Verification):**
> A CSV file will be saved with the budget details.

---

### Step 53: Test Step Name

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 20 |
| **Activity** | Upload Project Budget (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Instruction

</details>

**Expected Result (Test Verification):**
> Expected Result

---

### Step 54: Import Planned Budget Data

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 21 |
| **Activity** | Upload Project Budget (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Browse. Select the CSV file from the local system which already has the planned budget data maintained for the project created above.
Choose Import Source File .

</details>

**Expected Result (Test Verification):**
> A system message is displayed confirming that the planned data has been imported successfully

---

### Step 55: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Upload Project Budget (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Adapt the Project Planning Template
Refer the following table for sample values:
Note
The following account is not specific for budget allocation. You can also use a different account for the posting.
 | Category
 | General Ledger Fiscal Year
 | Posting Period
 | Project definition
 | Work Breakdown Structure Element (WBS Element)
 | Account Number
 | Amount in Global Currency
 | Global Currency
 | Company Code
 | X
 | X
 | X
 | X
 | 
 | 
 | 
 | 
 | 
 | BUDGET01
 | <current year>
Example: 2018
 | <current month>
Example: 11
 | O.000001
 | O.0000011
 | 61005000
 | 1000
 | USD
 | 5410

</details>

---

### Step 56: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Upload Project Budget (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Project Financial Controller .
.

</details>

---

### Step 57: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Upload Project Budget (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Import Financial Plan Data(F1711).

</details>

**Expected Result (Test Verification):**
> The Import Financial Plan Data screen is displayed.

---

### Step 58: Download Template; Fill the planned Budget in the CSV file

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 22 |
| **Activity** | Upload Project Budget (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Download Templates. A pop-up window appears.
In the pop-up window, choose , (Comma) from the Separator for .csv files dropdown and then choose Project Budgeting; the template CSV file will be downloaded to the local machine.
Choose Close
Access/open the file and fill the planned budget values.
Make sure to save the file in CSV (Comma delimited) (*.csv).
Note
Remember the location of the files stored.

</details>

**Expected Result (Test Verification):**
> A CSV file will be saved with the budget details.

---

### Step 59: Test Step Name

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 23 |
| **Activity** | Upload Project Budget (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Instruction

</details>

**Expected Result (Test Verification):**
> Expected Result

---

### Step 60: Import Planned Budget Data

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 24 |
| **Activity** | Upload Project Budget (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Browse. Select the CSV file from the local system which already has the planned budget data maintained for the project created above.
Choose Import Source File .

</details>

**Expected Result (Test Verification):**
> A system message is displayed confirming that the planned data has been imported successfully

---


## Activity 13: Manage Project Budget (Optional)

> 6 steps total | 2 classifiable | 4 hidden

### Step 61: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Manage Project Budget (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you manage (transfer, return and supplement) the budget allocated to WBS element.
You will be able to use the Analytics Cloud functionality to input planned budget to the project by executing the 2YG (https://rapid.sap.com/bp/scopeitems/2YG) test script.

</details>

---

### Step 62: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Manage Project Budget (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Project Financial Controller .

</details>

---

### Step 63: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Manage Project Budget (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Budget Documents - Projects(F5342)

</details>

**Expected Result (Test Verification):**
> The Manage Budget Documents - Projects screen is displayed.

---

### Step 64: Initiate Project Budget Transfer

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 25 |
| **Activity** | Manage Project Budget (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Create and select Budget Transfer from the drop down list
Make entries as shown in the following example in the General Information and other sections:
General Information
Plan Category : Project Budget (BUDGET01)
Posting Date: Todays Date (MM/dd/yyyy)
Budget Sender Items
WBS Element: O.0000011
Account Number: 61005000
Amount in Global Currency: 500
Budget Receiver Items
WBS Element: O.0000012
Account Number: 61007000
Amount in Global Currency: 500
The total of the sender budget items should be equal to the sum of receiver items.
Choose Create.

</details>

**Expected Result (Test Verification):**
> The Budget Transfer document is created.

---

### Step 65: Initiate Project Budget Return

| | |
|---|---|
| **Type** | `Navigation` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Manage Project Budget (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Create and select Budget Return from the drop down list
Make entries as shown in the following example in the General Information and other sections:
General Information
Plan Category : Project Budget (BUDGET01)
Posting Date: Todays Date (MM/dd/yyyy)
Budget Return Items
WBS Element: O.0000012
Account Number: 61007000
Amount in Global Currency: 500
Choose Create.
Note
The budget return document created can be reversed by choosing the Reverse icon and providing a proper reversal reason.

</details>

**Expected Result (Test Verification):**
> The budget return document is created

---

### Step 66: Initiate Project Budget Supplement

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 26 |
| **Activity** | Manage Project Budget (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Create and select Budget Supplement from the drop down list
Make entries as shown in the following example in the General Information and other sections:
General Information
Plan Category : Project Budget (BUDGET01)
Posting Date: Todays Date (MM/dd/yyyy)
Budget Supplement Items
WBS Element: O.0000012
Account Number: 61007000
Amount in Global Currency: 500
Choose Create.
Note
The budget supplement document created can be reversed, by choosing Reverse icon and providing a proper reversal reason.

</details>

**Expected Result (Test Verification):**
> The budget supplement document is created

---


## Activity 14: Define Demand

> 1 steps total | 0 classifiable | 1 hidden

### Step 67: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Define Demand |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This activity deals with demand planning for the project.

#### Procedure
To execute this activity, run the step 'Define Demand' from 4RF- Project Control - Resourcing and Procurementtest script to create and process your project related demands

</details>

---


## Activity 15: Release Projects/Project Parts

> 6 steps total | 3 classifiable | 3 hidden

### Step 68: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Release Projects/Project Parts |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you release the project to enable the project execution.Note
To use the workflow for the project release approval process, perform the steps described inReview Workflow for the Release of a Project (Optional)of theProject Review (1YF)test script, using the project from this document.

</details>

---

### Step 69: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Release Projects/Project Parts |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori Launchpad as a Project Financial Controller.

</details>

---

### Step 70: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Release Projects/Project Parts |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Project Control - Enterprise Projects(F3215)

</details>

**Expected Result (Test Verification):**
> The Project Control screen is displayed.

---

### Step 71: Open Project

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 27 |
| **Activity** | Release Projects/Project Parts |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Standard section, make the following entries and choose Go. 
Project : <Refer the respective Project created in the chapter Create Project>
Example
O.000001 (for Overhead Project) 
I.000001 (for Investment Project) 
R.000001 (for Revenue Project) 
S.000001 (for Statistical Project)

</details>

**Expected Result (Test Verification):**
> At least one entry is displayed in the Worklist area.

---

### Step 72: Release project and structure

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 28 |
| **Activity** | Release Projects/Project Parts |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the project and in header section choose Processing Status > Release

</details>

**Expected Result (Test Verification):**
> Project status changed to Released.
> Note
>   - For investment projects AuCs will be created for those WBS elements with a proper investment profile assigned. 
> 
>   - You can also use the Change Processing status using the Project Briefs app in the Project Manager role.
> 
>   - You can also change the processing status of the Work Package using the Project Planning app in the Project Financial Controller role.
>   - Project once released cannot be renamed or deleted.

---

### Step 73: Maintain actual start date in WBS Elements

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 29 |
| **Activity** | Release Projects/Project Parts |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose Related Apps  Project Planning. Choose Edit to open the project in change mode.
For all created WBS elements, maintain Actual Start Date field under WBS Element Detailed Overview page
 Choose Save.

</details>

**Expected Result (Test Verification):**
> Project saved with WBS elements Actual start dates.

---


## Activity 16: Direct Activity Allocation

> 5 steps total | 2 classifiable | 3 hidden

### Step 74: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Direct Activity Allocation |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you confirm actual activities that occurred in relation to a WBS element.

</details>

---

### Step 75: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Direct Activity Allocation |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori Launchpad as a Project Financial Controller.

</details>

---

### Step 76: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Direct Activity Allocation |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Open Manage Direct Activity Allocation - Deprecated(F3697).

</details>

**Expected Result (Test Verification):**
> The Manage Direct Activity Allocation  screen is displayed.

---

### Step 77: Enter Activity Allocation

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 30 |
| **Activity** | Direct Activity Allocation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Activity Allocations tab choose Create and , make the following entries:
Header Information:
Journal Entry Date:  Today
Posting Date: Today

 In the Allocation Items area, make the following entries and press Enter:
Sender Cost Center: 54101321
Sender Activity Type: 8
Receiver WBS Element: <Refer the respective WBS element created in the chapter Create Project > 
Choose Show More per Row.
Quantity: 10

</details>

**Expected Result (Test Verification):**
> A new object page appears.

---

### Step 78: Post Activity Allocation

| | |
|---|---|
| **Type** | `Action` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 31 |
| **Activity** | Direct Activity Allocation |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Choose Create.

</details>

**Expected Result (Test Verification):**
> The Journal Entries section appears showing the document number.

---


## Activity 17: Post General Journal Entry

> 5 steps total | 2 classifiable | 3 hidden

### Step 79: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Post General Journal Entry |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you post actual primary costs to WBS elements.

</details>

---

### Step 80: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Post General Journal Entry |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori Launchpad as a General Ledger Accountant.

</details>

---

### Step 81: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Post General Journal Entry |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Post General Journal Entries(F0718).

</details>

---

### Step 82: Enter General Journal Entries

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 32 |
| **Activity** | Post General Journal Entry |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Post General Journal Entries screen, make the following entries:
Journal Entry. Date: Today
Posting Date: Today
Journal Entry Type: SA
Company Code: 5410
Transaction Currency: MYR

 In the Line Items area, make the following entries and choose Enter: 

 Line Item 1
G/L Account: 61003000
Debit: 1000
Credit: 0

Choose Expand All button.
Tax Code: <Input Tax Code>
WBS Element: <Refer the respective WBS element created in the chapter Create Project >
Line Item 2
G/L Account:
 10010000

Debit: 0
Credit: 1000
Check that Total Balance is 0.00
Choose Post

</details>

**Expected Result (Test Verification):**
> A success message appears showing the document number.

---

### Step 83: Optional: Batch upload general Journal entries

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 33 |
| **Activity** | Post General Journal Entry |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Download Template file to local: 
On the Post General Journal Entries screen, choose Upload New Entry.
On the Document Upload  popup window. Download Template.
On the Template Download screen. Make the following entries, then choose Download.
Template Language: Malay
Format: Spreadsheet (*.xlsx) 
Download the template file to the local and fill general journal entries according to the template.
Upload Template file and batch upload general journal entries:
On the Post General Journal Entries screen, choose Upload New Entry.
On the Document Upload  screen, choose Browse.
On the popup screen, choose your local filled out template file and choose Upload File.

In the upper area, system have a message: Your uploaded file has been saved as a held document UPLD: 20XX-XX-XX XX: XX: XX (XXXXXXX).

Check batch upload general journal entries. 
Choose Post.

</details>

**Expected Result (Test Verification):**
> A success message appears showing the document number.

---


## Activity 18: Time Recording

> 1 steps total | 0 classifiable | 1 hidden

### Step 84: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Time Recording |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, employee enters the time recording for WBS Element using Manage My Timesheet(F1823)application.

#### Procedure
To execute this activity, execute Time Recording (1Q4) test script, using the WBS Element from this document. Note
While creating the task, maintain the Activity Typeas 11and WBS element created in the Create Project step of this test script.

Data
Sample Value
Details
Comments

 | WBS Element ID
 | <O.0000012>
 | <WBS for project execution>
 |

</details>

---


## Activity 19: Project Control Procurement

> 1 steps total | 0 classifiable | 1 hidden

### Step 85: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Project Control Procurement |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
This activity deals with demand planning and consumable purchasing activities for projects.

#### Procedure
To execute this activity, run steps from 4RF - Project Control - Resourcing and Procurementtest script to process your purchase requisitions generated from project demand.

</details>

---


## Activity 20: Monitor Projects

> 1 steps total | 0 classifiable | 1 hidden

### Step 86: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Monitor Projects |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you can analyze the costs (planned/actual) recorded on the project using different tiles available on the Fiori launchpad. You can also check project progress and the overall status of your project.

</details>

---


## Activity 21: Monitor Notification (Optional)

> 6 steps total | 4 classifiable | 2 hidden

### Step 87: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Monitor Notification (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

### Procedure

</details>

---

### Step 88: Log on

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Monitor Notification (Optional) |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori launchpad as a Project Financial Controller.

</details>

---

### Step 89: Choose the notifications

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 34 |
| **Activity** | Monitor Notification (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Choose the Notifications icon at the top right of the Home screen.
Choose the notifications which are generated by the system.
Note
This notification will be displayed only in case there is a situation of actual postings exceeding the budget threshold limit set in the AVC profile selected for the project.

</details>

**Expected Result (Test Verification):**
> The Project Budget Report-Overview screen is displayed.

---

### Step 90: Detailed information from notifications

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 35 |
| **Activity** | Monitor Notification (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
- Open Project Control - Enterprise Projects(F3215).
  - In the Standard section, make the following entry and choose Go:  - Project: <Refer the Project mentioned in the notification>

  - Select the project from the displayed list and click to open. In the Related Situations section of the project, the complete details of the situation, the WBS element details to which the postings are made and the date it got triggered is displayed.
You can also see the list of notifications from the situation management that got triggered against the project.

</details>

**Expected Result (Test Verification):**
> Detailed information of the situation is displayed.

---

### Step 91: Actions in Situation

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 36 |
| **Activity** | Monitor Notification (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Click on the line items in Related Situations to navigate to the Project Budget Report-Overview screen.
You can check the budget cost defined and the actual cost posted on the project for further analysis

</details>

---

### Step 92: Actions in notifications

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 37 |
| **Activity** | Monitor Notification (Optional) |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Click on the WBS element shown in the Project Budget Report -Overview screen and choose to dismiss the notification by selecting one of the following actions:  - Situation Resolved
  - Situation Obsolete
  - Situation Invalid

Once the situation is dismissed, no one can see the situation.

</details>

**Expected Result (Test Verification):**
> Situation is dismissed by selecting the appropriate option.

---


## Activity 22: Monitor Projects via Project Financial Controller Overview

> 5 steps total | 2 classifiable | 3 hidden

### Step 93: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Monitor Projects via Project Financial Controller Overview |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you can analyze the status, timelines, budget and costs of your project.Note
You will be able to access the reports such as Project Cost, Plan vs Actual, Project Budget Report and Monitor Projects directly from Project Financial Overview.

</details>

---

### Step 94: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Monitor Projects via Project Financial Controller Overview |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori Launchpad as a Project Financial Controller .

</details>

---

### Step 95: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Monitor Projects via Project Financial Controller Overview |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Project Financial Controller Overview(F3078)

</details>

---

### Step 96: Enter Selection Criteria

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 38 |
| **Activity** | Monitor Projects via Project Financial Controller Overview |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Standard section, make the following entries and choose Go.
Planning Category: PLN

</details>

**Expected Result (Test Verification):**
> Projects with selected planning category are displayed in the Data Analysis area.

---

### Step 97: Check Financials

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 39 |
| **Activity** | Monitor Projects via Project Financial Controller Overview |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Check financials and Overall status of the project using various cards

</details>

**Expected Result (Test Verification):**
> The Overall Status, Planned and Active Projects, Actual costs, Cost to Date-Timeline and Upcoming Milestones are displayed.

---


## Activity 23: Monitor Projects via Monitor Projects App

> 6 steps total | 3 classifiable | 3 hidden

### Step 98: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Monitor Projects via Monitor Projects App |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you can analyze the cost and overall progress of your project.

</details>

---

### Step 99: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Monitor Projects via Monitor Projects App |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori Launchpad as a Project Financial Controller.

</details>

---

### Step 100: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Monitor Projects via Monitor Projects App |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Monitor Projects(F3088)

</details>

**Expected Result (Test Verification):**
> The Monitor Projects screen is displayed.

---

### Step 101: Enter Selection Criteria

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 40 |
| **Activity** | Monitor Projects via Monitor Projects App |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Standard section, make the following entries and choose Go.
Project : <Refer the respective Project created in the chapter Create Project >Example
O.000001  (for Overhead Project)
I.000001  (for Investment Project)
R.000001 (for Revenue Project)
S.000001 (for Statistical Project)

Planning Category :PLN

</details>

**Expected Result (Test Verification):**
> At least one entry is displayed in the Worklist area.

---

### Step 102: Check Financials

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 41 |
| **Activity** | Monitor Projects via Monitor Projects App |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
From the Worklist area, select the project.
Choose View Costs to check project costs.
Choose View Budget to check project budget.
Choose Back to go to the previous screen

</details>

**Expected Result (Test Verification):**
> Project Costs and Project Budget reports of the selected project are displayed

---

### Step 103: Check Project Progress

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 42 |
| **Activity** | Monitor Projects via Monitor Projects App |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
From the Worklist area, select the project and choose Project Progress to go to the Monitor Project Progress screen which shows the project timelines.
Note
This would only be possible in case 1YF-Project Review is active, too.

</details>

**Expected Result (Test Verification):**
> A detailed view of project progress is displayed in graphical form.

---


## Activity 24: Monitor Projects via Project Cost Report

> 5 steps total | 2 classifiable | 3 hidden

### Step 104: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Monitor Projects via Project Cost Report |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, analyze the cost structure of your project and check planned cost.

</details>

---

### Step 105: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Monitor Projects via Project Cost Report |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori Launchpad as a Project Financial Controller .

</details>

---

### Step 106: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Monitor Projects via Project Cost Report |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Project Cost Report - Plan/Actual(F2513)

</details>

**Expected Result (Test Verification):**
> The Project Cost  screen displays.

---

### Step 107: Enter Selection Criteria

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 43 |
| **Activity** | Monitor Projects via Project Cost Report |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Standard section, make the following entries and choose Go.
Project: <Refer the respective Project created in the chapter Create Project >
Planning Category 1: Plan
Planning Category 2: CPM Baseline
Example
O.000001  (for Overhead Project)
I.000001  (for Investment Project)
R.000001 (for Revenue Project)
S.000001 (for Statistical Project)

</details>

**Expected Result (Test Verification):**
> Details of the project structure and the corresponding planned and Actual costs as well as commitments are displayed.

---

### Step 108: Navigation to Project Cost Report - Line items; view details of different cost

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 44 |
| **Activity** | Monitor Projects via Project Cost Report |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the project in the table, and choose View Details.
On Project Costs - line items screen, check financials using drilldown and filter possibilities.

</details>

**Expected Result (Test Verification):**
> All Plan and Actual costs are displayed.

---


## Activity 25: Monitor Projects via Project Budget Report

> 6 steps total | 3 classifiable | 3 hidden

### Step 109: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Monitor Projects via Project Budget Report |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you can analyze the cost structure of your project and check planned budget.
Based on the budget availability profile selected during the project creation, you can see the budget consumption report for a particular fiscal year or overall project

#### Prerequisites
If you intend to use Project Budget, make sure that you activate the non-standard scope item Predictive Commitments Management(2I3) which is a prerequisite for budgeting. Once activated, commitment management ledger 0E is active and applicable for all company codes and countries. These commitments are updated in Extension Ledger 0E (predelivered) in ACDOCA table. Commitments are reduced by various business transactions such as goods receipt. The default content for Project Budgeting utilizes profiles PS001 and you can either update this profile or create your own profile via the configuration activity Maintain Budget Availability Control Profile for Projects. 
Ensure that you perform the Preliminary Stepsof this document to update the following: 
  - Maintain Financial statement YPS2 
  - Tag ACT_COST which is mandatory for G/Ls relevant for Budget check. Commitment/Budget works for stock and non-stock purchase orders.
  - Maintain Financial Statement Versions (FSV)
  - Assign Semantic Tags for FSV 
  - Set Report Relevancy 
  - Replicate Runtime Hierarchy. Make sure G/Ls relevant for Budget are part of this structure. 
To view commitments in the report, an open purchase order and/or requisition must exist. For details on creating purchase orders, refer to Consumable Purchasing (BNX).

</details>

---

### Step 110: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Monitor Projects via Project Budget Report |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori Launchpad as a Project Financial Controller .

</details>

**Expected Result (Test Verification):**
> The SAP Fiori Launchpad displays.

---

### Step 111: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Monitor Projects via Project Budget Report |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Project Budget Report(F3377)

</details>

**Expected Result (Test Verification):**
> The Project Budget Report - Overview  screen displays.

---

### Step 112: Enter Selection Criteria

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 45 |
| **Activity** | Monitor Projects via Project Budget Report |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the upper area, make the following entries and choose Go.
Project : <Refer the respective project created in the Create Project section>Example
O.000001 (for Overhead Project)
I.000001 (for Investment Project)
R.000001 (for Revenue Project)
S.000001 (for Statistical Project)

Planning Category: Plan
Fiscal Year: Current year

</details>

**Expected Result (Test Verification):**
> Details of the project structure and the corresponding planned budget display.
> Note
> The aggregated and non- aggregated costs of the selected project are displayed. In the budget report, you would see the assigned value (Commitment +Actual) and available budget (Budget-Assigned Value) based on which you can analyze the project.

---

### Step 113: Navigation to Project Budget Report - Line items; view details of different cost

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 46 |
| **Activity** | Monitor Projects via Project Budget Report |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the project in the table, and choose View Details.
On the Project Budget Report - Line items screen, check the financials using drilldown and filter possibilities.
Note
In the Standard section, the information is shown in the Compact Filter view by default.You can also change it to Visual Filter view to get an easy understanding of overall costs of the project. This visual depiction helps the stakeholders to get an overview of the project.

</details>

**Expected Result (Test Verification):**
> All the plan, actual, and budget costs display.

---

### Step 114: Navigation to Project Budget Report- Line items: view graphical representation of different costs

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 47 |
| **Activity** | Monitor Projects via Project Budget Report |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Project Budget Report - Line items screen, once you ensure all required search fields are filled, you can see the different cost items recorded on the project as graphical representations, such as the bubble chart, bar graph and pie chart. 
Note
You can see the details of the cost items by hovering the cursor on the graphs.

</details>

**Expected Result (Test Verification):**
> The cumulative actual costs, commitments and budget posted on the project display.

---


## Activity 26: Monitor Projects via Manage Project Procurement

> 4 steps total | 1 classifiable | 3 hidden

### Step 115: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Monitor Projects via Manage Project Procurement |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you can monitor the purchasing documents using the Manage Project Procurement app and check the net order value or ordered quantity for purchase order or purchase requisitions assigned to the project.

</details>

---

### Step 116: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Monitor Projects via Manage Project Procurement |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori Launchpad as a Project Financial Controller.

</details>

---

### Step 117: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Monitor Projects via Manage Project Procurement |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Manage Project Procurement(F2930)

</details>

---

### Step 118: Enter Selection Criteria

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 48 |
| **Activity** | Monitor Projects via Manage Project Procurement |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Standard section, make the following entries and choose Go.
Project : <Refer the respective Project created in the chapter Create Project >Example
O.000001 (for Overhead Project)
I.000001 (for Investment Project)
R.000001 (for Revenue Project)
S.000001 (for Statistical Project)

Display currency :MYR
PO Delivery Status :Open

</details>

**Expected Result (Test Verification):**
> Details of the project related to purchase order and purchase requisition, such as delivery quantity, net order value, delivery date and so on are displayed according to the selection and you can click on each link to get more information.

---


## Activity 27: Monitor Projects via P&amp;L Plan/Actual

> 5 steps total | 2 classifiable | 3 hidden

### Step 119: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Monitor Projects via P&amp;L Plan/Actual |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, analyze the cost structure of your project and compare actual vs planned.

</details>

---

### Step 120: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Monitor Projects via P&amp;L Plan/Actual |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori Launchpad as a Project Financial Controller.

</details>

---

### Step 121: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Monitor Projects via P&amp;L Plan/Actual |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open P&L - Plan/Actual(F1710)

</details>

---

### Step 122: Enter Selection Criteria

| | |
|---|---|
| **Type** | `Data Entry` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 49 |
| **Activity** | Monitor Projects via P&amp;L Plan/Actual |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Standard section, make the following entries and choose Go.
Ledger:0L
Ledger Fiscal Year: Current year
Planning Category: PLN
Project: <Refer the respective Project created in the chapter Create Project>Example
O.000001 (for Overhead Project)
I.000001 (for Investment Project)
R.000001 (for Revenue Project)
S.000001 (for Statistical Project)

</details>

**Expected Result (Test Verification):**
> At least one entry is shown in the Data Analysis area.

---

### Step 123: Check Financials

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 50 |
| **Activity** | Monitor Projects via P&amp;L Plan/Actual |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Check financials using drilldown and filter possibilities.

</details>

**Expected Result (Test Verification):**
> All actual costs are displayed.

---


## Activity 28: Check/update Settlement Rules (Optional)

> 1 steps total | 0 classifiable | 1 hidden

### Step 124: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Check/update Settlement Rules (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, check the settlement rule generated or maintain settlement rules as required. 
Note
Settlement is not supported for projects with revenue and statistical projects.

</details>

---


## Activity 29: Settlement Rule for Overhead Projects

> 7 steps total | 4 classifiable | 3 hidden

### Step 125: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Settlement Rule for Overhead Projects |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, check the settlement rule generated.

#### Prerequisites
Execute the step 'Period-End Process: Internal Cost Projects-Generate Settlement Rule' of the Period-End Closing - Projects(BNA)test script.

</details>

---

### Step 126: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Settlement Rule for Overhead Projects |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori Launchpad as a Project Financial Controller.

</details>

---

### Step 127: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Settlement Rule for Overhead Projects |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Project Control - Enterprise Projects(F3215).

</details>

---

### Step 128: Open Project

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 51 |
| **Activity** | Settlement Rule for Overhead Projects |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Standard section, make the following entries and choose Go.
Project : <Refer the respective Project created in the chapter Create Project>
Example
O.000001 (for Overhead Project)

</details>

**Expected Result (Test Verification):**
> At least one entry is displayed in the worklist area.

---

### Step 129: Open Workpackage Details

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 52 |
| **Activity** | Settlement Rule for Overhead Projects |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the project list view, choose the project displayed to navigate to the detailed Overview page.
From the header section, choose Related Apps. A pop-up screen appears.
From the pop-up screen, select Project Planning to go to the Project Planning app.
Choose the Work Package ID: <Refer the respective Work Package created in the chapter Create Project > to navigate to the Work Package page.

</details>

**Expected Result (Test Verification):**
> Work Package details are shown in detailed view.

---

### Step 130: Navigate to the Settlement Rule and Check

| | |
|---|---|
| **Type** | `Verification` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 53 |
| **Activity** | Settlement Rule for Overhead Projects |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
From the Header section, choose Settlement Rule to go to maintain settlement rule overview page. 
Check the details of the settlement rule generated from the previous step.

</details>

**Expected Result (Test Verification):**
> Settlement rule will be generated with regard to cost centers.

---

### Step 131: Optional: Update Settlement Rule According to your Requirement.

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 54 |
| **Activity** | Settlement Rule for Overhead Projects |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
On the Maintain Settlement Rule: Overview screen, make the following entries:
Line1:
Cat: CTR
Settlement Receiver: 54101501
%: 50.00
Settlement Type: PER
NO: 1
Line 2:
Cat: CTR
Settlement Receiver: 54101501
%: 50.00
Settlement Type: PER
NO: 2
Choose Back and then choose Save.

</details>

**Expected Result (Test Verification):**
> Settlement rule would be generated with regard to cost centers.

---


## Activity 30: Settlement Rule for Investment Projects

> 1 steps total | 0 classifiable | 1 hidden

### Step 132: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Settlement Rule for Investment Projects |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
By executing this process, the periodic settlement is executed and all costs collected on the investment project will be settled to the automatically created AuC.

#### Procedure
Note
Settlement rule is automatically created upon running settlement for the first time as described in the Period-End Closing - Projects(BNA)test script. For Example: All costs collected on the investment project will be settled to the automatically created AuC. 

Execute the step "Period-End Process: Assets under Construction projects > Assets under Construction Settlement of the Period-End Closing - Projects(BNA)test script

</details>

---


## Activity 31: Period End Closing Projects (Optional)

> 1 steps total | 0 classifiable | 1 hidden

### Step 133: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Period End Closing Projects (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you can carry out Period End Closing for the projects created in the steps mentioned earlier in this test script.

</details>

---


## Activity 32: Period End Closing Projects - Apply Overhead (Optional)

> 1 steps total | 0 classifiable | 1 hidden

### Step 134: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Period End Closing Projects - Apply Overhead (Optional) |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you post the actual overheads calculated for the projects / Work Packages.
Note
The application of overheads is not supported for statistical projects

#### Prerequisites
The overhead calculation can be carried out only if you have maintained the costing sheet value (as described in the 'Create Project' topic of this test script)

#### Procedure
To execute this activity, perform the step 'Run Actual Overhead - Projects' of the Period-End Closing - Projects(BNA)test script, using the Work Package from this document.
Data
Sample Value
Details
Comments

 | Work Package
 | <O.0000012>
 | <WBS for project execution>
 |

</details>

---


## Activity 33: Period End Closing Projects – Run Settlements

> 1 steps total | 0 classifiable | 1 hidden

### Step 135: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Period End Closing Projects – Run Settlements |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you execute Period End closing for projects / Work Packages.

#### Prerequisites
All previous process steps are completed successfully.

#### Procedure
To execute this activity, perform the step “Period-End Process: Internal Cost Projects -> Actual Project Settlement “ of the Period-End Closing - Projects(BNA)test script, using the Work Package from this document and for investment projects, perform the steps “Period-End Process: Asset Under Construction Projects -> Create Assets for Complete AuC Settlement, Maintain Settlement Rule for Final Settlement & Final Settlement of the Investment Project (Collective Processing) “ of the Period-End Closing - Projects(BNA)test script, using the Work Package from this document. 
DataSample ValueDetailsComments
 | Work Package
 | <O.0000012>
 | WBS for project execution
 | 
 | Work Package
 | <I.0000012> | <WBS for project execution> |

</details>

---


## Activity 34: Period End Closing Projects- Monitor Financials

> 1 steps total | 0 classifiable | 1 hidden

### Step 136: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Period End Closing Projects- Monitor Financials |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Procedure
To execute this activity, execute Monitor projects using the Period-End Closing - Projects(BNA)test script, using the WBS Element from this document.
DataSample ValueDetailsComments
 | WBS Element
 | <O.0000012>
 | <WBS for project execution>
 |

#### Instructions
### Context
In this activity , you can analyze the cost structure of your project and check Plan and Actual cost.

</details>

---


## Activity 35: Complete Project Parts and Project

> 5 steps total | 2 classifiable | 3 hidden

### Step 137: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Complete Project Parts and Project |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you technically complete the project, that is, set the status to Complete. For investment projects, the final settlement gets transferred from the AuC asset to the completed asset and to the cost center as specified in the settlement rules (as specified in the Period-End Closing - Projects(BNA)test script).

</details>

---

### Step 138: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Complete Project Parts and Project |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori Launchpad as a Project Financial Controller.

</details>

---

### Step 139: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Complete Project Parts and Project |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Project Control - Enterprise Projects(F3215).

</details>

---

### Step 140: Open Project

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 55 |
| **Activity** | Complete Project Parts and Project |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Standard section, make the following entries and choose Go. 
Project : <Refer the respective Project created in the chapter 'Create Project '>
Example
O.000001 (for Overhead Project) 
I.000001 (for Investment Project) 
R.000001 (for Revenue Project) 
S.000001 (for Statistical Project)

</details>

**Expected Result (Test Verification):**
> At least one entry is displayed in the Worklist area.

---

### Step 141: Complete Project and Structure

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 56 |
| **Activity** | Complete Project Parts and Project |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the Project and in the header section choose Processing Status > Complete

</details>

**Expected Result (Test Verification):**
> Project is saved with status Completed. (The system status is set to Technically Complete)

---


## Activity 36: Close Project Parts and Project

> 5 steps total | 2 classifiable | 3 hidden

### Step 142: Information

| | |
|---|---|
| **Type** | `Information` |
| **Category** | REFERENCE |
| **Visibility** | ⚪ Hidden |
| **Activity** | Close Project Parts and Project |

**What this step does:**
> Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Purpose
In this activity, you close the completed project, that is, set the project status to Close.

</details>

---

### Step 143: Log On

| | |
|---|---|
| **Type** | `Logon` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Close Project Parts and Project |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Log on to the SAP Fiori Launchpad as a Project Financial Controller.

</details>

---

### Step 144: Access App

| | |
|---|---|
| **Type** | `Access App` |
| **Category** | SYSTEM_ACCESS |
| **Visibility** | ⚪ Hidden |
| **Activity** | Close Project Parts and Project |

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

Open Project Control - Enterprise Projects(F3215)

</details>

**Expected Result (Test Verification):**
> The Project Control screen displays.

---

### Step 145: Open Project

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 57 |
| **Activity** | Close Project Parts and Project |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
In the Standard section, make the following entries and choose Go. 
Project : <Refer the respective Project created in the chapter 'Create Project '>
Example
O.000001 (for Overhead Project) 
I.000001 (for Investment Project) 
R.000001 (for Revenue Project) 
S.000001 (for Statistical Project)

</details>

**Expected Result (Test Verification):**
> At least one entry is displayed in the Worklist area.

---

### Step 146: Close project and structure

| | |
|---|---|
| **Type** | `Process Step` |
| **Category** | BUSINESS_PROCESS |
| **Visibility** | 🟢 Visible Step 58 |
| **Activity** | Close Project Parts and Project |

**Classification buttons:** `[✓ Matches]` `[⚙ Needs Adjustment]` `[⚠ Doesn't Match]` `[— Not Relevant]`

**What this step does:**
> Review the description below. Does your company have a similar process? If yes, select 'This matches our process.' If your company does this differently, select 'Our process is different' and describe how.

<details>
<summary><strong>Technical Details for Implementation Team</strong></summary>

#### Content
Select the Project and in header section choose Processing Status and choose Close

</details>

**Expected Result (Test Verification):**
> Project is saved with status  Closed.

---


## Activity 37: Additional Information

> 5 steps total | 0 classifiable | 5 hidden

### Step 147: Information

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

### Preceding Processes
Complete the following processes and conditions before you start with the test steps:
Process
Business Condition

 | <Scope Item ID> – <Scope Item Title>
 | <Enter business condition.>

### Succeeding Processes
After completing the activities in this test script, you can continue testing the following business processes:
Process
Business Condition

 | BNA
 | Period-End Closing - Projects

</details>

---


# Appendix: Statistics

| Step Type | Count | Classifiable |
|-----------|-------|-------------|
| Information | 43 | 0 |
| Logon | 23 | 0 |
| Access App | 21 | 0 |
| Process Step | 43 | 43 |
| Navigation | 2 | 0 |
| Action | 2 | 2 |
| Data Entry | 8 | 8 |
| Verification | 5 | 5 |

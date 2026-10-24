# Research C: Capability baseline for SAC Planning, Anaplan and peers

Research date: 2026-10-20. Scope: evidence-based baseline for positioning a custom SAP-integrated budgeting product. A claim of "better than SAC or Anaplan" has to be tested against these findings, not asserted.

Source rules applied: vendor documentation and official vendor pages only. SAP Community posts are used only when written by SAP and are labelled "SAP-authored community post". Analyst positions are cited only from vendor-published pages and labelled "vendor-published analyst claim". No third-party listicles.

Confidence scale:
- **High:** the quote comes from a fetched vendor doc page that carries a current release or date.
- **Medium:** the quote is from a vendor page, but the page is a marketing or announcement page, is older, or is indirect.
- **Low:** the item was seen only in a search snippet or is inferred.

Items that could not be confirmed are marked **not confirmed**.

## Access and method notes (read first)

- **help.sap.com:** the portal is a JavaScript single-page app, so WebFetch returns only the shell ("SAP Help Portal | SAP Online Help"). Content was read through the portal's own JSON endpoints (`/http.svc/deliverableMetadata` and `/http.svc/pagecontent`). The SAC Help deliverable was **Q3 2026 (2026.15)**, build 363, with topic dates of 2026-10-16. "Resolves" below means the URL returns HTTP 200 and the topic exists in the current build.
- **community.sap.com:** returns a Cloudflare challenge (HTTP 403) to WebFetch and curl. The post was read through the Khoros community API (`/api/2.0/search`, LiQL by message id).
- **www.sap.com:** returns HTTP 403 to WebFetch (bot block) but HTTP 200 to curl.
- **learning.sap.com:** fetched directly. Pages carry content-package codes such as SACP34 2608 (package dated 2026-09-01) and SACX11 2608 (2026-09-03).
- **help.anaplan.com (Anapedia):** fetched directly. Each page shows a "lastModified" date, which is cited below.

---

## A. Verification of the existing report's sources

| ID | URL resolves? | Claim supported? | Notes |
|---|---|---|---|
| S1 | Yes (200). Learning course; content package SACP34, 2026-09-01 | **Yes, fully** | Units cover data actions, advanced formulas, multi actions, allocations, currency conversion, forecasting and simulation (Smart Predict, value driver trees, compass) and calendar. The course includes the lesson "Creating Data Locking Tasks". |
| S2 | Yes (200). SACP34 2608 | **Supported by the page, but stale** | Monte Carlo, the contrast with time series, the restrictions, and the "professional or standard" license all appear on the page. SAP's own Q1 2026 post (S6) and Help Q3 2026 say the complex-filter and target-settings restrictions were lifted or relaxed. The learning page still lists them. |
| S3 | Yes (200 SPA). Topic "Planning on Public Versions", Q3 2026 (2026.15) | **Yes** | Wording to use: "temporary private version"; conflict-resolution options on publish. One nuance: the conflict choice requires an admin toggle and is not available for account models. |
| S6 | Yes, but bot-blocked (403 Cloudflare). Read through the API | **Yes** | SAP-authored community post (board "technology-blog-posts-by-sap", author ChenNee, 2026-01-26). |
| S7 | Yes (200). No release code found | **Partly** | Gives general performance best practice: 8–12 dimensions, advanced formulas instead of real-time formulas, avoid exception aggregation, reduce zeros, data access profiles. No numeric cell limits. |
| S8 | Yes (200 SPA). "About Forecasting with Predictive Planning", Q3 2026 | **Yes** | Exact wording is "up to 1000 predictive models at a given time". Forecasts are persisted into private versions. |
| S9 | Yes (200). SACX11 2608 (2026-09-03) | **Yes** | Mass Data Entry, hierarchy-node input (proportional distribution), Process Data versus Publish Data, and data actions through Planning Triggers. The page also lists limitations. |
| S12 | Yes for curl (200); 403 for WebFetch | **Not supported by the page text itself.** Supported by other SAP documentation. | In October 2026 the pricing page shows only a hero ("SAP Analytics Cloud pricing" / "Explore purchasing options") and meta text ("subscription and pay-as-you-go plans"; keyword "capacity units"). Its breadcrumb places SAC under SAP Business Data Cloud. SAP BDC Help confirms that moved subscriptions are "entitled with SAP Business Data Cloud capacity units". |
| S4, S5, S10, S11 | Not provided in the brief | n/a | Not checked. |

### S1 detail
- **Finding:** The course "Leveraging Advanced Features in SAP Analytics Cloud for Planning" has 8 units and 19 lessons (about 7 h 32 min). Units: Exploring Advanced Features; Copying Data Using Data Actions; Creating Advanced Formula Data Actions; Creating and Configuring Multi Actions; Allocating Planning Data; Converting Currencies for Planning; Forecasting and Simulating Planning Data; Using the SAP Analytics Cloud Calendar to Create a Planning Process. Lesson titles found in the page payload include "Simulating Data with Value Driver Trees", "Simulating Data with SAP Analytics Cloud Compass", "Creating Data Locking Tasks", "Configuring Rolling Forecast Layouts" and "Managing Data Action Performance".
- **Quote:** "Add and schedule a data locking task."
- **URL:** https://learning.sap.com/courses/leveraging-advanced-features-in-sap-analytics-cloud-for-planning
- **Date:** content package SACP34, 2026-09-01T04:54Z (2608)
- **Confidence:** High

### S2 detail
- **Finding:** Compass is a Monte Carlo simulation and is distinct from time-series forecasts. The page lists two restrictions: unsupported filter types (advanced, attribute, exclude, time range, dynamic time) and no change of target settings after a simulation is saved. It requires a planning license.
- **Quotes:** "use the Monte Carlo simulation, a mathematical simulation method delivering a range of probable outcomes"; "In order to use compass, you will require an SAP Analytics Cloud for Planning, professional or standard license."; "Once a simulation is saved, you cannot change its target settings…"
- **Supersession:** SAP Help Q3 2026 "Create Simulations" now says "Complex filters are also carried over from the story table in read-only mode." Only certain range filters on day-level or user-managed dates remain unsupported.
- **URLs:**
  - https://learning.sap.com/courses/leveraging-advanced-features-in-sap-analytics-cloud-for-planning/simulating-data-with-sap-analytics-cloud-compass_de2ac36b-92b5-4512-af39-94797d5176af
  - https://help.sap.com/docs/SAP_ANALYTICS_CLOUD/00f68c2e08b941f081002fd3691d86a7/294108ce5eb143518cd9031dd41937fd.html
- **Date:** learning page SACP34_2608; Help Q3 2026 (2026.15)
- **Confidence:** High that the page says this. High that it is outdated on restrictions.

### S3 detail
- **Quotes:** "Editing a public version creates a temporary private version that only you can see until the changes are published."; "If other users are editing the same version, your changes could overwrite theirs when you publish because the most recent update will overwrite previous states."; "The choice of whether to discard or overwrite conflicting changes is not available for account models."; the choice requires the toggle "Display options to resolve version publish conflicts".
- **Additional point:** "The system checks write permissions only when users try to publish a version."
- **URL:** https://help.sap.com/docs/SAP_ANALYTICS_CLOUD/00f68c2e08b941f081002fd3691d86a7/b6e3d093988e4c3eba7eb6c1c110e954.html
- **Date:** Q3 2026 (2026.15)
- **Confidence:** High

### S6 detail (SAP-authored community post)
- **Quotes:** "Enabling simulation from dashboards with complex filters"; "Enabling changing of target settings after simulation creation"; "the prior simulation results of private scenarios will be discarded … but the driver value configurations will be retained"; "Public scenarios, on the other hand, will be marked as invalid".
- **URL:** https://community.sap.com/t5/technology-blog-posts-by-sap/sap-analytics-cloud-compass-in-q1-2026-new-use-cases-enhanced-workflow/ba-p/14313750
- **Date:** 2026-01-26
- **Confidence:** High

### S7 detail
- **Quote:** "Try to keep the number of dimensions (including standard dimensions like Account, Date, and Version) between 8 and 12."
- **Also on the page:** use advanced formulas in data actions with on-demand execution rather than real-time formulas; exception aggregations (average, min, max) add a second pass; unnecessary zeros hurt performance; balance security profiles against performance.
- **URL:** https://learning.sap.com/courses/optimizing-planning-performance-in-sap-analytics-cloud/exploring-best-practice-for-performance-in-an-sap-analytics-cloud-planning-model
- **Date:** not shown
- **Confidence:** High for the content. Medium as a "limit", because it is a guideline, not a hard limit.

### S8 detail
- **Quotes:** "Predictive scenarios (time series forecasting models) are created on top of planning models, up to 1000 predictive models at a given time."; "Predictive forecasts are persisted into private versions and promoted as public versions".
- **URL:** https://help.sap.com/docs/SAP_ANALYTICS_CLOUD/00f68c2e08b941f081002fd3691d86a7/66eeff9e46334644b43b10e49e2022bf.html
- **Date:** Q3 2026
- **Confidence:** High

### S9 detail
- **Quotes:** "Mass Data Entry is the default planning input mode in the SAP Analytics Cloud, Add-in For Excel."; "the planning value for a hierarchy node will be applied proportionally to all unchanged hierarchy elements."
- **Limitations:** "You can plan on only one model at a time."; "The add-in does not support data input control, so you do not have a visual indication of the locked cells. Processing data on locked cells might be possible, but publishing is not allowed."
- **URL:** https://learning.sap.com/courses/creating-workbooks-using-the-sap-analytics-cloud-add-in-for-microsoft-excel/performing-planning-activities-using-the-sap-analytics-cloud-add-in-for-microsoft-excel_bba0afc0-a27a-492d-bf36-4bfb41a94bfa
- **Date:** SACX11, 2026-09-03
- **Confidence:** High

### S12 detail
- **Pricing page:** the title is "SAP Analytics Cloud Pricing". The meta description reads "Discover flexible pricing options for SAP Analytics Cloud, including subscription and pay-as-you-go plans." The rendered body contains only the "SAP Analytics Cloud pricing" hero and an empty "Explore purchasing options" section, under the breadcrumb All products / SAP Business Data Cloud / SAP Analytics Cloud. There are no prices and no explicit statement about BDC capacity.
  - URL: https://www.sap.com/products/data-cloud/cloud-analytics/pricing.html (accessed 2026-10-20)
- **Corroborating SAP documentation:** "Once the subscriptions have been updated, your SAP for Me account is entitled with SAP Business Data Cloud capacity units."
  - URL: https://help.sap.com/docs/SAP_BUSINESS_DATA_CLOUD/f7acf8c9dad54e99b5ce5ebc633ed8e1/21283e4c9c724e82bf52bd3eb889480b.html (BDC Help, 2026-10-19)
- **Caveat:** The BDC page says customers can move to BDC from "standalone provisioned" SAC. Whether new SAC can be bought **only** through BDC capacity is **not confirmed**.
- **Confidence:** Medium

---

## B. SAP Analytics Cloud Planning (Help Q3 2026 / 2026.15 unless stated)

### B1. Data actions, multi actions, advanced formulas
- **Advanced formulas** are written in a script editor or a visual tool. Some functions exist only in script. Quote: "A few functions are only available in the script editor, and not supported in the visual tool". "Several restrictions apply to using measures with AND or OR operators."
  - URL: https://help.sap.com/docs/SAP_ANALYTICS_CLOUD/00f68c2e08b941f081002fd3691d86a7/4af8f5afbaf541f5821107eb772a5224.html
  - Confidence: High
- **Multi-action step types:** data action, version management, predictive, data import, PaPM integration, data locking and comment management. On publish behaviour: "Publish and ignore warnings: … If any restrictions such as data locks apply to some of the data you're trying to publish, then the affected data will be discarded."
  - URL: https://help.sap.com/docs/SAP_ANALYTICS_CLOUD/00f68c2e08b941f081002fd3691d86a7/169d66dc8a914fd4b792e3d3b91b9aa0.html
  - Confidence: High
- **AI-assisted data actions:** generate advanced-formula script from a comment and the reverse. Quote: "choose the Generate Script button to generate an advanced formulas script". SAP's own caution: the generated comment "may not cover all technical details like filters, calculations, and definitions."
  - URLs: https://help.sap.com/docs/SAP_ANALYTICS_CLOUD/00f68c2e08b941f081002fd3691d86a7/00ca4ae380794468ba42ea46d10a4045.html and …/3f95d6d495e140bfaf357400854ab678.html
  - Confidence: High
- **QRC3 2026 additions** (copy step with factor, comment management step, data filter parameters): seen only in search snippets of an SAP Community **member** post and the SAP "What's New". **Not confirmed** from SAP documentation in this pass. Confidence: Low.

### B2. Allocations and currency conversion
- Both are covered as dedicated units in the official course (S1): "Creating Data Actions for Allocations", "Performing Allocations", "Configuring Currency Conversion".
  - URL: S1
  - Confidence: High (exists). Feature depth was not assessed.

### B3. Value driver trees (VDT)
- Quote: "Both planning and BI users can create value driver trees and enter data in them. However, only users with planning licenses can publish changes to a version."
- Limits: "You can only use one account hierarchy within a node."; "You can only change the date filter for the entire value driver tree, not for individual nodes."; "Data entry isn't available when there's an advanced filter on the version dimension."
- URL: https://help.sap.com/docs/SAP_ANALYTICS_CLOUD/00f68c2e08b941f081002fd3691d86a7/f6189755175940f3a4e007c3d6b83ee5.html
- Confidence: High

### B4. Calendar and workflow
- Quote: "Create, assign, and work on tasks, and add files, approval workflows, and processes that link tasks together… You can also use the calendar to schedule data locks, data actions, or multi actions."
- URL: https://help.sap.com/docs/SAP_ANALYTICS_CLOUD/00f68c2e08b941f081002fd3691d86a7/af4b7e39edd249d3b59fa7d4ab110a7a.html
- Confidence: High

### B5. Data locking
- **Model:** a driving-dimension grid with states locked, restricted and open, plus ownership and manager delegation. Quote: "locked and restricted cells for public versions appear as read-only… You can plan on these cells by selecting Ignore Data Locks… but data locks will still be enforced when you publish the version."
- **Documented exceptions:**
  - "Data locks do not apply to users with the admin role, or the user who created the model."
  - "Data locks can only be set on the default hierarchy."
  - "Data locks can't be directly set on calculated measures or accounts."
  - "As a default, locked child members will still receive values from data disaggregation".
- URL: https://help.sap.com/docs/SAP_ANALYTICS_CLOUD/00f68c2e08b941f081002fd3691d86a7/e07d46e950794d5a928a9b16d1394de6.html
- Confidence: High

### B6. Version management (private, public edit, publish)
- See S3. From "Planning on Private Versions": "If data access control is enabled for a dimension in the model, it restricts changes to data in public versions, but not in private versions." Conflict resolution "is only available to models with measures. It is not supported for account models."
  - URL: https://help.sap.com/docs/SAP_ANALYTICS_CLOUD/00f68c2e08b941f081002fd3691d86a7/1a011f8041a84e109a3b6bf8c1c81bc1.html
  - Confidence: High
- **Planning area:** "Data actions and multi actions only affect data within your planning area." The page also notes that edits can be made that "cannot be published, such as when a cell belongs to a member for which you are missing write privileges."
  - URL: https://help.sap.com/docs/SAP_ANALYTICS_CLOUD/00f68c2e08b941f081002fd3691d86a7/b7958a0bfceb426c8ac486863ec59abc.html
  - Confidence: High

### B7. Seamless planning (SAP Datasphere / BDC) and live versions
- **Seamless planning:** model data is stored in SAP Datasphere. Quote: "with no data replication or acquisition involved". Restrictions:
  - "Seamless planning doesn't support account models."
  - "It is currently not possible to migrate existing SAP Analytics Cloud models… to SAP Datasphere spaces."
  - URL: https://help.sap.com/docs/SAP_ANALYTICS_CLOUD/00f68c2e08b941f081002fd3691d86a7/6d81dcce234b417e8afb8450abab785e.html
  - Confidence: High
- **Prerequisites and maturity:** tenants must be "linked in a 1:1 relationship"; "Seamless planning is still under development"; same data centre and same IdP required; NEO tenants are not supported; the Data Import Service API does not support public dimension tables or private versions.
  - URL: https://help.sap.com/docs/SAP_ANALYTICS_CLOUD/00f68c2e08b941f081002fd3691d86a7/6c74bb464c854d6ebd59fa3fee06e14b.html
  - Confidence: High
- **Live versions (plan on live actuals):** supported sources are "SAP Datasphere, Google BigQuery, Azure SQL and Snowflake". Quote: "Live versions are public versions and read-only which means that they don't support data entry… Publishing data to live versions is not supported." The feature must be enabled through a support case. SAP recommends "avoiding live connectivity to Snowflake with tables containing more than a million rows". **S/4HANA is not listed as a live-version source.**
  - URL: https://help.sap.com/docs/SAP_ANALYTICS_CLOUD/00f68c2e08b941f081002fd3691d86a7/4a573d78d2da4642b6f374d377c2f4a0.html
  - Confidence: High

### B8. AI and Joule
- **AI features in SAC (feature-scope description, Q3 2026):** AI-Assisted Story Code Generation, Calculations, Chart Summary, Commenting, Data Actions and Prompt Insights; Analytical Insights (Joule); Just Ask; Predictive Planning; Smart Insights; Smart Predict.
  - Quote: "AI-Assisted Prompt Insights: Lets you generate intelligent, data-backed business insights from planning data with prompts using natural language."
  - URL: https://help.sap.com/docs/SAP_ANALYTICS_CLOUD/92a4a76cf6ae454cbf55b73df1cc2f3d/4d187fbfe17847ecbd794fb7c95c5ae2.html
  - Confidence: High
- **Licensing:** "You've purchased the SAP AI Units license for features for select…" (applies to some features). The tenant must be on a data centre that supports SAP Business AI.
  - URL: https://help.sap.com/docs/SAP_ANALYTICS_CLOUD/00f68c2e08b941f081002fd3691d86a7/8dcc1f1915b241b3a10c8e5b8a76b062.html
  - Confidence: High
- **Predictive planning restrictions:** "only time series forecasting is supported"; SAP BPC models are not supported; "You cannot select more than 5 dimensions or attributes…"; "The maximum number of entities supported is 1000."
  - URL: https://help.sap.com/docs/SAP_ANALYTICS_CLOUD/00f68c2e08b941f081002fd3691d86a7/1bbf118346bb4059b8bd068b4b91c943.html
  - Confidence: High
- **SAP Enterprise Planning (announced, agentic):** quotes: "A new planning solution, SAP Enterprise Planning, will embed Joule Agents…"; "Built using SAP Business Data Cloud solution data products and the SAP Analytics Cloud solution…"; "General availability is planned for Q3 2026." The same guide lists the "Financial Planning Assistant" with GA planned for Q3 2026.
  - URL: https://www.sap.com/topics/events/sapphire/innovation-news-guide-2026 (Sapphire 2026)
  - Confidence: Medium (announcement)
  - **GA not confirmed:** no SAP Help product documentation for "SAP Enterprise Planning" or a planning Joule agent was found in help.sap.com search on 2026-10-20.

### B9. Documented size, model and performance limits
- **Data acquisition:** CSV files up to 2 GB; XLSX up to 200 MB.
- **Models on non-SAP-data-centre platforms:** "For SAP BW, SAP HANA, Google BigQuery, and SQL data sources only: 1,000,000,000 cells; 1000 columns". For "all other data sources": 10,000,000 rows.
- **Account models and stories:** 100,000,000 cells; 100 columns. For other sources, 800,000 rows.
- **Fact rows:** "Subsequent data imports to an existing model cannot exceed a total of 2^31-1 (2,147,483,647) rows."
- **Master data:** "Dimension members: 1,000,000". "Analytic models: if there are more than 1,000,000 unique members, the dimension will be made read-only." Imported values are limited to 256 characters.
- **Jobs:** "Each tenant can have a maximum of 30 concurrent data management jobs". Queued jobs time out after 50 minutes.
- URL: https://help.sap.com/docs/SAP_ANALYTICS_CLOUD/00f68c2e08b941f081002fd3691d86a7/5f61b6509a5e4d499e8cb9685f32db73.html
- Confidence: High
- **Performance guidance:** 8–12 dimensions (S7) and the planning area (B6).
- **Not confirmed:** no documented hard limit was found for the number of versions per planning model, the number of cells per planning table, or the runtime of a data action.

### B10. Write-back of plan data to S/4HANA
- **SAC-side export to ACDOCP:** In S/4HANA Cloud Public Edition 2608 this export is now labelled **deprecated**. Quote: "Note that this export function is deprecated and will be removed in a future release. Instead, you can use SAP S/4HANA Cloud apps to export plan data from SAP S/4HANA Cloud to SAP Analytics Cloud."
  - Reading: the integration direction is now driven from S/4HANA through "Manage Financial Plan Data Jobs for SAP Analytics Cloud Integration", with Target Type ACDOCP.
  - Exported or integrated plan data lands in table **ACDOCP** (Planning - ACDOCP).
  - URLs: https://help.sap.com/docs/SAP_S4HANA_CLOUD/1cbcff7ccd35405ab445b223c1ab1588/efee7f7a47844876a80565d50f1cffcd.html and …/5cecd4d1af5243579d13730e1f896106.html
  - Date: S/4HANA Cloud Public Edition 2608 (2026-10-08)
  - Confidence: High
- **On-premise:** S/4HANA 2025 FPS02 (Oct 2026) still lists "Exporting Plan Data to SAP S/4HANA or SAP S/4HANA Cloud" without "(Deprecated)" in the title. This was seen in search results only. Confidence: Low.

### B11. Budget control: does SAC enforce ERP availability control? (Expected answer: no.)
- **Finding:** SAP documents budget availability control (BAC) as an **S/4HANA** function. SAC is a source of budget values: SAC versions are mapped to S/4 budget plan categories. Enforcement happens in S/4 when actual costs are posted. No SAP document found describes SAC itself performing a funds check or availability check during planning.
- **Quotes:**
  - "The Budget Availability Control function is part of the SAP S/4HANA Cloud Public Edition core delivery and allows a business to control the budget consumption of a cost center or project…"
  - "it controls your actual bookings in table ACDOCA… the new total amount posted in table ACDOCA is checked against the budget data posted for this object in table ACDOCP for the corresponding plan category."
  - The budget consistency check (in S/4) "checks whether the adjusted budget data for an object is equal to or higher than the actual data posted in table ACDOCA" when budgets arrive via SAC export or plan-data jobs.
  - "Do not use Delta Mode for integrating plan data line items to special categories for Budget Availability Control, such as BUDGET01 or BUDGET02."
  - "For project planning, you need the WBS element. The G/L account is not considered for budget availability control."
- **URLs:**
  - https://help.sap.com/docs/SAP_S4HANA_CLOUD/1cbcff7ccd35405ab445b223c1ab1588/ba3785d74bdb401d9bc4093d6356fae8.html
  - https://help.sap.com/docs/SAP_S4HANA_CLOUD/1cbcff7ccd35405ab445b223c1ab1588/2a5455fff76b4b65b4ee9ada1f2db48a.html
  - https://help.sap.com/docs/SAP_S4HANA_CLOUD/1cbcff7ccd35405ab445b223c1ab1588/5cecd4d1af5243579d13730e1f896106.html
- **Date:** 2608 Latest
- **Confidence:** High that enforcement sits in S/4. Medium on the negative (that SAC has no in-plan funds check), because it rests on absence of documentation.
- **Contrast with Oracle:** Oracle EPM Planning Budget Revisions performs a "Funds Check" against Fusion Budgetary Control from inside planning (see D5). SAP has no documented equivalent from SAC.

### B12. Licensing
- **Editions:** "Two license types allow you to use planning tools: SAP Analytics Cloud for planning, standard edition and … professional edition."
- **Business intelligence (BI) users:** they can create private versions and enter data on booked values, but "Private and Public Edit versions can be edited but not published".
- **Licence removal:** "When planning licenses are removed… planning content created from those licenses will be restricted for other end users, even those with administrator roles".
- URL: https://help.sap.com/docs/SAP_ANALYTICS_CLOUD/00f68c2e08b941f081002fd3691d86a7/20d92cebb9f94699949f99bd54a169bd.html
- Confidence: High

### B13. Excel add-in
- See S9: one model at a time, no data input control, publishing is blocked on locked cells.

### B14. Analyst position (vendor-published analyst claim)
- SAP: "SAP was recognized as a Leader by Gartner for its ability to execute and completeness of vision." Source: SAP News, 2025-12-09, by Dan Yu.
- URL: https://news.sap.com/2025/12/sap-a-leader-gartner-magic-quadrant-financial-planning-software/
- The Gartner report is dated 1 December 2025 (per Anaplan's citation).
- Confidence: Medium

---

## C. Anaplan (Anapedia lastModified dates given)

### C1. Engines: Polaris versus Classic
- **Statement of Direction (lastModified 2026-08-04):**
  - "Anaplan Polaris has been in General Availability since 2023 and will be the primary focus…"
  - "We will be adding new functionality for calculation only in Polaris"
  - "Classic engine will be maintained, but will not receive major new calculation functionality"
  - "We recommend that any new model development is done using Anaplan Polaris"
  - Scale: "18 quintillion cells per line item"
  - Planned Polaris functions: IRR, NPV, standard deviation, variance (marked as planned, not GA).
  - URL: https://help.anaplan.com/anaplan-calculation-engines---statement-of-direction-2025-a68b54b9-170b-4584-867a-6b6600914a31
  - Confidence: High
- **Classic density (2023-09-01):** "In the Classic engine, this data is stored as an array and is dense… Each cell in the Classic engine uses 8 bytes of memory, whether it contains data or not."
  - URL: https://help.anaplan.com/understand-sparsity-and-density-616ee341-8a5f-4718-8c90-c82e34eca86c
  - Confidence: High
- **Classic block limit (2023-09-20):** "Each line item block can contain up to 2,147,483,647 cells." A change that would exceed it "is not applied".
  - URL: https://help.anaplan.com/cell-count-limit-on-line-item-blocks-8b535ad6-79fd-4793-8435-2248913bf8ab
  - Confidence: High
- **Polaris dimensionality (2026-01-07):** "The DIT for all dimensions of a line item mustn't exceed 64."
  - URL: https://help.anaplan.com/dimension-index-totals-in-polaris-03cfcfa5-cfbb-49ff-9467-0f16ef38b79a
  - Confidence: High
- **Polaris modelling gaps and limits (2025-01-15):**
  - "Brought forward isn't available in Polaris."
  - "Optimizer isn't available in Polaris."
  - "Year To Date (YTD) and Year To Go (YTG) summary periods aren't available in Polaris"
  - "A model may contain up to 100 versions."
  - "The maximum length of a formula is 2,000 characters."
  - "There's a 10,000 character limit for cells."
  - Classic exports and views "silently truncate" beyond 2,147,483,647 rows or columns.
  - URL: https://help.anaplan.com/modeling-differences-between-engines-e35619de-5623-464b-9e0c-5d050dd99aa7
  - Confidence: High
- **Line-item limit raised (April 2026 releases, lastModified 2026-06-04):** "We've raised the limit on the number of line items that can exist in a Polaris model from 15,000 to 20,000."
  - URL: https://help.anaplan.com/april-2026-releases-774e1f4a-5510-4736-b4b6-4c1c315b2d19
  - Confidence: High

### C2. Modelling language and function differences (2026-10-16)
- A list of "Functions not available in Polaris" includes financial functions (FV, IPMT, CUMIPMT, DURATION, COUP*), the FIRSTNONBLANK and LASTNONBLANK aggregations, MAILTO and MAKELINK.
- Quote: "In Polaris, RANKCUMULATE can't be used when the target is dimensioned by a line item subset…"
- URL: https://help.anaplan.com/calculation-function-differences-between-engines-4c7a3bda-f406-49d5-a3ba-d54524fc0c22
- Confidence: High

### C3. Application lifecycle management (ALM)
- **Subscription:** "You must have Professional or Enterprise subscription to use ALM." (2026-06-29)
  - URL: https://help.anaplan.com/application-lifecycle-management-0406d4dd-3e8d-40c0-be2f-1c34c1caeebf
- **Compare and Synchronize (2024-09-06):**
  - "Compare and Synchronize doesn't allow you to pick and choose the changes you want to move from the source model to the target model."
  - "The Compare and Synchronize process is one-way."
  - URL: https://help.anaplan.com/the-compare-and-synchronize-process-ed3892b9-241f-4a18-9f82-449aa20f534c
- **Deployed mode (2024-08-28):** "you're not allowed to add revision tags to models in Deployed mode"; "Don't disable deployed mode in production models…"
  - URL: https://help.anaplan.com/considerations-when-you-enable-deployed-mode-5dea12f4-57c4-4b57-a2cb-97bdfe5d007e
- Confidence: High

### C4. Excel (Anaplan XL and the Excel add-in)
- **Anaplan XL Reporting (2026-06-24):** "A key aspect of Anaplan XL Reporting is that the data itself isn't held in Excel." Sources include SSAS, Power BI, **SAP HANA**, IBM TM1, Kyvos, Incorta, Atoti, Anaplan and Anaplan FCR.
  - URL: https://help.anaplan.com/anaplan-xl-reporting-c8392461-27de-4fa6-89b6-cace4d6c3421
  - Confidence: High
- **Writeback:** XL version 2603 added "a dropdown menu below the Writes button, which enables you to submit or discard all changes…" (March 2026 releases).
  - URL: https://help.anaplan.com/march-2026-releases-d6e68b11-445b-4cd8-bbda-7b7c735608a9
  - Confidence: High

### C5. CloudWorks and Anaplan Data Orchestrator (ADO)
- **ADO writeback pipelines (September 2026 releases, 2026-10-07):** writeback to Oracle, Salesforce, SFTP and PostgreSQL. Snowflake writeback arrived in March 2026. **No SAP writeback pipeline is listed.**
  - URL: https://help.anaplan.com/2cc92764-958d-4489-82dd-37d19cb1069b
  - Confidence: High
- **CloudWorks connectors:** AWS S3, Azure Blob and Google BigQuery. This comes from search snippets of "Create a CloudWorks connection" and was not fetched. Confidence: Low.

### C6. SAP connectivity
- **ADO "Import data from SAP" (2026-09-28):**
  - "The connection supports these SAP components: SAP HANA, SAP BW, SAP ECC. This connector uses SAP OData version 4."
  - For SAP Datasphere, "basic authentication can't be used. An OAuth-based connection is required."
  - **S/4HANA is not named. Writeback to SAP is not documented.**
  - URL: https://help.anaplan.com/import-data-from-sap-d0eba7b0-e8ac-4a6b-9de6-314380b18c7f
  - Confidence: High for what is listed. Write-back to SAP: **not confirmed / not documented**.

### C7. AI: PlanIQ/Forecaster, CoPlanner, CoModeler, Analyst, agents
- **Agents announcement (Anaplan news, 2025-12-09):**
  - "Anaplan CoModeler… turns natural language requests into structured models, logic and calculations"
  - Role-based agents "now available": Finance Analyst, Supply Chain Analyst, Sales Analyst, Workforce Analyst.
  - "In the first half of next year, Anaplan will debut its first autonomous AI agents" (stated as planned).
  - URL: https://www.anaplan.com/news/anaplan-introduces-new-suite-role-based-ai-agents/
  - Confidence: Medium (press release)
- **March 2026 releases:**
  - "We've introduced Anaplan CoModeler, an intelligent AI agent built directly into the Anaplan modeling experience… available in Polaris and Classic workspaces."
  - Anaplan Analyst and Agent Studio were introduced.
  - URL: https://help.anaplan.com/march-2026-releases-d6e68b11-445b-4cd8-bbda-7b7c735608a9 (lastModified 2026-04-10)
  - Confidence: High
- **September 2026 releases:**
  - "CoModeler assisted actions are now fully visible in the standard Anaplan model history."
  - Analyst "runs live calculations grounded in Structured Query Language (SQL)".
  - URL: https://help.anaplan.com/2cc92764-958d-4489-82dd-37d19cb1069b
  - Confidence: High
- **Forecaster (PlanIQ successor):** February 2026 release notes: "Forecaster is now deployed across all AWS regions where Anaplan is deployed."
  - URL: https://help.anaplan.com/february-2026-releases-8c84c5ff-bfde-45a9-9e04-f0a99ccf6941
  - Confidence: High that it is deployed. A formal GA date and PlanIQ retirement are **not confirmed**.
- **CoPlanner:** the legal page (search snippet only) says inclusion runs "until October 15, 2026". Current terms are **not confirmed**. Confidence: Low.

### C8. Security
- **BYOK (2025-04-10):**
  - "BYOK is an additional product your organization can purchase if it has the Enterprise edition."
  - "own AES-256 keys"
  - "No mechanism exists for Anaplan employees to access your keys."
  - "In a BYOK encrypted workspace, model data is encrypted at rest, but not when loaded into memory."
  - URL: https://help.anaplan.com/bring-your-own-key-byok-5d23356b-0f55-47c4-aab2-1b53c7d4cd8a
- **Key manager (2023-04-06):** "key manager appliance certified to FIPS 140-2 Level 3".
  - URL: https://help.anaplan.com/why-byok-is-secure-724a05e7-69ce-48c2-bd8d-01416d7b72bb
- Confidence: High

### C9. Workspace limits
- **Workspace limits (2025-12-15):** amber warnings appear when "Your model count limit exceeds 4,500 models" and when "Your workspace size reaches 75% of your workspace's capacity limit."
  - URL: https://help.anaplan.com/workspace-limits-ca9008a2-f073-4c62-8b9e-00d644d1a272
  - Confidence: High
- **Absolute size (130 GB standard, about 720 GB "HyperModel"):** appears only in Anaplan **Community** threads. **Not confirmed** by Anapedia. Confidence: Low.

### C10. Analyst position (vendor-published analyst claim)
- Quote: "positioned by Gartner® in the Leaders quadrant of the Magic Quadrant™ for Financial Planning Software. Gartner evaluated 14 financial planning software providers". Report: Crowder, Sahoo, Lashinsky, 1 December 2025.
- URL: https://www.anaplan.com/news/gartner-mq-financial-planning-software-2025/ (2025-12-04)
- Confidence: Medium

---

## D. Peers: distinctive innovations

### D1. Pigment
- **Scenarios** carry both data and formulas. Quotes: "Scenarios let you see how different data inputs or formulas create different plans and compare them." Limits: "you can't perform calculations across Scenarios"; "Scenarios can't be converted from Local to Shared".
  - URL: https://kb.pigment.com/docs/get-started-scenarios (updated 2025-11-27)
  - Confidence: High
- **Pseudo-merge ("copy inputs" between scenarios):**
  - "copy overrides, manual inputs, and imported data from one Scenario and push them to a different, target Scenario"
  - Governance caveat: "Regardless of a Member's Write access on selected Metrics, inputs are copied over to target blocks when pushed."
  - No true branch/merge with conflict resolution is documented.
  - URL: https://kb.pigment.com/v1/docs/copy-inputs-between-scenarios (2025-08-22)
  - Confidence: High
- **Agents:**
  - "The Modeler Agent helps you build… and creates Blocks and formulas accordingly."
  - The Analyst Agent builds "repeatable, schedulable Missions".
  - Custom Agents are supported.
  - Admins can allow web search.
  - URL: https://kb.pigment.com/docs/pigment-agents (updated 2026-08-31)
  - The Planner Agent is still "Coming soon" on https://www.pigment.com/ai
  - Confidence: High (KB). Medium (marketing page).
- **Analyst position:** a Visionary in the 2025 MQ (vendor-published claim, pigment.com/blog/gartner-mq-2025, search snippet only). Confidence: Low.

### D2. Board
- **Board Agents on Microsoft Foundry (2026-01-21):** "The initial release includes FP&A and Controller Agents… will be available globally starting March 31, 2026".
  - URL: https://www.board.com/news/board-collaborates-with-microsoft-to-bring-agentic-ai-into-the-core-of-enterprise-planning
- **Board 15.1 (published 2026-08-06, updated 2026-10-13):**
  - Supply Chain and Merchandiser Agents added.
  - "The FP&A Agent adds causal analysis, while the Controller Agent adds deeper intercompany reconciliation and can prepare journal proposals".
  - "Agent version management" and "API Credit monitoring".
  - Datasets limited to 100 per type.
  - URL: https://help.board.com/docs/what-s-new-in-the-board-15-1-release
  - Confidence: High
- **Analyst positions (vendor-published claims):**
  - "We're a Leader in the 2025 Gartner® Magic Quadrant™ for Financial Planning Software" (https://www.board.com/international-recognition)
  - BARC Score Integrated Planning & Analytics DACH 2026 "Market Leader" (https://www.board.com/news/barc-score-for-integrated-planning-analytics-dach-2026-board-once-again-named-market-leader, 2026-03-31)
  - Confidence: Medium

### D3. Jedox
- **MCP server for agent access:** "Jedox MCP gives AI agents and enterprise AI tools governed access to the data, models, planning structures, and business logic inside Jedox… aligns AI access with the rules, roles, and permissions you set". Bring-your-own-model is supported: "proprietary AI models (BYOM)".
  - Agent maturity: the Reporting, Knowledge and Modeling agents are listed under "On the horizon".
  - URL: https://www.jedox.com/en/platform/ai/ (modified 2026-10-09)
  - Confidence: Medium (product page)
- **SAP connector:** "supports extraction of data from SAP ERP, SAP BW/BW on HANA, SAP S/4HANA via sRFC… involves installable transport packages on the SAP side". Write-back is documented for Salesforce, Power BI and Qlik. **SAP write-back is not stated.**
  - URL: https://www.jedox.com/en/platform/integration/ (modified 2026-08-20)
  - Confidence: Medium
- **Analyst position (vendor-published claim):** "named a Leader in the 2025 Gartner® Magic Quadrant™ for Financial Planning Software, marking our third consecutive year". Source dated 2025-12-04.
  - URL: https://www.jedox.com/en/blog/jedox-leader-in-2025-gartner-magic-quadrant/
  - Confidence: Medium

### D4. Workday Adaptive Planning ("Adaptive from Workday")
- **Planning Agent:** "Planning Agent helps early access customers reduce data exploration and analysis by 30%…"; "New Illuminate agents will be available in 2026." The "Flex Credits" consumption model was introduced.
  - URL: https://newsroom.workday.com/2025-09-16-Workday-Illuminate-TM-Expands-with-New-AI-Agents-for-HR,-Finance,-and-Industry (2025-09-16)
  - Confidence: Medium. GA status is **not confirmed**.
- **MCP Server (2026R2 release notes, Preview):** "Workday Adaptive Planning now provides an MCP Server that enables customer AI agents to access Adaptive Planning data and model context through a secure, standardized interface." Customers must opt in to the Universal Main Service Agreement (UMSA) to use it in Preview.
  - URL: https://doc.workday.com/adaptive-planning/en-us/what-s-new/releases/2026r2-release-notes/2026r2-planning-for-hcm-and-financials/adaptive-planning-mcp-server.html
  - Confidence: High
- **Adaptive Decision Intelligence (press release, May 2026):** blocked (403). Snippet only. **Not confirmed.**
- **Analyst position:** Workday announced Leader status for a 4th year (newsroom, 2025-12-04). Search snippet only. Confidence: Low.

### D5. Oracle Fusion Cloud EPM
- **Budget control from planning:** EPM Planning Financials Budget Revisions integrates with Fusion **Budgetary Control**.
  - Quotes: "Financials exports data… when performing a Funds Check"; "load encumbrance data from Budgetary Control to OEP_Consumed"; "Budget Revisions requires that the application is single currency and enabled for Hybrid."
  - URL: https://docs.oracle.com/en/cloud/saas/planning-budgeting-cloud/epbca/fin_budget_adjustment_setup_102x2f7be273.html (2026-09-01)
  - Second quote: "using the write-back feature in Data Integration, transfer budgets to Budgetary Control and enable budgetary control validation."
  - URL: https://docs.oracle.com/en/cloud/saas/epm-cloud/diepm/integrations_fus_bud_intro.html (2026-10-01)
  - Confidence: High
- **Agents:** EPM Assistants are "Preconfigured JSON definitions that help you quickly create AI agents in AI Agent Studio… communicate with Cloud EPM services through REST APIs" (release 26.04). The product page names a "Planning Agent".
  - URLs: https://docs.oracle.com/en/cloud/saas/enterprise-performance-management-common/epmai/epm_assistants_for_planning.html (2026-10-01) and https://www.oracle.com/performance-management/
  - Confidence: High (docs). Medium (product page).
- **Analyst position:** Oracle announced Leader status in the 2025 MQ (oracle.com news, 2026-02-19). Search snippet only. Confidence: Low.

---

## E. Documented gaps and recurring limitations (from the vendors' own documentation)

These are possible areas of differentiation. Each one needs a test before it is used as a claim.

### SAP Analytics Cloud Planning
1. **No in-plan budget enforcement.** BAC runs in S/4HANA at actual posting (ACDOCA against ACDOCP). SAC only supplies budget versions mapped to categories. Oracle documents a funds check from planning; SAP does not, for SAC. (B11)
2. **The integration path is shifting.** The SAC-side "Export Data to SAP S/4HANA" is deprecated in S/4HANA Cloud Public Edition 2608 and replaced by S/4-driven plan-data jobs. Delta mode is not allowed for BAC budget categories. (B10, B11)
3. **Publish conflicts are last-writer-wins by default.** Conflict choice needs an admin toggle and does not exist for account models. Write permissions are checked only at publish, so planners can do work that later cannot be published. (S3, B6)
4. **Data locking edge cases.** Admins and the model creator bypass locks. Locks work only on the default hierarchy. Locks cannot be set on calculated or restricted members. Locked children still receive disaggregated values by default. The Excel add-in shows no lock indication. (B5, S9)
5. **Seamless and live planning are constrained.** Datasphere storage is "still under development". Account models are not supported. Existing models cannot be migrated. Tenants must be linked 1:1 in the same data centre and IdP. Live versions are read-only, cannot be published to, are enabled only through a support case, have a Snowflake guidance limit of about 1 million rows, and **S/4HANA is not a live-version source**. (B7)
6. **Predictive planning is narrow.** Time series only, at most 5 entity dimensions, at most 1,000 entities, no BPC. (B8)
7. **Hard platform limits:** 1M members per dimension; 2^31-1 fact rows per model; 30 concurrent data jobs per tenant; 100 columns for account models and stories. (B9)
8. **Value driver trees:** one account hierarchy per node, one date filter for the whole tree, no data entry with an advanced version filter. (B3)
9. **Commercial and licensing dependencies:** BI users cannot publish. Planning content is locked if licences lapse. Some AI features need SAP AI Units. Agentic "SAP Enterprise Planning" was announced for Q3 2026 GA, but **no product documentation was found on 2026-10-20**. (B8, B12)
10. **Documentation drift.** The official compass learning content (2608) still lists restrictions that SAP said were lifted in Q1 2026. (S2, S6)

### Anaplan
1. **Engine split.** Classic is maintained but gets no major new calculation features. Polaris lacks Optimizer, Brought forward, YTD/YTG and a list of financial functions. Migration requires remodelling "to align to the natural dimensionality of data". (C1, C2)
2. **Hard modelling limits:**
   - Polaris: a dimension index total of 64 per line item; 100 versions per model; 20,000 line items per model; 2,000-character formulas; 10,000-character cells.
   - Classic: 2^31-1 cells per line-item block; dense 8 bytes per cell. (C1)
3. **ALM is all-or-nothing and one-way.** No cherry-picking of changes. Deployed models cannot take revision tags. ALM needs a Professional or Enterprise subscription. (C3)
4. **SAP integration is import-oriented.** The ADO SAP connector names HANA, BW and ECC (OData v4) for import. S/4HANA is not named. No SAP writeback pipeline is documented, although writeback exists for Snowflake, Oracle, Salesforce, SFTP and PostgreSQL. (C5, C6)
5. **No ERP budget-control link documented.** Nothing in the reviewed Anapedia pages covers availability control or funds checking against SAP. This is **not confirmed** as absent globally. (C6)
6. **BYOK is a paid add-on** (Enterprise edition), and data is not encrypted in memory. (C8)

### Peers (for honest positioning)
- **Agentic and natural-language modelling is now table stakes:** Anaplan CoModeler (introduced in the March 2026 release notes), Pigment Modeler Agent, Board Agents (announced as available from 31 March 2026; the Board 15.1 notes of August 2026 describe them in production), the Oracle Planning Agent, and Workday's Planning Agent and MCP Server. A custom product must match a baseline here, not lead on it by default.
- **Standardised agent access via MCP:** Workday has an Adaptive Planning MCP Server (Preview, 2026R2) and Jedox has Jedox MCP. Neither SAC nor Anaplan documents an MCP server in the sources reviewed. This is **not confirmed absent**.
- **Funds check inside planning:** Oracle EPM with Budgetary Control is the documented precedent. It is the closest competitor pattern to "SAP-integrated budgeting with availability control".

---

## F. Unverified or not-confirmed items (do not use without further checks)
- SAC QRC3 2026 planning items (copy step with factor, comment management, data filter parameters, reuse of Datasphere currency tables). Seen only in snippets, including a member blog.
- General availability of "SAP Enterprise Planning" and the "Financial Planning Assistant" (planned Q3 2026). No help.sap.com documentation was found.
- Whether new SAC can be purchased **only** through BDC capacity units.
- S/4HANA on-premise 2025 FPS02 deprecation status of the SAC export.
- Anaplan absolute workspace size (130 GB) and HyperModel (720 GB). Community sources only.
- Anaplan CloudWorks connector list. Snippet only.
- Current CoPlanner terms after 2026-10-15.
- Anaplan Forecaster formal GA date and PlanIQ retirement.
- Workday Planning Agent GA and Adaptive Decision Intelligence (press release 403).
- Oracle, Workday and Pigment MQ positions. Snippets only. SAP, Anaplan, Jedox and Board MQ claims were fetched from vendor pages.
- Any data action runtime limit, version-count limit or table cell limit for SAC planning. Not found in SAC Help.

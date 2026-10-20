# Research A: Building a budgeting and planning application on the SAP BTP ABAP Environment ("Steampunk")

Research date: 2026-10-20. All sources were retrieved on that day. This report uses only SAP-authoritative sources: help.sap.com (read through the portal's JSON content API), the SAP-docs GitHub mirror of the BTP documentation (used for page commit dates), the SAP/abap-atc-cr-cv-s4hc GitHub repository (SAP's released-API list), and one SAP-authored community post (read through the community's public API). The confidence ratings mean:

- **High:** verbatim text in an authoritative source.
- **Medium:** derived from authoritative text, but the text is indirect or partial.
- **Low:** inference only.

## How sources are dated

- **BTP / ABAP environment guide pages** (help.sap.com `ABAP_ENVIRONMENT/250515df61b74848810389e964f8c367` and `BTP/65de2977205c403bbc107264b8eccf4b`, version "Cloud"). The pages are generated from github.com/SAP-docs/btp-cloud-platform. Each entry in this report is marked "last changed YYYY-MM-DD", which is the date of the last git commit to that page in the mirror. I checked every loio cited below against the live help portal and all of them resolve. I also spot-checked several key quotes against the live pages, and they match.
- **ABAP Keyword Documentation for ABAP Cloud.** The old entry URL `https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US/` now redirects (HTTP 301) to `https://help.sap.com/docs/abap-cloud/abap-keyword/...` (version "latest", build 19).
  - The release-news table maps ABAP 9.20 to SAP BTP ABAP environment 2608.
  - Pages for 9.21–9.24 (mapped to 2611/2702/2705/2708) exist but are empty placeholders.
  - So the content effectively reflects release 2608, which is the current release as of October 2026.
- **ABAP Cloud guides** (RAP, integration, ABAP Analytics, ABAP AI) are on help.sap.com/docs/abap-cloud/... with version "sap_btp" or "latest". These pages carry no page date. I cite their build numbers instead.
- **Released-API list:** github.com/SAP/abap-atc-cr-cv-s4hc `src/objectReleaseInfo_BTPLatest.json`. SAP's own viewer maps this file to "SAP BTP ABAP Environment".
  - The file was last changed on 2026-10-06 with the commit "Business AI Platform, ABAP environment 2611" (#194).
  - The previous version is dated 2026-07-29 (2608).
  - I checked every API named in this report: all are already "released" in the 2608 version of the list.
- **Naming change, flagged for awareness.** Since late September 2026, SAP documentation, the help-portal product name, and the add-on community post call the service **"SAP Business AI Platform, ABAP environment"** (formerly "SAP BTP, ABAP environment"). It is the same service, with the same URLs, IDs, service plans and regions.

---

## Q1. Runtime limit on dialog/HTTP (UI/API) requests

- **Finding:** Confirmed.
  - API and UI requests are cancelled automatically after 10 minutes.
  - Long-running work must run as Application Jobs or through bgPF, or be split into smaller work packages.
  - All applications, including jobs, must tolerate being interrupted and restarted.
- **Exact quote:** "For elasticity, operability and protection reasons, the runtime of API or UI requests to ABAP applications is limited. After 10 minutes, running requests are automatically canceled. Tasks requiring longer runtimes have to be executed in Application Jobs, as background processes via the background processing framework (bgPF), or need to be split into smaller work packages. For an optimal user experience, all ABAP applications, including application jobs, have to be prepared to be interrupted and restarted even earlier than the maximum runtime."
- **URL:**
  - https://help.sap.com/docs/btp/sap-business-technology-platform/development-in-abap-environment
  - The same page is at https://help.sap.com/docs/ABAP_ENVIRONMENT/250515df61b74848810389e964f8c367/31367ef6c3e947059e0d7c1cbfcaae93.html?version=Cloud
- **Date:** last changed 2025-03-19. I checked the live page on 2026-10-20.
- **Verdict on the report claim:** **Accurate.** "Background processing" in the claim corresponds to bgPF in SAP's text. "Tolerate interruption and restart" matches "prepared to be interrupted and restarted even earlier than the maximum runtime".
- **Confidence:** High.

**Related limits that matter for a budgeting engine:**
- **Per-session memory.** "The memory limit for a single session is 4 GB, regardless of the application server size. Large servers allow memory exemptions (of up to 16 GB) requested programmatically using `cl_ssi_rp_session_memory`."
  - Source: "ABAP Compute Units", https://help.sap.com/docs/ABAP_ENVIRONMENT/250515df61b74848810389e964f8c367/7d1caa87c4b34366a7cf1b00a93199e2.html?version=Cloud (last changed 2026-09-30).
  - Confidence: High.
- **Set-based database copy.** ABAP SQL supports `INSERT ... FROM ( SELECT subquery_clauses ... )` in ABAP Cloud. This is useful for copying plan versions without loading rows into ABAP memory.
  - Source: Keyword Documentation `abapinsert_source`.
  - Confidence: High.

---

## Q2. Background and parallel processing, RAP save-sequence rules, numbering

**Application Jobs**
- **Model:** a class implements the job interfaces. In ADT you then create a job catalog entry, and a job template that refers to the catalog entry.
  - Quote: "Define the job catalog entry. Using ABAP development tools for Eclipse, you create a job catalog entry which refers to the class of step 1 … Define the job template. Using ABAP development tools for Eclipse, you create a job template which refers to the job catalog entry of step 2."
  - Source: https://help.sap.com/docs/ABAP_ENVIRONMENT/250515df61b74848810389e964f8c367/949ba003345b476e99e46b920f41632d.html?version=Cloud (last changed 2026-09-30).
  - Confidence: High.
- **API:** "You can use the `CL_APJ_RT_API` class to maintain application jobs … schedule … retrieve the status … cancel … delete".
  - Source: …/1491e6c075c04e7c9a485a2e24b82653.html (last changed 2024-02-21).
  - Release state in the BTP list: `CL_APJ_RT_API` released; `IF_APJ_DT_EXEC_OBJECT`, `IF_APJ_RT_EXEC_OBJECT` and `IF_APJ_JT_CHECK_20` released; `IF_APJ_JT_CHECK` deprecated with successor `IF_APJ_JT_CHECK_20`; `CL_APJ_DT_CREATE_CONTENT` released.
  - Confidence: High.
- **Automatic restart:** "If an application job stops running due to process interruption … Another server resumes processing the application job as soon as possible, starting with the job step that was interrupted … implement your logic in a way that it's transactionally consistent and can be restarted at any time."
  - `CL_APJ_RT_API=>GET_OWN_AUTO_RESTART_NUMBER` and `IS_EXPLICIT_RESTART` detect a restart.
  - Jobs that recur more often than every 5 minutes are cancelled rather than restarted.
  - Source: …/5bb62cec33834c6eaa5b80e82b34e54a.html (last changed 2026-05-13).
  - Confidence: High.
- **Intended use:** "The application job framework ideally defines long-running, repeated jobs. It's not recommended to use it to define short-running jobs with a high frequency."
  - Source: …/0837d1ea0b0b4d3892f66e8533b654cb.html (last changed 2024-11-13).
  - Confidence: High.

**bgPF (Background Processing Framework)**
- "The bgPF is based on the background remote function call (bgRFC) … supports the transactional and the queued background processes … exactly once … exactly once in order … The bgPF is available since SAP BTP ABAP environment 2308."
- Source: https://help.sap.com/docs/abap-cloud/abap-concepts/background-processing-framework (ABAP Cloud concepts, version sap_cross_product_abap, build 8556). There is also a BTP pointer page, …/0ad13bd0fafb46f08d3f5174d5fd01f9.html (last changed 2025-03-19).
- Release state: `CL_BGMC_PROCESS_FACTORY` released, along with `IF_BGMC_PROCESS_FACTORY`, `IF_BGMC_OP_SINGLE` and `IF_BGMC_OP_SINGLE_TX_UNCONTR`.
- Confidence: High.

**CL_ABAP_PARALLEL**
- Released (BTP list; application component BC-ABA-LA).
- Documented for the ABAP environment: "To start parallel tasks, use class `CL_ABAP_PARALLEL` … two of the free dialog processes on a server are always retained … it's not efficient to parallelize very short-running operations. The time limit is around 200 milliseconds."
- Source: …/1193647aaf804eee8d8356ffe4096423.html (last changed 2025-06-11).
- Confidence: High.

**RAP save-sequence restrictions**
- **Handler/saver restriction table** (ABAP Cloud keyword doc "Restrictions in RAP Handler and Saver Methods", `abapinvalid_stmts_in_rap_methods`):
  - "Database modifications using the standard connection" are marked "-" (not allowed) for all handler methods, including determinations on modify/save and validations, and for FINALIZE, CHECK_BEFORE_SAVE, CLEANUP and CLEANUP_FINALIZE.
  - They are allowed only in ADJUST_NUMBERS and SAVE/SAVE_MODIFIED.
  - "COMMIT [WORK | ENTITIES], ROLLBACK [WORK | ENTITIES]" is "-" in every handler and saver method.
  - Confidence: High.
- **Controlled SAP LUW** (`abapinvalid_stmts_in_tx`): "Database modifications | - | X | Only allowed in the late save phase …" and "In the contexts of RAP … local consumption of RAP business events, bgPF, and classified APIs, commit or rollback statements are not allowed."
  - Confidence: High.
- **FINALIZE** (RAP guide, sap_btp, build 8220): "FINALIZE is the last chance to change BO instances on the transactional buffer via EML modify calls. After this step, EML modify requests result in runtime errors."
  - Confidence: High.
- **BEHAVIOR_ILLEGAL_STATEMENT**
  - ABAP Cloud keyword doc, RAISE ENTITY EVENT: "The statement can only be used in ABAP behavior pools by RAP saver methods in the RAP late save phase. Otherwise, the runtime error BEHAVIOR_ILLEGAL_STATEMENT occurs."
  - The classic (S/4HANA 2025) keyword doc "RAP Implementation Rules" maps checkpoint group CC_STMT (controlled SAP LUW checks) to the runtime errors "BEHAVIOR_ILLEGAL_STATEMENT, BEHAVIOR_ILLEGAL_STMT_IN_CALL". It also notes that activation is not required "in the restricted ABAP language version scope".
  - Confidence: High for the error name. Medium that every violation in ABAP Cloud raises this specific dump, as opposed to being logged.

**Late numbering**
- "In the ABAP behavior pool, the RAP saver method adjust_numbers must be implemented to assign a final primary key value … just before the instance is saved on the database. Thus, a gapless assignment of unique keys is ensured."
  - Source: keyword doc `ABENBDL_LATE_NUMBERING`.
- RAP guide ADJUST_NUMBERS: "called during the save sequence after the point-of-no-return … Usually the final key value is assigned by number range objects".
- Confidence: High.

**Number range APIs**
- Released (BTP list): `CL_NUMBERRANGE_RUNTIME`, `CL_NUMBERRANGE_INTERVALS`, `CL_NUMBERRANGE_OBJECTS` and `CL_NUMBERRANGE_BUFFER`.
- Deprecated: the older `CL_NUMBER_RANGE_RUNTIME/INTERVALS/OBJECTS`.
- Not to be released: the SNR* function groups.
- For RAP: "The CL_NUMBERRANGE_BUFFER class provides methods for getting numbers from an interval at runtime" (…/aa5e287bc8214c079922680f6688a55c.html, last changed 2023-11-01).
- Confidence: High.

---

## Q3. Numerics, currencies and random numbers

**Types** (keyword doc "Built-In Numeric Types"):
- decfloat34: "16 byte | Decimal floating point number type with 34 places … each 34-digit decimal number can be represented exactly".
- p: "The valid length for packed numbers is between 1 and 16 bytes … After the decimal separator, up to 14 decimal places are allowed". 16 bytes means 31 digits.
- Confidence: High.

**Calculation type** (`abenarith_type`):
- Priority order: decfloat34 if any decfloat operand; then f (or the `**` operator); then p; then int8; then i.
- Calculation type p: "calculated with an internal precision of 31 places … If an overflow occurs … recalculated to an internal precision of 63 places … Surplus decimal places … are rounded commercially … for each interim result."
- decfloat34: "Interim results are rounded commercially".
- Warning in the doc: an inline declaration with calculation type p produces "data type p with length 8 and no decimal places".
- Confidence: High.

**round()** (`abendec_floating_point_round`):
- `round( val = arg {dec = n}|{prec = n} [mode = m] )`. Modes are the CL_ABAP_MATH constants ROUND_HALF_UP, ROUND_HALF_DOWN, ROUND_HALF_EVEN, ROUND_UP, ROUND_DOWN, ROUND_CEILING and ROUND_FLOOR.
- "If mode is not given a value, commercial rounding is used." Half-even is described as "rounded to the value whose rightmost digit is an even number."
- Confidence: High.
- `CL_ABAP_MATH` and `CL_ABAP_DECFLOAT` are both released.

**Currencies whose decimals are not 2 (JPY 0; KWD/BHD/OMR 3)**
- **DDIC currency fields** (`abenddic_currency_field`): "A currency amount is an integer in the smallest unit of the currency … By default, the number of decimal places for a currency is always two. Currencies with a different number of decimal places must also be entered in the table TCURX".
  - A currency field may have data type CURR, DECFLOAT16 or DECFLOAT34.
  - Operations the doc calls critical include multiplying two currency fields and operations between fields with different currencies: "Accurate results should not be expected … if the number of decimal places in the program does not match the number in the currency."
  - Confidence: High.
- **CDS amount fields** (`abencds_amount_field`):
  - Allowed types: CURR, DECFLOAT34, DEC and FLTP.
  - Functions: "GET_NUMERIC_VALUE … CURR_TO_DECFLOAT_AMOUNT: converts an amount field of data type CURR into an amount field of data type DECFLOAT34", with "an implicit decimal shift".
  - "The function DECIMAL_SHIFT is not available in CDS view entities."
  - Confidence: High.
- **CDS CURRENCY_CONVERSION** (`abencds_conv_func_unit_curr_v2`):
  - Parameters: amount (CURR or DECFLOAT34), source/target currency, exchange_rate_date, exchange_rate_type (default 'M'), round, decimal_shift and decimal_shift_back. Conversion uses "TCUR... of package SFIB".
  - "The inbound value is rounded to two decimal places before it is converted."
  - decimal_shift multiplies "by 10 to the power of two minus the number of decimal places of the source currency".
  - Calculation happens on the database: "part of the calculation takes place using different rounding rules from ABAP".
  - In ABAP Cloud, only `$session.client` may be passed as the client.
  - The DDIC doc adds a hint: "CURRENCY_CONVERSION … also assumes two decimal places for currency fields. If the function … is used with other amounts of decimal places, unexpected behavior may arise."
  - Confidence: High.
- **ABAP environment guidance:**
  - "Currency Conversion" (…/680f68b1c2fd4eb08de178a504fc6603.html, last changed 2026-02-18): "you can use API class `CL_EXCHANGE_RATES` to load the current exchange rates into your system … provides PUT methods to write exchange rates … additionally provides two methods to convert currencies."
  - The page points to sample github.com/SAP-samples/cloud-abap-exchange-rates.
  - "Currency Amount Conversion" (…/9a3de2fc04d5407a90d8a7e5d2037871.html, last changed 2025-11-12) uses `CL_CONVERSION_EXT_INT` (released) with methods CURRENCY_AMOUNT_EXT_TO_INT / INT_TO_EXT. Quote: "two Yen are stored as 0.02 in the database in a field of data type CURR. All SAP currency data types have two decimal places, despite some currencies having three decimal places."
  - Confidence: High.
- **Release states (BTP list):**
  - Released: `CL_EXCHANGE_RATES`, `I_EXCHANGERATERAWDATA`, `I_EXCHANGERATETYPE`, `I_EXCHANGERATEFACTORSRAWDATA`, `I_CURRENCY`, `I_CURRENCYTEXT`, `CL_CONVERSION_EXT_INT` and `CL_UOM_CONVERSION`.
  - Not to be released: TCURX, TCURR, TCURC, TCURF and TCURN. The successor given for TCURX is I_CURRENCY.
  - Confidence: High.
- **Not confirmed:** that I_Currency exposes a decimals field. I did not inspect its field list. Also not confirmed: which app, if any, maintains currency decimals or exchange rates in the BTP ABAP environment, beyond the `CL_EXCHANGE_RATES` API.
- **Newer amount types:** DECFLOAT34 amount fields together with CURR_TO_DECFLOAT_AMOUNT are the documented modern option. I found no other new "amount type".

**Random numbers**
- Released in the BTP list: `CL_ABAP_RANDOM`, `CL_ABAP_RANDOM_INT`, `CL_ABAP_RANDOM_INT8`, `CL_ABAP_RANDOM_FLOAT`, `CL_ABAP_RANDOM_DECFLOAT16`, `CL_ABAP_RANDOM_DECFLOAT34`, `CL_ABAP_RANDOM_PACKED` and `CL_ABAP_RANDOM_PACKED_DEC1` through `CL_ABAP_RANDOM_PACKED_DEC14`.
- Confidence: High.

---

## Q4. AMDP/SQLScript and HANA PAL/APL

- **AMDP is allowed in ABAP Cloud, with restrictions.** Keyword doc "AMDP - Procedure Implementations" (`abenamdp_procedure_methods`): "The following additional restrictions apply in the current ABAP language version ABAP for Cloud Development:
  - The AMDP procedure implementation must be restricted to reads by using the addition AMDP OPTIONS READ-ONLY …
  - AMDP methods must be client-safe by using one of the AMDP options CDS SESSION CLIENT DEPENDENT or CLIENT INDEPENDENT.
  - The AMDP procedure must be implemented in SQLScript.
  - Repository objects that are used in the AMDP procedure implementation must be released for ABAP for Cloud Development …
  - Only objects in the current ABAP database schema can be accessed in the implementation. Other prefixes or corresponding AMDP macros are not allowed.
  - Any statements that could potentially cause problems are not allowed … no CE_... SQLScript operators are allowed and session variables cannot be accessed."
  - Also: `USING SCHEMA … OBJECTS` is "not available in the current ABAP language version".
  - Confidence: High.
- **PAL/APL from the BTP ABAP environment: not possible today, per SAP.** "ABAP Cloud Roadmap Information > Implementation" (help.sap.com/docs/ABAP_PLATFORM_CROSS/f2afdaf444844c38909aefc7bc792cdb/378a117413464dab8eaa83d583fbf1f8.html, version latest, build 926):
  - Item "Cloud-Ready ADMPs – Access to Database Objects in Separate Database Schemas", with "Planned Release: SAP Business AI Platform, ABAP environment 2611".
  - "Currently, cloud-ready AMDPs only allow to access ABAP-managed database objects that are located in the ABAP database schema … some scenarios require access to database objects in other schemas within the same HANA instance (like AFLs) … The AMDP infrastructure will also allow to access these database objects".
  - This is a roadmap item, not a commitment.
  - Confidence: High that it is not possible today. **Not confirmed** that 2611 will actually enable PAL/APL, or which AFL procedures would be allowed.
- **Multitenancy caveat:** the Multitenancy Development Guideline says "native SAP HANA database access via ABAP-managed database procedures (AMDP) requires special considerations … Always add the selection of the client to ABAP database procedures".

---

## Q5. CDS, analytics and UI

- **CDS hierarchies:** `DEFINE HIERARCHY … AS PARENT CHILD HIERARCHY( SOURCE … CHILD TO PARENT ASSOCIATION … [DIRECTORY … FILTER BY …] … SIBLINGS ORDER BY … [MULTIPLE PARENTS …] [ORPHANS …] [CYCLES …] …)` is documented in the ABAP Cloud keyword doc (`abencds_f1_define_hierarchy`).
  - Roadmap: "CDS-Native Hierarchies – Extended Support", with convenience tools for hierarchy creation and structure maintenance, is planned for 2702.
  - Confidence: High.
- **Analytical queries:** provider contract `ANALYTICAL_QUERY` (keyword doc `abencds_pv_provider_contract`): "CDS analytical projection views are intended for modelling analytical queries … the projected entity must be an analytical cube view or an analytical dimension view … runtime … ABAP Analytical Engine". The doc example uses `define transient view entity … provider contract analytical_query`.
  - Confidence: High.
- **SAP Analytics Cloud live connection through InA:**
  - "Integrating SAP Analytics Cloud" (…/587aec4da9e04aa1a5736996bffe452f.html, last changed 2022-09-23): "configure a live data connection in SAP Analytics Cloud and create an SAP Analytics Cloud model based on an ABAP environment analytical query … exposed via the analytical engine and the InA protocol via the REST services under `/sap/bw/ina/...`".
  - The communication scenario is **SAP_COM_0065 "SAP Analytics Cloud Integration"**: the communication-scenarios overview lists it, and "Create a Communication Arrangement" says "Select the communication scenario SAP_COM_0065".
  - ABAP Analytics guide (abap-cloud/abap-data-models, sap_btp): "InA can be specified as a type of service binding … You can connect your ABAP system to SAP Analytics Cloud using an InA service and a Live Data Connection."
  - Service binding type: "InA - UI".
  - Confidence: High.
  - **Not confirmed (not researched):** whether SAC planning or write-back works on a live connection to the ABAP environment.
- **Fiori elements OData V4 tree tables and hierarchy maintenance** (RAP guide "Treeview Features", sap_btp):
  - "you can create read-only and editable treeviews with drag and drop, cut and paste, reorder, copy, and cascading delete options."
  - "For editable treeviews, hierarchies with directories are the only technically possible implementation. If you create an editable treeview without a directory, you will only get a read-only treeview" (page "Hierarchy Directories").
  - Editable treeviews are tied to draft.
  - Confidence: High.
- **Analytical tables / ALP:** RAP guide "RAP Analytical Tables": "RAP analytical tables in OData V4 enable analytical evaluations in RAP apps. RAP analytical tables are available in read-only scenarios and on a list report page" (via `@OData.applySupportedForAggregation: #FULL`).
  - Restriction: "CDS entities annotated for RAP analytical tables consumption aren't enabled for extensibility."
  - Confidence: High.
  - The **Analytical List Page floorplan with RAP is not confirmed**: no RAP doc found. SAPUI5 documents ALP for OData V4 in general.
- **Excel, XCO XLSX:**
  - "The XCO XLSX module offers a set of standard abstractions and APIs to programmatically work with XLSX workbooks … XCO_CP_XLSX … XCO_CP_XLSX_SELECTION … XCO_CP_XLSX_READ_ACCESS" (…/9b7a0d1e35524abba3b6fcb206851b95.html, last changed 2023-11-01).
  - Write access: "`xco_cp_xlsx=>document->empty( )->write_access( )` … `get_file_content( )` … `add_new_sheet( )`" (…/8dddce9fd9954e72a09d2b39d22db995.html, last changed 2026-04-29).
  - Released: `XCO_CP_XLSX`, `XCO_CP_XLSX_READ_ACCESS`, `XCO_CP_XLSX_WRITE_ACCESS`, `XCO_CP_XLSX_SELECTION`, plus style and color classes.
  - Confidence: High.
- **File upload (large objects):** RAP guide "Working with Large Objects": "You can enable your RAP application for maintaining large objects (LOBs) … incorporate external binary files or text files when editing entity instances." The fields are Attachment, Mimetype and Filename, and the doc shows the Fiori Elements upload.
  - Confidence: High.
- **UI5 apps deployed to the ABAP environment** ("SAP Fiori Applications in the ABAP Environment", …/1d9deef79d7d4936850b2d6343206ec8.html, last changed 2025-04-02):
  - Deployment goes to "the SAPUI5 ABAP repository … A business server page (BSP) application … ICF node … launchpad app descriptor items".
  - Restriction: "Only OData UI services from your custom service binding are supported. API services on SAP Business Accelerator Hub are not supported."
  - A "Freestyle App Integration" page shows freestyle apps using the reuse library in this environment.
  - Confidence: Medium that freestyle (non-Fiori-elements) apps deploy the same way. The docs describe "SAP Fiori application" deployment generically and do not single out freestyle.

---

## Q6. Per-customer configuration

- **Business Configuration Maintenance Object** (…/61159c4dc45b45619b46b4620615c357.html, last changed 2026-02-03):
  - "declares a service binding as relevant for business configuration. It will be shown … in the Fiori app Custom Business Configurations App."
  - Prerequisites: an OData V4 UI binding; a draft-enabled root; a composition tree of height at most 2 (or 3 with a singleton root); "The data model must consist only of client-dependent tables."
  - API: `MBC_CP_API` (released).
  - Confidence: High.
- **Custom Business Configurations app** (…/76384d8e68e646d6ae5ce8977412cbb4.html, last changed 2026-02-03): business catalog `SAP_CORE_BC_BCT_MBC_PC`, role template `SAP_BR_BPC_EXPERT`.
  - Confidence: High.
- **Customizing transports** ("Transport of Business Configuration", …/7d7c3441f9a84208b3efe20a0356f3fb.html, last changed 2025-02-05):
  - "you record business configuration changes on transport requests of type Customizing. Once you release the request, all the changes are pushed into the remote repository associated with the used software component".
  - Patterns: isolated tenants; a software component of type Business Configuration; or Development software components.
  - "All consumer tenants (≥200) in multitenant systems are isolated tenants because the administration of software components is not supported in these tenants."
  - The Export Customizing Transports app uses catalogs `SAP_CORE_BC_BCT_TRN_MNG_PC` and `SAP_CORE_BC_BCT_TRN_REL_PC`.
  - The transport API `CL_BCFG_CD_REUSE_API_FACTORY` is released.
  - Confidence: High.

---

## Q7. Workflow

- **SAP Build Process Automation / workflow capability** (Proxy API page, …/059470b6349d482f89eb9993be14ec00.html, last changed 2025-04-02): "With the proxy API, you can start workflows of the workflow capability within SAP Build Process Automation out of your ABAP Environment. The overall starting point is the class CL_SWF_CPWF_API_FACTORY_A4C."
  - Released: `CL_SWF_CPWF_API_FACTORY_A4C`, `IF_SWF_CPWF_API`, `I_CPWF_INST` (BDEF and CDS) and `IF_SWF_CPWF_CALLBACK`.
  - The RAP guide "Integrating SAP Workflow Management" explains triggering from a determination on save, including with late numbering (`setPayload` in adjust_numbers).
  - "Integrating SAP Workflow Management" (…/b7931f7b42d5433987b9d3f30e2445fd.html, last changed 2025-02-19) covers the setup.
  - Confidence: High.
- **Not confirmed:**
  - Building custom ABAP flexible workflow scenarios inside the BTP ABAP environment. Some flexible-workflow BAdIs and CDS views (BC-BMT-WFM) appear as released in the BTP list, but I found no ABAP environment documentation for custom scenarios.
  - A "My Inbox" app inside the ABAP environment.
  - Approval tasks therefore appear to live in SAP Build Process Automation, but that is an inference (confidence Low).

---

## Q8. Multitenancy and product delivery

- **Multitenant SaaS: tenant = client.** Multitenancy Development Guideline (…/9d994c89909c49e2957db840d7eace5c.html, last changed 2025-04-17):
  - "We use multiple clients in the ABAP environment as a technical means to implement multitenancy."
  - Limitations:
    - "Multitenancy isn't supported for the development scenario using the ABAP Development Tools … a consumer can't further develop or extend the provider's SaaS application using ADT."
    - "Transport of objects isn't supported in a multitenant environment."
    - "Tenant isolation isn't completely ensured by the ABAP environment infrastructure."
    - "If strict data isolation is a legal requirement, we propose an external audit".
  - Confidence: High.
- **SaaS guide** (…/e3c38ebaefc44523b679e7a0c375bc86.html, last changed 2026-04-01):
  - The add-on is registered with the SaaS provisioning service.
  - The ABAP Solution Service provisions instances and tenants.
  - Single-tenant or multi-tenant enabled.
  - The "Maintain Solution" app in the Landscape Portal replaces older tutorials.
  - Sizing page: you set a "Tenant Limit"; "For multitenancy offerings, there's no sizing/quota per customer".
  - ACU page: "For every 100 tenants, at least one ACU and two HCUs are required."
  - Service plan `saas_oem`: "Allows you to create projects for ABAP systems to run multitenancy SaaS applications."
  - Confidence: High.
- **Landscape Portal** (help.sap.com/docs/sap-btp-abap-environment/landscape-portal, build 182):
  - Apps for the add-on lifecycle: Register Product, Build Product Version, Publish Product, Discover Product, Deploy Product, Manage Consumer Subscription, Maintain Solution and Manage System Hibernation.
  - Publish Product: "You, as a partner, have developed a product that you want to make available to your customers as an add-on that they can install into their system … A product must be offered via the SAP Store … Solution ID and Edition ID".
  - Discover Product (customer side): "The use of the Discover Product app is tied to certain terms and conditions."
  - Confidence: High.
- **Verification of the report claim** about https://community.sap.com/t5/technology-blog-posts-by-sap/sap-btp-abap-environment-new-software-delivery-option-add-on-product/ba-p/14094161:
  - **Accurate.**
  - About the post: SAP-authored community post in the "Technology Blog Posts by SAP" board, by Nora_Klemp. The current title is "SAP Business AI Platform, ABAP environment – New software delivery option 'Add-On Product'". Posted 2025-08-13; last edited 2026-10-06 (revision 51), according to the community API.
  - Quote: "supports now two options for partners to deliver products to their customers … multitenant software-as-a-service (SaaS) solutions … service offering … 'Add-On Product' … software offering … The customer installs and operates it in his own ABAP environment systems."
  - **Partner and commercial prerequisites stated in the post:**
    - "A prerequisite … is a SAP PE Build contract for the respective partner."
    - Comparison table:
      - Commercial prerequisites for both options: "SAP PE Build contract with SAP Store enhancement".
      - Required PartnerEdge-Build commercial model: "Platform" for SaaS, "Integration" for Add-On Product.
      - "Product offering in SAP Store is mandatory: Yes | Yes".
      - Add-On: runs in the customer's global account; operations, upgrade scheduling and infrastructure costs are the customer's; extensibility is "Developer extensibility". SaaS gets key-user extensibility.
    - "To deliver the Add-On Product … the partner requires the SAP PE track 'Build'. Using any other track is not possible."
    - Programme requirements: "Valid due diligence; … SAP PartnerEdge program agreements; Completion of compliance trainings; The Accounts payable is in good standing; … Paying of the annual program fee; Maintenance of ongoing … requirements".
    - "The provision of the Add-On product is only permitted and possible via the SAP Store."
    - Revenue share: "Any partner selling a GTM-ready solution must adhere to paying a revenue share to SAP according to the price list for the Build track … regardless of whether SAP facilitated the customer transaction".
    - Partner licences: material 8006181 (runtime, 16 GB blocks, minimum 1) and 8006182 (persistence, 16 GB blocks, minimum 2). "The minimum setup of a system is 16 GB runtime … and 32 GB persistence".
    - Customer side: "a signed Amendment to SAP Business Technology Platform Supplemental Terms and Conditions for ABAP Add-ons is required … automatically part of … contracts … with signed date on April 23, 2025 or later … For customer BTP contracts signed before April 23, 2025 … create a customer ticket for component BC-CP-ABA … DocuSign". "The customer can only see the product in the Landscape Portal if the amendment is signed."
    - Optional certification through the SAP Integration and Certification Center.
  - The post carries a disclaimer that it "does not replace legal agreements … cannot serve as single point of truth."
  - Confidence: High that the post says this. Commercial terms must be confirmed with SAP.
- **Conflicts to flag:**
  - **Add-on scope.** The help.sap.com SaaS guide (last changed 2026-04-01, still live) says: "You should only consider using add-on delivery if you intend to offer a Software as a Service (SaaS) solution." "Set Up Add-On Build" says: "Your add-on product should only be installed in ABAP systems in your global accounts for development and production." Both contradict the newer customer-installed Add-On Product option, which the post and the Landscape Portal Publish/Discover Product pages document. The SaaS-guide text is likely stale.
  - **Add-ons per system.** The SaaS guide says "Note that only one add-on can be installed per system." Landscape Portal "Deploy Product" says "You can install multiple add-ons on one Steampunk system if each add-on uses unique software components".

---

## Q9. Forms and PDF output (a "budget book")

- **Adobe Document Services rendering:**
  - "The Adobe Document Services (ADS) can render Adobe XML Forms (XFA) to PDF documents and other print formats" ("Print Forms", …/959664fed2114b7ba070c5bc8b4beba2.html, last changed 2021-12-17).
  - Runtime API `CL_FP_ADS_UTIL` with `RENDER_PDF` and `RENDER_4_PQ` (…/3d8686d312bc426d8b2aa323473996b0.html, last changed 2025-11-12).
  - Data from RAP service definitions through `CL_FP_FDP_SERVICES` (XML data and XSD) (…/a104660468324090b601ee2969a54d99.html, last changed 2025-08-06).
  - Form templates are uploaded in ADT and read with `CL_FP_FORM_READER` (…/1ff85ee73c784dd1ae9abe72e2c43003.html).
  - Print queues: `CL_PRINT_QUEUE_UTILS=>CREATE_QUEUE_ITEM_BY_DATA` (…/754b6cdbb0d545918a7387c1ccaa7811.html, last changed 2026-09-28).
  - Connection to the SAP Forms service by Adobe is through communication scenario **SAP_COM_0503** ("Configure the SAP Forms Service in the ABAP Environment", help.sap.com/docs/CP_FORMS_BY_ADOBE/dcbea777ceb3411cb10500a1a392273e/265dfc44ab754ac19da5cd3ada856cee.html).
  - Confidence: High.
- **Merging PDFs:** `CL_RSPO_PDF_MERGER` / `IF_RSPO_PDF_MERGER` are released (BTP list). Usage docs were not read (confidence Medium).
- **Output management:** the BTP "Output Management" page has no body text. `CL_APOC_OUTPUT_REQUEST_API` appears as released in the BTP list. **Not confirmed** that it is usable for custom objects in the ABAP environment.
- **Licensing:** the SAP Forms service by Adobe is a separate BTP service, so a separate entitlement is implied. Pricing was not researched.

---

## Q10. AI: ABAP AI SDK powered by ISLM

- **Availability** ("Availability" page, help.sap.com/docs/abap-ai/generative-ai-in-abap-cloud, build 8929): "ABAP AI SDK | SAP Business Technology Platform | SAP S/4HANA Cloud Public Edition | SAP S/4HANA Cloud Private Edition | SAP S/4HANA".
  - Confidence: High.
- **What it is:** "an ABAP reuse library that supports you in interacting with large language models (LLMs) hosted on the generative AI hub in SAP AI Core … the official client for consuming LLMs in ABAP." It offers prompt completion, a prompt library, function calling and exception handling.
  - ISLM provides "Connectivity management to the generative AI hub", prompt templates and "Auto enablement (turnkey)".
- **Released APIs** (BTP list):
  - `CL_AIC_ISLM_COMPL_API_FACTORY` (usage: `cl_aic_islm_compl_api_factory=>get( )->create_instance( <intelligent scenario> )`).
  - `CL_AIC_ISLM_ORCH_API_FACTORY` (orchestration service).
  - `CL_AIC_ISLM_PROMPT_TPL_FACTORY`.
  - `CL_AIC_ISLM_METADATA_FACTORY`, new in the 2611 list.
  - `IF_AIC_COMPLETION_API`, `IF_AIC_ORCHESTRATION_API`, `IF_AIC_PROMPT_TEMPLATE`, `IF_AIC_FUNCTION_SPECIFIER` and others.
  - Confidence: High.
- **Setup and constraints:**
  - Requires SAP AI Core: "You have purchased the license for SAP AI Core", plan "Extended" (…/5b35ee98403045309bb0f8c7f0c79365.html, last changed 2026-09-30).
  - Requires communication scenario **SAP_COM_0A69** (…/8dd73367ad7542109c7c54edeb1ab9c5.html, last changed 2025-04-17).
  - Region mapping: the regions page notes "SAP Business AI Platform, ABAP environment is available in other regions than SAP AI Core … a mapping between regions might be required, see 3566760". SAP Note 3566760 was not read.
  - Constraints page: "the result obtained from a large language model can be a wrong answer … hallucination … models can be deprecated or become unavailable at any time … The release cycles for the generative AI hub and the ABAP AI SDK … differ".
  - Confidence: High.
- **Other caveats:**
  - Classic ML through ISLM with PAL is documented for S/4HANA on-premise ("Create an Intelligent Scenario Using PAL"). For the BTP ABAP environment, AFL access is blocked today (see Q4). **Not confirmed** for BTP.
  - "SAP Joule for developers, ABAP AI capabilities" (developer tooling) requires "an additional license". This is separate from the SDK.

---

## Q11. Events

- **RAP business events:** "an event can be defined in the behavior definition … with the key word event EventName … raised in the behavior implementation in the late save phase" (RAP guide "Business Events"). In the keyword doc, RAISE ENTITY EVENT outside the late save phase gives BEHAVIOR_ILLEGAL_STATEMENT.
  - Confidence: High.
- **Consuming SAP S/4HANA and other events** ("Event-Based Development Flow", abap-cloud/abap-integration-connectivity, sap_btp, build 8228):
  - "To consume an event, you need to create an event consumption model … Events can also be consumed in the same system as they are raised".
  - Event infrastructures: SAP Event Mesh (communication arrangement created from the service key) and SAP Advanced Event Mesh (SAP_COM_0492 / SAP_COM_0493).
  - "The events are compliant with the CloudEvents specification."
  - Confidence: High.

---

## Q12. Regions

Source: "Regions and API Endpoints for the ABAP Environment" (help.sap.com/docs/btp/sap-business-technology-platform/regions-and-api-endpoints-for-abap-environment; loio 879f37370d9b45e99a16538e0f37ff2c; last changed 2026-09-30; live page checked).

**Enterprise-account regions:**

| Provider | Regions |
|---|---|
| SAP Cloud Infrastructure | eu01 Frankfurt |
| AWS | ap10 Australia (Sydney), br10, ca10, **eu10 Europe (Frankfurt)** (incl. eu10-002…006), eu11 Frankfurt EU Access, jp10 Japan (Tokyo), **ap11 Singapore**, ap12 South Korea (Seoul), us10, us11 |
| Azure | ap20 Australia (Sydney), **ap21 Singapore**, br20, ca20, ch20, eu20 Netherlands, eu22 Frankfurt, jp20 Japan (Tokyo), us20, us21 |
| Google Cloud | ap30 Australia (Sydney), br30, eu30 Frankfurt, il30, **in30 India (Mumbai)**, jp30 Japan (Osaka), jp31 Japan (Tokyo), sa30/sa31 KSA, us30 |

- Trial regions: us10 and ap21 Singapore.
- **No Malaysia region is listed.** I also found no "Malaysia" or "Kuala Lumpur" anywhere in the BTP documentation mirror.
- The user's eu10 (AWS Frankfurt) is supported.
- Confidence: High.

---

## Q13. Commercial and sizing model (no prices)

- **Service plans** ("Service Plans and Metering for SAP Business AI Platform, ABAP environment", …/b7f5a93ce3804963ab7fd547f3c4fdf9.html, last changed 2026-09-28):
  - `free`: "small proof-of-concept development projects … The instance will be stopped each night automatically and needs to be started again via the Landscape Portal. Only community support … not subject to SLAs."
  - `standard`: "development, test, and productive ABAP systems. The minimum system size is 2 HANA Compute Units and 1 ABAP Compute Unit."
  - `abap_compute_unit`: runtime memory, metered "in 16 GB blocks on an hourly basis".
  - `hana_compute_unit`: persistent memory, also in 16 GB blocks, hourly.
  - `saas_oem`: for multitenant SaaS, same minimum.
  - `16_abap_64_db`: deprecated.
  - "It is mandatory to assign a combination of three entitlement service plans: ABAP Compute Unit, HANA Compute Unit, and either the Free, Standard, or SaaS OEM plan."
  - Confidence: High.
- **ACU:** "Each ABAP Compute Unit comprises 16 GB of memory and approximately four virtual CPUs (vCPUs)." The maximum number of ACUs is at most twice the number of HCUs.
- **Creating an ABAP System** (…/50b32f144e184154987a06e4b55ce447.html, last changed 2026-05-27):
  - Runtime sizes: "0.5, 1, 1.5, 2, 3, 4, 4.5, 6, 8, 16, 24, 32, or 64" ACU.
  - HCU per HANA instance: 2, 4, 8, 16, 32 or 64. "one HANA compute unit representing a block size of 16 GB".
  - Disk: auto "40 * size_of_persistence + 40" GB; extra disk "0.002 HCU" per GB.
  - Elastic scaling: "charges are only levied based on the actually allocated ACUs, and not on the configured maximum".
  - Multi-AZ "doubles the HANA compute unit (HCU) consumption".
  - A `build-runtime` plan exists for SAP Build subscriptions that include ABAP environment quota.
  - Landscape Portal "Manage System Hibernation" allows stopping and starting systems.
  - Confidence: High.
- **Conflict: minimum size.** "Minimum 2 HCU + 1 ACU" (service plans page; also the post's "minimum setup … 16 GB runtime … 32 GB persistence") versus the creation page allowing 0.5 ACU, single app server: "Instances with a Total ABAP Runtime Size of 0.5 ACU always have only one application server … shouldn't be used for production systems."

---

## Unconfirmed items

- Custom ABAP flexible workflow scenarios and a "My Inbox" inside the BTP ABAP environment.
- The Analytical List Page floorplan on RAP OData V4.
- SAC planning or write-back over a live connection to the ABAP environment.
- PAL/APL usage: not possible today; only planned (roadmap, 2611).
- `CL_APOC_OUTPUT_REQUEST_API` usability for custom objects.
- I_Currency decimals field details; an app for maintaining currency decimals or exchange rates (beyond the `CL_EXCHANGE_RATES` API).
- The content of SAP Note 3566760 (AI Core region mapping).
- Whether every controlled-SAP-LUW violation in ABAP Cloud dumps with BEHAVIOR_ILLEGAL_STATEMENT, as opposed to other BEHAVIOR_* errors or logging.

## Conflicts and oddities

1. **Add-on delivery scope.** The SaaS guide and the add-on build page are stale-looking: "only … if you intend to offer a SaaS"; "should only be installed … in your global accounts". They conflict with the Add-On Product option in the post and the Landscape Portal.
2. **Add-ons per system.** "Only one add-on … per system" (SaaS guide) versus "multiple add-ons … if each add-on uses unique software components" (Landscape Portal Deploy Product).
3. **Minimum system size.** 2 HCU + 1 ACU versus 0.5 ACU allowed for non-production.
4. **Currency decimals.** The BTP page says "All SAP currency data types have two decimal places". The keyword doc says CURR data elements may define other decimal counts, and that CDS CURRENCY_CONVERSION assumes 2 decimals with "unexpected behavior" otherwise.
5. **Keyword doc release table.** It lists ABAP 9.21–9.24 mapped to future releases (2611–2708), but those pages are empty. Treat the content as release 2608.
6. **Product renaming.** "SAP BTP, ABAP environment" became "SAP Business AI Platform, ABAP environment" in the documentation from late September 2026.

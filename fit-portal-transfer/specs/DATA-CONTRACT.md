# Data Contract — SAP Best Practices ZIP Specification

**Source file**: `/workspaces/cockpit/SAP_Best_Practices_for_SAP_S4HANA_Cloud_Public_Edition_2508_MY_SAPCUSTOMER.zip`
**Verified on**: 2026-02-20
**Verification method**: Python zipfile + openpyxl extraction with 100% file enumeration

---

## Section 1: ZIP Inventory Summary

| Metric | Verified Value |
|--------|---------------|
| Total files (excluding directories) | 1,527 |
| Total size (uncompressed) | 300,924,375 bytes (287.0 MB) |
| ZIP file name | `SAP_Best_Practices_for_SAP_S4HANA_Cloud_Public_Edition_2508_MY_SAPCUSTOMER.zip` |

### File Type Distribution

| Extension | Count |
|-----------|-------|
| .xlsx | 708 |
| .docx | 580 |
| .pdf | 232 |
| .zip | 3 |
| .csv | 2 |
| .xlsm | 1 |
| .rtf | 1 |
| **Total** | **1,527** |

### Category Distribution

| Category | Path Pattern | Count |
|----------|-------------|-------|
| TestScripts | `S4C/Library/TestScripts/` | 1,127 |
| Setup | `S4C/Library/Setup/` | 231 |
| General | `S4C/Library/General/` | 162 |
| Others | `S4C/Library/Others/` | 4 |
| Configuration | `S4C/Library/Configuration/` | 1 |
| PackExcel | `packExcel/SolS-013/2508/` | 1 |
| Root | (root level) | 1 |
| **Total** | | **1,527** |

---

## Section 2: TestScripts (1,127 files)

### Structure
Each scope item has a paired DOCX + XLSX file:
- `{SCOPE_ID}_S4CLD2508_BPD_EN_{COUNTRY}.docx` — Business Process Document (narrative)
- `{SCOPE_ID}_S4CLD2508_BPD_EN_{COUNTRY}.xlsx` — Business Process Document (structured test cases)

Where:
- `{SCOPE_ID}` = alphanumeric code (e.g., `J60`, `1EG`, `2QL`)
- `{COUNTRY}` = `MY` (Malaysia) for country-specific, or `XX` for global

### Count Breakdown
- DOCX files: 577
- XLSX files: 550
- DOCX without matching XLSX: 27 (these are supplementary DOCX files — some scope items have multiple DOCX but one XLSX)
- XLSX without matching DOCX: 0

### Unique Scope Items (from XLSX): 550

---

## Section 3: Complete Scope Item List

The following 550 scope item IDs have BPD XLSX files. This is the canonical list.
Any scope item ID NOT in this list does NOT exist in the dataset.

```
16R 16T 18J 19E 19M 1A8 1B6 1BM 1BS 1E1 1E3 1EG 1EZ 1F1 1FM
1GA 1GB 1GF 1GO 1GP 1HB 1HO 1IL 1IQ 1IU 1J2 1JI 1JT 1JW 1K2
1KA 1LE 1LQ 1M1 1MC 1MI 1MN 1MP 1MR 1MV 1MX 1N1 1N3 1N5 1N7
1NJ 1NL 1NN 1NT 1O0 1P0 1P7 1P9 1Q4 1QM 1QR 1RK 1RM 1RO 1RY
1S0 1S2 1S4 1SG 1T6 1VP 1W4 1W8 1WA 1WC 1WE 1WO 1WV 1X1 1X3
1X7 1X9 1XB 1XD 1XF 1XI 1XN 1XV 1Y2 1Y5 1YB 1YF 1YI 1YT 1Z1
1Z3 1Z6 1ZQ 1ZT 20N 21D 21P 21Q 21R 21T 22K 22P 22T 22Z 24F
24H 24J 287 28B 2AR 2BE 2BG 2BI 2BK 2DP 2EJ 2EL 2EM 2EQ 2ET
2F2 2F4 2F5 2F9 2FA 2FD 2FM 2HU 2I3 2KF 2KH 2LG 2LH 2LN 2LZ
2M0 2MB 2ME 2NV 2NX 2NY 2NZ 2O0 2O2 2O9 2OH 2OI 2OO 2OQ 2PD
2Q2 2QI 2QL 2QN 2QP 2QY 2R3 2R7 2RU 2RW 2SA 2SB 2SJ 2T3 2TS
2TT 2TW 2TX 2U1 2U2 2U3 2U6 2U8 2UF 2UG 2UJ 2UN 2UO 2UZ 2V0
2V7 2VA 2VB 2VJ 2VK 2VL 2VM 2VN 2VO 2WL 2XT 2XU 2YJ 2YL 2YM
2ZS 31G 31H 31J 31L 31N 31Q 33E 33F 33G 33J 33M 33O 33Q 33V
33X 34B 34C 34D 34E 34F 34G 34L 34M 34N 34O 34P 35D 35E 35F
3AB 3BR 3BS 3BT 3BU 3BW 3BX 3D2 3DV 3DX 3EN 3F0 3F4 3F7 3FC
3FP 3FY 3G8 3HQ 3HR 3HS 3HU 3HV 3I1 3I2 3I3 3I4 3I5 3I7 3I8
3JX 3KK 3KX 3KY 3L3 3L5 3L7 3L8 3LQ 3M0 3M3 3M4 3M5 3MO 3N5
3NA 3NI 3NR 3OK 3QD 3QM 3TD 3TE 3UK 3UL 3UP 3VQ 3VR 3VS 3VT
3W0 3W1 3W3 3W4 3WY 3WZ 3X0 3X3 3X4 3XK 3YE 3ZB 3ZF 40G 40Y
41F 41U 42K 42L 42N 43B 43R 43Y 46P 47I 49D 49E 49F 49X 4A1
4A2 4AH 4AI 4AN 4AP 4AQ 4AU 4AV 4AZ 4B0 4B3 4B4 4B5 4BL 4C8
4E9 4GA 4GG 4GQ 4GR 4GS 4GT 4H2 4HG 4HH 4HI 4I9 4LO 4LU 4LZ
4MM 4MT 4N6 4OC 4OL 4PG 4Q0 4QN 4R2 4R6 4R7 4R8 4RC 4RF 4RV
4V7 4VT 4WM 4X3 4X5 4X8 4X9 4XD 4YX 53L 53M 53V 53X 53Y 54A
54U 54V 55E 55F 55I 55U 56E 57Z 5CX 5D2 5DQ 5DR 5DS 5FH 5FJ
5FK 5FL 5FM 5FN 5FO 5FQ 5FR 5FS 5FT 5FU 5FV 5FW 5FX 5FY 5FZ
5HG 5HN 5HO 5HP 5HR 5I2 5I9 5IK 5IM 5IS 5IT 5JT 5KF 5LE 5MQ
5NU 5O6 5OD 5OE 5OF 5OJ 5OK 5OL 5OM 5P9 5PA 5PU 5W2 5WF 5WG
5WH 5WI 5XU 5Z0 5Z1 5Z2 5Z3 5Z4 5Z5 5Z6 5Z7 60H 637 63L 63V
63W 63X 63Y 649 64E 64F 65D 69L 69M 6AV 6B5 6B6 6B7 6BJ 6BP
6BV 6DI 6GC 6GD 6GS 6GU 6HY 6IL 6IM 6JM 6JN 6JO 6KO 6MT 6N4
6N9 6ND 6NE 6NF 6NH 6NI 6NM 6R3 6SZ 6U2 6U3 6UC 6V2 6W1 6W2
6W3 6W4 6WC 6WD 6X6 6YU 71O 71P 71S 73P 77V 78L 78S 7AU 7BG
7DJ 7DL 7EZ 7G4 7G5 7KW 7L1 7MI 7MJ 7OD 7QE 7TC 7TE 7UQ 7VL
7W6 7WC 7XY BD3 BD6 BD9 BDA BDD BDG BDH BDK BDN BDQ BDT BDW
BEG BEJ BF7 BFA BFB BFC BFH BGC BH1 BH2 BH3 BJ2 BJ5 BJ8 BJE
BJH BJK BJN BJQ BKA BKJ BKK BKL BKP BKZ BLF BLL BMC BMD BME
BMH BMK BML BMR BMY BNA BNX I9I J11 J12 J13 J14 J44 J45 J54
J55 J58 J59 J60 J62 J77 J78 J82 JB1 SL4
```

Total: 550 scope item IDs.

---

## Section 4: BPD XLSX Column Schema (Canonical)

**Sheet name**: `Test Cases` (present in all 550 BPD XLSX files)
**Structure verified**: 20/20 random samples have identical column structure
**Header row**: Row index 4 (0-based), i.e., the 5th row
**Metadata rows**: Rows 0-3 contain file metadata (comments prefixed with `#`)
**Data rows**: Start at row index 5 (0-based), i.e., the 6th row

| Column Index | Column Name | Data Type | Description |
|-------------|-------------|-----------|-------------|
| 0 | `Test Case GUID` | string/null | GUID for the test case grouping |
| 1 | `Test Case Name*` | string/null | Human-readable name of the test case (scope item name on first occurrence) |
| 2 | `[Scope GUID]` | string/null | Internal SAP scope GUID |
| 3 | `[Scope Name]` | string/null | SAP scope name |
| 4 | `[Solution Process GUID]` | string/null | Internal SAP process GUID |
| 5 | `[Solution Process Name]` | string/null | Process name within the scope item |
| 6 | `[Solution Process Flow GUID]` | string/null | Internal SAP flow GUID |
| 7 | `[Solution Process Flow Name]` | string/null | Flow name within the process |
| 8 | `[Solution Process Flow Diagram GUID]` | string/null | Internal SAP diagram GUID |
| 9 | `[Solution Process Flow Diagram Name]` | string/null | Diagram name |
| 10 | `[Test Case Priority]` | string/null | Priority level |
| 11 | `[Test Case Owner]` | string/null | Owner designation |
| 12 | `Test Case Status` | string/null | Status (e.g., "In Preparation") |
| 13 | `Activity GUID` | string/null | GUID for the activity grouping |
| 14 | `Activity Title*` | string/null | Title of the activity within the test case |
| 15 | `Activity Target Name` | string/null | Target app/transaction name |
| 16 | `Activity Target URL` | string/null | URL to the target |
| 17 | `Action GUID` | string/null | GUID for the specific action |
| 18 | `Action Title*` | string | Title of the action (THIS IS THE STEP NAME) |
| 19 | `Action Instructions*` | string (HTML) | HTML-formatted step instructions |
| 20 | `Action Expected Result` | string (HTML) | HTML-formatted expected outcome |

**Critical notes**:
- Column 18 (`Action Title*`) is the primary step identifier. A row is a "step" if and only if column 18 is non-empty.
- Column 19 (`Action Instructions*`) contains raw HTML with inline styles. This HTML must be preserved as-is, not sanitized or rewritten.
- Column 1 (`Test Case Name*`) is only populated on the first row of each test case group. Subsequent rows inherit via grouping.
- Columns in square brackets `[...]` are read-only metadata from SAP — not editable by the user.

---

## Section 5: Configuration XLSM Schema

**File**: `S4C/Library/Configuration/SSCUI_List_EN_XX.xlsm`
**File size**: 997,861 bytes

### Sheet 1: `2508 S4H Cloud` (Main Configuration Sheet)

**Header row**: Row index 3 (0-based)
**Data rows**: 4,703 (rows 4 through 4,706)

| Column Index | Column Name | Data Type | Description |
|-------------|-------------|-----------|-------------|
| 0 | `Application Area` | string | Top-level functional area (e.g., "Finance") |
| 1 | `Application Subarea` | string | Sub-area (e.g., "Accounts Payable") |
| 2 | `Configuration Item Name` | string | Name of the config item (or "N/A") |
| 3 | `Configuration Item ID` | string | ID of the config item (or "N/A") |
| 4 | `Configuration Activity` | string | Description of the configuration activity |
| 5 | `Configuration Activity Available in Configuration Your Solution` | string | "Yes" or "No" — whether self-service |
| 6 | `Configuration Approach` | string | How to perform the configuration |
| 7 | `Category` | string | "Mandatory", "Recommended", "Optional", or empty |
| 8 | `Configuration Activity ID` | string | Unique activity ID |
| 9 | `Main Scope Item ID` | string | Links to scope item (e.g., "J58", "All") |
| 10 | `Main Scope Item Descriptions` | string | Scope item name |
| 11 | `Global, Country Dependent, or Localized` | string | Localization scope |
| 12 | `Specialized for Certain Countries` | string | Country-specific indicator |
| 13 | `Activity ID` | string | Alternative activity ID |
| 14 | `Application Component ID` | string | SAP component hierarchy |
| 15 | `Redo in P` | string | Redo in production flag |
| 16 | `Delete Customer Records` | string | Data cleanup flag |
| 17 | `Additional Information` | string | Extra notes |
| 18 | `File upload functionality enabled` | string | Upload flag |

**Category distribution** (verified):
- Mandatory: 591
- Recommended: 1,491
- Optional: 2,604
- Empty/Unspecified: 17
- **Total: 4,703**

**Self-service availability** (verified):
- "Yes": 4,690
- "No": 13

### Sheet 2: `IMG Activity TRAN in BC` (Business Catalog Cross-Reference)

**Header row**: Row index 0
**Data rows**: 4,451

| Column Index | Column Name | Data Type |
|-------------|-------------|-----------|
| 0 | `Business Catalog ID` | string |
| 1 | `Description` | string |
| 2 | `Transaction Code` | string |
| 3 | `IAM App ID` | string |
| 4 | `IMG Activity` | string |
| 5 | `Explanatory text` | string |
| 6 | `SSCUI ID` | string |
| 7 | `Business Catalog Component ID` | string |
| 8 | `IMG Activity ACH` | string |

### Sheets 3-15: Expert Configuration Sheets

These sheets contain expert-level configuration templates for specific scope items:

| Sheet Name | Rows | Purpose |
|-----------|------|---------|
| `73` | 28 | Define Country Codes (Kosovo) |
| `5D2` | 22 | Advanced Intercompany Sales activation |
| `61` | 5 | Tax Code expert configuration |
| `5MQ` | 17 | (expert config) |
| `699` | 34 | (expert config) |
| `J87` | 40 | (expert config) |
| `DPK` | 18 | (expert config) |
| `983` | 31 | (expert config) |
| `7DM` | 24 | (expert config) |
| `64E` | 31 | (expert config) |
| `REV` | 35 | (expert config) |
| `J90` | 49 | (expert config) |
| `4KL` | 32 | (expert config) |

### Sheet 16: `Doc. Info`
Empty sheet (0 rows). Ignore.

---

## Section 6: Process Step Counts by Scope Item

**Total process steps across all 550 scope items: 102,261**

**Distribution:**
- Minimum: 4 steps
- Maximum: 2,008 steps
- Median: 101 steps
- Mean: 185.9 steps
- < 50 steps: 142 scope items
- 50-100 steps: 128 scope items
- 100-200 steps: 127 scope items
- 200-500 steps: 103 scope items
- 500+ steps: 50 scope items

The exact per-scope-item counts are verified during data ingestion by the `verify-data.ts` script. After ingestion, the query `SELECT scope_item_id, COUNT(*) FROM process_steps GROUP BY scope_item_id` must return exactly 550 rows, and `SELECT SUM(count) FROM (...)` must return exactly 102,261.

---

## Section 7: Links XLSX (Master Index)

**File**: `packExcel/SolS-013/2508/S4C_2508_MY_links.xlsx`
**File size**: 12,651 bytes

### Sheet 1: `SolutionScenario` (32 data rows + 1 header)

Columns: `BOMID`, `Title`, `Entity External ID`, `Country`, `Language`, `Link`

Contains solution-level links (SAP Notes, APIs, What's New, etc.)

### Sheet 2: `SolutionProcess` (163 data rows + 1 header)

Columns: `BOMID`, `Title`, `Entity External ID`, `Country`, `Language`, `Link`

Contains process-level tutorial links. `Entity External ID` maps to scope item IDs.
162 unique scope items have tutorial links.

### Sheet 3: `SolutionProcessFlow` (0 data rows + 1 header)

Empty. No process flow diagram links are provided in this ZIP.

---

## Section 8: Setup PDFs (231 files)

**Path**: `S4C/Library/Setup/`
**PDF files**: 230
**XLSX files**: 1 (supplementary)

Naming pattern: `{SCOPE_ID}_Set-Up_EN_{COUNTRY}.pdf`

230 unique scope items have Setup PDFs. These are configuration guides with step-by-step instructions.

---

## Section 9: General Files (162 files)

**Path**: `S4C/Library/General/`

| Type | Count | Description |
|------|-------|-------------|
| Upload templates (.xlsx) | 155 | Data migration templates |
| CSV files | 2 | Data migration templates |
| BRD documents (.xlsx) | 3 | Business Requirements Documents (Consolidation) |
| Template files (.xlsx) | 11 | Journal entry and other templates |
| Nested ZIP files | 3 | Compressed template bundles |
| PDF files | 2 | Documentation |
| DOCX files | 1 | Documentation |

---

## Section 10: Others (4 files)

**Path**: `S4C/Library/Others/`

4 miscellaneous files. Must be inventoried and stored in the database.

---

## Section 11: Root Files (1 file)

- `README.rtf` — Top-level readme for the Best Practices package

---

## Section 12: Action Title Patterns

Total unique action titles across all BPDs: 13,080

Top action titles (these define the step type taxonomy):

| Action Title | Count | Semantic Type |
|-------------|-------|--------------|
| `Information` | 17,731 | INFORMATION |
| `Log On` | 10,039 | LOGON |
| `Access the App` | 3,536 | ACCESS_APP |
| `Access the SAP Fiori App` | 3,484 | ACCESS_APP |
| `Access App` | 2,494 | ACCESS_APP |
| `Log on` | 2,304 | LOGON |
| `Access the SAP Fiori app` | 1,567 | ACCESS_APP |
| `Enter Selection Criteria` | 761 | DATA_ENTRY |
| `Save` | 645 | ACTION |
| `Log onto Fiori Launchpad` | 443 | LOGON |
| `Logon` | 383 | LOGON |
| `Open Configure Your Solution` | 374 | ACCESS_APP |
| `Enter Data` | 352 | DATA_ENTRY |
| `Post` | 314 | ACTION |
| `Execute` | 234 | ACTION |
| `Back` | 191 | NAVIGATION |

**Normalization rules for step types:**

Action titles containing (case-insensitive):
- "log on", "logon", "log onto" → `LOGON`
- "access", "open" (referring to app/fiori) → `ACCESS_APP`
- "information" → `INFORMATION`
- "enter", "input" → `DATA_ENTRY`
- "save", "post", "execute", "run" → `ACTION`
- "verify", "check", "confirm", "review" → `VERIFICATION`
- "back", "return", "navigate" → `NAVIGATION`
- Everything else → `PROCESS_STEP`

These normalized types are used for UI display (e.g., hiding repetitive LOGON steps from summary views).

---

## Section 13: Integrity Checks (Post-Ingestion)

After ingesting the ZIP into the database, the following queries must return the specified values:

```sql
-- Check 1: Scope item count
SELECT COUNT(*) FROM scope_items;
-- Expected: 550

-- Check 2: Total process steps
SELECT COUNT(*) FROM process_steps;
-- Expected: 102261

-- Check 3: Config activities (main sheet)
SELECT COUNT(*) FROM config_activities;
-- Expected: 4703

-- Check 4: Config category distribution
SELECT category, COUNT(*) FROM config_activities GROUP BY category;
-- Expected: Mandatory=591, Recommended=1491, Optional=2604, (empty)=17

-- Check 5: Setup PDFs
SELECT COUNT(*) FROM setup_guides;
-- Expected: 230

-- Check 6: General files
SELECT COUNT(*) FROM general_files;
-- Expected: 162

-- Check 7: Solution links
SELECT COUNT(*) FROM solution_links WHERE type = 'scenario';
-- Expected: 32

SELECT COUNT(*) FROM solution_links WHERE type = 'process';
-- Expected: 163

-- Check 8: IMG activities
SELECT COUNT(*) FROM img_activities;
-- Expected: 4451

-- Check 9: Expert config sheets
SELECT COUNT(*) FROM expert_configs;
-- Expected: 13 (one per expert config sheet, excluding Doc. Info)

-- Check 10: No orphaned steps
SELECT COUNT(*) FROM process_steps WHERE scope_item_id NOT IN (SELECT id FROM scope_items);
-- Expected: 0

-- Check 11: No orphaned configs
SELECT COUNT(*) FROM config_activities WHERE scope_item_id NOT IN (SELECT id FROM scope_items) AND scope_item_id != 'All';
-- Expected: 0

-- Check 12: Every BPD DOCX has a corresponding XLSX
SELECT COUNT(*) FROM scope_items WHERE docx_stored = true AND xlsx_stored = false;
-- Expected: 0

-- Check 13: Self-service availability
SELECT COUNT(*) FROM config_activities WHERE self_service = true;
-- Expected: 4690

SELECT COUNT(*) FROM config_activities WHERE self_service = false;
-- Expected: 13
```

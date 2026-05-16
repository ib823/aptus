# ABEAM V2 — EXHAUSTIVE BACKEND INTEGRATION TEST

## WHAT THIS IS

A comprehensive integration test suite executed against the running dev server. Every test makes **real HTTP requests** and verifies **real database state**. This is NOT code analysis — you must observe actual API responses, status codes, and database records.

## WHAT THIS IS NOT

- Not a unit test (those already exist and pass)
- Not a code review (we already did that)
- Not a browser test (that comes after)

## CONSTRAINTS

1. **Start the dev server** (`pnpm dev`) and wait for it to be ready before any tests
2. **Use `curl` or `fetch` for all API calls** — real HTTP, not function imports
3. **Use `npx prisma studio` queries or direct Prisma scripts** to verify DB state when needed
4. **Do NOT modify any source files** — this is read-only testing
5. **Log every request and response** — status code, relevant body fields, timing
6. **Continue on failure** — log the failure, move to the next test
7. **Produce the final report** even if tests fail

## SETUP

### Step 1: Start Dev Server

```bash
cd /path/to/ABeam
pnpm dev &
DEV_PID=$!
sleep 15  # Wait for Next.js compilation
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
# Must return 200 or 302. If not, wait longer.
```

### Step 2: Identify Test Auth

Examine the auth system to determine how to authenticate API requests:

```bash
# Read the auth middleware
cat src/middleware.ts
cat src/lib/auth.ts
# or
cat src/lib/auth/index.ts

# Check if there's a test/dev bypass, API key auth, or session-based auth
grep -r "TEST_AUTH\|DEV_AUTH\|API_KEY\|BYPASS" src/lib/auth* src/middleware*

# Check if Next.js API routes use getServerSession or similar
grep -r "getServerSession\|getSession\|auth()\|currentUser" src/app/api/ --include="*.ts" -l | head -20
```

**You need to figure out how to make authenticated API calls.** Options:
- If there's a dev/test auth bypass → use it
- If session-based → use the magic-link flow to get a session cookie, then pass it in all requests
- If API key → find or create one
- If you cannot authenticate → use Prisma direct DB operations as fallback for write operations, and test only public/read endpoints via HTTP

**Document exactly how you authenticated and include the auth mechanism in your report.**

### Step 3: Create Test Helper

Create a temporary test helper script (do NOT modify the codebase):

```bash
cat > /tmp/ABeam-test-helper.sh << 'EOF'
BASE_URL="http://localhost:3000"
AUTH_COOKIE=""  # Fill in after auth setup
TEST_COUNT=0
PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0
RESULTS_FILE="/tmp/ABeam-test-results.log"

test_api() {
  local method="$1"
  local endpoint="$2"
  local body="$3"
  local expected_status="$4"
  local description="$5"
  
  TEST_COUNT=$((TEST_COUNT + 1))
  
  if [ "$method" = "GET" ]; then
    RESPONSE=$(curl -s -w "\n%{http_code}" -b "$AUTH_COOKIE" "$BASE_URL$endpoint")
  else
    RESPONSE=$(curl -s -w "\n%{http_code}" -X "$method" -H "Content-Type: application/json" -b "$AUTH_COOKIE" -d "$body" "$BASE_URL$endpoint")
  fi
  
  STATUS=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | sed '$d')
  
  if [ "$STATUS" = "$expected_status" ]; then
    PASS_COUNT=$((PASS_COUNT + 1))
    echo "✅ PASS [$STATUS] $description" | tee -a "$RESULTS_FILE"
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    echo "❌ FAIL [$STATUS expected $expected_status] $description" | tee -a "$RESULTS_FILE"
    echo "   Response: $(echo "$BODY" | head -3)" | tee -a "$RESULTS_FILE"
  fi
  
  # Store last response for chaining
  LAST_STATUS="$STATUS"
  LAST_BODY="$BODY"
}

summary() {
  echo ""
  echo "═══════════════════════════════════════"
  echo "TOTAL: $TEST_COUNT | PASS: $PASS_COUNT | FAIL: $FAIL_COUNT | SKIP: $SKIP_COUNT"
  echo "═══════════════════════════════════════"
}
EOF
source /tmp/ABeam-test-helper.sh
```

**If curl-based testing proves difficult due to auth, create a Node.js test runner instead:**

```javascript
// /tmp/ABeam-e2e-runner.mjs
// Use Prisma Client directly for DB operations + fetch for API testing
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const BASE = 'http://localhost:3000';

// ... test functions using prisma directly for setup/verification
// and fetch() for API endpoint testing
```

**Choose whichever approach works. The goal is real requests + real DB verification. Report which approach you used.**

---

## TEST SUITE 1: DATABASE INTEGRITY & CATALOG DATA (Foundational)

Before testing any user flows, verify the underlying data is correct.

### 1.1 Scope Item Catalog

```
For EACH of these 6 scope items: J60, J59, J45, 1NT, BDW, 2ET

Query: GET /api/catalog/scope-items (or direct Prisma)
Verify:
  [ ] Scope item exists in catalog
  [ ] Has a businessName (not null, not empty)
  [ ] Has a description (not null)
  [ ] Has a functionalArea

Then for EACH scope item:
Query: GET /api/catalog/scope-items/{id}/hierarchy
Verify:
  [ ] Returns HierarchyTree JSON
  [ ] processes array length > 0
  [ ] Each ProcessNode has flows array
  [ ] Each FlowNode has activities array
  [ ] Each ActivityNode has stepCount > 0
  [ ] Each ActivityNode has classifiableCount > 0 (for most activities)

Record the actual counts:
  J60: ___ processes, ___ flows, ___ activities, ___ total steps, ___ classifiable
  J59: ___ processes, ___ flows, ___ activities, ___ total steps, ___ classifiable
  J45: ___ processes, ___ flows, ___ activities, ___ total steps, ___ classifiable
  1NT: ___ processes, ___ flows, ___ activities, ___ total steps, ___ classifiable
  BDW: ___ processes, ___ flows, ___ activities, ___ total steps, ___ classifiable
  2ET: ___ processes, ___ flows, ___ activities, ___ total steps, ___ classifiable
```

### 1.2 Steps Data per Scope Item

```
For EACH of the 6 scope items:

Query: GET /api/catalog/scope-items/{id}/steps?limit=2000
Verify:
  [ ] Returns array of steps
  [ ] Total count matches hierarchy stepCount sum
  [ ] Each step has: id, sequence, actionTitle, stepType, activityId
  [ ] Steps with stepType in [DATA_ENTRY, ACTION, VERIFICATION, PROCESS_STEP, 
      businessprocess, configuration, reporting, masterdata] → isClassifiable = true
  [ ] Steps with stepType in [LOGON, LOGOFF, ACCESS_APP, INFORMATION, NAVIGATION,
      logon, logoff, information, testprocedure] → isClassifiable = false

Boundary tests:
  [ ] GET /api/catalog/scope-items/{id}/steps?limit=0 → error or empty
  [ ] GET /api/catalog/scope-items/{id}/steps?limit=2001 → should fail Zod (was max=200, now max=2000)
  [ ] GET /api/catalog/scope-items/{id}/steps?limit=-1 → error
  [ ] GET /api/catalog/scope-items/{id}/steps?limit=abc → error
  [ ] GET /api/catalog/scope-items/{id}/steps (no limit param) → uses default
  [ ] GET /api/catalog/scope-items/NONEXISTENT/steps → 404 or empty

Record actual classifiable counts per scope item (cross-reference with hierarchy data).
```

### 1.3 Configuration Items

```
For EACH of the 6 scope items:

Query: GET /api/catalog/scope-items/{id}/config-items (or equivalent)
Verify:
  [ ] Returns array of configuration items
  [ ] Each has: category (Mandatory/Recommended/Optional), selfService boolean, title, guidance
  [ ] Count > 0 for at least J60 and J59

Record: J60: ___ config items, J59: ___, J45: ___, 1NT: ___, BDW: ___, 2ET: ___
```

### 1.4 Process Landscapes / Chain Data

```
Test the constants and helper functions (can be done via Prisma script or Node eval):

For findChainsForScopeItem():
  [ ] findChainsForScopeItem("J60") returns array with P2P chain
  [ ] findChainsForScopeItem("J59") returns array with O2C chain
  [ ] findChainsForScopeItem("J45") returns array with WHO chain
  [ ] findChainsForScopeItem("1NT") returns empty array
  [ ] findChainsForScopeItem("BDW") returns empty array
  [ ] findChainsForScopeItem("2ET") returns empty array
  [ ] findChainsForScopeItem("NONEXISTENT") returns empty array
  [ ] findChainsForScopeItem("") returns empty array
  [ ] findChainsForScopeItem(null) does not throw (returns empty or handles gracefully)
```

### 1.5 Scope Item Metadata

```
Test the curated metadata constant:

Import and verify getScopeItemMetadata() and getActivityMetadata():

For EACH of the 6 scope items:
  [ ] getScopeItemMetadata(id) returns non-null
  [ ] Has businessName, businessDescription, modules array, activityMetadata array
  [ ] activityMetadata.length > 0
  [ ] Each activityMetadata entry has: businessQuestion (non-empty string), thinkAbout, modules, configAreas

Specifically verify content quality:
  [ ] J60 activityMetadata includes entry matching "Invoice Entry" with question about invoices without POs
  [ ] J59 activityMetadata includes entry about dunning/payment reminders
  [ ] J45 activityMetadata includes entry about purchase orders
  [ ] 1NT activityMetadata includes entry about project costs/WBS
  [ ] BDW activityMetadata includes entry about returnables/empties
  [ ] 2ET activityMetadata includes entry about sales orders

Negative:
  [ ] getScopeItemMetadata("NONEXISTENT") returns null or undefined (not throw)
  [ ] getActivityMetadata("J60", "NonExistentActivity") returns null (fallback)
```

---

## TEST SUITE 2: ASSESSMENT LIFECYCLE (Full CRUD)

### 2.1 Assessment Creation — Happy Path (×3 different scenarios)

```
SCENARIO A: Finance-focused (like real client)
  POST /api/assessments
  Body: {
    name: "E2E Test Finance Corp",
    industry: "Manufacturing",
    country: "MY",
    companySize: "midsize"
  }
  Expected: 201 with assessment object containing id, status="draft"
  Store: ASSESSMENT_A_ID

SCENARIO B: Procurement-focused
  POST /api/assessments
  Body: {
    name: "E2E Test Procurement Ltd",
    industry: "Trading",
    country: "SG",
    companySize: "small"
  }
  Expected: 201
  Store: ASSESSMENT_B_ID

SCENARIO C: Minimal / Edge case
  POST /api/assessments
  Body: {
    name: "E2E Test Minimal",
    industry: "Services",
    country: "US",
    companySize: "large"
  }
  Expected: 201
  Store: ASSESSMENT_C_ID

Verify in DB:
  [ ] All 3 assessments exist with status="draft"
  [ ] Each has unique id
  [ ] createdAt timestamps are recent
  [ ] organizationId is set (if multi-tenant)
```

### 2.2 Assessment Creation — Negative Tests

```
  [ ] POST /api/assessments with empty body → 400 (Zod validation error)
  [ ] POST /api/assessments with { name: "" } → 400
  [ ] POST /api/assessments with { name: "x" } (too short?) → check if min length enforced
  [ ] POST /api/assessments with { name: "A".repeat(500) } → check max length
  [ ] POST /api/assessments with { country: "INVALID" } → 400 or accepts?
  [ ] POST /api/assessments with { companySize: "INVALID" } → 400
  [ ] POST /api/assessments with { industry: "" } → 400 or accepts?
  [ ] POST /api/assessments with extra fields { name: "Test", hackerField: "malicious" } → extra fields stripped?
  [ ] POST /api/assessments with SQL injection in name: { name: "'; DROP TABLE--" } → 201 (safely stored, not executed)
  [ ] POST /api/assessments with XSS in name: { name: "<script>alert(1)</script>" } → 201 (stored escaped)
  [ ] GET /api/assessments/{NONEXISTENT_ID} → 404
  [ ] GET /api/assessments/../../etc/passwd → 400/404 (path traversal blocked)
```

### 2.3 Company Profile — CRUD + Completeness Gate

```
Using ASSESSMENT_A_ID:

  PUT /api/assessments/{id}/company-profile
  Body: { 
    companyName: "Apex Manufacturing Sdn Bhd",
    industry: "Manufacturing",
    employeeCount: 500,
    annualRevenue: "50M-200M",
    fiscalYearEnd: "December",
    currency: "MYR",
    headquartersCountry: "MY"
  }
  Expected: 200

  GET /api/assessments/{id}/company-profile
  Verify:
    [ ] Returns saved data
    [ ] completenessPercentage field present
    [ ] Record the percentage: ___% 

  Test completeness gate:
    [ ] If < 60%, scope selection should be gated (verify how — API returns flag? Frontend-only?)
    [ ] Add more fields until ≥ 60%:
        - deploymentModel: "public_cloud"
        - migrationApproach: "greenfield"
        - locations: ["Kuala Lumpur"]
        - languages: ["en", "ms"]
    [ ] After update, completenessPercentage ≥ 60

  Negative:
    [ ] PUT with empty body → 400 or merges empty?
    [ ] PUT with invalid enum value { deploymentModel: "INVALID" } → 400
    [ ] PUT with numeric string for employeeCount: { employeeCount: "not_a_number" } → 400
    [ ] GET profile for non-existent assessment → 404
```

### 2.4 Assessment Status Transitions

```
The 12-state machine: draft → scoping → in_progress → workshop_active → review_cycle → 
gap_resolution → pending_validation → validated → pending_sign_off → signed_off → 
handed_off → archived

Test every valid transition that the API supports:

  GET /api/assessments/{ASSESSMENT_A_ID}
  Record current status: ___

  # Try advancing status
  PUT /api/assessments/{id}/status  (or PATCH, find the correct endpoint)
  Body: { status: "scoping" }
  
  For each transition attempt:
    [ ] draft → scoping: should succeed (or require profile completeness?)
    [ ] scoping → in_progress: should succeed (or require scope items selected?)
    [ ] in_progress → workshop_active: check prerequisites
    [ ] in_progress → gap_resolution: check prerequisites (all steps classified?)
    [ ] Each failed prerequisite returns meaningful error message

  INVALID transitions (negative):
    [ ] draft → signed_off: should fail (skipping states)
    [ ] draft → archived: should fail
    [ ] in_progress → draft: should fail (backward transition)
    [ ] signed_off → in_progress: should fail (reopening after sign-off)
    [ ] Any transition with invalid status string → 400

  Record: which transitions work, which are blocked, what error messages appear.
```

---

## TEST SUITE 3: SCOPE SELECTION (Full Coverage)

### 3.1 Scope Selection — Happy Path

```
Using ASSESSMENT_A_ID (Finance):
  
  POST /api/assessments/{id}/scope (or PUT — find correct endpoint & method)
  Add J60 (Accounts Payable):
    Body: { scopeItemId: "J60", relevance: "YES" }
    Expected: 200/201

  Add J59 (Accounts Receivable):
    Body: { scopeItemId: "J59", relevance: "YES" }
    Expected: 200/201

  GET /api/assessments/{id}/scope
  Verify:
    [ ] Returns array with exactly 2 items
    [ ] J60 present with relevance="YES"
    [ ] J59 present with relevance="YES"

Using ASSESSMENT_B_ID (Procurement):
  Add J45, 2ET
  
Using ASSESSMENT_C_ID (Minimal):
  Add BDW only

Verify data isolation:
  [ ] GET scope for Assessment A → only J60, J59
  [ ] GET scope for Assessment B → only J45, 2ET
  [ ] GET scope for Assessment C → only BDW
  [ ] NO cross-contamination between assessments
```

### 3.2 Scope Selection — All Relevance Values

```
Using ASSESSMENT_A_ID:

  Add 1NT with relevance="MAYBE":
    [ ] Accepted, stored as MAYBE
  
  Update J60 to relevance="NO":
    [ ] Accepted, changed to NO
  
  Update J60 back to relevance="YES":
    [ ] Accepted, changed back to YES

  Remove 1NT:
    DELETE /api/assessments/{id}/scope/{scopeItemId} (or equivalent)
    [ ] Accepted, 1NT removed from scope

  GET scope → confirm final state: J60(YES), J59(YES), 1NT removed
```

### 3.3 Scope Selection — Negative Tests

```
  [ ] Add non-existent scope item { scopeItemId: "ZZZZZ" } → 400 or 404
  [ ] Add empty scope item { scopeItemId: "" } → 400
  [ ] Add with invalid relevance { scopeItemId: "J60", relevance: "INVALID" } → 400
  [ ] Add duplicate (J60 already selected) → 409 conflict or idempotent 200?
  [ ] Remove non-selected scope item → 404 or 200 (idempotent)?
  [ ] Add scope item to non-existent assessment → 404
```

### 3.4 Scope Selection — Bulk Operations (if endpoint exists)

```
  Check: does a bulk scope endpoint exist?
  grep -r "bulk" src/app/api/assessments/\[id\]/scope/ --include="*.ts"
  
  If yes:
    [ ] POST bulk with [J60, J59, J45, 1NT, BDW, 2ET] → all 6 added
    [ ] POST bulk with empty array → 400 or no-op?
    [ ] POST bulk with mix of valid/invalid IDs → partial success or all-or-nothing?
```

---

## TEST SUITE 4: STEP CLASSIFICATION (The Core Workflow)

This is the most important test suite. It tests the exact workflow that was broken before rectification.

### 4.1 Individual Step Classification — Happy Path

```
Using ASSESSMENT_A_ID with J60 selected:

First, get the step list:
  GET /api/catalog/scope-items/J60/steps?limit=2000
  Store first 10 classifiable step IDs (where isClassifiable=true)
  Store: STEP_IDS = [step1, step2, ..., step10]

Classify each with a different status:
  PUT /api/assessments/{ASSESSMENT_A_ID}/steps/{STEP_IDS[0]}
  Body: { fitStatus: "FIT", confidence: "HIGH" }
  Expected: 200
  
  PUT /api/assessments/{ASSESSMENT_A_ID}/steps/{STEP_IDS[1]}
  Body: { fitStatus: "CONFIGURE", confidence: "MEDIUM", clientNote: "Need custom approval workflow" }
  Expected: 200

  PUT /api/assessments/{ASSESSMENT_A_ID}/steps/{STEP_IDS[2]}
  Body: { fitStatus: "GAP", confidence: "LOW", clientNote: "We use a completely different process for this" }
  Expected: 200

  PUT /api/assessments/{ASSESSMENT_A_ID}/steps/{STEP_IDS[3]}
  Body: { fitStatus: "NA", clientNote: "Not applicable to our business" }
  Expected: 200

  PUT /api/assessments/{ASSESSMENT_A_ID}/steps/{STEP_IDS[4]}
  Body: { fitStatus: "FIT" }  // No confidence, no note — minimal
  Expected: 200

Verify all 5 persisted:
  GET /api/assessments/{ASSESSMENT_A_ID}/steps?scopeItemId=J60&limit=2000
  (or the step responses endpoint)
  [ ] 5 steps have non-PENDING status
  [ ] Step 0: FIT, confidence=HIGH
  [ ] Step 1: CONFIGURE, confidence=MEDIUM, clientNote present
  [ ] Step 2: GAP, confidence=LOW, clientNote present
  [ ] Step 3: NA, clientNote present
  [ ] Step 4: FIT, no confidence, no note
```

### 4.2 Individual Step Classification — Negative Tests

```
  [ ] PUT with invalid fitStatus: { fitStatus: "INVALID" } → 400
  [ ] PUT with empty fitStatus: { fitStatus: "" } → 400
  [ ] PUT with missing fitStatus: {} → 400
  [ ] PUT with fitStatus: "PENDING" → 400 or accepted? (going back to unclassified)
  [ ] PUT for non-existent step ID → 404
  [ ] PUT for step in non-selected scope item → 403 or 404?
  [ ] PUT for non-classifiable step (LOGON type) → should it succeed or reject?
  [ ] PUT with confidence: "INVALID" → 400
  [ ] PUT with clientNote exceeding max length (if any) → 400 or truncated?
  [ ] PUT with clientNote containing special chars: { clientNote: "<script>alert('xss')</script>" } → stored safely
  [ ] PUT with clientNote containing Unicode: { clientNote: "需要自定义审批流程" } → stored correctly
  [ ] PUT to step on WRONG assessment ID → 404 (no cross-assessment access)
```

### 4.3 Step Classification — Reclassification

```
  Reclassify step 0 from FIT to GAP:
    PUT /api/assessments/{ASSESSMENT_A_ID}/steps/{STEP_IDS[0]}
    Body: { fitStatus: "GAP", clientNote: "Changed my mind after discussion" }
    Expected: 200

  Verify:
    [ ] Step 0 now shows GAP (not FIT)
    [ ] Old FIT classification replaced (not appended)
    [ ] clientNote updated
    [ ] Was a GapResolution auto-created for the GAP?

  Reclassify step 0 back to FIT:
    PUT Body: { fitStatus: "FIT" }
    [ ] Step 0 now FIT
    [ ] Was the GapResolution removed or orphaned?

  Reclassify in rapid succession (simulate impatient user):
    PUT step 5 as FIT
    PUT step 5 as GAP (immediately)
    PUT step 5 as CONFIGURE (immediately)
    PUT step 5 as NA (immediately)
    [ ] Final state should be NA
    [ ] No duplicate StepResponse records
```

### 4.4 BULK Classification — Critical (Previously Broken)

```
This was the exact mechanism broken before rectification (Zod only accepted FIT/NA).

Get an activity's classifiable steps:
  From the hierarchy, pick an activity with 5+ classifiable steps
  Store: ACTIVITY_STEP_IDS = [all classifiable step IDs in that activity]

Test ALL 4 fitStatus values via bulk:

  POST /api/assessments/{ASSESSMENT_A_ID}/steps/bulk
  Body: { stepIds: ACTIVITY_STEP_IDS, fitStatus: "FIT" }
  Expected: 200
  [ ] All steps in ACTIVITY_STEP_IDS now have fitStatus=FIT

  POST /api/assessments/{ASSESSMENT_A_ID}/steps/bulk
  Body: { stepIds: ACTIVITY_STEP_IDS, fitStatus: "CONFIGURE", clientNote: "Configuration needed for local requirements" }
  Expected: 200
  [ ] All steps now CONFIGURE with clientNote

  POST /api/assessments/{ASSESSMENT_A_ID}/steps/bulk
  Body: { stepIds: ACTIVITY_STEP_IDS, fitStatus: "GAP", clientNote: "Our process is fundamentally different" }
  Expected: 200
  [ ] All steps now GAP with clientNote
  [ ] GapResolution records auto-created for each?

  POST /api/assessments/{ASSESSMENT_A_ID}/steps/bulk
  Body: { stepIds: ACTIVITY_STEP_IDS, fitStatus: "NA" }
  Expected: 200
  [ ] All steps now NA

Bulk — Negative:

  [ ] POST bulk with empty stepIds: { stepIds: [], fitStatus: "FIT" } → 400 or no-op?
  [ ] POST bulk with invalid fitStatus: { stepIds: [...], fitStatus: "INVALID" } → 400
  [ ] POST bulk with missing fitStatus: { stepIds: [...] } → 400
  [ ] POST bulk with non-existent step IDs → partial success or all fail?
  [ ] POST bulk with mix of classifiable + non-classifiable step IDs → ?
  [ ] POST bulk with duplicate step IDs → idempotent?
  [ ] POST bulk with 500+ step IDs (large payload) → succeeds?
  [ ] POST bulk with clientNote: "" (empty string) → accepted?
  [ ] POST bulk to wrong assessment → 404

Bulk — "Accept All SAP Standard" simulation:

  Get ALL classifiable step IDs for J60 (should be ~460):
  POST /api/assessments/{ASSESSMENT_A_ID}/steps/bulk
  Body: { stepIds: [all 460 IDs], fitStatus: "FIT" }
  Expected: 200
  [ ] Completes within 30 seconds (performance check)
  [ ] All 460 steps now FIT
  
  Verify progress:
  GET /api/assessments/{ASSESSMENT_A_ID}/progress (or equivalent)
  [ ] J60 shows 100% (or close — depends on if non-classifiable are counted)
```

### 4.5 Step Response Queries — Limit Boundaries

```
These are the exact queries that were broken by Zod max(200):

  GET /api/assessments/{id}/steps?scopeItemId=J60&limit=50 → 200, returns ≤50
  GET /api/assessments/{id}/steps?scopeItemId=J60&limit=200 → 200, returns ≤200
  GET /api/assessments/{id}/steps?scopeItemId=J60&limit=500 → 200 (was 400 before fix!)
  GET /api/assessments/{id}/steps?scopeItemId=J60&limit=1000 → 200
  GET /api/assessments/{id}/steps?scopeItemId=J60&limit=1500 → 200
  GET /api/assessments/{id}/steps?scopeItemId=J60&limit=2000 → 200
  GET /api/assessments/{id}/steps?scopeItemId=J60&limit=2001 → 400 (exceeds new max)
  GET /api/assessments/{id}/steps?scopeItemId=J60&limit=99999 → 400

Same tests for catalog endpoint:
  GET /api/catalog/scope-items/J60/steps?limit=500 → 200 (was 400 before fix!)
  GET /api/catalog/scope-items/J60/steps?limit=2001 → 400
```

---

## TEST SUITE 5: GAP RESOLUTION

### 5.1 Auto-Created Gaps

```
After classifying steps as GAP in Suite 4:

  GET /api/assessments/{ASSESSMENT_A_ID}/gaps (or /gap-resolutions)
  
  Verify:
    [ ] Gap entries exist for every step classified as GAP
    [ ] Each gap has: stepId, scopeItemId, description (from clientNote), status
    [ ] Gap links back to the correct assessment

  Record: ___ total gaps auto-created
```

### 5.2 Gap Resolution CRUD

```
  Take first gap ID: GAP_ID

  GET /api/assessments/{id}/gaps/{GAP_ID}
  [ ] Returns gap detail with step info, classification note

  PUT /api/assessments/{id}/gaps/{GAP_ID}
  Body: { 
    resolutionType: "CONFIGURE",
    resolutionDescription: "Can be handled with SAP configuration",
    estimatedEffort: 5,
    priority: "HIGH"
  }
  Expected: 200
  [ ] Resolution type saved
  [ ] Description saved
  [ ] Effort saved

  Test all 8 resolution types:
  For EACH of: FIT, CONFIGURE, KEY_USER_EXT, BTP_EXT, ISV, CUSTOM_ABAP, ADAPT_PROCESS, OUT_OF_SCOPE
    PUT Body: { resolutionType: "{type}" }
    [ ] Accepted

  Negative:
    [ ] PUT with invalid resolutionType → 400
    [ ] PUT with negative estimatedEffort → 400 or accepted?
    [ ] GET gap from wrong assessment → 404
```

### 5.3 Gap Lifecycle with Reclassification

```
  Step was GAP → classified back to FIT:
    PUT /api/assessments/{id}/steps/{step_id}
    Body: { fitStatus: "FIT" }
    
  After reclassification:
    [ ] Gap still exists? Or removed?
    [ ] If still exists, is it marked as obsolete/resolved?
    [ ] If removed, verify it's truly gone from DB
```

---

## TEST SUITE 6: REPORTS & EXPORTS (The Critical Missing Test)

### 6.1 Report Endpoints Discovery

```
Find all report-related endpoints:
  grep -r "report\|export\|generate\|download\|pdf\|xlsx\|zip" src/app/api/ --include="*.ts" -l
  grep -r "report\|export\|generate" src/app/api/assessments/ --include="*.ts" -l

List every report endpoint found:
  /api/assessments/{id}/reports/... ?
  /api/assessments/{id}/export/... ?
  /api/reports/... ?

For EACH endpoint found, test with ASSESSMENT_A_ID (which has classifications):
```

### 6.2 Report Generation — Attempt Each Type

```
For EACH report endpoint discovered:

  Attempt generation:
    GET or POST /api/assessments/{ASSESSMENT_A_ID}/reports/{type}
    
  Record for EACH:
    [ ] Endpoint exists (200) or not (404)
    [ ] Returns content (file, JSON, or generation job)
    [ ] Content-Type header (application/pdf, application/xlsx, etc.)
    [ ] File size > 0
    [ ] If JSON response with job ID, poll for completion

  Expected report types to look for:
    - Executive Summary (PDF)
    - Scope Selection Summary
    - Step Classification Detail (XLSX)
    - Gap Register (XLSX)
    - Configuration Workbook (XLSX)
    - Integration Register
    - Data Migration Register
    - OCM Report
    - Effort Estimate
    - Readiness Scorecard
    - Audit Trail / Decision Log
    - Complete Package (ZIP)

  For each report that generates successfully:
    [ ] Save to /tmp/ABeam-reports/ for inspection
    [ ] Record file size
    [ ] For XLSX: verify it's a valid XLSX (not empty or corrupted)
    [ ] For PDF: verify it's a valid PDF (starts with %PDF)
    [ ] For ZIP: verify it contains expected files
```

### 6.3 Report Content Verification

```
If XLSX reports are generated, use a Node script to read and verify content:

  // Using ExcelJS to read XLSX

  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('/tmp/ABeam-reports/gap-register.xlsx');
  
  For Gap Register XLSX:
    [ ] Has at least one sheet
    [ ] Contains rows matching the GAP classifications made in Suite 4
    [ ] Client notes are included
    [ ] Resolution types are included (if set in Suite 5)

  For Step Classification XLSX:
    [ ] Contains rows for all classified steps
    [ ] FIT/CONFIGURE/GAP/NA values present
    [ ] Scope item names present (business names, not just codes)

  For Executive Summary PDF:
    [ ] File size > 1KB (not empty)
    [ ] Contains text (extract with pdf-parse or similar)
```

### 6.4 Report Generation — No Data Scenario

```
Using ASSESSMENT_C_ID (which has BDW selected but NO classifications):

  Attempt report generation:
    [ ] Does it generate an empty/placeholder report?
    [ ] Does it return an error saying "no data"?
    [ ] Does it return a report with "0 items classified" message?
```

### 6.5 Report Generation — Cross-Assessment Isolation

```
  Generate report for ASSESSMENT_A_ID → should contain J60/J59 data ONLY
  Generate report for ASSESSMENT_B_ID → should contain J45/2ET data ONLY
  
  [ ] No data leakage between assessments in generated reports
```

---

## TEST SUITE 7: PROGRESS & DASHBOARD

### 7.1 Progress Tracking

```
  GET /api/assessments/{ASSESSMENT_A_ID}/progress
  
  Verify:
    [ ] Overall progress percentage
    [ ] Per-scope-item breakdown:
        - J60: classified count / total classifiable
        - J59: classified count / total classifiable
    [ ] Counts match what we classified in Suite 4

  After bulk-classifying all J60 steps:
    [ ] J60 shows 100% (or near)
    [ ] Overall changes proportionally
```

### 7.2 Dashboard Endpoints

```
  GET /api/dashboard (or /api/assessments/{id}/dashboard)
  
  Check each dashboard widget endpoint:
    [ ] Attention items / action required
    [ ] KPIs (scope items, steps classified, gaps)
    [ ] Progress heatmap
    [ ] Activity feed / decision log
    [ ] Timeline

  For EACH endpoint:
    [ ] Returns 200
    [ ] Returns meaningful data (not empty for an assessment with classifications)
    [ ] No error in response body
```

### 7.3 Decision Log / Audit Trail

```
  GET /api/assessments/{ASSESSMENT_A_ID}/decisions (or /decision-log or /audit-trail)
  
  Verify:
    [ ] Contains entries for every classification made in Suite 4
    [ ] Each entry has: action, userId, timestamp, details
    [ ] Actions include MARKED_FIT, MARKED_GAP, etc.
    [ ] Bulk classifications logged (BULK_MARK_ALL_FIT)
    [ ] Reclassifications logged
    
  Record: ___ total decision log entries
```

---

## TEST SUITE 8: REGISTERS (Integration, Data Migration, OCM)

### 8.1 Register Endpoints Discovery

```
  grep -r "register\|integration\|migration\|ocm\|change-management" src/app/api/ --include="*.ts" -l
  
  For EACH register type found:

  GET /api/assessments/{ASSESSMENT_A_ID}/registers/{type}
  Or GET /api/assessments/{ASSESSMENT_A_ID}/integration-register
  
  Verify:
    [ ] Endpoint exists
    [ ] Returns 200 with array or object
    [ ] Structure includes register items with fields
```

### 8.2 Register CRUD (if supported)

```
  For Integration Register:
    POST /api/assessments/{id}/registers/integration
    Body: { 
      title: "SAP-to-Legacy ERP Integration",
      description: "Data sync between SAP and existing Oracle system",
      sourceSystem: "Oracle EBS",
      targetSystem: "SAP",
      integrationPattern: "batch",
      priority: "HIGH"
    }
    [ ] Created successfully

  For Data Migration Register:
    POST with migration item
    [ ] Created successfully

  For OCM Register:
    POST with change management item
    [ ] Created successfully
```

---

## TEST SUITE 9: WORKSHOP MANAGEMENT

### 9.1 Workshop Endpoints

```
  grep -r "workshop" src/app/api/ --include="*.ts" -l

  GET /api/assessments/{ASSESSMENT_A_ID}/workshops
  [ ] Returns 200 (empty array initially)

  POST /api/assessments/{ASSESSMENT_A_ID}/workshops
  Body: {
    title: "Finance Process Review Workshop",
    description: "Review AP and AR scope items with business stakeholders",
    scheduledDate: "2026-04-01T09:00:00Z",
    duration: 240,
    facilitator: "consultant@partner.com"
  }
  Expected: 201
  Store: WORKSHOP_ID

  GET /api/assessments/{ASSESSMENT_A_ID}/workshops/{WORKSHOP_ID}
  [ ] Returns workshop detail

  Negative:
    [ ] POST with missing title → 400
    [ ] POST with past date → 400 or accepted?
    [ ] GET workshop from wrong assessment → 404
```

---

## TEST SUITE 10: MULTI-TENANT DATA ISOLATION

### 10.1 Cross-Assessment Isolation

```
  Using all 3 assessment IDs:

  For EACH pair of assessments (A↔B, A↔C, B↔C):
    
    # Try to read other assessment's steps
    GET /api/assessments/{A}/steps?scopeItemId=J45  
    → Should return empty (J45 not in Assessment A's scope)
    
    # Try to classify steps on wrong assessment
    PUT /api/assessments/{B}/steps/{STEP_FROM_ASSESSMENT_A}
    Body: { fitStatus: "FIT" }
    → Should fail (403 or 404)
    
    # Try to read other assessment's gaps
    GET /api/assessments/{B}/gaps
    → Should only return B's gaps, not A's

    # Try to read other assessment's scope
    GET /api/assessments/{A}/scope
    → Only A's scope items
    
  All cross-assessment access attempts:
    [ ] Properly blocked or return only own data
    [ ] No error messages leak data about other assessments
```

### 10.2 Same Scope Item, Different Assessments

```
  Add J60 to BOTH Assessment A and Assessment C:
  
  Classify step X in Assessment A as FIT
  Classify same step X in Assessment C as GAP
  
  Verify:
    [ ] Assessment A step X = FIT
    [ ] Assessment C step X = GAP
    [ ] Independent — changing one doesn't affect the other
    [ ] Progress differs between assessments for same scope item
```

---

## TEST SUITE 11: ROLE-BASED ACCESS CONTROL (if testable)

### 11.1 Role Discovery

```
  Examine how roles are assigned:
  grep -r "UserRole\|role\|RBAC" src/app/api/ --include="*.ts" | head -30
  
  Check if role can be specified in test requests.
  
  If role-based endpoints exist, test with different roles:
  
  For EACH role in: platform_admin, partner_lead, consultant, process_owner, it_lead, viewer
  
  Test permissions:
    [ ] viewer: can GET but NOT PUT/POST/DELETE
    [ ] process_owner: can classify steps, can add notes, CANNOT delete assessment
    [ ] it_lead: can add notes, CANNOT change fitStatus?
    [ ] consultant: full access to assessment operations
    [ ] platform_admin: full access including admin endpoints
    
  Record which roles can perform which operations.
```

---

## TEST SUITE 12: CONVERSATION MODE (if data exists)

### 12.1 ConversationTemplate State

```
  Check if any templates exist:
    SELECT COUNT(*) FROM "ConversationTemplate";
    [ ] Expected (after `pnpm db:seed`): one row per ScopeItem (baseline
        generic flow planted by prisma/seeds/conversation-templates.ts).
    [ ] Expected (before seeding, fresh DB): 0 — run `pnpm db:seed`.

  If you need scope-specific behaviour beyond the baseline, create via admin API:
    POST /api/admin/conversation-templates
    Body: {
      scopeItemId: "J60",
      processStepId: "{any step ID}",
      questionFlow: {
        "rootQuestionId": "q1",
        "questions": [
          { "id": "q1", "text": "Does your company process invoices?",
            "answers": [
              { "id": "a1-yes", "text": "Yes", "nextQuestionId": "q2" },
              { "id": "a1-no", "text": "No", "classification": "NA" }
            ]
          },
          { "id": "q2", "text": "Do you match invoices to POs?",
            "answers": [
              { "id": "a2-yes", "text": "Yes, exactly as described", "classification": "FIT" },
              { "id": "a2-diff", "text": "Differently", "classification": "GAP" }
            ]
          }
        ]
      }
    }
    [ ] Template created successfully

  Test conversation flow:
    POST /api/assessments/{id}/conversation/J60/respond
    Body: { questionId: "q1", answerId: "a1-yes" }
    [ ] Returns next question (q2)

    POST /api/assessments/{id}/conversation/J60/respond
    Body: { questionId: "q2", answerId: "a2-yes" }
    [ ] Returns classification FIT

    POST /api/assessments/{id}/conversation/J60/complete
    [ ] Session completed, classification applied to step
```

---

## TEST SUITE 13: PERFORMANCE & LOAD

### 13.1 Large Payload Performance

```
  Time these operations:

  GET /api/catalog/scope-items/J60/hierarchy
  Record: ___ ms (should be < 2000ms)

  GET /api/catalog/scope-items/J60/steps?limit=2000
  Record: ___ ms (should be < 3000ms for 714 steps)

  POST bulk classify 460 steps at once:
  Record: ___ ms (should be < 10000ms)

  GET /api/assessments/{id}/progress (after 460 classifications)
  Record: ___ ms (should be < 1000ms)
```

### 13.2 Concurrent Classification

```
  Send 5 classification requests simultaneously (using background processes):
  
  PUT step_A as FIT &
  PUT step_B as GAP &
  PUT step_C as CONFIGURE &
  PUT step_D as NA &
  PUT step_E as FIT &
  wait
  
  Verify:
    [ ] All 5 saved correctly (no race condition)
    [ ] No duplicate StepResponse records
    [ ] No database deadlocks
```

---

## FINAL REPORT FORMAT

After ALL suites complete, produce this comprehensive report:

```
# ABEAM V2 — Backend Integration Test Report
Date: [date]
Server: http://localhost:3000
Auth Method: [describe how you authenticated]
Test Runner: [bash/curl or Node.js script — describe which]

## SUMMARY

| Suite | Tests | Pass | Fail | Skip | Notes |
|---|---|---|---|---|---|
| 1: DB Integrity & Catalog | | | | | |
| 2: Assessment Lifecycle | | | | | |
| 3: Scope Selection | | | | | |
| 4: Step Classification | | | | | |
| 5: Gap Resolution | | | | | |
| 6: Reports & Exports | | | | | |
| 7: Progress & Dashboard | | | | | |
| 8: Registers | | | | | |
| 9: Workshop Management | | | | | |
| 10: Data Isolation | | | | | |
| 11: RBAC | | | | | |
| 12: Conversation Mode | | | | | |
| 13: Performance | | | | | |
| **TOTAL** | | | | | |

## CATALOG DATA VERIFICATION

| Scope Item | Steps | Classifiable | Activities | Hierarchy OK | Config Items |
|---|---|---|---|---|---|
| J60 | | | | | |
| J59 | | | | | |
| J45 | | | | | |
| 1NT | | | | | |
| BDW | | | | | |
| 2ET | | | | | |

## CLASSIFICATION PIPELINE

| Test | Result | Notes |
|---|---|---|
| Individual PUT FIT | | |
| Individual PUT CONFIGURE | | |
| Individual PUT GAP | | |
| Individual PUT NA | | |
| Bulk POST FIT | | |
| Bulk POST CONFIGURE (was broken!) | | |
| Bulk POST GAP (was broken!) | | |
| Bulk POST NA | | |
| Bulk with clientNote (was dropped!) | | |
| Limit=500 catalog steps (was rejected!) | | |
| Limit=500 step responses (was rejected!) | | |
| Reclassification FIT→GAP→FIT | | |
| Auto-advance (gap auto-creation) | | |
| Bulk 460 steps at once | | |

## ZOD VALIDATION BOUNDARIES

| Endpoint | Param | Test Value | Expected | Actual | Pass? |
|---|---|---|---|---|---|
| catalog/steps | limit | 200 | 200 | | |
| catalog/steps | limit | 500 | 200 | | |
| catalog/steps | limit | 2000 | 200 | | |
| catalog/steps | limit | 2001 | 400 | | |
| assessment/steps | limit | 500 | 200 | | |
| assessment/steps | limit | 2001 | 400 | | |
| bulk | fitStatus | "FIT" | 200 | | |
| bulk | fitStatus | "CONFIGURE" | 200 | | |
| bulk | fitStatus | "GAP" | 200 | | |
| bulk | fitStatus | "INVALID" | 400 | | |

## REPORT GENERATION

| Report Type | Endpoint | Status Code | File Generated | File Size | Content Valid | Notes |
|---|---|---|---|---|---|---|
| Executive Summary | | | | | | |
| Gap Register | | | | | | |
| Config Workbook | | | | | | |
| Step Detail | | | | | | |
| Effort Estimate | | | | | | |
| Complete Package | | | | | | |
| [others found] | | | | | | |

## DATA ISOLATION

| Test | Pass? | Notes |
|---|---|---|
| Assessment A scope ≠ Assessment B scope | | |
| Assessment A steps ≠ Assessment B steps | | |
| Cross-assessment step classification blocked | | |
| Same scope item independent across assessments | | |
| Report content isolated per assessment | | |

## NEGATIVE TEST RESULTS

| Test | Expected | Actual | Pass? |
|---|---|---|---|
| Empty body → 400 | | | |
| Invalid enum → 400 | | | |
| SQL injection → safe | | | |
| XSS in notes → safe | | | |
| Path traversal → blocked | | | |
| Non-existent IDs → 404 | | | |
| [every negative test...] | | | |

## PERFORMANCE

| Operation | Time (ms) | Acceptable? |
|---|---|---|
| J60 hierarchy fetch | | < 2000ms |
| J60 steps fetch (714) | | < 3000ms |
| Bulk classify 460 steps | | < 10000ms |
| Progress calculation | | < 1000ms |
| Report generation | | < 30000ms |
| Concurrent 5x classify | | No deadlocks |

## CRITICAL FINDINGS

### Blocking Issues (would prevent launch)
[List any failures that indicate broken core functionality]

### Gaps Found (features that don't exist yet)
[List endpoints that returned 404, features not implemented]

### Security Concerns
[List any unexpected 200s on unauthorized access, data leakage, etc.]

## API ROUTE MAP (Discovered)

List EVERY API endpoint tested with its HTTP method, auth requirements, and status:
| Method | Endpoint | Auth Required | Status | Notes |
|---|---|---|---|---|
| GET | /api/catalog/scope-items | | | |
| GET | /api/catalog/scope-items/{id}/hierarchy | | | |
| ... [every endpoint] | | | |
```

---

## CRITICAL REMINDERS

1. **START THE DEV SERVER** — all tests hit real HTTP endpoints
2. **FIGURE OUT AUTH FIRST** — document how you authenticate, this is step zero
3. **USE REAL HTTP REQUESTS** — not imports, not function calls — curl/fetch against localhost
4. **VERIFY IN DATABASE** — don't trust just the API response; check Prisma when critical
5. **CONTINUE ON FAILURE** — log it, move on, the report is the deliverable
6. **THE REPORT GENERATION TESTS (Suite 6) ARE THE #1 PRIORITY** after basic CRUD works
7. **SAVE ALL GENERATED FILES** to /tmp/ABeam-reports/ for later inspection
8. **RECORD TIMING** for performance-sensitive operations

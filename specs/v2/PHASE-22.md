# Phase 22: Conversation Mode

## 1. Overview

Conversation Mode provides an alternative UX for step classification designed for business users unfamiliar with SAP terminology. Instead of presenting raw SAP documentation and asking users to choose FIT / CONFIGURE / GAP / NA, Conversation Mode transforms each process step into a guided, plain-language question flow. The system interprets the user's natural responses and derives the appropriate classification.

**Problem**: Process owners and executive sponsors often struggle with the traditional StepReviewCard interface because:
- SAP terminology is opaque ("Post Cash Journal Entries" means nothing to a Finance VP)
- The documentation wall is intimidating
- Classification requires understanding SAP's capability model

**Solution**: A conversational decision tree that translates each step into business questions:
```
Traditional:
  Step: Post Cash Journal Entries
  [SAP documentation wall...]
  FIT | CONFIGURE | GAP | NA

Conversation Mode:
  "Does your company handle petty cash or cash receipts/payments?"
  -> Yes, we use cash journals -> "How do you handle cash journal entries today?"
    -> Manually in spreadsheets -> CONFIGURE (needs cash journal setup)
    -> In our current ERP        -> FIT (SAP provides this)
    -> We have custom requirements -> GAP (describe what's different)
  -> No, everything is electronic -> NA
```

Consultants author the conversation templates. Process owners and business users consume them. Templates are per-scope-item + per-process-step + per-language, stored as JSON decision trees.

## 2. Dependencies

### Upstream (must exist before this phase)
- **Phase 1-4 (Core Assessment)**: Assessment, ScopeSelection, StepResponse, ProcessStep models
- **Phase 5 (Gap Resolution)**: GapResolution model (Conversation Mode may auto-create gaps)
- **Phase 17 (Role System)**: Role-based access control; conversation mode targets `process_owner` and `executive_sponsor` roles

### Downstream (phases that depend on this)
- **Phase 23 (Intelligent Dashboard)**: Dashboard can surface conversation session progress
- **Phase 24 (Onboarding)**: Onboarding flows can highlight conversation mode as the recommended path for process owners

### External Dependencies
- None (no new npm packages required; uses existing shadcn/ui components)

## 3. Data Model Changes

### New Models

```prisma
model ConversationTemplate {
  id              String   @id @default(cuid())
  scopeItemId     String
  processStepId   String
  questionFlow    Json     // DecisionTree structure (see Business Logic section)
  language        String   @default("en")
  version         Int      @default(1)
  createdBy       String
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([scopeItemId, processStepId, language])
  @@index([scopeItemId])
  @@index([isActive])
}

model ConversationSession {
  id                     String    @id @default(cuid())
  assessmentId           String
  userId                 String
  scopeItemId            String
  currentQuestionId      String?   // ID within the questionFlow tree
  responses              Json      // ConversationResponse[]
  derivedClassifications Json?     // DerivedClassification[]
  status                 String    @default("in_progress") // "in_progress" | "completed" | "abandoned"
  startedAt              DateTime  @default(now())
  completedAt            DateTime?

  @@index([assessmentId, userId])
  @@index([assessmentId, scopeItemId])
  @@index([status])
}
```

### Zod Schemas

```typescript
// --- Decision Tree Structure ---

import { z } from "zod";

export const classificationValueSchema = z.enum(["FIT", "CONFIGURE", "GAP", "NA"]);

export const conversationAnswerSchema: z.ZodType = z.object({
  id: z.string(),
  text: z.string().min(1).max(500),
  nextQuestionId: z.string().optional(),
  classification: classificationValueSchema.optional(),
  followUpPrompt: z.string().max(500).optional(),
  confidence: z.number().min(0).max(1).default(0.8),
});

export const conversationQuestionSchema = z.object({
  id: z.string(),
  question: z.string().min(5).max(1000),
  helpText: z.string().max(2000).optional(),
  answers: z.array(conversationAnswerSchema).min(2).max(8),
  allowFreeText: z.boolean().default(false),
});

export const questionFlowSchema = z.object({
  rootQuestionId: z.string(),
  questions: z.record(z.string(), conversationQuestionSchema),
});

// --- Session Data ---

export const conversationResponseSchema = z.object({
  questionId: z.string(),
  answerId: z.string().optional(),
  freeText: z.string().max(2000).optional(),
  timestamp: z.string().datetime(),
});

export const derivedClassificationSchema = z.object({
  processStepId: z.string(),
  classification: classificationValueSchema,
  confidence: z.number().min(0).max(1),
  derivedFromAnswers: z.array(z.string()),
  gapDescription: z.string().max(2000).optional(),
});

// --- API Payloads ---

export const createTemplateSchema = z.object({
  scopeItemId: z.string(),
  processStepId: z.string(),
  questionFlow: questionFlowSchema,
  language: z.string().length(2).default("en"),
});

export const respondToQuestionSchema = z.object({
  questionId: z.string(),
  answerId: z.string().optional(),
  freeText: z.string().max(2000).optional(),
});

export const completeConversationSchema = z.object({
  applyClassifications: z.boolean().default(true),
});
```

### Migration

```sql
-- CreateTable: ConversationTemplate
CREATE TABLE "ConversationTemplate" (
    "id" TEXT NOT NULL,
    "scopeItemId" TEXT NOT NULL,
    "processStepId" TEXT NOT NULL,
    "questionFlow" JSONB NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConversationTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConversationTemplate_scopeItemId_processStepId_language_key"
    ON "ConversationTemplate"("scopeItemId", "processStepId", "language");
CREATE INDEX "ConversationTemplate_scopeItemId_idx"
    ON "ConversationTemplate"("scopeItemId");
CREATE INDEX "ConversationTemplate_isActive_idx"
    ON "ConversationTemplate"("isActive");

-- CreateTable: ConversationSession
CREATE TABLE "ConversationSession" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scopeItemId" TEXT NOT NULL,
    "currentQuestionId" TEXT,
    "responses" JSONB NOT NULL DEFAULT '[]',
    "derivedClassifications" JSONB,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "ConversationSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConversationSession_assessmentId_userId_idx"
    ON "ConversationSession"("assessmentId", "userId");
CREATE INDEX "ConversationSession_assessmentId_scopeItemId_idx"
    ON "ConversationSession"("assessmentId", "scopeItemId");
CREATE INDEX "ConversationSession_status_idx"
    ON "ConversationSession"("status");
```

## 4. API Routes

### `GET /api/assessments/[id]/conversation/[scopeItemId]`
Returns the conversation flow for all steps in a scope item that have templates.

**Auth**: Requires authenticated session. User must be a stakeholder on the assessment.

**Response** `200`:
```typescript
{
  scopeItemId: string;
  scopeItemName: string;
  templates: Array<{
    processStepId: string;
    stepTitle: string;
    stepSequence: number;
    questionFlow: QuestionFlow;
    hasExistingResponse: boolean;
    existingClassification: string | null;
  }>;
  sessionId: string | null; // Existing in-progress session, if any
  totalSteps: number;
  coveredSteps: number; // Steps that have conversation templates
}
```

**Response** `404`: Assessment or scope item not found.

### `POST /api/assessments/[id]/conversation/[scopeItemId]/respond`
Submit an answer to the current question and receive the next question or a classification.

**Auth**: Requires authenticated session. User must be a stakeholder with `canEdit: true`.

**Request Body**: `respondToQuestionSchema`

**Response** `200`:
```typescript
{
  sessionId: string;
  nextQuestion: ConversationQuestion | null; // null if this branch terminates
  derivedClassification: {
    processStepId: string;
    classification: "FIT" | "CONFIGURE" | "GAP" | "NA";
    confidence: number;
  } | null; // Present if this answer leads to a terminal classification
  progress: {
    answeredQuestions: number;
    estimatedRemaining: number;
  };
}
```

**Response** `400`: Invalid answer ID or question ID mismatch.
**Response** `409`: Session already completed.

### `GET /api/assessments/[id]/conversation/sessions`
List the current user's conversation sessions for an assessment.

**Auth**: Requires authenticated session.

**Response** `200`:
```typescript
{
  sessions: Array<{
    id: string;
    scopeItemId: string;
    scopeItemName: string;
    status: "in_progress" | "completed" | "abandoned";
    stepsClassified: number;
    totalSteps: number;
    startedAt: string;
    completedAt: string | null;
  }>;
}
```

### `POST /api/assessments/[id]/conversation/[scopeItemId]/complete`
Finalize a conversation session and optionally apply derived classifications as StepResponses.

**Auth**: Requires authenticated session. User must be a stakeholder with `canEdit: true`.

**Request Body**: `completeConversationSchema`

**Response** `200`:
```typescript
{
  sessionId: string;
  appliedCount: number; // Number of StepResponses created/updated
  skippedCount: number; // Steps where a response already existed and was not overwritten
  classifications: DerivedClassification[];
}
```

**Response** `400`: Session has no derived classifications yet.
**Response** `409`: Session already completed.

### `POST /api/admin/conversation-templates` (Admin)
Create or update a conversation template.

**Auth**: `platform_admin`, `partner_lead`, `consultant`.

**Request Body**: `createTemplateSchema`

**Response** `201`: Template created.
**Response** `409`: Template already exists for this scope item + step + language (use PUT to update).

### `PUT /api/admin/conversation-templates/[templateId]`
Update an existing conversation template. Increments version.

**Auth**: `platform_admin`, `partner_lead`, `consultant`.

**Request Body**: `{ questionFlow: QuestionFlow }`

**Response** `200`: Template updated (version incremented).

## 5. UI Components

### ConversationModeToggle
Location: `src/components/conversation/ConversationModeToggle.tsx`

A toggle switch placed in the review sidebar or step review header that lets users switch between traditional (StepReviewCard) mode and Conversation Mode. Shows a tooltip explaining the difference on first use.

```typescript
interface ConversationModeToggleProps {
  assessmentId: string;
  scopeItemId: string;
  isConversationAvailable: boolean; // false if no templates exist
  mode: "traditional" | "conversation";
  onModeChange: (mode: "traditional" | "conversation") => void;
}
```

Uses: `Switch` (shadcn/ui), `Tooltip` (shadcn/ui), `Badge` (to show "Beta" label)

### ConversationCard
Location: `src/components/conversation/ConversationCard.tsx`

Chat-like interface presenting one question at a time. Renders the current question with answer buttons. When an answer is selected, it animates upward as a "sent message" and the next question slides in. Uses the same card styling as StepReviewCard (`bg-card rounded-lg border`).

```typescript
interface ConversationCardProps {
  assessmentId: string;
  scopeItemId: string;
  template: {
    processStepId: string;
    stepTitle: string;
    questionFlow: QuestionFlow;
  };
  existingResponses: ConversationResponse[];
  onClassificationDerived: (classification: DerivedClassification) => void;
  onComplete: () => void;
}
```

Uses: `Card` (shadcn/ui), `Button` (for answer options), `Textarea` (for free-text answers), `Badge` (for classification preview), CSS transitions for message animations.

### ConversationProgress
Location: `src/components/conversation/ConversationProgress.tsx`

Shows progress through the conversation: how many steps have been classified, how many remain. Rendered as a horizontal progress bar with step dots.

```typescript
interface ConversationProgressProps {
  totalSteps: number;
  classifiedSteps: number;
  currentStepIndex: number;
  classifications: Array<{
    stepTitle: string;
    classification: string | null;
  }>;
}
```

Uses: `Progress` (shadcn/ui), `Tooltip` (shadcn/ui for step dot hover), design tokens (`bg-muted`, `text-muted-foreground`).

### ClassificationPreview
Location: `src/components/conversation/ClassificationPreview.tsx`

Shown before the user finalizes the conversation. Displays all derived classifications in a summary table so the user can review before applying. Uses the same color scheme as FIT_OPTIONS in StepReviewCard.

```typescript
interface ClassificationPreviewProps {
  classifications: DerivedClassification[];
  onApply: () => void;
  onCancel: () => void;
  isApplying: boolean;
}
```

Uses: `Card`, `Badge`, `Button`, `Table` (shadcn/ui), color tokens matching StepReviewCard (`bg-green-50`, `bg-blue-50`, `bg-amber-50`, `bg-gray-50`).

### ConversationTemplateEditor (Admin)
Location: `src/components/admin/ConversationTemplateEditor.tsx`

Visual decision-tree editor for consultants to author conversation templates. Uses a nested accordion structure where each question node can be expanded to define answers, and each answer can link to a follow-up question or a terminal classification.

```typescript
interface ConversationTemplateEditorProps {
  scopeItemId: string;
  processStepId: string;
  existingTemplate: ConversationTemplate | null;
  onSave: (flow: QuestionFlow) => void;
}
```

Uses: `Accordion`, `Input`, `Textarea`, `Select`, `Button`, `Card` (shadcn/ui).

## 6. Business Logic

### Decision Tree Traversal

The core algorithm walks the `questionFlow` JSON:

```typescript
function getNextQuestion(
  flow: QuestionFlow,
  currentQuestionId: string,
  selectedAnswerId: string,
): { nextQuestion: ConversationQuestion | null; classification: DerivedClassification | null } {
  const currentQuestion = flow.questions[currentQuestionId];
  if (!currentQuestion) throw new Error(`Question ${currentQuestionId} not found in flow`);

  const selectedAnswer = currentQuestion.answers.find((a) => a.id === selectedAnswerId);
  if (!selectedAnswer) throw new Error(`Answer ${selectedAnswerId} not found`);

  // Terminal: answer leads to classification
  if (selectedAnswer.classification) {
    return {
      nextQuestion: null,
      classification: {
        processStepId: /* from template context */,
        classification: selectedAnswer.classification,
        confidence: selectedAnswer.confidence ?? 0.8,
        derivedFromAnswers: [selectedAnswerId],
        gapDescription: selectedAnswer.followUpPrompt,
      },
    };
  }

  // Non-terminal: answer leads to next question
  if (selectedAnswer.nextQuestionId) {
    const next = flow.questions[selectedAnswer.nextQuestionId];
    if (!next) throw new Error(`Next question ${selectedAnswer.nextQuestionId} not found`);
    return { nextQuestion: next, classification: null };
  }

  // No classification and no next question: treat as incomplete
  return { nextQuestion: null, classification: null };
}
```

### Classification Application

When a session is completed and `applyClassifications: true`:

1. For each `DerivedClassification`, check if a `StepResponse` already exists for that assessment + process step.
2. If no existing response: create a new `StepResponse` with `fitStatus = classification`, `respondent = userId`, `clientNote = "Classified via Conversation Mode (confidence: X%)"`.
3. If existing response exists and `fitStatus === "PENDING"`: update it.
4. If existing response exists and `fitStatus !== "PENDING"`: skip (do not overwrite manual classifications). Increment `skippedCount`.
5. If classification is `GAP` and a `gapDescription` is present: auto-create a `GapResolution` with `resolutionType: "PENDING"`.
6. Log all applied classifications to `DecisionLogEntry` with `action: "conversation_classify"`.

### Template Validation

Before saving a template, validate that:
- The `rootQuestionId` exists in the `questions` map
- Every `nextQuestionId` referenced by an answer exists in the `questions` map
- Every leaf answer (no `nextQuestionId`) has a `classification` value
- No circular references (detect cycles via DFS)
- At least 2 answers per question, at most 8

## 7. Permissions & Access Control

| Action | Roles Allowed |
|--------|---------------|
| View conversation flow | All roles with assessment access |
| Respond to questions | `process_owner`, `consultant`, `solution_architect`, `project_manager` (must have `canEdit: true` on stakeholder record) |
| Apply classifications | `process_owner`, `consultant`, `solution_architect` (must have `canEdit: true`) |
| Create/edit templates | `platform_admin`, `partner_lead`, `consultant` |
| Delete templates | `platform_admin`, `partner_lead` |
| View other users' sessions | `consultant`, `partner_lead`, `platform_admin`, `project_manager` |
| Toggle conversation mode | All roles with assessment access (personal preference) |

### Scope Isolation
- Process owners can only see conversations for their `assignedAreas` on the `AssessmentStakeholder` record.
- Conversation sessions are user-scoped: a process owner cannot see another process owner's session responses unless they have consultant/PM/admin role.

## 8. Notification Triggers

| Event | Recipients | Channel |
|-------|-----------|---------|
| Conversation session completed | Consultant on assessment, PM | In-app notification |
| Classifications applied from conversation | All stakeholders on affected scope items | In-app notification |
| New conversation template published | All consultants in organization | Email digest |
| Low-confidence classification (<0.5) | Consultant who created template | In-app alert |

## 9. Edge Cases & Error Handling

| Edge Case | Handling |
|-----------|----------|
| No template exists for a step | ConversationModeToggle shows "Not available" with tooltip explaining templates need to be created |
| User abandons mid-conversation | Session saved with `status: "in_progress"`; resumable on next visit |
| User goes back to a previous question | Responses array is truncated at the point of backtracking; derived classifications recalculated |
| Concurrent sessions for same scope item | Only one in-progress session per user per scope item allowed; new session attempt returns existing |
| Template updated while session in progress | Session continues with the template version it started with (snapshot stored in session `responses` context) |
| All steps already classified manually | ConversationProgress shows existing classifications; user can still run conversation but skipped on apply |
| Free-text answer on a question where `allowFreeText: false` | API rejects with 400 error |
| Circular reference in template | Caught at template save time by cycle detection; runtime safeguard limits traversal to 50 questions |
| Classification confidence below threshold (0.3) | Warn user in ClassificationPreview: "Low confidence - consider manual review" |
| Process step deleted after template created | Template marked inactive; session cannot be started for missing steps |

## 10. Performance Considerations

- **Template Loading**: Templates are loaded per scope item, not per step. A single query fetches all templates for a scope item (`WHERE scopeItemId = ? AND isActive = true`). Typical scope items have 5-30 steps, so this is a small result set.
- **Session State**: Session `responses` JSON grows linearly with answered questions. Typical conversations are 3-8 questions deep. No pagination needed.
- **Batch Classification Apply**: When completing a session, all StepResponse upserts are batched in a single Prisma transaction. Typical batch size: 5-30 records.
- **Template Validation**: Cycle detection runs at O(V+E) where V = number of questions, E = number of answer->nextQuestion edges. Templates are small (typically <50 questions), so this is negligible.
- **Caching**: Conversation templates rarely change. Cache templates with `unstable_cache` or React `cache()` with a 1-hour TTL, invalidated on template update.

## 11. Testing Strategy

### Unit Tests
- `questionFlow` Zod schema validation: valid trees, missing root, dangling references, cycles
- Decision tree traversal: correct next question selection, terminal classification, back-tracking
- Classification application logic: new response creation, skip existing, gap auto-creation
- Template validation: cycle detection, leaf validation, answer count bounds

### Integration Tests
- `POST /api/assessments/[id]/conversation/[scopeItemId]/respond`: full flow from first question to classification
- `POST /api/assessments/[id]/conversation/[scopeItemId]/complete`: verify StepResponse and GapResolution records created
- Permission checks: process owner restricted to assigned areas, viewer cannot respond
- Session resumption: abandon and resume, verify state preserved

### E2E Tests
- Process owner toggles to conversation mode, answers all questions, reviews preview, applies classifications
- Consultant creates a template in admin, process owner uses it in assessment
- Mobile viewport: conversation card renders correctly at 375px width

### Edge Case Tests
- Template with 1 question and 2 terminal answers (simplest possible flow)
- Template with maximum depth (8 levels deep)
- Concurrent session guard: second session attempt returns existing session
- Classification apply with mixed existing/new responses

## 12. Migration & Seed Data

### Migration Steps
1. Run `npx prisma migrate dev --name add_conversation_mode` to create `ConversationTemplate` and `ConversationSession` tables.
2. No data migration required (new tables only).

### Seed Data
Provide 3 sample conversation templates for common scope items:

```typescript
const sampleTemplates = [
  {
    scopeItemId: "J60", // Accounts Payable
    processStepId: "/* first step of J60 */",
    language: "en",
    questionFlow: {
      rootQuestionId: "q1",
      questions: {
        q1: {
          id: "q1",
          question: "Does your company process vendor invoices?",
          helpText: "This includes any bills you receive from suppliers or service providers.",
          answers: [
            { id: "a1", text: "Yes, we process vendor invoices regularly", nextQuestionId: "q2" },
            { id: "a2", text: "No, we don't work with vendors", classification: "NA", confidence: 0.95 },
          ],
        },
        q2: {
          id: "q2",
          question: "How do you currently process vendor invoices?",
          answers: [
            { id: "a3", text: "Manually enter into our ERP system", classification: "FIT", confidence: 0.85 },
            { id: "a4", text: "Paper-based or spreadsheet tracking", classification: "CONFIGURE", confidence: 0.7, followUpPrompt: "SAP can automate this with standard invoice processing." },
            { id: "a5", text: "We have custom invoice matching rules", classification: "GAP", confidence: 0.6, followUpPrompt: "Describe your custom matching requirements." },
          ],
          allowFreeText: true,
        },
      },
    },
  },
  // Two more templates for scope items like J14 (Sales Order Processing) and BD2 (Bank Account Management)
];
```

## 13. Open Questions

1. **Template Authoring UX**: Should we provide a visual drag-and-drop tree editor, or is the nested accordion approach sufficient for V2? Visual editor is higher effort but more intuitive.
2. **AI-Assisted Template Generation**: Should we explore using an LLM to auto-generate conversation templates from SAP documentation? This could dramatically reduce consultant effort but adds AI dependency.
3. **Multi-Step Grouping**: Can a single conversation template cover multiple related process steps at once (e.g., "Create Invoice" + "Post Invoice" + "Release Payment"), or should each step have its own template?
4. **Confidence Threshold for Auto-Apply**: What minimum confidence score should be required to auto-apply a classification? Current default is 0.8 but this is configurable.
5. **Localization**: The `language` field supports multilingual templates. Should V2 include translation workflows, or is English-only sufficient for launch?
6. **Analytics**: Should we track which questions are most frequently answered a certain way, to help consultants refine templates?

## 14. Acceptance Criteria (Given/When/Then)

### AC-22.1: Toggle Between Modes
```
Given a process owner viewing step review for scope item J60
  And conversation templates exist for at least one step in J60
When they click the Conversation Mode toggle
Then the UI switches from StepReviewCard to ConversationCard
  And the toggle shows "Traditional Mode" as the return option
```

### AC-22.2: Complete a Conversation Flow
```
Given a process owner in conversation mode for scope item J60
  And the first question is "Does your company process vendor invoices?"
When they answer "Yes, we process vendor invoices regularly"
Then the next question "How do you currently process vendor invoices?" appears
  And the previous answer is shown as a "sent message" above
  And the progress indicator advances
```

### AC-22.3: Derive Classification
```
Given a process owner has answered all questions in a conversation branch
  And the final answer maps to classification "FIT" with confidence 0.85
When the conversation for that step completes
Then a DerivedClassification with classification "FIT" and confidence 0.85 is stored in the session
  And the ClassificationPreview shows "FIT" for that step with a green badge
```

### AC-22.4: Apply Classifications
```
Given a process owner has completed a conversation session with 5 derived classifications
  And 2 of those steps already have manual classifications
When they click "Apply Classifications" in the ClassificationPreview
Then 3 new StepResponse records are created with the derived classifications
  And 2 steps are skipped (existing manual classifications preserved)
  And a success toast shows "3 classifications applied, 2 skipped (already classified)"
  And 3 DecisionLogEntry records are created with action "conversation_classify"
```

### AC-22.5: GAP Auto-Creation
```
Given a conversation branch terminates with classification "GAP"
  And the answer includes a followUpPrompt "Describe your custom matching requirements"
  And the user entered free text "We require 4-way matching with goods receipt"
When the classification is applied
Then a GapResolution record is created with:
  - gapDescription: "We require 4-way matching with goods receipt"
  - resolutionType: "PENDING"
  - clientApproved: false
```

### AC-22.6: Session Resumption
```
Given a process owner started a conversation session for J60 yesterday
  And they answered 3 questions before closing the browser
When they return to scope item J60 and toggle to conversation mode
Then the existing session is loaded
  And their previous 3 answers are displayed as sent messages
  And the 4th question is presented as the current question
```

### AC-22.7: Template Creation (Admin)
```
Given a consultant is on the Conversation Template admin page
When they create a template with a question that has no nextQuestionId and no classification
Then the save is rejected with error "Every leaf answer must have a classification"
```

### AC-22.8: Conversation Not Available
```
Given a process owner viewing scope item BD2
  And no conversation templates exist for any steps in BD2
When they see the ConversationModeToggle
Then it is disabled with tooltip "Conversation mode not yet available for this area"
```

### AC-22.9: Area Restriction for Process Owners
```
Given a process owner assigned to areas ["Finance", "Procurement"]
When they try to access conversation mode for scope item J14 (Sales)
Then they receive a 403 error
  And the UI shows a PermissionDenied component
```

## 15. Size Estimate

**Size: L (Large)**

| Component | Effort |
|-----------|--------|
| Data model + migration | 0.5 days |
| API routes (6 endpoints) | 2 days |
| Decision tree engine (traversal, validation, cycle detection) | 1.5 days |
| Classification application logic + transaction | 1 day |
| ConversationCard UI (chat-like, animations) | 2 days |
| ConversationModeToggle + ConversationProgress | 0.5 days |
| ClassificationPreview | 0.5 days |
| ConversationTemplateEditor (admin) | 2 days |
| Unit + integration tests | 1.5 days |
| E2E tests | 1 day |
| **Total** | **~12.5 days** |

## 16. Phase Completion Checklist

- [ ] `ConversationTemplate` and `ConversationSession` tables created and migrated
- [ ] Zod schemas for `questionFlow`, `conversationResponse`, `derivedClassification` validated
- [ ] Decision tree traversal engine implemented with cycle detection
- [ ] `GET /api/assessments/[id]/conversation/[scopeItemId]` returns templates and session state
- [ ] `POST .../respond` advances conversation and returns next question or classification
- [ ] `POST .../complete` applies classifications as StepResponses in a single transaction
- [ ] `GET .../sessions` lists user's sessions with progress summary
- [ ] Admin CRUD endpoints for templates with validation
- [ ] `ConversationModeToggle` component renders and switches modes
- [ ] `ConversationCard` renders questions one at a time with chat-style animation
- [ ] `ConversationProgress` shows step completion progress
- [ ] `ClassificationPreview` shows all derived classifications before apply
- [ ] `ConversationTemplateEditor` allows consultants to author templates
- [ ] Permission checks: process owners restricted to assigned areas
- [ ] Session resumption works (in-progress sessions loaded on return)
- [ ] GAP classifications auto-create GapResolution records
- [ ] DecisionLogEntry records created for all conversation-derived classifications
- [ ] Seed data: 3 sample templates for common scope items
- [ ] Unit tests: schema validation, tree traversal, classification logic
- [ ] Integration tests: full conversation flow, permission checks
- [ ] E2E test: process owner completes conversation and applies classifications
- [ ] Mobile viewport tested (375px minimum width)

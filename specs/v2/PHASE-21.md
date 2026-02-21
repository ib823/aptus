# Phase 21: Workshop Management

## 1. Overview

Build full workshop lifecycle management for SAP Fit-to-Standard assessment sessions. Workshops are the primary collaboration mechanism where consultants facilitate live review of process steps with client stakeholders. This phase covers scheduling, attendee management, live facilitation mode with synchronized navigation, live polling/classification voting, workshop minutes auto-generation, and action item tracking.

**Source**: V2 Brief Section A5.9 + Addendum 1 Section 4 (workshop collaboration)

### Goals
- Provide end-to-end workshop lifecycle: schedule, invite, join, facilitate, vote, conclude, generate minutes
- Enable a projector-friendly "Workshop Mode" UI with large text, high contrast, and minimal chrome
- Support QR-code-based join flow for in-room attendees
- Implement synchronized navigation where the facilitator's current step broadcasts to all attendees
- Allow attendees to follow or unfollow the presenter independently
- Enable live classification voting with real-time tally display
- Auto-generate structured workshop minutes from session data
- Track action items with assignment, due dates, and status

---

## 2. Dependencies

| Dependency | Type | Notes |
|---|---|---|
| Phase 18 (Assessment Lifecycle) | Phase | `WorkshopSession` model defined in Phase 18; extended here with full detail |
| Phase 19 (Notification System) | Phase | Workshop invite/starting notifications |
| Phase 17 RBAC (11 roles) | Phase | Role-gated facilitation and voting permissions |
| `Assessment`, `ScopeItem`, `ProcessStep`, `StepResponse` | Schema | Core data displayed and modified during workshops |
| `AssessmentStakeholder` | Schema | Attendee resolution |
| WebSocket or SSE | Infrastructure | Real-time synchronized navigation and live vote updates |
| `qrcode` npm package | Library | QR code generation for session join codes |
| React 19 + Next.js 16 | Framework | Real-time UI with server actions and client state |
| shadcn/ui | Library | Dialog, Card, Badge, Progress, Avatar components |

---

## 3. Data Model Changes

### Modified: `WorkshopSession` (extends Phase 18 definition)

```prisma
model WorkshopSession {
  // Fields from Phase 18
  id                String    @id @default(cuid())
  assessmentId      String
  title             String
  sessionCode       String    @unique
  status            String    @default("scheduled") // "scheduled" | "active" | "completed" | "cancelled"
  scheduledAt       DateTime?
  startedAt         DateTime?
  endedAt           DateTime?
  facilitatorId     String
  scopeItemIds      String[]  @default([])
  attendeeCount     Int       @default(0)
  minutesGenerated  Boolean   @default(false)
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  // New fields for Phase 21
  qrCodeUrl         String?   @db.Text     // Data URI of QR code SVG
  facilitatorNotes  String?   @db.Text     // Pre-session notes from facilitator
  agenda            Json?     // [{scopeItemId, processFlowName, estimatedMinutes, status: "pending"|"in_progress"|"completed"|"skipped"}]
  currentStepId     String?                // Currently displayed step (for sync navigation)
  currentScopeItemId String?               // Currently displayed scope item
  duration          Int?                   // Actual duration in minutes (computed on end)
  recordingUrl      String?                // Optional link to external recording

  assessment Assessment           @relation(fields: [assessmentId], references: [id], onDelete: Cascade)
  attendees  WorkshopAttendee[]
  votes      WorkshopVote[]
  actionItems WorkshopActionItem[]
  minutes    WorkshopMinutes?

  @@index([assessmentId])
  @@index([sessionCode])
  @@index([assessmentId, status])
  @@index([facilitatorId])
}
```

### New: `WorkshopAttendee`

```prisma
model WorkshopAttendee {
  id              String    @id @default(cuid())
  sessionId       String
  userId          String
  role            String    @default("attendee") // "facilitator" | "presenter" | "attendee" | "observer"
  joinedAt        DateTime  @default(now())
  leftAt          DateTime?
  deviceType      String?   // "desktop" | "tablet" | "mobile"
  isFollowing     Boolean   @default(true)  // Following presenter's navigation
  isPresenter     Boolean   @default(false) // Can share screen / navigate for all
  connectionStatus String   @default("connected") // "connected" | "disconnected" | "idle"
  lastPingAt      DateTime  @default(now())
  createdAt       DateTime  @default(now())

  session WorkshopSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  user    User            @relation(fields: [userId], references: [id])

  @@unique([sessionId, userId])
  @@index([sessionId])
  @@index([userId])
}
```

### New: `WorkshopVote`

```prisma
model WorkshopVote {
  id              String   @id @default(cuid())
  sessionId       String
  processStepId   String
  userId          String
  classification  String   // "FIT" | "CONFIGURE" | "GAP" | "NA"
  confidence      String?  // "high" | "medium" | "low"
  notes           String?  @db.Text
  votedAt         DateTime @default(now())

  session WorkshopSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@unique([sessionId, processStepId, userId])
  @@index([sessionId])
  @@index([sessionId, processStepId])
}
```

### New: `WorkshopActionItem`

```prisma
model WorkshopActionItem {
  id              String    @id @default(cuid())
  sessionId       String
  title           String
  description     String?   @db.Text
  assignedTo      String?   // userId
  assignedToName  String?   // Display name for convenience
  dueDate         DateTime?
  status          String    @default("open") // "open" | "in_progress" | "completed" | "cancelled"
  priority        String    @default("medium") // "high" | "medium" | "low"
  relatedStepId   String?   // processStepId if action relates to a specific step
  relatedScopeItemId String? // scopeItemId if action relates to a scope item
  completedAt     DateTime?
  completedBy     String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  session WorkshopSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([sessionId])
  @@index([sessionId, status])
  @@index([assignedTo])
}
```

### New: `WorkshopMinutes`

```prisma
model WorkshopMinutes {
  id                  String   @id @default(cuid())
  sessionId           String   @unique
  content             String   @db.Text   // Generated markdown
  attendeesSummary    Json     // [{userId, name, role, joinedAt, leftAt, deviceType}]
  decisionsSummary    Json     // [{processStepId, stepTitle, classification, voteBreakdown, notes}]
  actionItemsSummary  Json     // [{title, assignedToName, dueDate, priority, status}]
  agendaSummary       Json     // [{scopeItemId, scopeItemName, processFlowName, stepsReviewed, duration}]
  statisticsSummary   Json     // {totalStepsReviewed, fitCount, configureCount, gapCount, naCount, votingParticipation}
  generatedAt         DateTime @default(now())
  regeneratedAt       DateTime?
  exportedAt          DateTime?
  exportFormat        String?  // "pdf" | "docx"

  session WorkshopSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
}
```

### Modified: `User` model

```prisma
model User {
  // ... existing fields ...

  // New relation
  workshopAttendances WorkshopAttendee[]
}
```

### TypeScript Types (`src/types/workshop.ts`)

```typescript
export type WorkshopStatus = "scheduled" | "active" | "completed" | "cancelled";

export type AttendeeRole = "facilitator" | "presenter" | "attendee" | "observer";

export type ConnectionStatus = "connected" | "disconnected" | "idle";

export type VoteClassification = "FIT" | "CONFIGURE" | "GAP" | "NA";

export type VoteConfidence = "high" | "medium" | "low";

export type ActionItemStatus = "open" | "in_progress" | "completed" | "cancelled";

export type ActionItemPriority = "high" | "medium" | "low";

export interface AgendaItem {
  scopeItemId: string;
  processFlowName?: string;
  estimatedMinutes: number;
  status: "pending" | "in_progress" | "completed" | "skipped";
}

export interface VoteTally {
  processStepId: string;
  stepTitle: string;
  votes: {
    FIT: number;
    CONFIGURE: number;
    GAP: number;
    NA: number;
  };
  totalVoters: number;
  consensus: VoteClassification | null; // null if no clear majority
  confidenceBreakdown: Record<VoteConfidence, number>;
}

export interface SyncNavigationEvent {
  type: "navigate";
  scopeItemId: string;
  processStepId: string;
  timestamp: number;
  facilitatorId: string;
}

export interface WorkshopRealTimeMessage {
  type: "navigate" | "vote_update" | "attendee_join" | "attendee_leave" | "action_item_added" | "session_ended";
  payload: Record<string, unknown>;
  timestamp: number;
}
```

### Zod Schemas (`src/lib/validation/workshop.ts`)

```typescript
import { z } from "zod";

export const WorkshopCreateSchema = z.object({
  title: z.string().min(1).max(200),
  scheduledAt: z.string().datetime().optional(),
  scopeItemIds: z.array(z.string()).min(1, "At least one scope item is required"),
  facilitatorNotes: z.string().max(5000).optional(),
  agenda: z.array(z.object({
    scopeItemId: z.string(),
    processFlowName: z.string().optional(),
    estimatedMinutes: z.number().int().min(1).max(480),
  })).optional(),
});

export const WorkshopUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  scheduledAt: z.string().datetime().optional(),
  scopeItemIds: z.array(z.string()).optional(),
  facilitatorNotes: z.string().max(5000).optional(),
  agenda: z.array(z.object({
    scopeItemId: z.string(),
    processFlowName: z.string().optional(),
    estimatedMinutes: z.number().int().min(1).max(480),
    status: z.enum(["pending", "in_progress", "completed", "skipped"]).optional(),
  })).optional(),
});

export const WorkshopJoinSchema = z.object({
  sessionCode: z.string().length(6).regex(/^[A-HJ-NP-Z2-9]+$/),
  deviceType: z.enum(["desktop", "tablet", "mobile"]).optional(),
});

export const WorkshopVoteSchema = z.object({
  processStepId: z.string(),
  classification: z.enum(["FIT", "CONFIGURE", "GAP", "NA"]),
  confidence: z.enum(["high", "medium", "low"]).optional(),
  notes: z.string().max(2000).optional(),
});

export const WorkshopNavigateSchema = z.object({
  scopeItemId: z.string(),
  processStepId: z.string(),
});

export const ActionItemCreateSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
  assignedTo: z.string().optional(),
  dueDate: z.string().datetime().optional(),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
  relatedStepId: z.string().optional(),
  relatedScopeItemId: z.string().optional(),
});

export const ActionItemUpdateSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(5000).optional(),
  assignedTo: z.string().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  priority: z.enum(["high", "medium", "low"]).optional(),
  status: z.enum(["open", "in_progress", "completed", "cancelled"]).optional(),
});
```

---

## 4. API Routes

### Workshop Session Lifecycle

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/assessments/[id]/workshops` | Create workshop session | `consultant`, `partner_lead`, `solution_architect`, `platform_admin` |
| `GET` | `/api/assessments/[id]/workshops` | List workshops for assessment | Stakeholder |
| `GET` | `/api/assessments/[id]/workshops/[sessionId]` | Get session detail | Stakeholder |
| `PUT` | `/api/assessments/[id]/workshops/[sessionId]` | Update session metadata | Facilitator, `platform_admin` |
| `DELETE` | `/api/assessments/[id]/workshops/[sessionId]` | Cancel session (soft) | Facilitator, `platform_admin` |
| `POST` | `/api/assessments/[id]/workshops/[sessionId]/start` | Start session | Facilitator |
| `POST` | `/api/assessments/[id]/workshops/[sessionId]/end` | End session | Facilitator |

### Workshop Join & Attendance

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/workshops/join` | Join by session code | Authenticated |
| `GET` | `/api/assessments/[id]/workshops/[sessionId]/attendees` | List attendees | Session participant |
| `PUT` | `/api/assessments/[id]/workshops/[sessionId]/attendees/[userId]/follow` | Toggle follow presenter | Self only |
| `DELETE` | `/api/assessments/[id]/workshops/[sessionId]/attendees/[userId]` | Leave session | Self or facilitator |

### Live Voting

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/assessments/[id]/workshops/[sessionId]/votes` | Submit classification vote | Session participant |
| `GET` | `/api/assessments/[id]/workshops/[sessionId]/votes/[processStepId]` | Get vote tally for a step | Session participant |
| `GET` | `/api/assessments/[id]/workshops/[sessionId]/votes` | Get all votes for session | Facilitator |
| `POST` | `/api/assessments/[id]/workshops/[sessionId]/votes/[processStepId]/finalize` | Finalize vote as official StepResponse | Facilitator |

### Synchronized Navigation

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/assessments/[id]/workshops/[sessionId]/navigate` | Broadcast current step to attendees | Facilitator/presenter |
| `GET` | `/api/assessments/[id]/workshops/[sessionId]/stream` | SSE stream for real-time updates (navigation, votes, attendees) | Session participant |

### Action Items

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/assessments/[id]/workshops/[sessionId]/action-items` | Create action item | Facilitator, `consultant` |
| `GET` | `/api/assessments/[id]/workshops/[sessionId]/action-items` | List action items | Session participant |
| `PUT` | `/api/assessments/[id]/workshops/[sessionId]/action-items/[itemId]` | Update action item | Facilitator, assignee |
| `DELETE` | `/api/assessments/[id]/workshops/[sessionId]/action-items/[itemId]` | Delete action item | Facilitator |

### Workshop Minutes

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/assessments/[id]/workshops/[sessionId]/minutes/generate` | Auto-generate minutes | Facilitator |
| `GET` | `/api/assessments/[id]/workshops/[sessionId]/minutes` | Get generated minutes | Session participant |
| `PUT` | `/api/assessments/[id]/workshops/[sessionId]/minutes` | Edit generated minutes | Facilitator |
| `POST` | `/api/assessments/[id]/workshops/[sessionId]/minutes/export` | Export minutes as PDF/DOCX | Session participant |

### Request/Response Examples

**POST `/api/workshops/join`**
```json
// Request
{
  "sessionCode": "K7MN3P",
  "deviceType": "tablet"
}

// Response 200
{
  "sessionId": "clx_ws_001",
  "assessmentId": "clx_asmt_001",
  "title": "Finance Process Review",
  "status": "active",
  "facilitator": { "id": "user_abc", "name": "John Smith" },
  "currentStepId": "clx_step_045",
  "attendeeCount": 8
}

// Response 404
{
  "error": "SESSION_NOT_FOUND",
  "message": "No active workshop found with code K7MN3P"
}
```

**GET `/api/assessments/[id]/workshops/[sessionId]/votes/[processStepId]`**
```json
{
  "processStepId": "clx_step_045",
  "stepTitle": "Create Purchase Order",
  "votes": {
    "FIT": 3,
    "CONFIGURE": 1,
    "GAP": 1,
    "NA": 0
  },
  "totalVoters": 5,
  "consensus": "FIT",
  "confidenceBreakdown": { "high": 3, "medium": 1, "low": 1 },
  "voterDetails": [
    { "userId": "user_001", "name": "Alice", "role": "process_owner", "classification": "FIT", "confidence": "high" },
    { "userId": "user_002", "name": "Bob", "role": "it_lead", "classification": "CONFIGURE", "confidence": "medium" }
  ]
}
```

---

## 5. UI Components

### New Components

| Component | Location | Description |
|---|---|---|
| `WorkshopScheduleDialog` | `src/components/workshop/WorkshopScheduleDialog.tsx` | Dialog for creating/editing a workshop with scope item selection and agenda builder |
| `WorkshopJoinPage` | `src/app/(portal)/workshops/join/page.tsx` | Page with session code input and QR scanner |
| `WorkshopModePage` | `src/app/(portal)/workshops/[sessionId]/page.tsx` | Full-screen workshop facilitation view |
| `WorkshopModeLayout` | `src/components/workshop/WorkshopModeLayout.tsx` | Projector-friendly layout: dark background, large text, minimal chrome |
| `WorkshopStepCard` | `src/components/workshop/WorkshopStepCard.tsx` | Large card showing current step details for projection |
| `WorkshopVotingPanel` | `src/components/workshop/WorkshopVotingPanel.tsx` | Voting buttons (FIT/CONFIGURE/GAP/NA) with live tally bar chart |
| `WorkshopVoteTally` | `src/components/workshop/WorkshopVoteTally.tsx` | Real-time bar chart showing vote distribution |
| `WorkshopAttendeeList` | `src/components/workshop/WorkshopAttendeeList.tsx` | Sidebar showing connected attendees with avatars and connection status |
| `WorkshopAgenda` | `src/components/workshop/WorkshopAgenda.tsx` | Ordered list of agenda items with progress indicators |
| `WorkshopNavigationBar` | `src/components/workshop/WorkshopNavigationBar.tsx` | Bottom bar with prev/next step, progress, and agenda position |
| `WorkshopQRCode` | `src/components/workshop/WorkshopQRCode.tsx` | QR code display for session join link |
| `WorkshopActionItemForm` | `src/components/workshop/WorkshopActionItemForm.tsx` | Inline form for quickly capturing action items during session |
| `WorkshopActionItemList` | `src/components/workshop/WorkshopActionItemList.tsx` | List of action items with status, assignee, and due date |
| `WorkshopMinutesViewer` | `src/components/workshop/WorkshopMinutesViewer.tsx` | Rendered markdown viewer for generated minutes |
| `WorkshopMinutesEditor` | `src/components/workshop/WorkshopMinutesEditor.tsx` | Editable markdown editor for minutes refinement |
| `WorkshopSummaryCard` | `src/components/workshop/WorkshopSummaryCard.tsx` | Post-session summary card shown on assessment dashboard |
| `FollowPresenterToggle` | `src/components/workshop/FollowPresenterToggle.tsx` | Toggle button: "Following presenter" / "Free navigation" |
| `WorkshopTimer` | `src/components/workshop/WorkshopTimer.tsx` | Elapsed time display and per-agenda-item timer |

### Modified Components

| Component | Changes |
|---|---|
| Assessment detail page | Add "Workshops" tab showing `WorkshopSessionList` |
| Portal header | Add active workshop indicator when user is in a session |
| Dashboard | Show upcoming/active workshops for the user |

### Workshop Mode Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Workshop Mode: Finance Process Review          [Timer: 45:23]  │
│  Session Code: K7MN3P    [QR]    Attendees: 8/12               │
├───────────────────────────────────────────────┬─────────────────┤
│                                               │                 │
│  Current Step (large card):                   │  Attendees:     │
│                                               │  ● Alice (PO)   │
│  Step 5 of 47                                 │  ● Bob (IT)     │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━           │  ● Carol (PM)   │
│  Create Purchase Order                        │  ○ Dave (SA)    │
│                                               │                 │
│  "The user creates a standard purchase        │  Votes:         │
│   order for procurement of materials..."      │  FIT ████ 3     │
│                                               │  CFG ██   1     │
│  [FIT] [CONFIGURE] [GAP] [NA]                │  GAP █    1     │
│                                               │  NA        0    │
│                                               │                 │
├───────────────────────────────────────────────┤  Action Items:  │
│  Agenda:                                      │  □ Review PO    │
│  ✓ Accounts Payable (15 min)                  │    approval     │
│  ● Procurement (est. 20 min) ← current       │    workflow     │
│  ○ Sales Order Processing (est. 25 min)       │  □ Check GL     │
│  ○ Inventory Management (est. 15 min)         │    mapping      │
├───────────────────────────────────────────────┴─────────────────┤
│  [← Prev Step]  Step 5/47  [Scope: Procurement (J14)]  [Next →]│
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Business Logic

### Workshop Session Lifecycle

```typescript
// src/lib/workshop/lifecycle.ts

/**
 * Workshop session state machine:
 *
 * scheduled → active → completed
 * scheduled → cancelled
 * active → cancelled (emergency)
 *
 * Transitions:
 * - scheduled → active: facilitator starts session; generates QR code; opens SSE channel
 * - active → completed: facilitator ends session; computes duration; freezes votes
 * - scheduled → cancelled: facilitator cancels; notifies invitees
 * - active → cancelled: emergency cancel; saves current state
 */

export async function startWorkshop(sessionId: string, facilitatorId: string): Promise<WorkshopSession> {
  const session = await prisma.workshopSession.findUnique({ where: { id: sessionId } });

  if (!session) throw new NotFoundError("Workshop session not found");
  if (session.facilitatorId !== facilitatorId) throw new ForbiddenError("Only the facilitator can start the workshop");
  if (session.status !== "scheduled") throw new ConflictError(`Cannot start workshop in status: ${session.status}`);

  const qrCodeUrl = await generateQRCode(`${process.env.NEXT_PUBLIC_APP_URL}/workshops/join?code=${session.sessionCode}`);

  return prisma.workshopSession.update({
    where: { id: sessionId },
    data: {
      status: "active",
      startedAt: new Date(),
      qrCodeUrl,
    },
  });
}

export async function endWorkshop(sessionId: string, facilitatorId: string): Promise<WorkshopSession> {
  const session = await prisma.workshopSession.findUnique({ where: { id: sessionId } });

  if (!session) throw new NotFoundError("Workshop session not found");
  if (session.facilitatorId !== facilitatorId) throw new ForbiddenError("Only the facilitator can end the workshop");
  if (session.status !== "active") throw new ConflictError(`Cannot end workshop in status: ${session.status}`);

  const startedAt = session.startedAt!;
  const endedAt = new Date();
  const duration = Math.round((endedAt.getTime() - startedAt.getTime()) / 60000);

  // Mark all attendees as left
  await prisma.workshopAttendee.updateMany({
    where: { sessionId, leftAt: null },
    data: { leftAt: endedAt, connectionStatus: "disconnected" },
  });

  const attendeeCount = await prisma.workshopAttendee.count({ where: { sessionId } });

  return prisma.workshopSession.update({
    where: { id: sessionId },
    data: {
      status: "completed",
      endedAt,
      duration,
      attendeeCount,
    },
  });
}
```

### QR Code Generation

```typescript
// src/lib/workshop/qr-code.ts
import QRCode from "qrcode";

export async function generateQRCode(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    width: 256,
    margin: 2,
    color: { dark: "#000000", light: "#ffffff" },
    errorCorrectionLevel: "M",
  });
}
```

### Synchronized Navigation

```typescript
// src/lib/workshop/navigation.ts

/**
 * Facilitator navigates to a step; broadcast to all following attendees.
 *
 * Implementation options:
 * A) SSE: Server maintains an EventEmitter per session; POST navigate writes to emitter
 * B) Database polling: Write currentStepId to WorkshopSession; clients poll every 2s
 * C) Redis Pub/Sub: Publish to channel per session; SSE subscribers relay
 *
 * Recommended: SSE with in-memory EventEmitter (option A) for MVP; migrate to Redis (option C) for scale.
 */

const sessionEmitters = new Map<string, EventEmitter>();

export function getSessionEmitter(sessionId: string): EventEmitter {
  if (!sessionEmitters.has(sessionId)) {
    sessionEmitters.set(sessionId, new EventEmitter());
  }
  return sessionEmitters.get(sessionId)!;
}

export async function broadcastNavigation(sessionId: string, event: SyncNavigationEvent): Promise<void> {
  // Persist current position to DB (for late joiners)
  await prisma.workshopSession.update({
    where: { id: sessionId },
    data: {
      currentStepId: event.processStepId,
      currentScopeItemId: event.scopeItemId,
    },
  });

  // Broadcast to connected clients
  const emitter = getSessionEmitter(sessionId);
  emitter.emit("message", { type: "navigate", payload: event, timestamp: Date.now() });
}
```

### Live Vote Tally

```typescript
// src/lib/workshop/voting.ts

export async function submitVote(
  sessionId: string,
  userId: string,
  data: { processStepId: string; classification: VoteClassification; confidence?: VoteConfidence; notes?: string },
): Promise<WorkshopVote> {
  // Verify session is active
  const session = await prisma.workshopSession.findUnique({ where: { id: sessionId } });
  if (!session || session.status !== "active") throw new ConflictError("Workshop is not active");

  // Verify user is an attendee
  const attendee = await prisma.workshopAttendee.findUnique({
    where: { sessionId_userId: { sessionId, userId } },
  });
  if (!attendee) throw new ForbiddenError("You are not a participant in this workshop");

  // Upsert vote (user can change their vote during the session)
  const vote = await prisma.workshopVote.upsert({
    where: { sessionId_processStepId_userId: { sessionId, processStepId: data.processStepId, userId } },
    update: { classification: data.classification, confidence: data.confidence, notes: data.notes, votedAt: new Date() },
    create: { sessionId, processStepId: data.processStepId, userId, classification: data.classification, confidence: data.confidence, notes: data.notes },
  });

  // Compute and broadcast updated tally
  const tally = await computeVoteTally(sessionId, data.processStepId);
  const emitter = getSessionEmitter(sessionId);
  emitter.emit("message", { type: "vote_update", payload: tally, timestamp: Date.now() });

  return vote;
}

export async function computeVoteTally(sessionId: string, processStepId: string): Promise<VoteTally> {
  const votes = await prisma.workshopVote.findMany({
    where: { sessionId, processStepId },
  });

  const tally: VoteTally = {
    processStepId,
    stepTitle: "", // resolved separately
    votes: { FIT: 0, CONFIGURE: 0, GAP: 0, NA: 0 },
    totalVoters: votes.length,
    consensus: null,
    confidenceBreakdown: { high: 0, medium: 0, low: 0 },
  };

  for (const vote of votes) {
    tally.votes[vote.classification as VoteClassification]++;
    if (vote.confidence) {
      tally.confidenceBreakdown[vote.confidence as VoteConfidence]++;
    }
  }

  // Consensus: classification with > 50% of votes
  const majority = Math.ceil(tally.totalVoters / 2);
  for (const [classification, count] of Object.entries(tally.votes)) {
    if (count > majority) {
      tally.consensus = classification as VoteClassification;
      break;
    }
  }

  return tally;
}

/**
 * Finalize a vote: the facilitator accepts the consensus (or overrides)
 * and writes it as the official StepResponse for the assessment.
 */
export async function finalizeVote(
  sessionId: string,
  processStepId: string,
  facilitatorId: string,
  overrideClassification?: VoteClassification,
): Promise<StepResponse> {
  const session = await prisma.workshopSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new NotFoundError("Session not found");
  if (session.facilitatorId !== facilitatorId) throw new ForbiddenError("Only the facilitator can finalize votes");

  const tally = await computeVoteTally(sessionId, processStepId);
  const finalClassification = overrideClassification ?? tally.consensus;

  if (!finalClassification) {
    throw new ValidationError("No consensus reached. Facilitator must provide an override classification.");
  }

  // Write to official StepResponse
  return prisma.stepResponse.upsert({
    where: {
      assessmentId_processStepId: { assessmentId: session.assessmentId, processStepId },
    },
    update: {
      fitStatus: finalClassification,
      respondent: facilitatorId,
      respondedAt: new Date(),
      clientNote: `Workshop vote: FIT=${tally.votes.FIT}, CONFIGURE=${tally.votes.CONFIGURE}, GAP=${tally.votes.GAP}, NA=${tally.votes.NA}`,
    },
    create: {
      assessmentId: session.assessmentId,
      processStepId,
      fitStatus: finalClassification,
      respondent: facilitatorId,
      respondedAt: new Date(),
      clientNote: `Workshop vote: FIT=${tally.votes.FIT}, CONFIGURE=${tally.votes.CONFIGURE}, GAP=${tally.votes.GAP}, NA=${tally.votes.NA}`,
    },
  });
}
```

### Workshop Minutes Auto-Generation

```typescript
// src/lib/workshop/minutes.ts

export async function generateWorkshopMinutes(sessionId: string): Promise<WorkshopMinutes> {
  const session = await prisma.workshopSession.findUnique({
    where: { id: sessionId },
    include: {
      attendees: { include: { user: { select: { name: true, email: true } } } },
      votes: true,
      actionItems: true,
      assessment: { select: { companyName: true, industry: true } },
    },
  });

  if (!session) throw new NotFoundError("Session not found");
  if (session.status !== "completed") throw new ConflictError("Minutes can only be generated after session ends");

  // Build attendees summary
  const attendeesSummary = session.attendees.map((a) => ({
    userId: a.userId,
    name: a.user.name,
    role: a.role,
    joinedAt: a.joinedAt.toISOString(),
    leftAt: a.leftAt?.toISOString() ?? session.endedAt?.toISOString(),
    deviceType: a.deviceType,
  }));

  // Build decisions summary from votes
  const stepsVoted = [...new Set(session.votes.map((v) => v.processStepId))];
  const decisionsSummary = await Promise.all(stepsVoted.map(async (stepId) => {
    const tally = await computeVoteTally(sessionId, stepId);
    const step = await prisma.processStep.findUnique({ where: { id: stepId }, select: { actionTitle: true } });
    return {
      processStepId: stepId,
      stepTitle: step?.actionTitle ?? "Unknown Step",
      classification: tally.consensus,
      voteBreakdown: tally.votes,
      notes: session.votes.filter((v) => v.processStepId === stepId && v.notes).map((v) => v.notes),
    };
  }));

  // Build action items summary
  const actionItemsSummary = session.actionItems.map((ai) => ({
    title: ai.title,
    assignedToName: ai.assignedToName ?? "Unassigned",
    dueDate: ai.dueDate?.toISOString() ?? null,
    priority: ai.priority,
    status: ai.status,
  }));

  // Build statistics
  const statisticsSummary = {
    totalStepsReviewed: stepsVoted.length,
    fitCount: decisionsSummary.filter((d) => d.classification === "FIT").length,
    configureCount: decisionsSummary.filter((d) => d.classification === "CONFIGURE").length,
    gapCount: decisionsSummary.filter((d) => d.classification === "GAP").length,
    naCount: decisionsSummary.filter((d) => d.classification === "NA").length,
    noConsensus: decisionsSummary.filter((d) => d.classification === null).length,
    attendeeCount: session.attendees.length,
    duration: session.duration ?? 0,
    votingParticipation: session.attendees.length > 0
      ? (session.votes.length / (stepsVoted.length * session.attendees.length)) * 100
      : 0,
  };

  // Generate markdown content
  const content = renderMinutesMarkdown({
    session,
    attendeesSummary,
    decisionsSummary,
    actionItemsSummary,
    statisticsSummary,
  });

  // Upsert minutes
  return prisma.workshopMinutes.upsert({
    where: { sessionId },
    update: {
      content,
      attendeesSummary,
      decisionsSummary,
      actionItemsSummary,
      agendaSummary: session.agenda ?? [],
      statisticsSummary,
      regeneratedAt: new Date(),
    },
    create: {
      sessionId,
      content,
      attendeesSummary,
      decisionsSummary,
      actionItemsSummary,
      agendaSummary: session.agenda ?? [],
      statisticsSummary,
    },
  });
}
```

### Minutes Markdown Template

```typescript
function renderMinutesMarkdown(data: MinutesData): string {
  return `# Workshop Minutes: ${data.session.title}

**Assessment:** ${data.session.assessment.companyName}
**Date:** ${data.session.startedAt?.toLocaleDateString()}
**Duration:** ${data.statisticsSummary.duration} minutes
**Facilitator:** ${data.attendeesSummary.find((a) => a.role === "facilitator")?.name ?? "Unknown"}

## Attendees (${data.attendeesSummary.length})

| Name | Role | Joined | Left |
|------|------|--------|------|
${data.attendeesSummary.map((a) => `| ${a.name} | ${a.role} | ${a.joinedAt} | ${a.leftAt} |`).join("\n")}

## Classification Decisions (${data.statisticsSummary.totalStepsReviewed} steps)

| Step | Classification | Vote Breakdown | Notes |
|------|---------------|----------------|-------|
${data.decisionsSummary.map((d) => `| ${d.stepTitle} | ${d.classification ?? "No consensus"} | FIT:${d.voteBreakdown.FIT} CFG:${d.voteBreakdown.CONFIGURE} GAP:${d.voteBreakdown.GAP} NA:${d.voteBreakdown.NA} | ${(d.notes as string[]).join("; ")} |`).join("\n")}

## Summary Statistics

- **Steps Reviewed:** ${data.statisticsSummary.totalStepsReviewed}
- **FIT:** ${data.statisticsSummary.fitCount}
- **CONFIGURE:** ${data.statisticsSummary.configureCount}
- **GAP:** ${data.statisticsSummary.gapCount}
- **NA:** ${data.statisticsSummary.naCount}
- **No Consensus:** ${data.statisticsSummary.noConsensus}
- **Voting Participation:** ${data.statisticsSummary.votingParticipation.toFixed(1)}%

## Action Items (${data.actionItemsSummary.length})

| # | Title | Assigned To | Due Date | Priority | Status |
|---|-------|------------|----------|----------|--------|
${data.actionItemsSummary.map((ai, i) => `| ${i + 1} | ${ai.title} | ${ai.assignedToName} | ${ai.dueDate ?? "N/A"} | ${ai.priority} | ${ai.status} |`).join("\n")}

---
*Generated automatically by Aptus on ${new Date().toISOString()}*
`;
}
```

---

## 7. Permissions & Access Control

| Action | Allowed Roles | Notes |
|---|---|---|
| Create workshop | `consultant`, `partner_lead`, `solution_architect`, `platform_admin` | Must be assessment stakeholder |
| Schedule/edit workshop | Facilitator, `platform_admin` | Only before session starts |
| Cancel workshop | Facilitator, `platform_admin` | Any time; notifies attendees |
| Start workshop | Facilitator only | Session must be in "scheduled" status |
| End workshop | Facilitator only | Session must be in "active" status |
| Join by session code | Any authenticated user who is an assessment stakeholder | Non-stakeholders receive 403 |
| Submit vote | Any session attendee | Observers can view but not vote |
| Change own vote | Any session attendee | Allowed while session is active |
| View vote tally | Any session participant | Facilitator sees individual votes; others see aggregate only |
| Finalize vote to StepResponse | Facilitator only | Writes official classification |
| Navigate (broadcast) | Facilitator or designated presenter | |
| Follow/unfollow presenter | Any attendee | Self only |
| Create action item | Facilitator, `consultant`, `platform_admin` | During or after session |
| Update action item | Facilitator, assignee, `platform_admin` | |
| Delete action item | Facilitator, `platform_admin` | |
| Generate minutes | Facilitator, `platform_admin` | Only after session ends |
| View minutes | Any session participant | After generation |
| Edit minutes | Facilitator, `platform_admin` | Post-generation edits |
| Export minutes | Any session participant | PDF or DOCX |

---

## 8. Notification Triggers

| Event | Recipients | Channel | Priority |
|---|---|---|---|
| Workshop scheduled | All assessment stakeholders in scope item areas | email, in_app | Normal |
| Workshop starting in 5 minutes | Invited/registered attendees | push, in_app | High |
| Workshop session started | All assessment stakeholders | in_app | Normal |
| Workshop session ended | All attendees | in_app | Normal |
| Workshop cancelled | All invited attendees | email, in_app | Normal |
| Action item assigned | Assigned user | in_app, email | Normal |
| Action item due in 24 hours | Assigned user | push, email | High |
| Workshop minutes generated | All attendees | in_app, email | Normal |
| Vote finalized with override | Attendees who voted differently | in_app | Low |

*Note: Depends on Phase 19 (Notification System).*

---

## 9. Edge Cases & Error Handling

| Scenario | Handling |
|---|---|
| User joins with expired/invalid session code | Return 404: "No active workshop found with this code" |
| User joins completed session | Return 409: "This workshop has already ended" |
| Facilitator disconnects during active session | Session continues; co-presenter can take over; if no presenter, attendees switch to free navigation |
| Two users submit votes at the exact same time | Both upserts succeed (unique constraint on `[sessionId, processStepId, userId]`); tally recomputed |
| Facilitator finalizes vote but no consensus exists | Require explicit `overrideClassification` parameter; otherwise return 422 |
| Session has 0 votes when minutes are generated | Minutes show "No classifications were voted on during this session" |
| Attendee's device goes to sleep (mobile) | SSE auto-reconnects on wake; attendee `connectionStatus` set to "idle" after 5min no ping; "disconnected" after 15min |
| Session code collision (extremely unlikely) | Retry generation up to 5 times; same logic as Phase 18 |
| Workshop scheduled for past date | Reject with 422: "Scheduled date must be in the future" |
| More than 50 attendees attempt to join | Return 429: "Maximum attendee limit reached for this session"; limit configurable per org |
| Minutes regenerated after being edited | Warn facilitator: "This will overwrite manual edits. Continue?" |
| Assessment transitions to signed_off while workshop is active | End workshop automatically; notify facilitator |
| Action item assigned to non-stakeholder | Reject with 422: "Assignee must be an assessment stakeholder" |

---

## 10. Performance Considerations

| Concern | Mitigation |
|---|---|
| SSE connection per attendee (50+ concurrent) | Use in-memory EventEmitter per session; limit to 50 SSE connections per session |
| Vote tally computation on every vote | Cache tally in memory keyed by `(sessionId, processStepId)`; invalidate on new vote |
| Real-time navigation broadcast latency | In-memory emitter provides < 10ms latency; DB write is async (non-blocking) |
| Minutes generation with large sessions (200+ steps) | Generate async; return 202 Accepted with polling URL |
| QR code generation | Generate once on session start; cache as data URI in DB |
| Workshop list query | Index on `[assessmentId, status]`; pagination for > 20 workshops |
| Attendee presence tracking | Heartbeat ping every 30 seconds; batch `lastPingAt` updates |
| Action items query | Index on `[sessionId, status]` and `[assignedTo]` |
| SSE memory leak on session end | Clean up emitter from `sessionEmitters` map when session ends or after 1 hour of inactivity |

---

## 11. Testing Strategy

### Unit Tests

| Test | File |
|---|---|
| Workshop lifecycle state machine (valid/invalid transitions) | `__tests__/lib/workshop/lifecycle.test.ts` |
| QR code generation produces valid data URI | `__tests__/lib/workshop/qr-code.test.ts` |
| Vote tally computation with various vote distributions | `__tests__/lib/workshop/voting.test.ts` |
| Consensus detection (majority, tie, no consensus) | `__tests__/lib/workshop/consensus.test.ts` |
| Vote finalization writes correct StepResponse | `__tests__/lib/workshop/finalize.test.ts` |
| Minutes markdown generation with all sections | `__tests__/lib/workshop/minutes.test.ts` |
| Session code validation (Zod schema) | `__tests__/lib/validation/workshop.test.ts` |

### Integration Tests

| Test | File |
|---|---|
| Full workshop lifecycle: create, start, vote, end, generate minutes | `__tests__/api/workshops/lifecycle.test.ts` |
| Workshop join by session code | `__tests__/api/workshops/join.test.ts` |
| Vote submission and tally retrieval | `__tests__/api/workshops/voting.test.ts` |
| Vote finalization to StepResponse | `__tests__/api/workshops/finalize.test.ts` |
| Action item CRUD | `__tests__/api/workshops/action-items.test.ts` |
| Minutes generation and export | `__tests__/api/workshops/minutes.test.ts` |
| Non-stakeholder cannot join | `__tests__/api/workshops/auth.test.ts` |
| Observer cannot vote | `__tests__/api/workshops/observer.test.ts` |

### E2E Tests

| Test | File |
|---|---|
| Full workshop flow: schedule, join via code, vote, end, view minutes | `e2e/workshop-full-flow.spec.ts` |
| Workshop mode UI: projector layout, step navigation, vote panel | `e2e/workshop-mode-ui.spec.ts` |
| Mobile attendee join via QR code and vote | `e2e/workshop-mobile.spec.ts` |
| Action item creation and tracking | `e2e/workshop-action-items.spec.ts` |

---

## 12. Migration & Seed Data

### Prisma Migration

```bash
# Creates:
# 1. Extends WorkshopSession with Phase 21 fields (if not already from Phase 18)
# 2. WorkshopAttendee table
# 3. WorkshopVote table
# 4. WorkshopActionItem table
# 5. WorkshopMinutes table
# 6. WorkshopAttendee relation on User
pnpm prisma migrate dev --name add-workshop-management
```

### Seed Data (`prisma/seeds/workshop-seed.ts`)

```typescript
async function seedWorkshopData(assessmentId: string, facilitatorId: string) {
  // Create a completed workshop for demo
  const session = await prisma.workshopSession.create({
    data: {
      assessmentId,
      title: "Finance Process Review - Week 1",
      sessionCode: "K7MN3P",
      status: "completed",
      scheduledAt: new Date("2026-02-15T10:00:00Z"),
      startedAt: new Date("2026-02-15T10:05:00Z"),
      endedAt: new Date("2026-02-15T11:20:00Z"),
      facilitatorId,
      scopeItemIds: ["J60", "J14"],
      attendeeCount: 6,
      minutesGenerated: true,
      duration: 75,
      agenda: [
        { scopeItemId: "J60", estimatedMinutes: 40, status: "completed" },
        { scopeItemId: "J14", estimatedMinutes: 35, status: "completed" },
      ],
    },
  });

  // Create attendees
  // ... (create 6 WorkshopAttendee records)

  // Create votes
  // ... (create WorkshopVote records for reviewed steps)

  // Create action items
  await prisma.workshopActionItem.createMany({
    data: [
      {
        sessionId: session.id,
        title: "Review PO approval workflow with client",
        description: "Client mentioned a 4-level approval process. Need to validate if standard 3-way match covers this.",
        assignedTo: facilitatorId,
        assignedToName: "John Smith",
        dueDate: new Date("2026-02-22"),
        priority: "high",
        status: "open",
      },
      {
        sessionId: session.id,
        title: "Check GL account mapping for AP",
        description: "Verify if chart of accounts supports the client's current GL structure.",
        priority: "medium",
        status: "open",
      },
    ],
  });

  // Create a scheduled upcoming workshop
  await prisma.workshopSession.create({
    data: {
      assessmentId,
      title: "Procurement Deep Dive",
      sessionCode: "R4WT8X",
      status: "scheduled",
      scheduledAt: new Date("2026-02-28T14:00:00Z"),
      facilitatorId,
      scopeItemIds: ["J14", "2BM"],
      agenda: [
        { scopeItemId: "J14", estimatedMinutes: 45, status: "pending" },
        { scopeItemId: "2BM", estimatedMinutes: 30, status: "pending" },
      ],
    },
  });
}
```

### Environment Variables

```env
# Workshop configuration
WORKSHOP_MAX_ATTENDEES=50           # Maximum attendees per session
WORKSHOP_SSE_IDLE_TIMEOUT_MS=900000 # 15 minutes SSE idle timeout
WORKSHOP_HEARTBEAT_INTERVAL_MS=30000 # 30 second attendee heartbeat
WORKSHOP_IDLE_THRESHOLD_MS=300000   # 5 minutes before marking attendee idle
WORKSHOP_DISCONNECT_THRESHOLD_MS=900000 # 15 minutes before marking disconnected
```

---

## 13. Open Questions

| # | Question | Impact | Owner |
|---|---|---|---|
| 1 | Should real-time synchronization use SSE, WebSocket, or a third-party service (e.g., Ably, Pusher)? SSE is simplest but unidirectional; WebSocket is bidirectional but harder to scale on serverless. | High -- core architecture | Technical |
| 2 | Should vote tallies be visible to all attendees in real-time, or only to the facilitator until finalized? Showing real-time may bias subsequent voters. | High -- UX/methodology | Product + Domain |
| 3 | Can non-stakeholder guests (e.g., external SMEs) join workshops? If yes, need a guest join flow without full user account. | Medium -- affects auth model | Product |
| 4 | Should workshops support multiple facilitators (co-facilitation)? Current model has a single `facilitatorId`. | Medium -- affects permissions | Product |
| 5 | Should minutes export support DOCX format? Requires a DOCX generation library (e.g., `docx` npm package). | Low -- additional dependency | Technical |
| 6 | Maximum session duration? Should workshops auto-end after N hours to prevent abandoned sessions? | Low -- operational concern | Product |
| 7 | Should workshop votes be anonymous or attributed? Current design is attributed (facilitator sees who voted what). | Medium -- affects trust dynamics | Product + Domain |

---

## 14. Acceptance Criteria (Given/When/Then)

### AC-21.1: Workshop Creation
```
Given a consultant stakeholder on an assessment
When the consultant creates a workshop with title "Finance Review" and scope items ["J60", "J14"]
Then a WorkshopSession record is created with status "scheduled"
  And a unique 6-character session code is generated
  And the consultant is set as facilitatorId
  And workshop_invite notifications are dispatched to all stakeholders assigned to Finance/Procurement areas
```

### AC-21.2: Workshop Start with QR Code
```
Given a scheduled workshop with session code "K7MN3P"
When the facilitator clicks "Start Workshop"
Then the session status changes to "active"
  And startedAt is set to the current timestamp
  And a QR code is generated encoding the join URL
  And the Workshop Mode UI is displayed with the QR code prominently shown
  And workshop_starting notifications are dispatched
```

### AC-21.3: Join by Session Code
```
Given an active workshop with session code "K7MN3P"
  And a process_owner who is a stakeholder on the assessment
When the process_owner enters code "K7MN3P" on the join page
Then a WorkshopAttendee record is created
  And the user is redirected to the Workshop Mode UI
  And the attendee appears in the facilitator's attendee list
  And the attendee sees the facilitator's current step
```

### AC-21.4: Synchronized Navigation
```
Given an active workshop with 5 connected attendees all set to isFollowing = true
When the facilitator navigates to step "Create Purchase Order" (processStepId: "clx_step_045")
Then all 5 attendees' UIs update to display step "clx_step_045"
  And the update latency is under 500ms
  And the WorkshopSession.currentStepId is updated to "clx_step_045"
```

### AC-21.5: Unfollow Presenter
```
Given an active workshop where a process_owner is following the presenter
When the process_owner toggles "Unfollow presenter"
Then the process_owner's WorkshopAttendee.isFollowing is set to false
  And the process_owner can independently navigate through steps
  And the process_owner's UI shows an indicator: "Free navigation mode"
  And a "Re-follow presenter" button is visible
```

### AC-21.6: Live Classification Vote
```
Given an active workshop displaying step "Create Purchase Order"
  And 5 attendees are connected
When 3 attendees vote FIT, 1 votes CONFIGURE, and 1 votes GAP
Then the vote tally displays:
  FIT: 3 (60%)
  CONFIGURE: 1 (20%)
  GAP: 1 (20%)
  NA: 0 (0%)
  And consensus is shown as "FIT" (majority > 50%)
  And the tally updates in real-time as each vote is submitted
```

### AC-21.7: Vote Finalization
```
Given a workshop where step "Create Purchase Order" has consensus "FIT"
When the facilitator clicks "Finalize as FIT"
Then a StepResponse is created/updated for the assessment:
  fitStatus: "FIT"
  respondent: facilitator's userId
  clientNote: "Workshop vote: FIT=3, CONFIGURE=1, GAP=1, NA=0"
  And the step node in the flow diagram updates to FIT classification
```

### AC-21.8: Vote Override
```
Given a workshop where step "Approve Invoice" has no consensus (2 FIT, 2 GAP, 1 NA)
When the facilitator selects "Override: CONFIGURE" and provides reason
Then the StepResponse is created with fitStatus "CONFIGURE"
  And a DecisionLogEntry is created recording the override
  And attendees who voted differently are notified (if Phase 19 is active)
```

### AC-21.9: Action Item Tracking
```
Given an active workshop
When the facilitator creates an action item:
  title: "Verify GL account mapping"
  assignedTo: "user_alice"
  dueDate: "2026-03-01"
  priority: "high"
Then a WorkshopActionItem record is created
  And the action item appears in the workshop sidebar
  And the assigned user receives a notification (if Phase 19 is active)
```

### AC-21.10: Workshop Minutes Generation
```
Given a completed workshop with:
  - 6 attendees
  - 47 steps reviewed with votes
  - 3 action items
When the facilitator clicks "Generate Minutes"
Then a WorkshopMinutes record is created with:
  - Markdown content including all sections (attendees, decisions, action items, statistics)
  - attendeesSummary JSON with name, role, join/leave times
  - decisionsSummary JSON with vote breakdowns per step
  - actionItemsSummary JSON with titles, assignees, due dates
  - statisticsSummary JSON with counts and participation rate
  And session.minutesGenerated is set to true
```

### AC-21.11: Workshop Mode Projector Layout
```
Given an active workshop viewed on a desktop browser
When the facilitator enables Workshop Mode
Then the UI switches to a high-contrast, large-text layout:
  - Dark or white background (configurable)
  - Step title font size >= 24px
  - Vote buttons >= 64x64px
  - Minimal chrome (no sidebar, no header navigation)
  - Session code and QR code visible in header
  - Timer showing elapsed session time
```

### AC-21.12: Non-Stakeholder Rejection
```
Given an active workshop on assessment "Acme Corp"
  And a user who is NOT a stakeholder on "Acme Corp"
When the user attempts to join with the session code
Then the API returns 403 Forbidden
  And the error message states: "You must be a stakeholder on this assessment to join the workshop"
```

---

## 15. Size Estimate

**Size: L (Large)**

| Component | Effort |
|---|---|
| Schema migration (5 new/extended models) | 1 day |
| Workshop lifecycle engine (create, start, end, cancel) | 1.5 days |
| Join flow with session code + QR code | 1 day |
| Synchronized navigation (SSE/EventEmitter) | 2 days |
| Live voting with real-time tally | 2 days |
| Vote finalization to StepResponse | 0.5 day |
| Action item CRUD | 1 day |
| Workshop minutes auto-generation | 1.5 days |
| Minutes export (PDF/DOCX) | 1 day |
| API routes (22 endpoints) | 3 days |
| Workshop Mode UI (18 components) | 5 days |
| Mobile attendee experience | 1.5 days |
| Attendee presence tracking (heartbeat, status) | 1 day |
| Testing (unit + integration + E2E) | 3 days |
| **Total** | **~25 days** |

---

## 16. Phase Completion Checklist

- [ ] Prisma schema updated with `WorkshopAttendee`, `WorkshopVote`, `WorkshopActionItem`, `WorkshopMinutes` models
- [ ] `WorkshopSession` extended with Phase 21 fields (qrCodeUrl, agenda, currentStepId, etc.)
- [ ] Migration applied successfully in development and staging
- [ ] TypeScript types created in `src/types/workshop.ts`
- [ ] Zod schemas created in `src/lib/validation/workshop.ts`
- [ ] Workshop lifecycle engine: create, start, end, cancel with state validation
- [ ] Session code generation with retry on collision
- [ ] QR code generation from session join URL
- [ ] SSE stream endpoint for real-time updates (navigation, votes, attendee presence)
- [ ] Synchronized navigation: facilitator broadcasts step, attendees receive via SSE
- [ ] Follow/unfollow presenter toggle works correctly
- [ ] Live voting: submit, change, view tally in real-time
- [ ] Consensus detection with majority threshold
- [ ] Vote finalization writes official StepResponse with workshop context
- [ ] Facilitator override for no-consensus scenarios
- [ ] Action item CRUD with assignment and due dates
- [ ] Workshop minutes auto-generation with all sections (attendees, decisions, actions, stats)
- [ ] Minutes markdown rendering in viewer
- [ ] Minutes export as PDF (DOCX if decided)
- [ ] All 22 API routes implemented with Zod validation and auth guards
- [ ] Workshop Mode UI renders projector-friendly layout
- [ ] `WorkshopStepCard` displays current step with large text
- [ ] `WorkshopVotingPanel` shows vote buttons and live tally
- [ ] `WorkshopAttendeeList` shows connected attendees with status indicators
- [ ] `WorkshopAgenda` shows progress through agenda items
- [ ] `WorkshopNavigationBar` provides prev/next step controls
- [ ] `WorkshopQRCode` displays scannable QR code
- [ ] `WorkshopJoinPage` accepts session code input and QR scanner
- [ ] `WorkshopTimer` shows elapsed time
- [ ] `FollowPresenterToggle` works correctly
- [ ] Mobile attendee experience tested on iOS and Android browsers
- [ ] Attendee presence tracking (heartbeat, idle, disconnect detection)
- [ ] Non-stakeholder join rejection enforced
- [ ] Observer role can view but not vote
- [ ] EventEmitter cleanup on session end (no memory leaks)
- [ ] Unit tests pass (lifecycle, voting, consensus, minutes)
- [ ] Integration tests pass (all API endpoints, auth enforcement)
- [ ] E2E tests pass (full workshop flow, mobile join, action items)
- [ ] No TypeScript strict-mode errors introduced
- [ ] PR reviewed and approved

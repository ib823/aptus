# Phase 28: Real-Time Collaboration

## 1. Overview

New phase introducing real-time collaboration infrastructure for the Aptus platform. This phase layers five collaboration capabilities onto the existing assessment workflow, enabling multiple stakeholders to work on the same assessment simultaneously with awareness, coordination, and conflict prevention.

**Layer 1 — Presence**: Who is online, what assessment or page they are viewing, and their last action timestamp. Avatar indicators appear on assessment pages showing active collaborators.

**Layer 2 — Field-Level Editing Locks**: When a user focuses on a step's response field, a lock is broadcast to other connected clients. The field shows "Sarah Chen is editing this response..." for other users. Locks have a 5-minute timeout for abandoned edits.

**Layer 3 — Comments & @Mentions**: Threaded comments attachable to any entity (step, gap, scope item, integration point, data migration object, OCM impact). @mention autocomplete resolves from assessment stakeholders. Mentioned users receive notifications.

**Layer 4 — Conflict Detection**: When two stakeholders classify the same step differently (both assigned to the step's area), the system auto-creates a Conflict record. Notifications are sent to both parties plus the project manager. A structured resolution workflow captures the final classification with rationale.

**Layer 5 — Activity Feed**: Real-time stream of assessment activity. Filterable by functional area, stakeholder, action type, and time range. Persisted for historical review.

**Source**: Addendum 1 Section 3 (Sections 3.1-3.4) + Section 4 (cross-organizational collaboration)

## 2. Dependencies

| Dependency | Type | Status | Notes |
|---|---|---|---|
| Phase 19 (WebSocket & Notification System) | Internal | Required | WebSocket infrastructure and notification dispatch system. Phase 28 builds the collaboration protocol on top of Phase 19's transport layer. |
| Assessment model | Internal | Exists | All collaboration features are scoped to an assessment |
| AssessmentStakeholder model | Internal | Exists | Stakeholder roster drives @mention autocomplete and area-based access |
| StepResponse model | Internal | Exists | Step classification changes trigger conflict detection |
| GapResolution model | Internal | Exists | Gap changes generate activity feed entries |
| ScopeSelection model | Internal | Exists | Scope changes generate activity feed entries |
| User model | Internal | Exists | User identity for presence, comments, and activity attribution |
| DecisionLogEntry model | Internal | Exists | Conflict resolutions are also logged as decision entries for audit |
| shadcn/ui | External | Exists | `Avatar`, `Popover`, `Dialog`, `Textarea`, `Badge`, `Tooltip` |
| Prisma 6 | External | Exists | Database models for comments, conflicts, and activity feed |
| Redis (optional) | External | Optional | For scaling WebSocket presence beyond single process; not required for V2 |

## 3. Data Model Changes

```prisma
// ── Phase 28: Threaded Comments ──

model Comment {
  id              String   @id @default(cuid())
  assessmentId    String
  targetType      String   // "STEP" | "GAP" | "SCOPE_ITEM" | "INTEGRATION" | "DATA_MIGRATION" | "OCM"
  targetId        String
  authorId        String
  content         String   @db.Text
  contentHtml     String?  @db.Text  // Rendered HTML with @mention links
  mentions        String[] @default([]) // User IDs mentioned via @
  parentCommentId String?
  status          String   @default("OPEN") // "OPEN" | "RESOLVED"
  resolvedById    String?
  resolvedAt      DateTime?
  editedAt        DateTime?
  isEdited        Boolean  @default(false)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  assessment Assessment @relation(fields: [assessmentId], references: [id], onDelete: Cascade)
  author     User       @relation("commentAuthor", fields: [authorId], references: [id])
  resolvedBy User?      @relation("commentResolver", fields: [resolvedById], references: [id])
  parent     Comment?   @relation("replies", fields: [parentCommentId], references: [id])
  replies    Comment[]  @relation("replies")

  @@index([assessmentId, targetType, targetId])
  @@index([assessmentId, authorId])
  @@index([assessmentId, status])
  @@index([parentCommentId])
}

// ── Phase 28: Classification Conflicts ──

model Conflict {
  id                     String    @id @default(cuid())
  assessmentId           String
  entityType             String    // "STEP" | "GAP"
  entityId               String
  classifications        Json      // [{userId: string, userName: string, role: string, classification: string, rationale: string | null, timestamp: string}]
  status                 String    @default("OPEN") // "OPEN" | "IN_DISCUSSION" | "ESCALATED" | "RESOLVED"
  resolvedById           String?
  resolvedClassification String?
  resolutionNotes        String?   @db.Text
  escalatedToId          String?   // PM or executive who received escalation
  escalatedAt            DateTime?
  createdAt              DateTime  @default(now())
  resolvedAt             DateTime?

  assessment Assessment @relation(fields: [assessmentId], references: [id], onDelete: Cascade)
  resolvedBy User?      @relation("conflictResolver", fields: [resolvedById], references: [id])

  @@index([assessmentId, status])
  @@index([assessmentId, entityType, entityId])
  @@index([status])
}

// ── Phase 28: Activity Feed ──

model ActivityFeedEntry {
  id           String   @id @default(cuid())
  assessmentId String
  actorId      String
  actorName    String
  actorRole    String
  actionType   String   // "classified_steps" | "added_gap" | "resolved_gap" | "uploaded_attachment" | "commented" | "mentioned" | "conflict_detected" | "conflict_resolved" | "workshop_completed" | "scope_changed" | "sign_off_submitted"
  summary      String   // Human-readable: "Sarah Chen classified 5 steps in Accounts Payable as FIT"
  entityType   String?  // "STEP" | "GAP" | "SCOPE_ITEM" | "COMMENT" | "CONFLICT" | "WORKSHOP"
  entityId     String?
  metadata     Json?    // Action-specific context: {stepCount: 5, area: "FI", fitStatus: "fit", ...}
  areaCode     String?  // Functional area code for area-based filtering
  createdAt    DateTime @default(now())

  assessment Assessment @relation(fields: [assessmentId], references: [id], onDelete: Cascade)

  @@index([assessmentId, createdAt])
  @@index([assessmentId, actorId])
  @@index([assessmentId, actionType])
  @@index([assessmentId, areaCode, createdAt])
}

// ── Phase 28: Editing Locks (ephemeral, stored in memory/Redis — DB model for recovery) ──

model EditingLock {
  id           String   @id @default(cuid())
  assessmentId String
  entityType   String   // "STEP_RESPONSE" | "GAP_RESOLUTION" | "SCOPE_SELECTION" | "COMMENT"
  entityId     String
  lockedById   String
  lockedByName String
  acquiredAt   DateTime @default(now())
  expiresAt    DateTime // acquiredAt + 5 minutes
  isActive     Boolean  @default(true)

  @@unique([assessmentId, entityType, entityId])
  @@index([assessmentId, isActive])
  @@index([expiresAt])
}
```

**Migration notes**:
- Four new tables; no existing tables modified.
- `Comment` supports self-referential relation (`parentCommentId`) for threaded replies.
- `Conflict.classifications` is a JSON array because the number of conflicting parties is variable (typically 2, but could be more if multiple stakeholders classify the same step).
- `EditingLock` has a unique constraint on `[assessmentId, entityType, entityId]` to ensure only one user can hold a lock on a given entity. Locks are primarily managed in-memory via the WebSocket Presence Manager, with the database serving as a recovery mechanism.
- `ActivityFeedEntry.areaCode` enables area-scoped filtering (process owners only see activity in their assigned areas).

## 4. API Routes

### GET /api/assessments/[id]/comments

List comments for an assessment, optionally filtered by target.

```typescript
const listCommentsSchema = z.object({
  targetType: z.enum(["STEP", "GAP", "SCOPE_ITEM", "INTEGRATION", "DATA_MIGRATION", "OCM"]).optional(),
  targetId: z.string().optional(),
  status: z.enum(["OPEN", "RESOLVED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// Response 200
interface ListCommentsResponse {
  data: CommentWithReplies[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

interface CommentWithReplies {
  id: string;
  targetType: string;
  targetId: string;
  author: { id: string; name: string; avatarUrl: string | null; role: string };
  content: string;
  contentHtml: string | null;
  mentions: MentionedUser[];
  status: "OPEN" | "RESOLVED";
  isEdited: boolean;
  createdAt: string;
  updatedAt: string;
  resolvedBy: { id: string; name: string } | null;
  resolvedAt: string | null;
  replies: CommentWithReplies[];
  replyCount: number;
}

interface MentionedUser {
  id: string;
  name: string;
}

// Response 401: Unauthorized
// Response 403: Forbidden (not a stakeholder on this assessment)
// Response 404: Assessment not found
```

### POST /api/assessments/[id]/comments

Create a new comment or reply.

```typescript
const createCommentSchema = z.object({
  targetType: z.enum(["STEP", "GAP", "SCOPE_ITEM", "INTEGRATION", "DATA_MIGRATION", "OCM"]),
  targetId: z.string().min(1),
  content: z.string().min(1).max(10000),
  parentCommentId: z.string().cuid().optional(),
  mentions: z.array(z.string().cuid()).max(20).default([]),
});

// Response 201
interface CreateCommentResponse {
  data: CommentWithReplies;
}

// Response 400: { error: { code: "VALIDATION_ERROR", message: string } }
// Response 401: Unauthorized
// Response 403: Forbidden
// Response 404: Assessment or parent comment not found
```

### PUT /api/assessments/[id]/comments/[commentId]

Update a comment's content.

```typescript
const updateCommentSchema = z.object({
  content: z.string().min(1).max(10000),
  mentions: z.array(z.string().cuid()).max(20).optional(),
});

// Response 200: { data: CommentWithReplies }
// Response 403: Only the author can edit their comment
// Response 404: Comment not found
```

### PUT /api/assessments/[id]/comments/[commentId]/resolve

Mark a comment as resolved.

```typescript
// No body required. Authenticated user becomes the resolver.

// Response 200: { data: CommentWithReplies }
// Response 403: Forbidden (only consultant, solution_architect, or PM can resolve)
// Response 404: Comment not found
```

### DELETE /api/assessments/[id]/comments/[commentId]

Soft-delete a comment (only author or admin can delete).

```typescript
// Response 204: No content
// Response 403: Only the author or platform_admin can delete
// Response 404: Comment not found
```

### GET /api/assessments/[id]/conflicts

List conflicts for an assessment.

```typescript
const listConflictsSchema = z.object({
  status: z.enum(["OPEN", "IN_DISCUSSION", "ESCALATED", "RESOLVED"]).optional(),
  entityType: z.enum(["STEP", "GAP"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// Response 200
interface ListConflictsResponse {
  data: ConflictDetail[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

interface ConflictDetail {
  id: string;
  entityType: string;
  entityId: string;
  entityName: string;             // Step action title or gap description
  entityArea: string | null;      // Functional area
  classifications: Array<{
    userId: string;
    userName: string;
    role: string;
    classification: string;
    rationale: string | null;
    timestamp: string;
  }>;
  status: "OPEN" | "IN_DISCUSSION" | "ESCALATED" | "RESOLVED";
  resolvedBy: { id: string; name: string } | null;
  resolvedClassification: string | null;
  resolutionNotes: string | null;
  createdAt: string;
  resolvedAt: string | null;
}
```

### PUT /api/assessments/[id]/conflicts/[conflictId]/resolve

Resolve a conflict with a final classification.

```typescript
const resolveConflictSchema = z.object({
  classification: z.enum(["fit", "gap", "configure", "not_applicable"]),
  notes: z.string().max(5000).optional(),
});

// Response 200: { data: ConflictDetail }
// Response 400: Conflict is already resolved
// Response 403: Only consultant or escalated executive can resolve
// Response 404: Conflict not found
```

### PUT /api/assessments/[id]/conflicts/[conflictId]/escalate

Escalate a conflict to a project manager or executive.

```typescript
const escalateConflictSchema = z.object({
  escalateToId: z.string().cuid(),
  message: z.string().max(2000).optional(),
});

// Response 200: { data: ConflictDetail }
// Response 400: Conflict is already resolved or already escalated
// Response 403: Only PM can escalate
// Response 404: Conflict or escalation target not found
```

### GET /api/assessments/[id]/activity

Activity feed for an assessment (paginated).

```typescript
const activityFeedSchema = z.object({
  actionType: z.string().optional(),
  actorId: z.string().cuid().optional(),
  areaCode: z.string().optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// Response 200
interface ActivityFeedResponse {
  data: ActivityEntry[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

interface ActivityEntry {
  id: string;
  actor: { id: string; name: string; avatarUrl: string | null; role: string };
  actionType: string;
  summary: string;
  entityType: string | null;
  entityId: string | null;
  areaCode: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}
```

### WebSocket: /ws/assessment/[id]

WebSocket endpoint for real-time collaboration on an assessment.

```typescript
// Client -> Server messages
type ClientMessage =
  | { type: "join"; assessmentId: string }
  | { type: "leave"; assessmentId: string }
  | { type: "heartbeat" }
  | { type: "cursor_position"; page: string; section?: string }
  | { type: "lock_acquire"; entityType: string; entityId: string }
  | { type: "lock_release"; entityType: string; entityId: string }
  | { type: "typing_start"; targetType: string; targetId: string }
  | { type: "typing_stop"; targetType: string; targetId: string };

// Server -> Client messages
type ServerMessage =
  | { type: "presence_update"; users: PresenceUser[] }
  | { type: "user_joined"; user: PresenceUser }
  | { type: "user_left"; userId: string }
  | { type: "lock_acquired"; entityType: string; entityId: string; lockedBy: { id: string; name: string }; expiresAt: string }
  | { type: "lock_released"; entityType: string; entityId: string }
  | { type: "lock_expired"; entityType: string; entityId: string }
  | { type: "typing_indicator"; userId: string; userName: string; targetType: string; targetId: string; isTyping: boolean }
  | { type: "comment_added"; comment: CommentWithReplies }
  | { type: "comment_updated"; comment: CommentWithReplies }
  | { type: "comment_resolved"; commentId: string; resolvedBy: { id: string; name: string } }
  | { type: "conflict_detected"; conflict: ConflictDetail }
  | { type: "conflict_resolved"; conflictId: string; resolution: { classification: string; resolvedBy: string } }
  | { type: "activity"; entry: ActivityEntry }
  | { type: "classification_changed"; entityType: string; entityId: string; fitStatus: string; changedBy: string }
  | { type: "error"; code: string; message: string };

interface PresenceUser {
  id: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  currentPage: string;
  currentSection: string | null;
  lastActionAt: string;
  isIdle: boolean; // true if no action in 5 minutes
}
```

## 5. UI Components

### Component Tree

```
CollaborationProvider (client — Context wrapper)
├── PresenceBar (client — top of assessment pages)
│   ├── AvatarStack (active users)
│   │   └── Avatar (shadcn) per online user
│   │       └── Tooltip ("Sarah Chen — viewing Scope Selection")
│   ├── OnlineCount badge
│   └── ViewingIndicator ("3 people viewing this page")
│
├── CommentPanel (client — slide-over panel on right side)
│   ├── CommentPanelHeader
│   │   ├── Title ("Comments")
│   │   ├── FilterSelect (status: All | Open | Resolved)
│   │   └── CloseButton
│   ├── CommentThread (per top-level comment)
│   │   ├── CommentBubble
│   │   │   ├── AuthorAvatar
│   │   │   ├── AuthorName + Role badge
│   │   │   ├── Timestamp (relative: "2 hours ago")
│   │   │   ├── CommentContent (with rendered @mentions as links)
│   │   │   ├── StatusBadge ("OPEN" | "RESOLVED")
│   │   │   └── CommentActions
│   │   │       ├── Button "Reply"
│   │   │       ├── Button "Resolve" (if authorized)
│   │   │       ├── Button "Edit" (if author)
│   │   │       └── Button "Delete" (if author or admin)
│   │   └── ReplyList (nested CommentBubbles, max 2 levels deep displayed)
│   ├── CommentComposer
│   │   ├── MentionTextarea (with @mention autocomplete)
│   │   │   └── MentionSuggestionPopover
│   │   │       └── StakeholderList (filtered by typed text)
│   │   └── Button "Post Comment"
│   └── EmptyState ("No comments yet. Start the conversation!")
│
├── CommentIndicator (client — inline on entities)
│   ├── MessageCircle icon
│   ├── CommentCount badge
│   └── onClick -> opens CommentPanel filtered to this entity
│
├── EditingLockIndicator (client — on input fields)
│   ├── LockIcon
│   ├── Text "{userName} is editing..."
│   └── Tooltip ("Lock expires in {minutes}m {seconds}s")
│
├── ConflictBanner (client — top of step/gap view when conflict exists)
│   ├── AlertTriangle icon
│   ├── Text "Classification conflict detected"
│   ├── ConflictParties ("{userName1} says FIT, {userName2} says GAP")
│   └── Button "View Details" -> opens ConflictResolutionDialog
│
├── ConflictResolutionDialog (client)
│   ├── Dialog (shadcn)
│   │   ├── ConflictHeader
│   │   │   ├── EntityName (step action title)
│   │   │   └── StatusBadge
│   │   ├── ClassificationComparison
│   │   │   └── ClassificationCard (per conflicting party)
│   │   │       ├── UserAvatar + Name + Role
│   │   │       ├── Classification badge (FIT/GAP/CONFIGURE)
│   │   │       ├── Rationale text
│   │   │       └── Timestamp
│   │   ├── ResolutionForm (if authorized to resolve)
│   │   │   ├── RadioGroup (FIT | GAP | CONFIGURE | N/A)
│   │   │   ├── Textarea (resolution notes)
│   │   │   └── Button "Resolve Conflict"
│   │   ├── EscalateSection (if PM role)
│   │   │   ├── StakeholderSelect (escalate to)
│   │   │   ├── Textarea (escalation message)
│   │   │   └── Button "Escalate"
│   │   └── ConflictTimeline (history of status changes)
│
├── ConflictListPage (RSC)
│   └── ConflictList (client)
│       ├── ConflictFilters
│       │   ├── StatusFilter (tabs: Open | In Discussion | Escalated | Resolved)
│       │   └── EntityTypeFilter (Step | Gap)
│       ├── ConflictCard (per conflict)
│       │   ├── EntityName
│       │   ├── ConflictPartiesAvatars
│       │   ├── StatusBadge
│       │   ├── Timestamp
│       │   └── Button "Resolve" or "View"
│       └── EmptyState
│
└── ActivityFeed (client — sidebar panel or dedicated page)
    ├── ActivityFeedHeader
    │   ├── Title ("Activity")
    │   └── ActivityFilters
    │       ├── FilterChip (area code)
    │       ├── FilterChip (action type)
    │       └── FilterChip (stakeholder)
    ├── ActivityEntryList
    │   └── ActivityEntry (per entry)
    │       ├── ActorAvatar (small)
    │       ├── SummaryText (with highlighted entity names)
    │       ├── RelativeTimestamp
    │       └── ActionTypeIcon
    ├── LoadMoreButton (pagination)
    └── RealTimeIndicator (pulse dot when new entries arrive)
```

### Key Props & State

```typescript
interface CollaborationProviderProps {
  assessmentId: string;
  userId: string;
  userRole: string;
  children: React.ReactNode;
}

interface CollaborationContextValue {
  // Presence
  onlineUsers: PresenceUser[];
  isConnected: boolean;

  // Locks
  locks: Map<string, EditingLockInfo>; // key: `${entityType}:${entityId}`
  acquireLock: (entityType: string, entityId: string) => Promise<boolean>;
  releaseLock: (entityType: string, entityId: string) => void;
  isLockedByOther: (entityType: string, entityId: string) => boolean;
  getLockHolder: (entityType: string, entityId: string) => { id: string; name: string } | null;

  // Comments
  commentCounts: Map<string, number>; // key: `${targetType}:${targetId}`
  openCommentPanel: (targetType: string, targetId: string) => void;

  // Activity
  recentActivity: ActivityEntry[];
  unreadActivityCount: number;
}

interface EditingLockInfo {
  lockedById: string;
  lockedByName: string;
  expiresAt: Date;
}

interface CommentPanelProps {
  assessmentId: string;
  targetType: string;
  targetId: string;
  isOpen: boolean;
  onClose: () => void;
}

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  stakeholders: Array<{ id: string; name: string; role: string }>;
  placeholder?: string;
  maxLength?: number;
}

interface ConflictResolutionDialogProps {
  conflict: ConflictDetail;
  canResolve: boolean;
  canEscalate: boolean;
  stakeholders: Array<{ id: string; name: string; role: string }>;
  onResolve: (classification: string, notes: string) => void;
  onEscalate: (escalateToId: string, message: string) => void;
  onClose: () => void;
}
```

## 6. Business Logic

### WebSocket Presence Manager

```typescript
class PresenceManager {
  private rooms: Map<string, Map<string, PresenceUser>>; // assessmentId -> userId -> PresenceUser
  private heartbeatTimers: Map<string, NodeJS.Timer>;

  constructor() {
    this.rooms = new Map();
    this.heartbeatTimers = new Map();
  }

  join(assessmentId: string, user: PresenceUser): void {
    if (!this.rooms.has(assessmentId)) {
      this.rooms.set(assessmentId, new Map());
    }
    this.rooms.get(assessmentId)!.set(user.id, {
      ...user,
      lastActionAt: new Date().toISOString(),
      isIdle: false,
    });
    this.startHeartbeatTimer(assessmentId, user.id);
  }

  leave(assessmentId: string, userId: string): void {
    this.rooms.get(assessmentId)?.delete(userId);
    this.clearHeartbeatTimer(assessmentId, userId);
    if (this.rooms.get(assessmentId)?.size === 0) {
      this.rooms.delete(assessmentId);
    }
  }

  heartbeat(assessmentId: string, userId: string): void {
    const user = this.rooms.get(assessmentId)?.get(userId);
    if (user) {
      user.lastActionAt = new Date().toISOString();
      user.isIdle = false;
      this.resetHeartbeatTimer(assessmentId, userId);
    }
  }

  getOnlineUsers(assessmentId: string): PresenceUser[] {
    return Array.from(this.rooms.get(assessmentId)?.values() ?? []);
  }

  private startHeartbeatTimer(assessmentId: string, userId: string): void {
    const key = `${assessmentId}:${userId}`;
    this.heartbeatTimers.set(key, setTimeout(() => {
      const user = this.rooms.get(assessmentId)?.get(userId);
      if (user) user.isIdle = true;
      // After 2x timeout (10 min), auto-remove
      this.heartbeatTimers.set(`${key}:disconnect`, setTimeout(() => {
        this.leave(assessmentId, userId);
      }, 5 * 60 * 1000));
    }, 5 * 60 * 1000)); // 5 minutes idle threshold
  }

  private resetHeartbeatTimer(assessmentId: string, userId: string): void {
    this.clearHeartbeatTimer(assessmentId, userId);
    this.startHeartbeatTimer(assessmentId, userId);
  }

  private clearHeartbeatTimer(assessmentId: string, userId: string): void {
    const key = `${assessmentId}:${userId}`;
    clearTimeout(this.heartbeatTimers.get(key));
    clearTimeout(this.heartbeatTimers.get(`${key}:disconnect`));
    this.heartbeatTimers.delete(key);
    this.heartbeatTimers.delete(`${key}:disconnect`);
  }
}
```

### Lock Manager

```typescript
class LockManager {
  private locks: Map<string, EditingLock>; // key: `${assessmentId}:${entityType}:${entityId}`
  private lockTimers: Map<string, NodeJS.Timer>;

  private static LOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutes

  acquireLock(
    assessmentId: string,
    entityType: string,
    entityId: string,
    userId: string,
    userName: string
  ): { success: boolean; lock: EditingLock | null; holder: { id: string; name: string } | null } {
    const key = `${assessmentId}:${entityType}:${entityId}`;
    const existing = this.locks.get(key);

    if (existing && existing.lockedById !== userId && existing.isActive) {
      // Already locked by another user
      return {
        success: false,
        lock: null,
        holder: { id: existing.lockedById, name: existing.lockedByName },
      };
    }

    const lock: EditingLock = {
      assessmentId,
      entityType,
      entityId,
      lockedById: userId,
      lockedByName: userName,
      acquiredAt: new Date(),
      expiresAt: new Date(Date.now() + LockManager.LOCK_DURATION_MS),
      isActive: true,
    };

    this.locks.set(key, lock);
    this.startLockTimer(key);

    return { success: true, lock, holder: null };
  }

  releaseLock(assessmentId: string, entityType: string, entityId: string, userId: string): boolean {
    const key = `${assessmentId}:${entityType}:${entityId}`;
    const existing = this.locks.get(key);

    if (!existing || existing.lockedById !== userId) return false;

    this.locks.delete(key);
    this.clearLockTimer(key);
    return true;
  }

  renewLock(assessmentId: string, entityType: string, entityId: string, userId: string): boolean {
    const key = `${assessmentId}:${entityType}:${entityId}`;
    const existing = this.locks.get(key);

    if (!existing || existing.lockedById !== userId) return false;

    existing.expiresAt = new Date(Date.now() + LockManager.LOCK_DURATION_MS);
    this.resetLockTimer(key);
    return true;
  }

  isLocked(assessmentId: string, entityType: string, entityId: string): {
    locked: boolean;
    holder: { id: string; name: string } | null;
    expiresAt: Date | null;
  } {
    const key = `${assessmentId}:${entityType}:${entityId}`;
    const lock = this.locks.get(key);

    if (!lock || !lock.isActive) {
      return { locked: false, holder: null, expiresAt: null };
    }

    return {
      locked: true,
      holder: { id: lock.lockedById, name: lock.lockedByName },
      expiresAt: lock.expiresAt,
    };
  }

  private startLockTimer(key: string): void {
    this.lockTimers.set(key, setTimeout(() => {
      this.locks.delete(key);
      // Broadcast lock_expired event via WebSocket
    }, LockManager.LOCK_DURATION_MS));
  }

  private resetLockTimer(key: string): void {
    this.clearLockTimer(key);
    this.startLockTimer(key);
  }

  private clearLockTimer(key: string): void {
    clearTimeout(this.lockTimers.get(key));
    this.lockTimers.delete(key);
  }
}
```

### Conflict Detection

```typescript
async function detectClassificationConflict(
  assessmentId: string,
  entityType: "STEP" | "GAP",
  entityId: string,
  userId: string,
  classification: string
): Promise<Conflict | null> {
  // Find other stakeholders who have classified this same entity differently
  const stakeholders = await prisma.assessmentStakeholder.findMany({
    where: { assessmentId },
    include: { user: true },
  });

  // Get the entity's functional area to check area overlap
  let entityArea: string | null = null;
  if (entityType === "STEP") {
    const step = await prisma.processStep.findUnique({
      where: { id: entityId },
      include: { scopeItem: { select: { functionalArea: true } } },
    });
    entityArea = step?.scopeItem?.functionalArea ?? null;
  }

  // Find stakeholders assigned to this area (other than current user)
  const areaStakeholders = stakeholders.filter(
    (s) =>
      s.userId !== userId &&
      (s.assignedAreas.length === 0 || // No area restriction = all areas
        (entityArea && s.assignedAreas.includes(entityArea)))
  );

  // Check if any area stakeholder has a different classification
  const existingResponse = await prisma.stepResponse.findUnique({
    where: { assessmentId_processStepId: { assessmentId, processStepId: entityId } },
  });

  if (!existingResponse) return null;

  // Check decision log for other classifications
  const otherClassifications = await prisma.decisionLogEntry.findMany({
    where: {
      assessmentId,
      entityType: "STEP_RESPONSE",
      entityId,
      action: "CLASSIFIED",
      actor: { not: userId },
    },
    orderBy: { timestamp: "desc" },
    take: 5,
  });

  const conflictingEntries = otherClassifications.filter(
    (entry) => {
      const newVal = entry.newValue as { fitStatus?: string };
      return newVal.fitStatus && newVal.fitStatus !== classification;
    }
  );

  if (conflictingEntries.length === 0) return null;

  // Check if an open conflict already exists
  const existingConflict = await prisma.conflict.findFirst({
    where: { assessmentId, entityType, entityId, status: { in: ["OPEN", "IN_DISCUSSION"] } },
  });

  if (existingConflict) {
    // Update existing conflict with new classification
    const classifications = existingConflict.classifications as Array<Record<string, unknown>>;
    const updated = classifications.filter((c) => c.userId !== userId);
    updated.push({
      userId,
      userName: stakeholders.find((s) => s.userId === userId)?.name ?? "Unknown",
      role: stakeholders.find((s) => s.userId === userId)?.role ?? "unknown",
      classification,
      rationale: null,
      timestamp: new Date().toISOString(),
    });

    return prisma.conflict.update({
      where: { id: existingConflict.id },
      data: { classifications: updated },
    });
  }

  // Create new conflict
  const classifications = [
    ...conflictingEntries.map((entry) => ({
      userId: entry.actor,
      userName: stakeholders.find((s) => s.userId === entry.actor)?.name ?? "Unknown",
      role: stakeholders.find((s) => s.userId === entry.actor)?.role ?? "unknown",
      classification: (entry.newValue as { fitStatus: string }).fitStatus,
      rationale: null,
      timestamp: entry.timestamp.toISOString(),
    })),
    {
      userId,
      userName: stakeholders.find((s) => s.userId === userId)?.name ?? "Unknown",
      role: stakeholders.find((s) => s.userId === userId)?.role ?? "unknown",
      classification,
      rationale: null,
      timestamp: new Date().toISOString(),
    },
  ];

  return prisma.conflict.create({
    data: { assessmentId, entityType, entityId, classifications, status: "OPEN" },
  });
}
```

### @Mention Parsing

```typescript
const MENTION_REGEX = /@\[([^\]]+)\]\(([a-z0-9]+)\)/g;
// Input: "Hey @[Sarah Chen](clxyz123) can you review this?"
// Matches: [{name: "Sarah Chen", id: "clxyz123"}]

function parseMentions(content: string): { userIds: string[]; contentHtml: string } {
  const userIds: string[] = [];
  const contentHtml = content.replace(MENTION_REGEX, (_, name, id) => {
    userIds.push(id);
    return `<span class="mention" data-user-id="${id}">@${escapeHtml(name)}</span>`;
  });
  return { userIds: [...new Set(userIds)], contentHtml };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
```

### Activity Feed Entry Creation

```typescript
async function createActivityEntry(params: {
  assessmentId: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  actionType: string;
  summary: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  areaCode?: string;
}): Promise<ActivityFeedEntry> {
  const entry = await prisma.activityFeedEntry.create({ data: params });

  // Broadcast to connected WebSocket clients
  broadcastToAssessment(params.assessmentId, {
    type: "activity",
    entry: {
      id: entry.id,
      actor: { id: params.actorId, name: params.actorName, avatarUrl: null, role: params.actorRole },
      actionType: params.actionType,
      summary: params.summary,
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
      areaCode: params.areaCode ?? null,
      metadata: params.metadata ?? null,
      createdAt: entry.createdAt.toISOString(),
    },
  });

  return entry;
}
```

### Graceful Degradation (No WebSocket)

```typescript
// When WebSocket connection fails or is unavailable:
const FALLBACK_CONFIG = {
  // Presence: hidden entirely — no avatars, no online count
  presence: { enabled: false },

  // Editing locks: polling-based (10-second interval via REST)
  locks: {
    enabled: true,
    mode: "polling" as const,
    intervalMs: 10_000,
    endpoint: "/api/assessments/[id]/locks",
  },

  // Comments: standard REST — fully functional without WebSocket
  comments: { enabled: true, mode: "rest" as const },

  // Activity feed: polling-based refresh (30-second interval)
  activityFeed: {
    enabled: true,
    mode: "polling" as const,
    intervalMs: 30_000,
  },

  // Conflicts: detected asynchronously server-side — notifications via REST
  conflicts: { enabled: true, mode: "rest" as const },
};
```

## 7. Permissions & Access Control

| Feature | platform_admin | partner_lead | consultant | project_manager | solution_architect | process_owner | it_lead | data_migration_lead | executive_sponsor | client_admin | viewer |
|---|---|---|---|---|---|---|---|---|---|---|---|
| See presence | Yes | Yes | Yes | Yes | Yes | Own area | Yes | Yes | No | Yes | No |
| Active editing indicators | Yes | No | Yes | No | Yes | Own area | Own area | Own area | No | No | No |
| Acquire editing lock | Yes | No | Yes | No | Yes | Own area | Own area | Own area | No | No | No |
| Post comments | Yes | Yes | Yes | Yes | Yes | Own area | Own area | Own area | Approvals only | Yes | No |
| Reply to comments | Yes | Yes | Yes | Yes | Yes | Own area | Own area | Own area | Yes | Yes | No |
| Edit own comments | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | No |
| Delete own comments | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | No |
| Delete any comment | Yes | No | No | No | No | No | No | No | No | No | No |
| Resolve comments | Yes | No | Yes | Yes | Yes | No | No | No | No | No | No |
| @Mention others | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | No |
| See activity feed | All | All | All | All | All | Own area | Technical | Own area | No | All | No |
| View conflicts | Yes | Yes | Yes | Yes | Yes | Own area | Own area | No | If escalated | Yes | No |
| Resolve conflicts | Yes | No | Yes | No (escalates) | Yes | No (provides input) | No (provides input) | No | If escalated | No | No |
| Escalate conflicts | Yes | No | No | Yes | No | No | No | No | No | No | No |

**Notes**:
- "Own area" means the user can only interact with entities in their `assignedAreas`.
- Executive sponsors see conflicts only when explicitly escalated to them.
- Viewers have no collaboration capabilities — they observe the assessment in read-only mode without real-time features.
- "Approvals only" for executive_sponsor comments means they can comment on sign-off requests and escalated conflicts but not on general assessment entities.
- "Technical" for it_lead activity feed means they see activity related to integration points, data migration, and technical scope items.

## 8. Notification Triggers

| Event | Channel | Recipients | Template |
|---|---|---|---|
| New comment on entity | In-app + WebSocket | Assessment stakeholders with access to the entity's area | "{authorName} commented on {entityType} '{entityName}'" |
| @Mention in comment | In-app + Email + WebSocket | Mentioned user(s) | "{authorName} mentioned you in a comment: '{contentPreview}'" |
| Comment reply | In-app + WebSocket | Original comment author | "{authorName} replied to your comment on {entityType} '{entityName}'" |
| Comment resolved | In-app + WebSocket | Comment author | "{resolverName} resolved your comment on {entityType} '{entityName}'" |
| Conflict detected | In-app + Email + WebSocket | Conflicting parties + PM | "Classification conflict on {entityType} '{entityName}': {party1} says {classification1}, {party2} says {classification2}" |
| Conflict escalated | In-app + Email | Escalation target | "{escalatorName} escalated a classification conflict to you: {entityType} '{entityName}'" |
| Conflict resolved | In-app + WebSocket | All conflicting parties + PM | "Conflict on {entityType} '{entityName}' resolved as {classification} by {resolverName}" |
| User joins assessment (presence) | WebSocket only | Online users in same assessment | (No notification — avatar simply appears) |
| User leaves assessment (presence) | WebSocket only | Online users in same assessment | (No notification — avatar simply disappears) |
| Editing lock acquired | WebSocket only | Online users viewing same entity | (Field shows "{userName} is editing..." indicator) |

## 9. Edge Cases & Error Handling

| Scenario | Handling |
|---|---|
| User loses WebSocket connection mid-edit | Lock is maintained for full 5-minute duration. On reconnection, client re-sends `lock_acquire` to renew. If lock expired, user must re-acquire. |
| Two users try to acquire the same lock simultaneously | First `lock_acquire` wins (server processes sequentially). Second user receives `lock_acquired` event with the first user's info. |
| User closes browser tab without releasing lock | Heartbeat timeout (5 min) marks user as idle. Lock timer (5 min) auto-expires the lock. `lock_expired` event broadcast to room. |
| @Mention references a user not on the assessment | Server validates mentioned user IDs against `AssessmentStakeholder`. Invalid mentions are silently ignored (not highlighted in rendered HTML). |
| Comment on a deleted entity (e.g., deleted gap) | Comment creation returns 404: "Target entity not found." Existing comments on deleted entities remain visible but marked "(entity deleted)". |
| Conflict between more than 2 stakeholders | Supported. `classifications` JSON array can hold any number of entries. UI shows all parties in the conflict comparison view. |
| Conflict resolution applied but step was re-classified afterward | The resolved conflict remains resolved. If a new divergent classification occurs, a new conflict is created. |
| Activity feed grows very large (10,000+ entries) | Paginated API (50 per page). Oldest entries are never deleted but are archived after 90 days (moved to cold storage in a future phase). |
| WebSocket server restarts (deployment) | All clients disconnect. Clients reconnect with exponential backoff (1s, 2s, 4s, 8s, max 30s). On reconnect, client re-sends `join` and re-fetches presence state via REST fallback. |
| Comment content exceeds 10,000 characters | Zod validation rejects with 400: "Comment must be 10,000 characters or fewer." |
| Deeply nested reply chain (reply to reply to reply) | Database supports unlimited nesting. UI displays max 2 levels deep inline, with "View full thread" link for deeper nesting. |
| Concurrent comment creation (race condition) | No issue — comments are independent records. Ordering by `createdAt` handles display order. |
| User mentioned in comment but has no email configured | Skip email notification. In-app notification still delivered. |
| Lock acquired for entity in read-only assessment (signed_off) | Lock acquisition rejected: "Cannot edit a signed-off assessment." |

## 10. Performance Considerations

- **WebSocket connection pooling**: Single WebSocket connection per client, multiplexed across all assessment rooms. Client joins/leaves rooms via `join`/`leave` messages rather than opening new connections.
- **Presence broadcast throttling**: Presence updates are debounced (500ms) to avoid flooding clients during rapid joins/leaves. Maximum broadcast rate: 2 presence updates per second per assessment.
- **Lock storage**: Locks are primarily in-memory (PresenceManager) for sub-millisecond access. Database `EditingLock` table is written asynchronously for crash recovery. Database writes are batched every 5 seconds.
- **Comment query optimization**: Comments are loaded with a single query using `parentCommentId IS NULL` + eager-load replies (max depth 2). Index on `[assessmentId, targetType, targetId]` ensures fast entity-scoped queries.
- **Activity feed pagination**: Cursor-based pagination using `createdAt` + `id` for stable ordering. Index on `[assessmentId, createdAt]` provides efficient range scans.
- **Activity feed deduplication**: Batch classifications (e.g., "classified 5 steps") are aggregated into a single entry rather than 5 individual entries. Aggregation window: 30 seconds.
- **Conflict detection**: Runs asynchronously after each classification save (queued via microtask). Does not block the classification response. Maximum conflict check latency: 500ms.
- **@Mention autocomplete**: Stakeholder list is loaded once when the comment panel opens and cached in React state. No server round-trip per keystroke. Filtered client-side.
- **WebSocket message size**: All WebSocket messages are JSON-serialized. Maximum message size: 64KB. Comment content is truncated in WebSocket broadcasts (first 200 chars) — full content fetched via REST.
- **Memory management**: Each assessment room's presence data is approximately 500 bytes per user. With 100 concurrent users across 50 assessments, total presence memory is approximately 25KB — negligible.

## 11. Testing Strategy

### Unit Tests

```
describe("PresenceManager", () => {
  it("adds user to assessment room on join")
  it("removes user from assessment room on leave")
  it("marks user as idle after 5 minutes without heartbeat")
  it("auto-removes user after 10 minutes without heartbeat")
  it("returns empty array for assessment with no online users")
  it("handles same user joining from multiple tabs")
  it("cleans up empty rooms when last user leaves")
})

describe("LockManager", () => {
  it("acquires lock for available entity")
  it("rejects lock if already held by another user")
  it("allows same user to re-acquire their own lock (renewal)")
  it("releases lock on explicit release")
  it("auto-expires lock after 5 minutes")
  it("reports correct lock holder for locked entity")
  it("returns not locked for expired lock")
})

describe("ConflictDetection", () => {
  it("creates conflict when two stakeholders classify same step differently")
  it("does not create conflict for same classification")
  it("updates existing open conflict with new classification")
  it("does not create conflict for users outside entity area")
  it("creates new conflict after previous one is resolved")
  it("handles conflict with more than 2 parties")
})

describe("MentionParsing", () => {
  it("extracts user IDs from @mention syntax")
  it("renders mentions as HTML spans with data attributes")
  it("handles multiple mentions in same content")
  it("handles content with no mentions")
  it("deduplicates repeated mentions of same user")
  it("escapes HTML in mention names")
})

describe("ActivityFeedAggregation", () => {
  it("aggregates batch classifications into single entry")
  it("does not aggregate actions more than 30 seconds apart")
  it("does not aggregate actions from different users")
  it("preserves individual entries for non-aggregatable actions")
})
```

### Integration Tests

```
describe("POST /api/assessments/[id]/comments", () => {
  it("creates top-level comment on step entity")
  it("creates reply to existing comment")
  it("parses @mentions and stores user IDs")
  it("sends notification to mentioned users")
  it("rejects comment from viewer role")
  it("rejects comment on entity outside process_owner area")
  it("rejects comment exceeding 10,000 characters")
  it("rejects comment on non-existent entity")
  it("rejects unauthenticated request")
  it("returns 404 for non-existent assessment")
})

describe("PUT /api/assessments/[id]/comments/[commentId]", () => {
  it("updates comment content and sets isEdited flag")
  it("rejects update from non-author")
  it("rejects update to comment in different assessment")
})

describe("PUT /api/assessments/[id]/comments/[commentId]/resolve", () => {
  it("resolves comment and sets resolvedBy and resolvedAt")
  it("rejects resolve from process_owner role")
  it("rejects resolve of already-resolved comment")
  it("broadcasts comment_resolved via WebSocket")
})

describe("GET /api/assessments/[id]/conflicts", () => {
  it("returns paginated conflicts for assessment")
  it("filters by status parameter")
  it("filters by entityType parameter")
  it("includes entity name and area in response")
  it("rejects unauthenticated request")
  it("scopes results to process_owner area")
})

describe("PUT /api/assessments/[id]/conflicts/[conflictId]/resolve", () => {
  it("resolves conflict with chosen classification")
  it("updates the underlying StepResponse to resolved classification")
  it("creates DecisionLogEntry for the resolution")
  it("broadcasts conflict_resolved via WebSocket")
  it("rejects resolution from PM role (PM can only escalate)")
  it("rejects resolution of already-resolved conflict")
  it("sends notification to all conflicting parties")
})

describe("PUT /api/assessments/[id]/conflicts/[conflictId]/escalate", () => {
  it("escalates conflict to specified stakeholder")
  it("updates conflict status to ESCALATED")
  it("sends email notification to escalation target")
  it("rejects escalation from non-PM role")
  it("rejects escalation of already-resolved conflict")
})

describe("GET /api/assessments/[id]/activity", () => {
  it("returns paginated activity feed")
  it("filters by actionType parameter")
  it("filters by areaCode parameter")
  it("filters by date range")
  it("scopes results to process_owner assigned areas")
  it("returns newest entries first")
})

describe("WebSocket /ws/assessment/[id]", () => {
  it("broadcasts user_joined when client sends join message")
  it("broadcasts user_left when client disconnects")
  it("broadcasts lock_acquired when lock is acquired")
  it("broadcasts lock_released when lock is released")
  it("broadcasts lock_expired after 5-minute timeout")
  it("broadcasts presence_update on heartbeat")
  it("rejects connection from unauthenticated client")
  it("rejects connection from user not on assessment")
})
```

### E2E Tests (Playwright)

```
describe("Real-Time Collaboration", () => {
  it("presence avatars appear when second user opens same assessment")
  it("presence avatar disappears when user navigates away")
  it("editing lock indicator appears when another user focuses a field")
  it("editing lock clears after user releases focus")
  it("comment posted on step appears for both users in real-time")
  it("@mention autocomplete shows stakeholder list")
  it("@mention triggers notification for mentioned user")
  it("comment reply appears nested under parent")
  it("conflict banner appears when two users classify same step differently")
  it("conflict resolution dialog allows consultant to choose classification")
  it("activity feed updates in real-time when actions are performed")
  it("activity feed filters by area correctly")
  it("graceful degradation: app works without WebSocket (comments via REST)")
})
```

## 12. Migration & Seed Data

### Prisma Migration

```sql
-- CreateTable: Comment
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentHtml" TEXT,
    "mentions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "parentCommentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "editedAt" TIMESTAMP(3),
    "isEdited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Conflict
CREATE TABLE "Conflict" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "classifications" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolvedById" TEXT,
    "resolvedClassification" TEXT,
    "resolutionNotes" TEXT,
    "escalatedToId" TEXT,
    "escalatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Conflict_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ActivityFeedEntry
CREATE TABLE "ActivityFeedEntry" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "areaCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityFeedEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable: EditingLock
CREATE TABLE "EditingLock" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "lockedById" TEXT NOT NULL,
    "lockedByName" TEXT NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "EditingLock_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes: Comment
CREATE INDEX "Comment_assessmentId_targetType_targetId_idx" ON "Comment"("assessmentId", "targetType", "targetId");
CREATE INDEX "Comment_assessmentId_authorId_idx" ON "Comment"("assessmentId", "authorId");
CREATE INDEX "Comment_assessmentId_status_idx" ON "Comment"("assessmentId", "status");
CREATE INDEX "Comment_parentCommentId_idx" ON "Comment"("parentCommentId");

-- CreateIndexes: Conflict
CREATE INDEX "Conflict_assessmentId_status_idx" ON "Conflict"("assessmentId", "status");
CREATE INDEX "Conflict_assessmentId_entityType_entityId_idx" ON "Conflict"("assessmentId", "entityType", "entityId");
CREATE INDEX "Conflict_status_idx" ON "Conflict"("status");

-- CreateIndexes: ActivityFeedEntry
CREATE INDEX "ActivityFeedEntry_assessmentId_createdAt_idx" ON "ActivityFeedEntry"("assessmentId", "createdAt");
CREATE INDEX "ActivityFeedEntry_assessmentId_actorId_idx" ON "ActivityFeedEntry"("assessmentId", "actorId");
CREATE INDEX "ActivityFeedEntry_assessmentId_actionType_idx" ON "ActivityFeedEntry"("assessmentId", "actionType");
CREATE INDEX "ActivityFeedEntry_assessmentId_areaCode_createdAt_idx" ON "ActivityFeedEntry"("assessmentId", "areaCode", "createdAt");

-- CreateIndexes: EditingLock
CREATE UNIQUE INDEX "EditingLock_assessmentId_entityType_entityId_key" ON "EditingLock"("assessmentId", "entityType", "entityId");
CREATE INDEX "EditingLock_assessmentId_isActive_idx" ON "EditingLock"("assessmentId", "isActive");
CREATE INDEX "EditingLock_expiresAt_idx" ON "EditingLock"("expiresAt");

-- AddForeignKeys
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentCommentId_fkey" FOREIGN KEY ("parentCommentId") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Conflict" ADD CONSTRAINT "Conflict_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conflict" ADD CONSTRAINT "Conflict_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ActivityFeedEntry" ADD CONSTRAINT "ActivityFeedEntry_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

### Seed Data

```typescript
// In prisma/seed.ts — add demo collaboration data

// Demo comments
const commentId1 = "comment-demo-1";
const commentId2 = "comment-demo-2";

await prisma.comment.createMany({
  data: [
    {
      id: commentId1,
      assessmentId: "demo-assessment-1",
      targetType: "STEP",
      targetId: "step-demo-accounts-payable-1",
      authorId: "user-consultant-demo",
      content: "This step requires custom validation for Malaysian tax invoices. @[Ahmad Ibrahim](user-process-owner-demo) can you confirm the current process?",
      contentHtml: 'This step requires custom validation for Malaysian tax invoices. <span class="mention" data-user-id="user-process-owner-demo">@Ahmad Ibrahim</span> can you confirm the current process?',
      mentions: ["user-process-owner-demo"],
      status: "OPEN",
    },
    {
      id: commentId2,
      assessmentId: "demo-assessment-1",
      targetType: "STEP",
      targetId: "step-demo-accounts-payable-1",
      authorId: "user-process-owner-demo",
      content: "Confirmed. We currently use a custom ABAP report for SST validation. This cannot be replicated in standard S/4HANA Cloud.",
      parentCommentId: commentId1,
      status: "OPEN",
    },
  ],
});

// Demo conflict
await prisma.conflict.create({
  data: {
    id: "conflict-demo-1",
    assessmentId: "demo-assessment-1",
    entityType: "STEP",
    entityId: "step-demo-accounts-payable-3",
    classifications: [
      {
        userId: "user-consultant-demo",
        userName: "Sarah Chen",
        role: "consultant",
        classification: "fit",
        rationale: "Standard SAP process covers this requirement with minor configuration.",
        timestamp: "2025-12-01T10:30:00Z",
      },
      {
        userId: "user-process-owner-demo",
        userName: "Ahmad Ibrahim",
        role: "process_owner",
        classification: "gap",
        rationale: "Current process includes a custom approval matrix that standard SAP does not support.",
        timestamp: "2025-12-01T14:15:00Z",
      },
    ],
    status: "OPEN",
  },
});

// Demo activity feed entries
await prisma.activityFeedEntry.createMany({
  data: [
    {
      assessmentId: "demo-assessment-1",
      actorId: "user-consultant-demo",
      actorName: "Sarah Chen",
      actorRole: "consultant",
      actionType: "classified_steps",
      summary: "Sarah Chen classified 12 steps in Accounts Payable as FIT",
      entityType: "STEP",
      metadata: { stepCount: 12, area: "FI", fitStatus: "fit" },
      areaCode: "FI",
    },
    {
      assessmentId: "demo-assessment-1",
      actorId: "user-process-owner-demo",
      actorName: "Ahmad Ibrahim",
      actorRole: "process_owner",
      actionType: "commented",
      summary: "Ahmad Ibrahim commented on step 'Invoice Validation'",
      entityType: "COMMENT",
      entityId: commentId2,
      areaCode: "FI",
    },
    {
      assessmentId: "demo-assessment-1",
      actorId: "user-consultant-demo",
      actorName: "Sarah Chen",
      actorRole: "consultant",
      actionType: "conflict_detected",
      summary: "Classification conflict detected on step 'Approval Matrix Configuration'",
      entityType: "CONFLICT",
      entityId: "conflict-demo-1",
      areaCode: "FI",
    },
  ],
});
```

### Backfill

No backfill required. Comments, conflicts, and activity feed entries are generated by future user actions. Editing locks are ephemeral. Seed data provides a demo dataset for development and testing.

### Cleanup Job

A periodic cleanup job should be configured to:
- Delete expired `EditingLock` rows older than 1 hour (locks expire after 5 minutes; 1-hour buffer for crash recovery)
- Run every 15 minutes via Vercel Cron or database-level scheduled task

```sql
-- Cleanup expired editing locks
DELETE FROM "EditingLock" WHERE "expiresAt" < NOW() - INTERVAL '1 hour';
```

## 13. Open Questions

1. **Should the WebSocket server be a separate process or integrated into the Next.js server?**
   - Recommended: Integrated for V2 (single process). Next.js App Router can serve WebSocket connections via a custom server setup or a Vercel WebSocket-compatible configuration. For scaling beyond a single server instance, migrate to a dedicated WebSocket service with Redis pub/sub in a future phase.

2. **Should comments be deletable or only resolvable?**
   - Recommended: Both. Authors and platform_admin can delete comments. Any authorized user can resolve comments. Deleted comments show "[deleted]" placeholder to preserve thread context. Replies to deleted comments remain visible.

3. **Should conflict detection be synchronous (blocking the classification response) or asynchronous?**
   - Recommended: Asynchronous. The classification is saved immediately, and conflict detection runs as a follow-up task. This keeps classification response times under 200ms. The conflict notification arrives via WebSocket within 1-2 seconds.

4. **Should editing locks be persistent (database) or ephemeral (memory only)?**
   - Recommended: Primarily in-memory with database backup. In-memory locks are faster (sub-millisecond). Database records are written asynchronously every 5 seconds for crash recovery. On server restart, stale locks are cleaned up.

5. **Should the activity feed support real-time updates via WebSocket or polling?**
   - Recommended: WebSocket when available, polling fallback at 30-second intervals. New entries are broadcast via WebSocket to connected clients. The REST endpoint serves as both the fallback and the initial data load.

6. **What is the maximum nesting depth for comment replies?**
   - Recommended: No technical limit in the database (self-referential relation supports infinite depth). UI renders 2 levels deep inline with a "View full thread" link for deeper nesting. This prevents visual clutter while supporting complex discussions.

7. **Should conflicts auto-resolve if one party changes their classification to match the other?**
   - Recommended: Yes. If the classifications converge (both parties agree), the conflict is auto-resolved with a system-generated note: "Auto-resolved: both parties now agree on {classification}." This reduces manual resolution overhead.

8. **Should presence show which specific entity (step, gap) a user is viewing, or only which page?**
   - Recommended: Page-level for V2 (e.g., "viewing Scope Selection" or "viewing Step Classification for J60"). Entity-level presence (e.g., "viewing step S-001") adds complexity and data volume for marginal benefit.

## 14. Acceptance Criteria (Given/When/Then)

### AC-28.1: Presence — user avatars appear
```
Given I am viewing assessment "ASM-001" scope selection page
And another user "Sarah Chen" opens the same assessment
When Sarah's WebSocket connection is established
Then I see Sarah's avatar appear in the presence bar
And the avatar tooltip shows "Sarah Chen — viewing Scope Selection"
And the online count updates from "1" to "2"
```

### AC-28.2: Presence — user leaves
```
Given I see Sarah Chen's avatar in the presence bar
When Sarah navigates to a different assessment
Then Sarah's avatar disappears from the presence bar within 2 seconds
And the online count decreases by 1
```

### AC-28.3: Presence — idle detection
```
Given Sarah Chen has been inactive (no actions) for 5 minutes
When the heartbeat timeout fires
Then Sarah's avatar shows an "idle" indicator (dimmed or clock icon)
And after 10 total minutes of inactivity, Sarah's avatar is removed
```

### AC-28.4: Editing lock — acquire and display
```
Given I am viewing step "S-001" response field in assessment "ASM-001"
And Sarah Chen focuses on the same step's response field
When Sarah's lock_acquire message is processed
Then I see "Sarah Chen is editing this response..." below the field
And the field is visually disabled (not editable) for me
And a lock icon appears on the field
```

### AC-28.5: Editing lock — timeout
```
Given Sarah Chen holds a lock on step "S-001" response field
When 5 minutes pass without Sarah releasing the lock
Then the lock is automatically released
And I see the "Sarah Chen is editing..." indicator disappear
And the field becomes editable for me
```

### AC-28.6: Post comment on step
```
Given I am a consultant on assessment "ASM-001"
When I click the comment icon on step "S-001"
And the comment panel opens on the right side
And I type "This needs review @[Ahmad Ibrahim](user-123)" and click "Post Comment"
Then the comment appears in the panel with my name, avatar, and timestamp
And Ahmad Ibrahim receives an in-app notification
And an email is sent to Ahmad Ibrahim with the comment preview
And a comment_added WebSocket event is broadcast to other users on this assessment
```

### AC-28.7: Reply to comment
```
Given a comment exists on step "S-001" by Sarah Chen
When I click "Reply" on Sarah's comment
And I type "Agreed, this is a gap." and click "Post Comment"
Then my reply appears nested under Sarah's comment
And Sarah receives a notification "{myName} replied to your comment"
```

### AC-28.8: Resolve comment
```
Given I am a consultant and a comment is in "OPEN" status
When I click "Resolve" on the comment
Then the comment status changes to "RESOLVED"
And a green checkmark appears on the comment
And the comment author receives a notification
And a comment_resolved WebSocket event is broadcast
```

### AC-28.9: @Mention autocomplete
```
Given I am composing a comment on assessment "ASM-001"
And the assessment has stakeholders: Sarah Chen, Ahmad Ibrahim, Raj Patel
When I type "@Ah"
Then a suggestion popover appears showing "Ahmad Ibrahim (process_owner)"
And when I select "Ahmad Ibrahim"
Then the text updates to "@[Ahmad Ibrahim](user-123)"
```

### AC-28.10: Conflict detection
```
Given Sarah Chen (consultant) classified step "S-001" as "fit"
And Ahmad Ibrahim (process_owner) is assigned to the same area
When Ahmad classifies the same step "S-001" as "gap"
Then a Conflict record is created with both classifications
And both Sarah and Ahmad receive notifications about the conflict
And the project manager receives a notification
And a conflict_detected WebSocket event is broadcast
And a yellow conflict banner appears on step "S-001" for all users
```

### AC-28.11: Conflict resolution
```
Given a conflict exists on step "S-001" with status "OPEN"
And I am a consultant on the assessment
When I open the conflict resolution dialog
And I see Sarah's classification (fit) and Ahmad's classification (gap)
And I select "gap" as the final classification
And I enter resolution notes "Custom approval matrix confirmed as a gap by process owner"
And I click "Resolve Conflict"
Then the conflict status changes to "RESOLVED"
And the step response is updated to "gap"
And a DecisionLogEntry is created for the resolution
And both Sarah and Ahmad are notified of the resolution
```

### AC-28.12: Conflict escalation
```
Given a conflict exists on step "S-001" with status "IN_DISCUSSION"
And I am a project_manager on the assessment
When I click "Escalate" on the conflict
And I select "John Lee (executive_sponsor)" as the escalation target
And I enter message "Need executive decision on this classification"
Then the conflict status changes to "ESCALATED"
And John Lee receives an email notification about the escalation
And John Lee can now view and resolve the conflict
```

### AC-28.13: Activity feed — real-time updates
```
Given I am viewing the activity feed for assessment "ASM-001"
And Sarah Chen classifies 5 steps in Accounts Payable as FIT
When the classifications are saved
Then a new activity entry appears at the top of my feed
And the entry reads "Sarah Chen classified 5 steps in Accounts Payable as FIT"
And the entry includes Sarah's avatar and a relative timestamp
```

### AC-28.14: Activity feed — area filtering
```
Given I am a process_owner assigned to areas "FI" and "CO"
When I view the activity feed for assessment "ASM-001"
Then I see only activity entries with areaCode "FI" or "CO"
And I do not see entries for area "MM" or "SD"
```

### AC-28.15: Graceful degradation without WebSocket
```
Given my browser does not support WebSocket (or the connection fails)
When I use the assessment
Then presence indicators are not shown
And editing locks use 10-second polling via REST
And comments work normally via REST API
And the activity feed refreshes every 30 seconds via polling
And conflict detection still works (asynchronous, notification via REST)
```

### AC-28.16: Viewer role — no collaboration features
```
Given I am a viewer on assessment "ASM-001"
When I view the assessment
Then I do not see the presence bar
And I cannot post or reply to comments
And I do not see the comment composer
And I do not see editing lock indicators
And I do not have access to the activity feed
```

## 15. Size Estimate

| Category | Estimate |
|---|---|
| **T-shirt size** | **XL** |
| Schema changes (4 new tables) | 1 day |
| WebSocket server integration | 3 days |
| Presence Manager (join/leave/heartbeat/idle) | 2 days |
| Lock Manager (acquire/release/timeout) | 2 days |
| Comment CRUD API (5 routes) | 2 days |
| Comment UI (panel, thread, composer, @mention) | 3 days |
| Conflict detection engine | 2 days |
| Conflict CRUD API (3 routes) | 1 day |
| Conflict resolution UI (dialog, banner, list) | 2 days |
| Activity feed API + UI | 2 days |
| Graceful degradation (polling fallback) | 1 day |
| Notification integration (email + in-app) | 1 day |
| Tests (unit + integration + e2e) | 3 days |
| **Total** | **~25 days (5 weeks)** |

## 16. Phase Completion Checklist

- [ ] Prisma migration creates `Comment`, `Conflict`, `ActivityFeedEntry`, `EditingLock` tables
- [ ] WebSocket endpoint `/ws/assessment/[id]` accepts authenticated connections
- [ ] Presence Manager tracks online users per assessment with join/leave/heartbeat
- [ ] Presence bar renders avatar stack with tooltips showing user name, role, and current page
- [ ] Idle detection marks users as idle after 5 minutes, auto-removes after 10 minutes
- [ ] Lock Manager supports acquire/release/timeout with 5-minute duration
- [ ] Editing lock indicator renders "{userName} is editing..." on locked fields
- [ ] Locked fields are visually disabled for other users
- [ ] Lock auto-expires and broadcasts `lock_expired` event after 5 minutes
- [ ] `POST /api/assessments/[id]/comments` creates comments with @mention parsing
- [ ] `GET /api/assessments/[id]/comments` returns paginated, filterable comments with replies
- [ ] `PUT /api/assessments/[id]/comments/[commentId]` updates content with edit flag
- [ ] `PUT /api/assessments/[id]/comments/[commentId]/resolve` marks comment as resolved
- [ ] `DELETE /api/assessments/[id]/comments/[commentId]` soft-deletes with authorization
- [ ] Comment panel renders threaded comments with author avatars, timestamps, and status
- [ ] @mention autocomplete resolves from assessment stakeholders
- [ ] @mention triggers in-app and email notifications to mentioned users
- [ ] Comment reply triggers notification to parent comment author
- [ ] Conflict detection runs asynchronously after each classification save
- [ ] `GET /api/assessments/[id]/conflicts` returns paginated conflicts with entity details
- [ ] `PUT /api/assessments/[id]/conflicts/[conflictId]/resolve` resolves with final classification
- [ ] `PUT /api/assessments/[id]/conflicts/[conflictId]/escalate` escalates to specified stakeholder
- [ ] Conflict resolution updates the underlying StepResponse and creates DecisionLogEntry
- [ ] Conflict banner appears on entities with open conflicts
- [ ] Conflict resolution dialog shows classification comparison and resolution form
- [ ] Auto-resolve triggers when conflicting parties converge on same classification
- [ ] `GET /api/assessments/[id]/activity` returns paginated, filterable activity feed
- [ ] Activity entries created for classifications, comments, gaps, conflicts, scope changes
- [ ] Activity feed aggregates batch classifications into single entries
- [ ] Activity feed updates in real-time via WebSocket broadcast
- [ ] Area-based filtering enforced for process_owner activity feed access
- [ ] Graceful degradation: polling fallback for presence, locks, and activity feed when WebSocket unavailable
- [ ] Viewer role excluded from all collaboration features
- [ ] Permissions matrix enforced per role for all collaboration actions
- [ ] Expired `EditingLock` rows cleaned up by periodic job
- [ ] Seed data includes demo comments, conflict, and activity feed entries
- [ ] Unit tests pass for PresenceManager, LockManager, ConflictDetection, MentionParsing
- [ ] Integration tests pass for all comment, conflict, and activity API routes
- [ ] Integration tests pass for WebSocket connection and message handling
- [ ] E2E tests pass for presence, commenting, conflict resolution, and activity feed

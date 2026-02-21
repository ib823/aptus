# Phase 19: Notification System

## 1. Overview

Build the notification infrastructure for Aptus supporting three delivery channels: in-app notifications (real-time via polling or SSE), email notifications (via transactional email provider), and Web Push for PWA. Define a unified notification pipeline with per-user channel preferences, event-to-notification mapping, and a notification center UI.

**Source**: V2 Brief Section A8 + Addendum 1 Section 5 (notification events)

### Goals
- Deliver timely, relevant notifications for all significant assessment lifecycle events
- Allow users to configure per-event-type channel preferences (in_app, email, push)
- Provide a persistent in-app notification center with unread count, mark-as-read, and deep linking
- Support Web Push (VAPID) for PWA offline/background delivery
- Keep notification dispatch decoupled from business logic via an event bus pattern
- Batch email notifications to prevent inbox flooding (configurable digest window)

---

## 2. Dependencies

| Dependency | Type | Notes |
|---|---|---|
| Phase 17 RBAC (11 roles) | Phase | Role-based recipient resolution |
| Phase 18 Assessment Lifecycle | Phase | Status transition events are a primary notification trigger |
| `User` model | Schema | Notification target; preferences linked to user |
| `Assessment` + `AssessmentStakeholder` | Schema | Recipient resolution via stakeholder relations |
| Transactional email provider | Infrastructure | Resend, SendGrid, or AWS SES for email delivery |
| Web Push (VAPID keys) | Infrastructure | `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` env vars |
| `web-push` npm package | Library | Server-side push notification delivery |
| React 19 + Next.js 16 | Framework | SSE or polling for real-time in-app updates |

---

## 3. Data Model Changes

### New: `Notification`

```prisma
model Notification {
  id              String    @id @default(cuid())
  userId          String
  assessmentId    String?
  type            String    // See NotificationType enum below
  title           String
  body            String    @db.Text
  channel         String    // "in_app" | "email" | "push"
  status          String    @default("unread") // "unread" | "read" | "dismissed"
  deepLink        String?   // URL path, e.g., "/assessments/clx123/steps?step=abc"
  metadata        Json?     // Type-specific structured data
  sentAt          DateTime  @default(now())
  readAt          DateTime?
  dismissedAt     DateTime?
  emailMessageId  String?   // External email provider message ID for tracking
  pushDelivered   Boolean   @default(false)
  createdAt       DateTime  @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, status])
  @@index([userId, sentAt])
  @@index([assessmentId])
  @@index([userId, type])
}
```

### New: `NotificationPreference`

```prisma
model NotificationPreference {
  id                String  @id @default(cuid())
  userId            String
  notificationType  String  // matches Notification.type
  channelEmail      Boolean @default(true)
  channelInApp      Boolean @default(true)
  channelPush       Boolean @default(false)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, notificationType])
  @@index([userId])
}
```

### New: `PushSubscription`

```prisma
model PushSubscription {
  id              String   @id @default(cuid())
  userId          String
  endpoint        String   @db.Text
  p256dh          String
  auth            String
  userAgent       String?
  deviceName      String?
  isActive        Boolean  @default(true)
  lastUsedAt      DateTime?
  createdAt       DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@unique([userId, endpoint])
}
```

### New: `EmailDigestQueue`

```prisma
model EmailDigestQueue {
  id              String   @id @default(cuid())
  userId          String
  notificationIds String[] @default([])
  scheduledFor    DateTime
  sentAt          DateTime?
  createdAt       DateTime @default(now())

  @@index([userId])
  @@index([scheduledFor])
  @@index([sentAt])
}
```

### Modified: `User` model

```prisma
model User {
  // ... existing fields ...

  // New relations
  notifications           Notification[]
  notificationPreferences NotificationPreference[]
  pushSubscriptions       PushSubscription[]
}
```

### TypeScript Types (`src/types/notification.ts`)

```typescript
export type NotificationType =
  | "step_classified"
  | "gap_created"
  | "comment_mention"
  | "workshop_invite"
  | "workshop_starting"
  | "status_change"
  | "phase_completed"
  | "phase_blocked"
  | "conflict_detected"
  | "sign_off_request"
  | "deadline_reminder"
  | "stakeholder_added"
  | "stakeholder_removed";

export type NotificationChannel = "in_app" | "email" | "push";

export type NotificationStatus = "unread" | "read" | "dismissed";

export interface NotificationPayload {
  type: NotificationType;
  assessmentId?: string;
  title: string;
  body: string;
  deepLink?: string;
  metadata?: Record<string, unknown>;
  recipients: NotificationRecipient[];
  priority?: "low" | "normal" | "high";
}

export interface NotificationRecipient {
  userId: string;
  channels?: NotificationChannel[]; // Override; if omitted, uses user preferences
}
```

### Zod Schemas (`src/lib/validation/notification.ts`)

```typescript
import { z } from "zod";

export const NotificationTypeSchema = z.enum([
  "step_classified", "gap_created", "comment_mention", "workshop_invite",
  "workshop_starting", "status_change", "phase_completed", "phase_blocked",
  "conflict_detected", "sign_off_request", "deadline_reminder",
  "stakeholder_added", "stakeholder_removed",
]);

export const NotificationChannelSchema = z.enum(["in_app", "email", "push"]);

export const NotificationPreferenceUpdateSchema = z.object({
  notificationType: NotificationTypeSchema,
  channelEmail: z.boolean().optional(),
  channelInApp: z.boolean().optional(),
  channelPush: z.boolean().optional(),
});

export const NotificationPreferencesBulkUpdateSchema = z.object({
  preferences: z.array(NotificationPreferenceUpdateSchema).min(1).max(20),
});

export const PushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  userAgent: z.string().max(500).optional(),
  deviceName: z.string().max(100).optional(),
});

export const NotificationListQuerySchema = z.object({
  status: z.enum(["unread", "read", "dismissed", "all"]).default("all"),
  type: NotificationTypeSchema.optional(),
  assessmentId: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const MarkReadSchema = z.object({
  notificationIds: z.array(z.string()).min(1).max(100).optional(),
  all: z.boolean().optional(),
  beforeTimestamp: z.string().datetime().optional(),
});
```

---

## 4. API Routes

### Notification CRUD

| Method | Path | Description | Auth |
|---|---|---|---|
| `GET` | `/api/notifications` | List current user's notifications (paginated, filterable) | Authenticated |
| `GET` | `/api/notifications/unread-count` | Get unread count for badge | Authenticated |
| `PUT` | `/api/notifications/[id]/read` | Mark single notification as read | Owner |
| `PUT` | `/api/notifications/[id]/dismiss` | Dismiss single notification | Owner |
| `PUT` | `/api/notifications/read-all` | Mark all (or filtered) as read | Authenticated |

### Preferences

| Method | Path | Description | Auth |
|---|---|---|---|
| `GET` | `/api/notifications/preferences` | Get all preferences for current user | Authenticated |
| `PUT` | `/api/notifications/preferences` | Bulk update preferences | Authenticated |

### Push Subscription

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/notifications/push-subscription` | Register push subscription | Authenticated |
| `DELETE` | `/api/notifications/push-subscription` | Unregister push subscription | Authenticated |
| `GET` | `/api/notifications/vapid-public-key` | Get VAPID public key for client | Public |

### Server-Sent Events (optional real-time)

| Method | Path | Description | Auth |
|---|---|---|---|
| `GET` | `/api/notifications/stream` | SSE stream for real-time in-app notifications | Authenticated |

### Request/Response Examples

**GET `/api/notifications?status=unread&limit=10`**
```json
{
  "notifications": [
    {
      "id": "clx_notif_001",
      "type": "status_change",
      "title": "Assessment status changed",
      "body": "Acme Corp assessment moved from Scoping to In Progress",
      "channel": "in_app",
      "status": "unread",
      "deepLink": "/assessments/clx_asmt_001",
      "metadata": { "fromStatus": "scoping", "toStatus": "in_progress" },
      "sentAt": "2026-02-21T10:30:00Z"
    }
  ],
  "nextCursor": "clx_notif_002",
  "totalUnread": 7
}
```

**PUT `/api/notifications/preferences`**
```json
// Request
{
  "preferences": [
    { "notificationType": "workshop_invite", "channelEmail": true, "channelInApp": true, "channelPush": true },
    { "notificationType": "step_classified", "channelEmail": false, "channelInApp": true, "channelPush": false }
  ]
}

// Response 200
{
  "updated": 2
}
```

---

## 5. UI Components

### New Components

| Component | Location | Description |
|---|---|---|
| `NotificationBell` | `src/components/notifications/NotificationBell.tsx` | Header icon with animated unread-count badge; triggers panel |
| `NotificationPanel` | `src/components/notifications/NotificationPanel.tsx` | Dropdown panel showing recent notifications with infinite scroll |
| `NotificationItem` | `src/components/notifications/NotificationItem.tsx` | Individual notification row: icon, title, body preview, timestamp, read/dismiss actions |
| `NotificationPreferencesPage` | `src/app/(portal)/settings/notifications/page.tsx` | Full-page grid of notification types x channels with toggle switches |
| `NotificationEmptyState` | `src/components/notifications/NotificationEmptyState.tsx` | Empty state shown when no notifications |
| `PushPermissionBanner` | `src/components/notifications/PushPermissionBanner.tsx` | Dismissible banner prompting user to enable push notifications |

### Modified Components

| Component | Changes |
|---|---|
| Portal header/nav | Add `NotificationBell` to the right side of the header bar |
| Settings layout | Add "Notifications" link to settings sidebar |
| Service Worker (`public/sw.js`) | Add push event listener for Web Push |

### NotificationBell behavior

```typescript
// Poll every 30 seconds for unread count (fallback if SSE not supported)
// Badge shows count up to 99, then "99+"
// Click opens NotificationPanel as a popover
// Panel shows last 25 notifications; "View all" navigates to full page
// Marking as read updates badge count immediately (optimistic)
```

### NotificationPreferencesPage layout

```
| Notification Type      | In-App | Email | Push |
|------------------------|--------|-------|------|
| Step classified        |  [x]   |  [ ]  |  [ ] |
| Gap created            |  [x]   |  [x]  |  [ ] |
| Workshop invite        |  [x]   |  [x]  |  [x] |
| Workshop starting      |  [x]   |  [ ]  |  [x] |
| Status change          |  [x]   |  [x]  |  [ ] |
| Sign-off requested     |  [x]   |  [x]  |  [x] |
| Deadline approaching   |  [x]   |  [x]  |  [x] |
| @mention in comment    |  [x]   |  [x]  |  [x] |
| Conflict detected      |  [x]   |  [x]  |  [ ] |
| Phase completed        |  [x]   |  [x]  |  [ ] |
| Phase blocked          |  [x]   |  [x]  |  [ ] |
| Stakeholder added      |  [x]   |  [x]  |  [ ] |
| Stakeholder removed    |  [x]   |  [x]  |  [ ] |
```

---

## 6. Business Logic

### Notification Dispatch Pipeline

```typescript
// src/lib/notifications/dispatcher.ts

/**
 * Central notification dispatcher. All business events call this function.
 * It resolves recipients, checks preferences, and dispatches to channels.
 *
 * Flow:
 * 1. Receive NotificationPayload from business logic
 * 2. For each recipient, look up NotificationPreference
 * 3. For each enabled channel, dispatch:
 *    - in_app: Create Notification record in DB
 *    - email: Enqueue in EmailDigestQueue (batched) or send immediately (high priority)
 *    - push: Send via web-push library to all active PushSubscription records
 * 4. Return dispatch summary
 */
export async function dispatchNotification(payload: NotificationPayload): Promise<DispatchResult> {
  // ...
}
```

### Event-to-Notification Mapping

```typescript
// src/lib/notifications/events.ts

export const NOTIFICATION_EVENT_MAP: Record<string, NotificationEventConfig> = {
  "assessment.status_changed": {
    type: "status_change",
    titleTemplate: "Assessment status changed",
    bodyTemplate: "{{assessmentName}} moved from {{fromStatus}} to {{toStatus}}",
    recipientResolver: "all_stakeholders",
    defaultChannels: ["in_app", "email"],
    priority: "normal",
  },
  "step.classified": {
    type: "step_classified",
    titleTemplate: "Step classified",
    bodyTemplate: "{{stepTitle}} in {{scopeItemName}} was classified as {{fitStatus}}",
    recipientResolver: "step_counterpart", // If PO classified, notify consultant; vice versa
    defaultChannels: ["in_app"],
    priority: "low",
  },
  "gap.created": {
    type: "gap_created",
    titleTemplate: "New gap identified",
    bodyTemplate: "A gap was identified for {{stepTitle}} in {{scopeItemName}}",
    recipientResolver: "consultant_and_pm",
    defaultChannels: ["in_app", "email"],
    priority: "normal",
  },
  "workshop.scheduled": {
    type: "workshop_invite",
    titleTemplate: "Workshop scheduled: {{workshopTitle}}",
    bodyTemplate: "You are invited to {{workshopTitle}} on {{scheduledDate}}",
    recipientResolver: "workshop_invitees",
    defaultChannels: ["email", "in_app", "push"],
    priority: "normal",
  },
  "workshop.starting": {
    type: "workshop_starting",
    titleTemplate: "Workshop starting now",
    bodyTemplate: "{{workshopTitle}} is starting. Join with code {{sessionCode}}",
    recipientResolver: "workshop_attendees",
    defaultChannels: ["push", "in_app"],
    priority: "high",
  },
  "signoff.requested": {
    type: "sign_off_request",
    titleTemplate: "Sign-off requested",
    bodyTemplate: "{{assessmentName}} is ready for executive sign-off",
    recipientResolver: "executive_sponsors",
    defaultChannels: ["email", "in_app", "push"],
    priority: "high",
  },
  "deadline.approaching": {
    type: "deadline_reminder",
    titleTemplate: "Deadline approaching",
    bodyTemplate: "{{taskDescription}} is due in {{daysRemaining}} day(s)",
    recipientResolver: "assigned_stakeholders",
    defaultChannels: ["email", "push"],
    priority: "high",
  },
  "comment.mention": {
    type: "comment_mention",
    titleTemplate: "You were mentioned",
    bodyTemplate: "{{mentionedBy}} mentioned you in a comment on {{entityDescription}}",
    recipientResolver: "mentioned_users",
    defaultChannels: ["in_app", "email", "push"],
    priority: "normal",
  },
  "conflict.detected": {
    type: "conflict_detected",
    titleTemplate: "Classification conflict",
    bodyTemplate: "Conflicting classifications on {{stepTitle}}: {{conflictDetails}}",
    recipientResolver: "involved_parties_and_pm",
    defaultChannels: ["in_app", "email"],
    priority: "high",
  },
  "phase.completed": {
    type: "phase_completed",
    titleTemplate: "Phase completed: {{phaseName}}",
    bodyTemplate: "The {{phaseName}} phase for {{assessmentName}} is now complete",
    recipientResolver: "pm_and_partner_lead",
    defaultChannels: ["in_app", "email"],
    priority: "normal",
  },
  "phase.blocked": {
    type: "phase_blocked",
    titleTemplate: "Phase blocked: {{phaseName}}",
    bodyTemplate: "The {{phaseName}} phase for {{assessmentName}} is blocked: {{reason}}",
    recipientResolver: "pm_consultant_partner_lead",
    defaultChannels: ["in_app", "email"],
    priority: "high",
  },
};
```

### Recipient Resolvers

```typescript
// src/lib/notifications/recipients.ts

export type RecipientResolverName =
  | "all_stakeholders"
  | "consultant_and_pm"
  | "step_counterpart"
  | "workshop_invitees"
  | "workshop_attendees"
  | "executive_sponsors"
  | "assigned_stakeholders"
  | "mentioned_users"
  | "involved_parties_and_pm"
  | "pm_and_partner_lead"
  | "pm_consultant_partner_lead";

/**
 * Resolve "all_stakeholders" for a given assessment.
 */
async function resolveAllStakeholders(assessmentId: string): Promise<string[]> {
  const stakeholders = await prisma.assessmentStakeholder.findMany({
    where: { assessmentId },
    select: { userId: true },
  });
  return stakeholders.map((s) => s.userId);
}

/**
 * Resolve "step_counterpart": if the actor is a process_owner, return
 * the consultant(s); if the actor is a consultant, return the process_owner(s)
 * assigned to that functional area.
 */
async function resolveStepCounterpart(
  assessmentId: string,
  actorId: string,
  functionalArea: string,
): Promise<string[]> {
  // ...
}
```

### Email Digest Batching

```typescript
/**
 * Low/normal priority email notifications are batched into a digest.
 * - Digest window: 15 minutes (configurable via NOTIFICATION_DIGEST_WINDOW_MS env var)
 * - If the user has no pending digest, create one scheduled for now + window
 * - If there is a pending digest, append the notification ID
 * - A cron job processes due digests every minute
 * - High priority notifications skip the digest and send immediately
 */
```

### Web Push Delivery

```typescript
import webpush from "web-push";

// Configure VAPID
webpush.setVapidDetails(
  "mailto:notifications@aptus.app",
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

async function sendPushNotification(subscription: PushSubscriptionRecord, payload: PushPayload): Promise<boolean> {
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify(payload),
      { TTL: 3600 }, // 1 hour TTL
    );
    return true;
  } catch (error: unknown) {
    if (error instanceof webpush.WebPushError && error.statusCode === 410) {
      // Subscription expired; mark as inactive
      await prisma.pushSubscription.update({
        where: { id: subscription.id },
        data: { isActive: false },
      });
    }
    return false;
  }
}
```

---

## 7. Permissions & Access Control

| Action | Allowed Roles | Notes |
|---|---|---|
| Read own notifications | All authenticated users | Users can only read their own notifications |
| Mark own notifications as read/dismissed | All authenticated users | Users can only modify their own |
| Read own preferences | All authenticated users | |
| Update own preferences | All authenticated users | Cannot disable in_app for `sign_off_request` (always on) |
| Register push subscription | All authenticated users | Limit 5 active subscriptions per user |
| Send notifications (internal) | System only | Business logic dispatches; no user-facing "send" endpoint |
| View notification analytics | `platform_admin` | Future: admin dashboard for delivery stats |

### Forced Notifications

Certain notification types cannot be fully disabled:

| Type | Forced Channel | Reason |
|---|---|---|
| `sign_off_request` | `in_app` | Legal/compliance: executive must see sign-off requests |
| `conflict_detected` | `in_app` | Data integrity: conflicts must be surfaced |
| `stakeholder_removed` | `in_app`, `email` | Access change: user must know they lost access |

---

## 8. Notification Triggers

This section defines the integration points where business logic emits notification events.

| Business Event | Emitting Module | Notification Type | Recipients |
|---|---|---|---|
| `StepResponse` created/updated with fitStatus change | Step response API handler | `step_classified` | Counterpart (PO or consultant) |
| `GapResolution` created | Gap resolution API handler | `gap_created` | Consultant + PM |
| `Assessment.status` transitioned (Phase 18) | Transition engine | `status_change` | All stakeholders |
| `WorkshopSession` created (Phase 18/21) | Workshop API handler | `workshop_invite` | Invited stakeholders |
| `WorkshopSession.status` -> `active` | Workshop start handler | `workshop_starting` | Workshop attendees |
| `AssessmentPhaseProgress.status` -> `completed` (Phase 18) | Phase progress updater | `phase_completed` | PM + partner_lead |
| `AssessmentPhaseProgress.status` -> `blocked` (Phase 18) | Phase progress updater | `phase_blocked` | PM + consultant + partner_lead |
| Assessment transitions to `pending_sign_off` | Transition engine | `sign_off_request` | Executive sponsors |
| Cron: deadlines within N days | Deadline checker cron job | `deadline_reminder` | Assigned stakeholders |
| Comment with `@username` pattern | Comment API handler | `comment_mention` | Mentioned users |
| Conflicting classifications on same step | Conflict detector | `conflict_detected` | Involved parties + PM |

---

## 9. Edge Cases & Error Handling

| Scenario | Handling |
|---|---|
| User has no preferences set | Apply defaults from `NOTIFICATION_EVENT_MAP.defaultChannels` |
| Push subscription endpoint returns 410 Gone | Mark subscription `isActive = false`; do not retry |
| Push subscription endpoint returns 429 | Retry with exponential backoff (max 3 retries) |
| Email provider is down | Queue email in `EmailDigestQueue` with retry; log error; do not block in_app delivery |
| User receives 100+ notifications in rapid succession | Batch in_app writes in groups of 50; email goes to digest; push only for high priority |
| SSE connection drops | Client auto-reconnects with `EventSource`; last-event-id used to resume |
| User deletes account | Cascade delete all notifications, preferences, push subscriptions |
| Notification for assessment user is no longer stakeholder of | Check stakeholder membership at dispatch time; skip if removed |
| Deep link to deleted entity | Notification panel shows "This item is no longer available" with a dismiss button |
| Duplicate notification (idempotency) | Deduplicate by `(userId, type, assessmentId, deepLink)` within a 60-second window |

---

## 10. Performance Considerations

| Concern | Mitigation |
|---|---|
| Notification count query on every page load | Cache unread count in a `userId -> count` Redis key (or in-memory LRU); invalidate on write |
| High-volume notification writes during bulk operations | Batch inserts: `prisma.notification.createMany()` for up to 500 records |
| SSE connection limit | Limit to 1 SSE connection per user (keyed by session token); close stale connections after 30 min idle |
| Email digest processing | Cron job runs every 60 seconds; processes at most 100 digests per run to avoid timeout |
| Push notification fan-out | Process push delivery asynchronously; do not block API response |
| Notification table growth | Retain notifications for 90 days; archive/delete older records via nightly cron |
| Index strategy | Composite indexes on `[userId, status]` and `[userId, sentAt]` cover primary query patterns |
| Preferences lookup on every dispatch | Cache preferences in memory for duration of dispatch batch; invalidate on preference update |

---

## 11. Testing Strategy

### Unit Tests

| Test | File |
|---|---|
| Notification dispatcher routes to correct channels per user preferences | `__tests__/lib/notifications/dispatcher.test.ts` |
| Recipient resolver returns correct users per resolver type | `__tests__/lib/notifications/recipients.test.ts` |
| Template rendering with variable substitution | `__tests__/lib/notifications/templates.test.ts` |
| Email digest batching logic | `__tests__/lib/notifications/digest.test.ts` |
| Push notification error handling (410, 429) | `__tests__/lib/notifications/push.test.ts` |
| Forced notification enforcement (cannot disable sign_off_request in_app) | `__tests__/lib/notifications/forced.test.ts` |
| Deduplication within 60-second window | `__tests__/lib/notifications/dedup.test.ts` |
| Zod schema validation for all endpoints | `__tests__/lib/validation/notification.test.ts` |

### Integration Tests

| Test | File |
|---|---|
| GET /api/notifications with status/type filters and pagination | `__tests__/api/notifications/list.test.ts` |
| PUT /api/notifications/[id]/read updates status and readAt | `__tests__/api/notifications/read.test.ts` |
| PUT /api/notifications/read-all marks all unread as read | `__tests__/api/notifications/read-all.test.ts` |
| GET/PUT /api/notifications/preferences round-trip | `__tests__/api/notifications/preferences.test.ts` |
| POST /api/notifications/push-subscription registration and deletion | `__tests__/api/notifications/push-sub.test.ts` |
| End-to-end: StepResponse write triggers step_classified notification | `__tests__/api/notifications/event-integration.test.ts` |
| User cannot read another user's notifications | `__tests__/api/notifications/auth.test.ts` |

### E2E Tests

| Test | File |
|---|---|
| Notification bell shows unread count; panel opens and lists notifications | `e2e/notification-bell.spec.ts` |
| Marking notification as read updates badge count | `e2e/notification-read.spec.ts` |
| Notification preferences page toggles and saves correctly | `e2e/notification-preferences.spec.ts` |

---

## 12. Migration & Seed Data

### Prisma Migration

```bash
# Creates:
# 1. Notification table
# 2. NotificationPreference table
# 3. PushSubscription table
# 4. EmailDigestQueue table
# 5. Relations on User model
pnpm prisma migrate dev --name add-notification-system
```

### Seed Data (`prisma/seeds/notification-seed.ts`)

```typescript
/**
 * Seed default notification preferences for all existing users.
 * Uses NOTIFICATION_EVENT_MAP defaults.
 */
async function seedNotificationPreferences() {
  const users = await prisma.user.findMany({ select: { id: true } });
  const types = Object.values(NOTIFICATION_EVENT_MAP).map((e) => e.type);

  for (const user of users) {
    for (const type of types) {
      const config = Object.values(NOTIFICATION_EVENT_MAP).find((e) => e.type === type)!;
      await prisma.notificationPreference.upsert({
        where: { userId_notificationType: { userId: user.id, notificationType: type } },
        update: {},
        create: {
          userId: user.id,
          notificationType: type,
          channelEmail: config.defaultChannels.includes("email"),
          channelInApp: config.defaultChannels.includes("in_app"),
          channelPush: config.defaultChannels.includes("push"),
        },
      });
    }
  }
}

/**
 * Seed sample notifications for demo user.
 */
async function seedSampleNotifications(userId: string) {
  await prisma.notification.createMany({
    data: [
      {
        userId,
        type: "status_change",
        title: "Assessment status changed",
        body: "Acme Corp assessment moved from Scoping to In Progress",
        channel: "in_app",
        status: "unread",
        deepLink: "/assessments/demo-assessment-id",
      },
      {
        userId,
        type: "gap_created",
        title: "New gap identified",
        body: "A gap was identified for 'Create Purchase Order' in Procurement (J60)",
        channel: "in_app",
        status: "unread",
        deepLink: "/assessments/demo-assessment-id/gaps",
      },
      {
        userId,
        type: "workshop_invite",
        title: "Workshop scheduled: Finance Process Review",
        body: "You are invited to Finance Process Review on March 5, 2026 at 10:00 AM",
        channel: "in_app",
        status: "read",
        readAt: new Date("2026-02-20T14:00:00Z"),
        deepLink: "/assessments/demo-assessment-id/workshops/demo-workshop-id",
      },
    ],
  });
}
```

### Environment Variables

```env
# Web Push VAPID keys (generate with: npx web-push generate-vapid-keys)
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=

# Email provider
EMAIL_PROVIDER=resend           # "resend" | "sendgrid" | "ses"
RESEND_API_KEY=
EMAIL_FROM_ADDRESS=notifications@aptus.app
EMAIL_FROM_NAME=Aptus

# Notification config
NOTIFICATION_DIGEST_WINDOW_MS=900000   # 15 minutes
NOTIFICATION_RETENTION_DAYS=90
NOTIFICATION_SSE_IDLE_TIMEOUT_MS=1800000  # 30 minutes
```

---

## 13. Open Questions

| # | Question | Impact | Owner |
|---|---|---|---|
| 1 | Should we use SSE or WebSocket for real-time in-app notifications? SSE is simpler and works with Edge/Serverless; WebSocket requires persistent connections. | Medium -- affects infrastructure | Technical |
| 2 | Which transactional email provider? Resend is recommended for simplicity; SendGrid for scale. | Low -- abstracted behind interface | Infrastructure |
| 3 | Should email digests be 15-minute windows or user-configurable (e.g., "immediate", "hourly", "daily")? | Medium -- affects UX and schema | Product |
| 4 | Do we need notification analytics (delivery rate, read rate, click-through)? If yes, adds a `NotificationAnalytics` table. | Low -- can add later | Product |
| 5 | Should notifications persist after stakeholder removal from an assessment? Or should we purge assessment-specific notifications? | Medium -- data retention policy | Product + Legal |
| 6 | Maximum push subscriptions per user? Current limit is 5 (desktop + mobile + tablet). | Low -- constraint value | Product |

---

## 14. Acceptance Criteria (Given/When/Then)

### AC-19.1: In-App Notification Delivery
```
Given a consultant classifies a process step as GAP
  And the assessment has a process_owner stakeholder assigned to that functional area
  And the process_owner has in_app channel enabled for "step_classified"
When the classification is saved
Then a Notification record is created for the process_owner
  And the notification type is "step_classified"
  And the notification status is "unread"
  And the deepLink points to the relevant process step
```

### AC-19.2: Notification Bell Badge
```
Given a user has 5 unread notifications
When the user loads any portal page
Then the NotificationBell shows a badge with "5"
  And clicking the bell opens the NotificationPanel
  And the panel lists the 5 unread notifications sorted by sentAt descending
```

### AC-19.3: Mark as Read
```
Given a user has an unread notification with id "notif_123"
When the user clicks on the notification in the panel
Then a PUT request is sent to /api/notifications/notif_123/read
  And the notification status changes to "read"
  And readAt is set to the current timestamp
  And the unread badge count decreases by 1
```

### AC-19.4: Mark All as Read
```
Given a user has 12 unread notifications
When the user clicks "Mark all as read" in the notification panel
Then a PUT request is sent to /api/notifications/read-all
  And all 12 notifications are marked as "read"
  And the badge count becomes 0
```

### AC-19.5: Notification Preferences
```
Given a user navigates to Settings > Notifications
When the page loads
Then a grid of all 13 notification types x 3 channels is displayed
  And each cell shows a toggle switch matching the user's current preference
  And the "sign_off_request" in_app toggle is always on and disabled (forced)
```

### AC-19.6: Preference Update
```
Given a user disables email for "step_classified" notifications
When the user saves preferences
Then the NotificationPreference record for (userId, "step_classified") has channelEmail = false
  And subsequent step_classified events do NOT create email notifications for this user
  And in_app notifications are still delivered (if enabled)
```

### AC-19.7: Push Subscription Registration
```
Given a user grants push notification permission in the browser
When the service worker registers a push subscription
Then a POST request is sent to /api/notifications/push-subscription with endpoint, p256dh, auth
  And a PushSubscription record is created for the user
  And subsequent push-enabled notifications are delivered to this endpoint
```

### AC-19.8: Push Subscription Cleanup on 410
```
Given a push subscription endpoint returns HTTP 410 Gone
When the system attempts to send a push notification
Then the PushSubscription record is marked isActive = false
  And no further push attempts are made to this endpoint
```

### AC-19.9: Email Digest Batching
```
Given a user receives 5 normal-priority email notifications within a 15-minute window
When the digest cron job runs
Then a single digest email is sent containing all 5 notifications
  And each notification in the digest includes a deep link
```

### AC-19.10: High Priority Immediate Email
```
Given a user has email enabled for "sign_off_request"
When an assessment transitions to pending_sign_off
Then an email is sent immediately (not batched)
  And the email subject contains the assessment name
  And the email body includes a direct link to the sign-off page
```

---

## 15. Size Estimate

**Size: M (Medium)**

| Component | Effort |
|---|---|
| Schema migration + models (4 tables) | 0.5 day |
| Notification dispatcher + event mapping | 2 days |
| Recipient resolvers (10 resolver functions) | 1 day |
| API routes (9 endpoints) | 2 days |
| Email integration (provider abstraction + digest) | 1.5 days |
| Web Push integration (VAPID + service worker) | 1 day |
| UI components (6 components) | 2 days |
| Notification preferences page | 0.5 day |
| SSE real-time stream (optional) | 0.5 day |
| Testing (unit + integration) | 2 days |
| **Total** | **~13 days** |

---

## 16. Phase Completion Checklist

- [ ] Prisma schema updated with `Notification`, `NotificationPreference`, `PushSubscription`, `EmailDigestQueue`
- [ ] Migration applied successfully in development and staging
- [ ] TypeScript types created in `src/types/notification.ts`
- [ ] Zod schemas created in `src/lib/validation/notification.ts`
- [ ] Notification dispatcher implemented with preference lookup and channel routing
- [ ] All 13 notification event mappings configured with templates and recipient resolvers
- [ ] All 10 recipient resolver functions implemented and tested
- [ ] 9 API routes implemented with Zod validation and auth guards
- [ ] NotificationBell component renders with unread count badge
- [ ] NotificationPanel component shows paginated notifications with infinite scroll
- [ ] NotificationItem component renders with type-specific icons and deep links
- [ ] NotificationPreferencesPage renders grid with toggles and saves correctly
- [ ] Forced notification channels enforced (sign_off_request in_app cannot be disabled)
- [ ] Email provider integration working (Resend or configured alternative)
- [ ] Email digest batching implemented with cron job
- [ ] Web Push VAPID configuration and `web-push` integration complete
- [ ] Service worker handles push events and shows browser notifications
- [ ] PushPermissionBanner prompts user to enable push
- [ ] Push subscription cleanup on 410 Gone
- [ ] Deduplication logic prevents duplicate notifications within 60-second window
- [ ] SSE stream endpoint implemented (if chosen over polling)
- [ ] Notification retention cron job (90-day cleanup) implemented
- [ ] Environment variables documented in `.env.example`
- [ ] Unit tests pass (dispatcher, resolvers, templates, digest, push, forced, dedup)
- [ ] Integration tests pass (all API endpoints, event-to-notification flow)
- [ ] E2E tests pass (bell, panel, preferences)
- [ ] No TypeScript strict-mode errors introduced
- [ ] PR reviewed and approved

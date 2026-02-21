# Phase 27: Production Hardening & PWA

## 1. Overview

Capstone hardening phase that transforms Aptus from a desktop-oriented web application into a production-grade, installable Progressive Web App with offline capability, comprehensive mobile responsiveness, performance optimization, security hardening, and monitoring/observability infrastructure.

This phase addresses five interconnected concerns:

1. **Progressive Web App (PWA)**: Service worker for app shell caching, Web App Manifest for installability on iOS/Android/desktop, limited offline capability with classification queuing, and push notification infrastructure.

2. **Mobile-Responsive Audit**: Systematic review of every page and component across three breakpoint tiers (desktop 1024px+, tablet 768-1023px, mobile 320-767px). Touch-optimized targets, swipe gestures, and adaptive layouts.

3. **Offline Capability**: App shell loads when offline, data shows "offline" indicator, classifications are queued in IndexedDB and synced when connectivity returns, with conflict detection for concurrent edits.

4. **Performance Optimization**: Lighthouse audit targeting Performance > 90, Accessibility > 95, Best Practices > 95. Bundle analysis, code splitting, image optimization, and critical path optimization.

5. **Security & Monitoring**: Rate limiting, CORS configuration, CSP headers, dependency audit, structured logging, error tracking (Sentry), performance monitoring, database index optimization, and connection pooling.

**Source**: V2 Brief Section A10 items 5 + Addendum 1 Sections 2.1-2.4 (mobile/multi-device)

## 2. Dependencies

| Dependency | Type | Status | Notes |
|---|---|---|---|
| Phase 19 (Notification System) | Internal | Required | Push notification infrastructure (Web Push API) depends on the notification dispatch system from Phase 19 |
| Next.js 16 App Router | External | Exists | Service worker registration must work with App Router's RSC streaming |
| `next-pwa` or `@serwist/next` | External | Add | PWA plugin for Next.js — generates service worker, precache manifest |
| `workbox` | External | Add | Service worker runtime library for cache strategies (CacheFirst, NetworkFirst, StaleWhileRevalidate) |
| `idb-keyval` | External | Add | Lightweight IndexedDB wrapper for offline sync queue |
| `@sentry/nextjs` | External | Add | Error tracking and performance monitoring |
| `web-push` | External | Add | VAPID-based Web Push API server library |
| Tailwind v4 | External | Exists | Responsive utilities (`@media` queries, container queries) |
| shadcn/ui | External | Exists | All components must be audited for touch target sizes (minimum 44x44px) |
| Vercel Analytics | External | Add | Real User Monitoring (RUM) for performance metrics |
| PostgreSQL | External | Exists | Index optimization and connection pooling configuration |

## 3. Data Model Changes

```prisma
// ── Phase 27: Offline Sync Queue ──

model OfflineSyncQueue {
  id           String    @id @default(cuid())
  userId       String
  deviceId     String
  action       String    // "classify_step" | "add_note" | "create_gap" | "update_scope"
  assessmentId String
  payload      Json      // Action-specific data: {processStepId, fitStatus, ...}
  status       String    @default("pending") // "pending" | "synced" | "conflict" | "failed"
  conflictData Json?     // {serverValue: {...}, clientValue: {...}, serverTimestamp: string}
  errorMessage String?
  queuedAt     DateTime  @default(now())
  syncedAt     DateTime?
  retryCount   Int       @default(0)

  user User @relation(fields: [userId], references: [id])

  @@index([userId, status])
  @@index([deviceId])
  @@index([assessmentId, status])
  @@index([queuedAt])
}

// ── Phase 27: Push Subscription ──

model PushSubscription {
  id           String   @id @default(cuid())
  userId       String
  endpoint     String   @db.Text
  p256dhKey    String
  authKey      String
  deviceName   String?
  userAgent    String?
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  lastUsedAt   DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, endpoint])
  @@index([userId, isActive])
}

// ── Phase 27: Performance Baseline ──

model PerformanceBaseline {
  id            String   @id @default(cuid())
  route         String   // "/dashboard", "/assessments/[id]/scope", etc.
  metric        String   // "LCP" | "FID" | "CLS" | "TTFB" | "FCP"
  p50Value      Float
  p75Value      Float
  p95Value      Float
  sampleCount   Int
  measuredAt    DateTime @default(now())

  @@unique([route, metric])
  @@index([route])
}
```

**Migration notes**:
- Three new tables; no existing tables modified.
- `OfflineSyncQueue` tracks client-side actions performed while offline. Records are created server-side when the client syncs.
- `PushSubscription` stores Web Push API subscription objects per user/device.
- `PerformanceBaseline` stores Core Web Vitals baselines per route for regression detection.

## 4. API Routes

### POST /api/push/subscribe

Register a push subscription for the authenticated user.

```typescript
const pushSubscribeSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  deviceName: z.string().max(100).optional(),
});

// Response 201
interface PushSubscribeResponse {
  data: { id: string; deviceName: string | null; createdAt: string };
}

// Response 400: Invalid subscription format
// Response 401: Unauthorized
// Response 409: Subscription already exists
```

### DELETE /api/push/subscribe

Unregister a push subscription.

```typescript
const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

// Response 204: No content
// Response 404: Subscription not found
```

### POST /api/sync

Process offline sync queue items from a client device.

```typescript
const syncRequestSchema = z.object({
  deviceId: z.string().min(1).max(100),
  items: z.array(z.object({
    clientId: z.string(), // Client-generated ID for deduplication
    action: z.enum(["classify_step", "add_note", "create_gap", "update_scope"]),
    assessmentId: z.string().cuid(),
    payload: z.record(z.unknown()),
    queuedAt: z.string().datetime(),
  })).min(1).max(100),
});

// Response 200
interface SyncResponse {
  data: {
    synced: Array<{ clientId: string; serverId: string; status: "synced" }>;
    conflicts: Array<{
      clientId: string;
      status: "conflict";
      serverValue: unknown;
      clientValue: unknown;
      serverTimestamp: string;
    }>;
    failed: Array<{ clientId: string; status: "failed"; error: string }>;
  };
}

// Response 400: Validation error
// Response 401: Unauthorized
// Response 413: Too many items (> 100)
```

### POST /api/push/send (internal — not client-facing)

Send push notification to a user. Called by internal notification dispatch system.

```typescript
const pushSendSchema = z.object({
  userId: z.string().cuid(),
  title: z.string().max(200),
  body: z.string().max(500),
  url: z.string().url().optional(),
  tag: z.string().max(100).optional(),
  data: z.record(z.unknown()).optional(),
});

// Response 200: { sent: number; failed: number }
```

### GET /api/health

Application health check endpoint.

```typescript
// Response 200
interface HealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  version: string;
  checks: {
    database: { status: "up" | "down"; latencyMs: number };
    cache: { status: "up" | "down" | "not_configured" };
    storage: { status: "up" | "down" | "not_configured" };
  };
}

// Response 503: Unhealthy (database down)
```

### POST /api/performance/report

Client-side Core Web Vitals reporting endpoint.

```typescript
const performanceReportSchema = z.object({
  route: z.string().max(200),
  metrics: z.array(z.object({
    name: z.enum(["LCP", "FID", "CLS", "TTFB", "FCP", "INP"]),
    value: z.number().min(0),
    rating: z.enum(["good", "needs-improvement", "poor"]),
  })),
  userAgent: z.string().max(500).optional(),
  connection: z.string().max(50).optional(), // "4g", "3g", "slow-2g"
});

// Response 204: Accepted (fire-and-forget)
```

## 5. UI Components

### PWA Components

```
PWAInstallPrompt (client)
├── Dialog (shadcn)
│   ├── AppIcon (192px)
│   ├── Text "Install Aptus for faster access"
│   ├── FeatureList ("Works offline", "Push notifications", "Home screen access")
│   ├── Button "Install"
│   └── Button "Not now" (dismisses for 7 days)
│
OfflineIndicator (client)
├── Banner (fixed top, yellow background)
│   ├── WifiOff icon
│   ├── Text "You're offline. Changes will sync when you reconnect."
│   └── SyncQueueCount badge (e.g., "3 pending")
│
SyncStatusIndicator (client)
├── Popover (shadcn)
│   ├── SyncIcon (animated when syncing)
│   ├── QueueList
│   │   └── SyncQueueItem (per queued action)
│   │       ├── ActionDescription
│   │       ├── Timestamp
│   │       └── StatusBadge ("pending" | "syncing" | "conflict" | "failed")
│   └── Button "Sync Now" (manual trigger)
│
ConflictResolutionDialog (client)
├── Dialog (shadcn)
│   ├── ConflictHeader ("Classification conflict detected")
│   ├── ComparisonView
│   │   ├── ServerValue panel
│   │   └── ClientValue panel
│   ├── RadioGroup ("Keep server version" | "Keep my version")
│   └── Button "Resolve"
```

### Responsive Layout Components

```
ResponsiveShell (client — replaces current layout shell)
├── DesktopLayout (>= 1024px)
│   ├── Sidebar (fixed, 280px)
│   ├── TopNav
│   └── MainContent
├── TabletLayout (768-1023px)
│   ├── CollapsibleSidebar (overlay, hamburger toggle)
│   ├── TopNav (compact)
│   └── MainContent (single column)
└── MobileLayout (320-767px)
    ├── TopNav (minimal — logo + hamburger)
    ├── MainContent (full width, card-based)
    └── BottomTabBar
        ├── Tab (Dashboard)
        ├── Tab (Assessments)
        ├── Tab (Reports)
        └── Tab (More — overflow menu)

MobileStepNavigator (client — swipe-enabled for mobile)
├── SwipeContainer
│   ├── StepCard (current step)
│   │   ├── StepHeader
│   │   ├── ActionInstructions (collapsible)
│   │   ├── FitStatusSelector (large touch targets)
│   │   └── NoteInput
│   ├── SwipeLeftIndicator ("Next step")
│   └── SwipeRightIndicator ("Previous step")
└── StepProgressBar (compact)

MobileScopeSelector (client — card-based for mobile)
├── ScopeFilterBar (horizontal scroll)
│   ├── FilterChip (functional area)
│   └── FilterChip (relevance)
└── ScopeCardList
    └── ScopeCard (per scope item)
        ├── ScopeItemName
        ├── RelevanceBadge
        └── ToggleSwitch (select/deselect)
```

### Key Props & State

```typescript
interface OfflineIndicatorProps {
  isOnline: boolean;
  pendingCount: number;
  lastSyncedAt: Date | null;
}

interface SyncStatusIndicatorProps {
  queue: OfflineSyncItem[];
  isSyncing: boolean;
  onManualSync: () => void;
}

interface ConflictResolutionDialogProps {
  conflict: SyncConflict;
  onResolve: (resolution: "server" | "client") => void;
  onDismiss: () => void;
}

interface ResponsiveShellProps {
  children: React.ReactNode;
  currentRoute: string;
  user: SessionUser;
}

interface MobileStepNavigatorProps {
  steps: ProcessStep[];
  currentStepIndex: number;
  responses: Map<string, StepResponse>;
  onClassify: (stepId: string, fitStatus: string) => void;
  onSwipe: (direction: "left" | "right") => void;
}
```

## 6. Business Logic

### Service Worker Strategy

```typescript
// Cache strategies by resource type
const CACHE_STRATEGIES = {
  // App shell: cache-first (HTML, CSS, JS bundles)
  appShell: {
    strategy: "CacheFirst",
    cacheName: "aptus-shell-v1",
    maxEntries: 60,
    maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
    match: /\/_next\/static\//,
  },

  // API data: network-first with cache fallback
  apiData: {
    strategy: "NetworkFirst",
    cacheName: "aptus-api-v1",
    maxEntries: 200,
    maxAgeSeconds: 24 * 60 * 60, // 24 hours
    networkTimeoutSeconds: 5,
    match: /\/api\//,
  },

  // Images: stale-while-revalidate
  images: {
    strategy: "StaleWhileRevalidate",
    cacheName: "aptus-images-v1",
    maxEntries: 100,
    maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
    match: /\.(png|jpg|jpeg|svg|webp|ico)$/,
  },

  // Fonts: cache-first (long-lived)
  fonts: {
    strategy: "CacheFirst",
    cacheName: "aptus-fonts-v1",
    maxEntries: 10,
    maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year
    match: /\.(woff2?|ttf|otf)$/,
  },
};
```

### Offline Sync Queue (Client-Side)

```typescript
import { get, set, del, entries } from "idb-keyval";

interface OfflineSyncItem {
  clientId: string;
  action: "classify_step" | "add_note" | "create_gap" | "update_scope";
  assessmentId: string;
  payload: Record<string, unknown>;
  queuedAt: string; // ISO 8601
}

const SYNC_QUEUE_KEY = "aptus-sync-queue";
const DEVICE_ID_KEY = "aptus-device-id";

async function queueOfflineAction(item: Omit<OfflineSyncItem, "clientId" | "queuedAt">): Promise<void> {
  const queue = (await get<OfflineSyncItem[]>(SYNC_QUEUE_KEY)) ?? [];
  queue.push({
    ...item,
    clientId: crypto.randomUUID(),
    queuedAt: new Date().toISOString(),
  });
  await set(SYNC_QUEUE_KEY, queue);
}

async function syncQueue(): Promise<SyncResult> {
  const queue = (await get<OfflineSyncItem[]>(SYNC_QUEUE_KEY)) ?? [];
  if (queue.length === 0) return { synced: 0, conflicts: 0, failed: 0 };

  const deviceId = await getOrCreateDeviceId();
  const response = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId, items: queue }),
  });

  if (!response.ok) throw new Error(`Sync failed: ${response.status}`);
  const result: SyncResponse = await response.json();

  // Remove synced items from queue
  const syncedIds = new Set(result.data.synced.map((s) => s.clientId));
  const remainingItems = queue.filter((item) => !syncedIds.has(item.clientId));
  await set(SYNC_QUEUE_KEY, remainingItems);

  return {
    synced: result.data.synced.length,
    conflicts: result.data.conflicts.length,
    failed: result.data.failed.length,
  };
}

async function getOrCreateDeviceId(): Promise<string> {
  let deviceId = await get<string>(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    await set(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}
```

### Conflict Detection (Server-Side)

```typescript
async function processClassifyStep(
  item: OfflineSyncItem,
  userId: string
): Promise<SyncItemResult> {
  const { assessmentId, payload } = item;
  const { processStepId, fitStatus, clientNote } = payload as ClassifyStepPayload;

  // Check for concurrent modification
  const existing = await prisma.stepResponse.findUnique({
    where: { assessmentId_processStepId: { assessmentId, processStepId } },
  });

  if (existing && existing.updatedAt > new Date(item.queuedAt)) {
    // Server has a newer version — conflict
    return {
      clientId: item.clientId,
      status: "conflict",
      serverValue: {
        fitStatus: existing.fitStatus,
        clientNote: existing.clientNote,
        respondent: existing.respondent,
        respondedAt: existing.respondedAt?.toISOString(),
      },
      clientValue: { fitStatus, clientNote },
      serverTimestamp: existing.updatedAt.toISOString(),
    };
  }

  // No conflict — apply the classification
  await prisma.stepResponse.upsert({
    where: { assessmentId_processStepId: { assessmentId, processStepId } },
    create: {
      assessmentId,
      processStepId,
      fitStatus,
      clientNote: clientNote ?? null,
      respondent: userId,
      respondedAt: new Date(),
    },
    update: {
      fitStatus,
      clientNote: clientNote ?? null,
      respondent: userId,
      respondedAt: new Date(),
    },
  });

  return { clientId: item.clientId, status: "synced", serverId: existing?.id ?? "new" };
}
```

### Responsive Breakpoint System

```typescript
// Tailwind v4 breakpoint tokens (align with Tailwind defaults)
const BREAKPOINTS = {
  mobile: { max: 767 },    // 320-767px
  tablet: { min: 768, max: 1023 },  // 768-1023px
  desktop: { min: 1024 },  // 1024px+
} as const;

// Touch target minimum sizes
const TOUCH_TARGETS = {
  minimum: 44, // px — WCAG 2.5.5 Target Size
  comfortable: 48, // px — Material Design recommendation
  spacing: 8, // px — minimum spacing between targets
} as const;
```

### Security Headers

```typescript
// next.config.ts — security headers
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'", // Required for Next.js
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self' https://*.vercel.app wss://*.vercel.app https://*.sentry.io",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];
```

### Rate Limiting

```typescript
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const rateLimiters = {
  // General API: 100 requests per 60 seconds per IP
  api: new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(100, "60 s"),
    analytics: true,
    prefix: "rl:api",
  }),

  // Auth endpoints: 10 requests per 60 seconds per IP
  auth: new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(10, "60 s"),
    analytics: true,
    prefix: "rl:auth",
  }),

  // Report generation: 5 requests per 60 seconds per user
  report: new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(5, "60 s"),
    analytics: true,
    prefix: "rl:report",
  }),

  // Sync endpoint: 20 requests per 60 seconds per user
  sync: new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(20, "60 s"),
    analytics: true,
    prefix: "rl:sync",
  }),
};

async function checkRateLimit(
  limiter: Ratelimit,
  identifier: string
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const result = await limiter.limit(identifier);
  return {
    allowed: result.success,
    remaining: result.remaining,
    resetAt: new Date(result.reset),
  };
}
```

## 7. Permissions & Access Control

| Action | platform_admin | partner_lead | consultant | project_manager | solution_architect | process_owner | it_lead | data_migration_lead | executive_sponsor | client_admin | viewer |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Install PWA | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Receive push notifications | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | No |
| Queue offline classifications | Yes | No | Yes | No | Yes | Yes (own area) | Yes (own area) | No | No | No | No |
| Sync offline queue | Yes | No | Yes | No | Yes | Yes (own area) | Yes (own area) | No | No | No | No |
| Resolve sync conflicts | Yes | No | Yes (own) | No | Yes (own) | Yes (own area) | Yes (own area) | No | No | No | No |
| View performance dashboard | Yes | No | No | No | No | No | No | No | No | No | No |
| Access health endpoint | Yes | No | No | No | No | No | No | No | No | No | No |

**Notes**:
- PWA installation is available to all authenticated users.
- Offline capability mirrors online permissions: a user who cannot classify online cannot queue classifications offline.
- Push notification opt-in is user-controlled but viewer role is excluded from all push notifications.
- Health and performance endpoints are admin-only for operational monitoring.

## 8. Notification Triggers

| Event | Channel | Recipients | Template |
|---|---|---|---|
| Offline sync completed | Push + In-app toast | Syncing user | "{synced} changes synced successfully. {conflicts} conflicts need your attention." |
| Sync conflict detected | Push + In-app dialog | Affected user | "A classification conflict was detected for step '{stepName}'. Please review and resolve." |
| Sync failed (after 3 retries) | Push + In-app toast | Affected user | "Failed to sync {failed} changes. Please check your connection and try again." |
| PWA update available | In-app banner | All users | "A new version of Aptus is available. Refresh to update." |
| Performance degradation detected | Email | platform_admin | "Performance regression detected on route '{route}': LCP increased from {baseline}ms to {current}ms." |

## 9. Edge Cases & Error Handling

| Scenario | Handling |
|---|---|
| User classifies same step offline on two devices | Both sync attempts processed. Second device gets conflict if first synced first. Conflict resolution dialog shown on second device. |
| User goes offline mid-classification save | Current in-flight request fails. Action is NOT automatically queued (user must explicitly re-classify while offline for it to queue). Unsaved form state preserved in React state. |
| Service worker update available while user is working | Show non-intrusive banner "Update available". Do NOT auto-reload. User triggers update via "Refresh" button. |
| IndexedDB quota exceeded (offline queue too large) | Cap queue at 500 items. Show warning at 400 items: "Offline queue nearly full. Connect to sync." Reject new items at 500 with toast: "Cannot queue more changes offline. Please reconnect." |
| Push subscription expires | Silent failure. On next notification attempt, mark subscription as `isActive: false`. User re-subscribes on next visit. |
| Browser does not support service workers | PWA features gracefully hidden. No install prompt. No offline indicator. All functionality works as standard web app. |
| User denies push notification permission | Persist denial. Do not re-prompt for 30 days. Show in-app notifications as fallback. |
| Lighthouse score drops below threshold in CI | CI build warns but does not fail. Performance baseline stored for regression tracking. Alert sent to platform_admin. |
| Rate limit exceeded | Return 429 with `Retry-After` header. Client shows toast: "Too many requests. Please wait {seconds} seconds." |
| CSP blocks third-party script | Log to Sentry via CSP report-uri. Do not break application. Review CSP policy for necessary exceptions. |
| Mobile Safari PWA limitations (no push on iOS < 16.4) | Feature-detect push support. Hide push-related UI on unsupported browsers. Graceful degradation to in-app-only notifications. |
| Swipe gesture conflicts with browser back navigation | Use horizontal swipe threshold of 50px with velocity check. Short/slow swipes ignored to prevent browser navigation conflicts. |
| Bottom tab bar overlaps content on short screens | Content area has `padding-bottom` equal to tab bar height (56px) plus safe area inset. |

## 10. Performance Considerations

- **Bundle size target**: Total JavaScript payload under 250KB gzip for initial load. Use `@next/bundle-analyzer` to identify and eliminate large dependencies.
- **Code splitting**: Dynamic imports for heavy components (charts, PDF viewer, XLSX generator). Route-based splitting via Next.js App Router.
- **Image optimization**: Use Next.js `<Image>` component everywhere. WebP format with fallback. Lazy loading for below-fold images.
- **Font optimization**: Subset Geist font to Latin characters only. Use `next/font` for automatic optimization and preloading.
- **Critical CSS**: Tailwind v4's automatic tree-shaking eliminates unused utilities. Inline critical CSS via Next.js default behavior.
- **Service worker precaching**: Precache app shell (HTML templates, CSS, JS bundles). Do NOT precache API responses in the precache manifest.
- **API response caching**: Use `stale-while-revalidate` for assessment list and catalog data. Short-lived cache (60s) for assessment detail to avoid stale reads.
- **Database optimization**: Add missing composite indexes identified by `pg_stat_user_tables`. Enable connection pooling via PgBouncer or Prisma connection pool. Target: 95th percentile query latency under 50ms.
- **Lighthouse budget**: Performance > 90, Accessibility > 95, Best Practices > 95, SEO > 90. Measured on Vercel production deployment with 4G throttling.
- **Web Vitals targets**: LCP < 2.5s, FID < 100ms, CLS < 0.1, INP < 200ms on 75th percentile.
- **Offline sync batch size**: Sync queue items sent in batches of 25 to avoid large payloads. Retry with exponential backoff (1s, 2s, 4s, 8s, max 30s).

## 11. Testing Strategy

### Unit Tests

```
describe("OfflineSyncQueue (client)", () => {
  it("queues action with auto-generated clientId and timestamp")
  it("retrieves queue from IndexedDB")
  it("removes synced items from queue after successful sync")
  it("preserves conflicted and failed items in queue")
  it("caps queue at 500 items and rejects excess")
  it("generates consistent deviceId across sessions")
})

describe("ConflictDetection (server)", () => {
  it("detects conflict when server has newer version than queued action")
  it("allows sync when server has no existing data")
  it("allows sync when server version is older than queued action")
  it("returns server and client values in conflict response")
})

describe("RateLimiter", () => {
  it("allows requests within limit")
  it("blocks requests exceeding limit")
  it("resets after window expires")
  it("returns correct Retry-After header")
})

describe("SecurityHeaders", () => {
  it("includes all required CSP directives")
  it("sets X-Frame-Options to DENY")
  it("sets Strict-Transport-Security with preload")
  it("sets X-Content-Type-Options to nosniff")
})

describe("ResponsiveBreakpoints", () => {
  it("renders desktop layout at 1024px+")
  it("renders tablet layout at 768-1023px")
  it("renders mobile layout at 320-767px")
  it("bottom tab bar visible only on mobile")
  it("sidebar collapsed by default on tablet")
})
```

### Integration Tests

```
describe("POST /api/sync", () => {
  it("syncs classify_step action and creates StepResponse")
  it("syncs add_note action and updates StepResponse clientNote")
  it("detects conflict when server version is newer")
  it("handles batch of 25 mixed actions")
  it("rejects unauthenticated request with 401")
  it("rejects batch exceeding 100 items with 413")
  it("deduplicates by clientId (idempotent)")
  it("enforces assessment-level permission check")
})

describe("POST /api/push/subscribe", () => {
  it("creates push subscription for authenticated user")
  it("rejects duplicate subscription with 409")
  it("rejects invalid endpoint URL with 400")
  it("rejects viewer role with 403")
})

describe("GET /api/health", () => {
  it("returns healthy when database is up")
  it("returns degraded when cache is down")
  it("returns unhealthy when database is down with 503")
  it("includes latency metrics for each check")
})

describe("Rate limiting", () => {
  it("returns 429 after 100 API requests in 60 seconds")
  it("returns 429 after 10 auth requests in 60 seconds")
  it("includes Retry-After header in 429 response")
  it("resets counter after window expires")
})
```

### E2E Tests (Playwright)

```
describe("PWA & Mobile Experience", () => {
  it("service worker registers on first visit")
  it("app loads from cache when offline (app shell)")
  it("offline indicator appears when network is disconnected")
  it("classification queued offline is synced when reconnected")
  it("conflict resolution dialog appears for conflicting sync")
  it("PWA install prompt appears on supported browsers")
  it("mobile layout renders bottom tab bar at 375px viewport")
  it("swipe navigation works on mobile step view")
  it("tablet layout renders collapsible sidebar at 800px viewport")
  it("touch targets are at least 44x44px on mobile")
})

describe("Security", () => {
  it("CSP headers present on all responses")
  it("rate limiter returns 429 after threshold")
  it("health endpoint requires admin role")
})

describe("Performance", () => {
  it("Lighthouse performance score > 90 on dashboard page")
  it("LCP < 2.5s on assessment scope page")
  it("total JS bundle < 250KB gzip")
})
```

## 12. Migration & Seed Data

### Prisma Migration

```sql
-- CreateTable: OfflineSyncQueue
CREATE TABLE "OfflineSyncQueue" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "conflictData" JSONB,
    "errorMessage" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" TIMESTAMP(3),
    "retryCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OfflineSyncQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable: PushSubscription
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dhKey" TEXT NOT NULL,
    "authKey" TEXT NOT NULL,
    "deviceName" TEXT,
    "userAgent" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable: PerformanceBaseline
CREATE TABLE "PerformanceBaseline" (
    "id" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "p50Value" DOUBLE PRECISION NOT NULL,
    "p75Value" DOUBLE PRECISION NOT NULL,
    "p95Value" DOUBLE PRECISION NOT NULL,
    "sampleCount" INTEGER NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerformanceBaseline_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE INDEX "OfflineSyncQueue_userId_status_idx" ON "OfflineSyncQueue"("userId", "status");
CREATE INDEX "OfflineSyncQueue_deviceId_idx" ON "OfflineSyncQueue"("deviceId");
CREATE INDEX "OfflineSyncQueue_assessmentId_status_idx" ON "OfflineSyncQueue"("assessmentId", "status");
CREATE INDEX "OfflineSyncQueue_queuedAt_idx" ON "OfflineSyncQueue"("queuedAt");
CREATE UNIQUE INDEX "PushSubscription_userId_endpoint_key" ON "PushSubscription"("userId", "endpoint");
CREATE INDEX "PushSubscription_userId_isActive_idx" ON "PushSubscription"("userId", "isActive");
CREATE UNIQUE INDEX "PerformanceBaseline_route_metric_key" ON "PerformanceBaseline"("route", "metric");
CREATE INDEX "PerformanceBaseline_route_idx" ON "PerformanceBaseline"("route");

-- AddForeignKeys
ALTER TABLE "OfflineSyncQueue" ADD CONSTRAINT "OfflineSyncQueue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

### Seed Data

```typescript
// In prisma/seed.ts — add performance baselines for demo routes

const routes = [
  "/dashboard",
  "/assessments",
  "/assessments/[id]/scope",
  "/assessments/[id]/classify",
  "/assessments/[id]/gaps",
  "/assessments/[id]/reports",
  "/admin",
];

const metrics = ["LCP", "FID", "CLS", "TTFB", "FCP"] as const;

for (const route of routes) {
  for (const metric of metrics) {
    await prisma.performanceBaseline.upsert({
      where: { route_metric: { route, metric } },
      create: {
        route,
        metric,
        p50Value: metric === "CLS" ? 0.05 : metric === "FID" ? 50 : 800,
        p75Value: metric === "CLS" ? 0.08 : metric === "FID" ? 80 : 1200,
        p95Value: metric === "CLS" ? 0.15 : metric === "FID" ? 150 : 2500,
        sampleCount: 0,
      },
      update: {},
    });
  }
}
```

### PWA Assets

The following static assets must be created:

- `/public/manifest.json` — Web App Manifest
- `/public/icons/icon-192x192.png` — PWA icon (192px)
- `/public/icons/icon-512x512.png` — PWA icon (512px)
- `/public/icons/icon-maskable-192x192.png` — Maskable icon for Android
- `/public/icons/icon-maskable-512x512.png` — Maskable icon for Android
- `/public/sw.js` — Generated service worker (via build tool)
- `/public/offline.html` — Minimal offline fallback page

```json
// /public/manifest.json
{
  "name": "Aptus — SAP S/4HANA Fit-to-Standard",
  "short_name": "Aptus",
  "description": "SAP S/4HANA Cloud Fit-to-Standard assessment platform",
  "start_url": "/dashboard",
  "display": "standalone",
  "background_color": "#09090b",
  "theme_color": "#09090b",
  "orientation": "any",
  "icons": [
    { "src": "/icons/icon-192x192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512x512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-maskable-192x192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "/icons/icon-maskable-512x512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ],
  "categories": ["business", "productivity"]
}
```

### Backfill

No data backfill required. `OfflineSyncQueue` and `PushSubscription` are populated by user actions. `PerformanceBaseline` seeded with initial targets.

## 13. Open Questions

1. **Should we use `next-pwa` or `@serwist/next` for service worker generation?**
   - Recommended: `@serwist/next`. It is the actively maintained successor to `next-pwa` and has better App Router support. The API is similar but more flexible for custom cache strategies.

2. **Should offline mode support full assessment creation or only step classification?**
   - Recommended: Only step classification, note-taking, and gap creation for V2. Full assessment creation offline is complex (requires local Prisma schema replica) and low-value. Users typically start assessments while online.

3. **Should rate limiting use Upstash Redis or in-memory store?**
   - Recommended: Upstash Redis for production (persists across serverless function invocations). In-memory fallback for development. The `@upstash/ratelimit` library supports both.

4. **Should CSP be report-only initially?**
   - Recommended: Yes. Deploy with `Content-Security-Policy-Report-Only` for 2 weeks, monitoring Sentry for violations. Then switch to enforcing mode after confirming no legitimate scripts are blocked.

5. **Should the mobile bottom tab bar be customizable per role?**
   - Recommended: No. Use a fixed 4-tab layout (Dashboard, Assessments, Reports, More). The "More" tab contains role-specific overflow items. Customization adds complexity for minimal UX benefit.

6. **What is the IndexedDB storage quota for offline sync?**
   - Recommended: Rely on browser defaults (typically 50-100MB per origin). Cap the application-level queue at 500 items to stay well within limits. Each item is approximately 1-2KB.

7. **Should Sentry be configured with session replay?**
   - Recommended: Yes, but only for error sessions (not all sessions). Configure `replaysOnErrorSampleRate: 1.0` and `replaysSessionSampleRate: 0.1`. This provides debugging context without excessive data collection.

## 14. Acceptance Criteria (Given/When/Then)

### AC-27.1: PWA installation
```
Given I am an authenticated user visiting Aptus on Chrome desktop
And the service worker has registered successfully
When the browser detects PWA criteria are met (manifest, service worker, HTTPS)
Then an install prompt appears offering to install Aptus
And clicking "Install" creates a standalone app shortcut
And the installed app opens without browser chrome
```

### AC-27.2: Offline app shell
```
Given I have previously visited Aptus and the service worker has cached the app shell
When I lose network connectivity
Then the app shell (layout, navigation, chrome) loads from cache
And an offline indicator banner appears at the top of the page
And data areas show "You're offline" placeholder instead of spinners
```

### AC-27.3: Offline classification queuing
```
Given I am on the step classification page for assessment "ASM-001"
And I have lost network connectivity
When I classify step "S-001" as "fit" with note "Confirmed by client"
Then the classification is saved to the offline sync queue in IndexedDB
And the UI shows the classification as "pending sync" with a sync icon
And the offline indicator shows "1 pending change"
```

### AC-27.4: Offline sync on reconnection
```
Given I have 3 queued offline classifications
When network connectivity is restored
Then the sync process automatically starts within 5 seconds
And each classification is sent to POST /api/sync
And successfully synced items are removed from the queue
And the sync indicator shows "3 changes synced"
```

### AC-27.5: Sync conflict resolution
```
Given I classified step "S-001" as "fit" while offline
And another user classified the same step as "gap" while I was offline
When my offline queue syncs
Then the sync response returns a conflict for step "S-001"
And a conflict resolution dialog appears showing both values
And I can choose "Keep server version" or "Keep my version"
And the chosen value becomes the final classification
```

### AC-27.6: Mobile layout (375px viewport)
```
Given I am viewing Aptus on a 375px wide viewport (iPhone SE)
When I navigate to any page
Then the bottom tab bar is visible with 4 tabs
And the sidebar is not visible (replaced by hamburger menu)
And all content renders in single-column layout
And all touch targets are at least 44x44px
```

### AC-27.7: Tablet layout (800px viewport)
```
Given I am viewing Aptus on an 800px wide viewport (iPad Mini)
When I navigate to the assessment scope page
Then the sidebar is collapsed by default (hamburger toggle available)
And content renders in single-column layout
And touch targets are at least 44x44px
```

### AC-27.8: Mobile step navigation with swipe
```
Given I am on the mobile step classification view for assessment "ASM-001"
And I am viewing step 5 of 20
When I swipe left on the step card
Then I navigate to step 6
And when I swipe right on step 6
Then I navigate back to step 5
And the step progress bar updates accordingly
```

### AC-27.9: Rate limiting
```
Given I am making API requests to /api/assessments
When I exceed 100 requests within 60 seconds
Then the 101st request returns HTTP 429
And the response includes a Retry-After header
And subsequent requests are blocked until the window resets
```

### AC-27.10: Security headers
```
Given I make any request to the Aptus application
When I inspect the response headers
Then Content-Security-Policy is present and restrictive
And X-Frame-Options is set to DENY
And Strict-Transport-Security is set with max-age >= 63072000
And X-Content-Type-Options is set to nosniff
```

### AC-27.11: Health endpoint
```
Given I am a platform_admin
When I request GET /api/health
Then the response includes database connectivity status with latency
And the overall status reflects the worst component status
And non-admin users receive 403 Forbidden
```

### AC-27.12: Lighthouse performance
```
Given I run a Lighthouse audit against the production dashboard page
With 4G throttling enabled
Then the Performance score is > 90
And the Accessibility score is > 95
And the Best Practices score is > 95
```

## 15. Size Estimate

| Category | Estimate |
|---|---|
| **T-shirt size** | **XL** |
| Schema changes (3 new tables) | 0.5 day |
| Service worker + PWA manifest | 2 days |
| Offline sync queue (client + server) | 3 days |
| Conflict detection + resolution UI | 2 days |
| Push notification integration | 1.5 days |
| Responsive audit + breakpoint refactor | 4 days |
| Mobile navigation (bottom tabs, swipe) | 2 days |
| Security headers + rate limiting | 1.5 days |
| Sentry integration + structured logging | 1 day |
| Performance optimization + Lighthouse | 2 days |
| Database index optimization | 1 day |
| Health endpoint + monitoring | 0.5 day |
| Tests (unit + integration + e2e) | 3 days |
| **Total** | **~24 days (5 weeks)** |

## 16. Phase Completion Checklist

- [ ] Prisma migration creates `OfflineSyncQueue`, `PushSubscription`, `PerformanceBaseline` tables
- [ ] Web App Manifest (`manifest.json`) with correct icons, theme, and start URL
- [ ] Service worker registers on first visit and precaches app shell
- [ ] App shell loads from cache when offline
- [ ] Offline indicator banner appears when network is lost
- [ ] Step classifications queue to IndexedDB when offline
- [ ] `POST /api/sync` processes offline queue with conflict detection
- [ ] Conflict resolution dialog appears for conflicting sync items
- [ ] Automatic sync triggers within 5 seconds of reconnection
- [ ] `POST /api/push/subscribe` and `DELETE /api/push/subscribe` manage push subscriptions
- [ ] Push notifications delivered via Web Push API
- [ ] Desktop layout (1024px+) renders full sidebar and multi-column content
- [ ] Tablet layout (768-1023px) renders collapsible sidebar and single-column content
- [ ] Mobile layout (320-767px) renders bottom tab bar and card-based content
- [ ] All touch targets are at least 44x44px on mobile
- [ ] Swipe navigation works for step classification on mobile
- [ ] Security headers (CSP, HSTS, X-Frame-Options, etc.) present on all responses
- [ ] Rate limiting active on API (100/60s), auth (10/60s), report (5/60s), sync (20/60s)
- [ ] Sentry error tracking integrated and capturing unhandled exceptions
- [ ] `GET /api/health` returns database and service status
- [ ] `POST /api/performance/report` accepts Core Web Vitals data
- [ ] Lighthouse Performance > 90, Accessibility > 95, Best Practices > 95
- [ ] LCP < 2.5s, CLS < 0.1, INP < 200ms on 75th percentile
- [ ] Total JavaScript bundle < 250KB gzip on initial load
- [ ] Database indexes optimized based on query analysis
- [ ] PWA install prompt appears on supported browsers
- [ ] Seed data includes performance baselines for key routes
- [ ] Unit tests pass for offline queue, conflict detection, rate limiting, and responsive breakpoints
- [ ] Integration tests pass for sync, push subscription, and health endpoints
- [ ] E2E tests pass for offline flow, mobile layout, and swipe navigation

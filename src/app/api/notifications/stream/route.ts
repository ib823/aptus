/** GET: SSE endpoint for real-time notifications */

import { type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

const POLL_INTERVAL_MS = 15_000; // Poll DB every 15 seconds
const HEARTBEAT_INTERVAL_MS = 45_000; // Send heartbeat every 45 seconds
const MAX_DURATION_MS = 5 * 60 * 1_000; // 5-minute max stream (Vercel-compatible)
const UNREAD_CACHE_TTL_MS = 30_000;

const CACHE_MAX_ENTRIES = 500;
const unreadCountCache = new Map<string, { count: number; fetchedAt: number }>();

async function getUnreadCount(userId: string, forceRefresh = false): Promise<number> {
  const now = Date.now();
  const cached = unreadCountCache.get(userId);
  if (!forceRefresh && cached && now - cached.fetchedAt < UNREAD_CACHE_TTL_MS) {
    return cached.count;
  }

  const count = await prisma.notification.count({
    where: { userId, status: "unread" },
  });

  // Bounded LRU: sweep stale entries first, then evict oldest if still at capacity
  if (unreadCountCache.size >= CACHE_MAX_ENTRIES) {
    for (const [key, entry] of unreadCountCache) {
      if (now - entry.fetchedAt > UNREAD_CACHE_TTL_MS) {
        unreadCountCache.delete(key);
      }
    }
    if (unreadCountCache.size >= CACHE_MAX_ENTRIES) {
      const firstKey = unreadCountCache.keys().next().value;
      if (firstKey !== undefined) unreadCountCache.delete(firstKey);
    }
  }
  unreadCountCache.set(userId, { count, fetchedAt: now });
  return count;
}

export async function GET(_request: NextRequest): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const userId = user.id;
  const startTime = Date.now();
  let lastCheckedAt = new Date();
  let lastSentCount = -1; // Track last sent count to avoid redundant events

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      function send(event: string, data: unknown) {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Stream closed by client — safe to ignore
        }
      }

      // Send initial connection event
      send("connected", { userId, timestamp: new Date().toISOString() });

      let heartbeatCounter = 0;
      let pollCounter = 0;
      const unreadRefreshCycles = Math.max(1, Math.ceil(UNREAD_CACHE_TTL_MS / POLL_INTERVAL_MS));

      const interval = setInterval(async () => {
        // Check max duration
        if (Date.now() - startTime > MAX_DURATION_MS) {
          send("reconnect", { reason: "max_duration" });
          clearInterval(interval);
          controller.close();
          return;
        }

        heartbeatCounter++;
        pollCounter++;

        // Send heartbeat every ~30s
        if (heartbeatCounter % Math.ceil(HEARTBEAT_INTERVAL_MS / POLL_INTERVAL_MS) === 0) {
          send("heartbeat", { timestamp: new Date().toISOString() });
        }

        // Poll for new notifications; refresh unread counts less frequently.
        try {
          const newNotifications = await prisma.notification.findMany({
            where: {
              userId,
              status: "unread",
              sentAt: { gt: lastCheckedAt },
            },
            orderBy: { sentAt: "desc" },
            take: 10,
          });

          if (newNotifications.length > 0) {
            send("notifications", newNotifications);
            lastCheckedAt = newNotifications[0]?.sentAt ?? new Date();
          }

          const shouldRefreshCount =
            newNotifications.length > 0 || pollCounter % unreadRefreshCycles === 0;
          const count = shouldRefreshCount
            ? await getUnreadCount(userId, newNotifications.length > 0)
            : lastSentCount;

          // Send unread_count only when it changes
          if (count !== lastSentCount) {
            send("unread_count", { count });
            lastSentCount = count;
          }
        } catch (err) {
          console.error("[NotificationStream] DB poll error, skipping cycle:", err);
        }
      }, POLL_INTERVAL_MS);

      // Cleanup when stream is cancelled
      _request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          // Stream closed by client — safe to ignore
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

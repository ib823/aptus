/** GET: SSE endpoint for real-time notifications */

import { type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

const POLL_INTERVAL_MS = 3_000; // Poll DB every 3 seconds
const HEARTBEAT_INTERVAL_MS = 30_000; // Send heartbeat every 30 seconds
const MAX_DURATION_MS = 5 * 60 * 1_000; // 5-minute max stream (Vercel-compatible)

export async function GET(_request: NextRequest): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const userId = user.id;
  const startTime = Date.now();
  let lastCheckedAt = new Date();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      function send(event: string, data: unknown) {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Stream closed
        }
      }

      // Send initial connection event
      send("connected", { userId, timestamp: new Date().toISOString() });

      let heartbeatCounter = 0;

      const interval = setInterval(async () => {
        // Check max duration
        if (Date.now() - startTime > MAX_DURATION_MS) {
          send("reconnect", { reason: "max_duration" });
          clearInterval(interval);
          controller.close();
          return;
        }

        heartbeatCounter++;

        // Send heartbeat every ~30s (10 poll cycles)
        if (heartbeatCounter % Math.ceil(HEARTBEAT_INTERVAL_MS / POLL_INTERVAL_MS) === 0) {
          send("heartbeat", { timestamp: new Date().toISOString() });
        }

        // Poll for new notifications
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
            lastCheckedAt = new Date();
          }

          // Also send updated unread count
          const count = await prisma.notification.count({
            where: { userId, status: "unread" },
          });
          send("unread_count", { count });
        } catch {
          // DB error — skip this cycle
        }
      }, POLL_INTERVAL_MS);

      // Cleanup when stream is cancelled
      _request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

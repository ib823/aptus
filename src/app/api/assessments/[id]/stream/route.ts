import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id: assessmentId } = await params;

  let lastChecked = new Date();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      
      const sendEvent = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // ignore closed streams
        }
      };

      sendEvent("connected", { status: "connected", assessmentId });

      const intervalId = setInterval(async () => {
        try {
          const newComments = await prisma.comment.findMany({
            where: {
              assessmentId,
              createdAt: { gt: lastChecked }
            },
            select: { id: true, targetType: true, targetId: true, authorId: true, status: true },
          });

          const newLocks = await prisma.editingLock.findMany({
            where: {
              assessmentId,
              acquiredAt: { gt: lastChecked }
            },
            select: { id: true, entityType: true, entityId: true, lockedById: true },
          });

          const now = new Date();

          if (newComments.length > 0) {
            sendEvent("comments_updated", { count: newComments.length, comments: newComments });
          }

          if (newLocks.length > 0) {
            sendEvent("locks_updated", { count: newLocks.length });
          }

          // General ping
          sendEvent("ping", { time: Date.now() });

          lastChecked = now;
        } catch {
          // Ignore
        }
      }, 5000);

      req.signal.addEventListener("abort", () => {
        clearInterval(intervalId);
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
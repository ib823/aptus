import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ConversationPageProps {
  params: Promise<{ id: string }>;
}

export default async function ConversationPage({ params }: ConversationPageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id: assessmentId } = await params;

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, deletedAt: null },
    select: { id: true, status: true },
  });

  if (!assessment) notFound();

  const sessions = await prisma.conversationSession.findMany({
    where: { assessmentId, userId: user.id },
    orderBy: { startedAt: "desc" },
  });

  // Look up scope item names for display
  const scopeItemIds = [...new Set(sessions.map((s) => s.scopeItemId))];
  const scopeItems = scopeItemIds.length > 0
    ? await prisma.scopeItem.findMany({
        where: { id: { in: scopeItemIds } },
        select: { id: true, name: true, functionalArea: true },
      })
    : [];
  const scopeMap = new Map(scopeItems.map((s) => [s.id, s]));

  return (
    <div>
      <PageHeader
        title="Conversation Mode"
        description="Guided Q&A sessions for scope item classification. Start a conversation from any scope item in Review."
      />

      {sessions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">No conversations yet</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              Start a conversation by toggling Conversation Mode on any scope item
              during the Review phase.
            </p>
            <Link
              href={`/assessment/${assessmentId}/review`}
              className="inline-flex items-center gap-1.5 mt-4 text-sm font-medium text-primary hover:underline"
            >
              Go to Review <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {sessions.map((session) => {
            const scopeItem = scopeMap.get(session.scopeItemId);
            const isComplete = session.status === "completed";
            return (
              <Link
                key={session.id}
                href={`/assessment/${assessmentId}/review?scopeItem=${session.scopeItemId}&mode=conversation`}
              >
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base">
                        {scopeItem?.name ?? session.scopeItemId}
                      </CardTitle>
                      <Badge variant={isComplete ? "default" : "secondary"}>
                        {isComplete ? "Complete" : "In Progress"}
                      </Badge>
                    </div>
                    {scopeItem?.functionalArea && (
                      <p className="text-sm text-muted-foreground">{scopeItem.functionalArea}</p>
                    )}
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-xs text-muted-foreground">
                      Started {formatDistanceToNow(session.startedAt, { addSuffix: true })}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

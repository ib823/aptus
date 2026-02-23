import { ActivityFeed } from "@/components/collaboration/ActivityFeed";

interface ActivityPageProps {
  params: Promise<{ id: string }>;
}

export default async function ActivityPage({ params }: ActivityPageProps) {
  const { id: assessmentId } = await params;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">Activity Feed</h1>
      <div className="bg-card rounded-lg border min-h-[400px]">
        <ActivityFeed assessmentId={assessmentId} />
      </div>
    </div>
  );
}

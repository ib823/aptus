import { SnapshotsClient } from "@/components/signoff/SnapshotsClient";

interface SnapshotsPageProps {
  params: Promise<{ id: string }>;
}

export default async function SnapshotsPage({ params }: SnapshotsPageProps) {
  const { id } = await params;
  return <SnapshotsClient assessmentId={id} />;
}

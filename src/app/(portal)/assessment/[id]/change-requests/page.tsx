import { ChangeRequestsClient } from "@/components/lifecycle/ChangeRequestsClient";

interface ChangeRequestsPageProps {
  params: Promise<{ id: string }>;
}

export default async function ChangeRequestsPage({ params }: ChangeRequestsPageProps) {
  const { id } = await params;
  return <ChangeRequestsClient assessmentId={id} />;
}

import { TriggersClient } from "@/components/lifecycle/TriggersClient";

interface TriggersPageProps {
  params: Promise<{ id: string }>;
}

export default async function TriggersPage({ params }: TriggersPageProps) {
  const { id } = await params;
  return <TriggersClient assessmentId={id} />;
}

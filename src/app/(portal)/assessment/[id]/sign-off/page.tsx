import { SignOffDashboardClient } from "@/components/signoff/SignOffDashboardClient";

interface SignOffPageProps {
  params: Promise<{ id: string }>;
}

export default async function SignOffPage({ params }: SignOffPageProps) {
  const { id } = await params;
  return <SignOffDashboardClient assessmentId={id} />;
}

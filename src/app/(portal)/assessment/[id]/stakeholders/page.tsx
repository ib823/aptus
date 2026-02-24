import { redirect } from "next/navigation";

interface StakeholdersPageProps {
  params: Promise<{ id: string }>;
}

export default async function StakeholdersPage({
  params,
}: StakeholdersPageProps) {
  const { id } = await params;
  redirect(`/assessment/${id}/overview`);
}

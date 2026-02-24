import { redirect } from "next/navigation";

interface ReviewScopeItemPageProps {
  params: Promise<{ id: string }>;
}

export default async function ReviewScopeItemPage({
  params,
}: ReviewScopeItemPageProps) {
  const { id } = await params;
  redirect(`/assessment/${id}/review`);
}

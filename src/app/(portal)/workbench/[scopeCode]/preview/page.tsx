import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { mapLegacyRole } from "@/lib/auth/role-migration";
import { PreviewClient } from "@/components/fts/PreviewClient";
import { getScopeItem, scopeCodes } from "@/lib/fts/data";

interface PageProps {
  params: Promise<{ scopeCode: string }>;
}

const ALLOWED_ROLES = new Set([
  "consultant",
  "partner_lead",
  "platform_admin",
  "executive_sponsor",
  "project_manager",
]);

export async function generateStaticParams() {
  return scopeCodes.map((scopeCode) => ({ scopeCode }));
}

export async function generateMetadata({ params }: PageProps) {
  const { scopeCode } = await params;
  const scope = getScopeItem(decodeURIComponent(scopeCode));
  if (!scope) return { title: "Scope item not found — Aptus" };
  return {
    title: `${scope.code} ${scope.title} — Phase 1 Preview`,
    description: `Stakeholder preview for ${scope.title} (${scope.code}).`,
  };
}

export default async function PreviewPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!ALLOWED_ROLES.has(mapLegacyRole(user.role))) redirect("/dashboard");

  const { scopeCode } = await params;
  const scope = getScopeItem(decodeURIComponent(scopeCode));
  if (!scope) notFound();

  const isAuthor = mapLegacyRole(user.role) !== "project_manager";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="bg-slate-900 text-slate-200 text-xs print:hidden">
        <div className="max-w-6xl mx-auto px-6 py-2 flex items-center justify-between">
          {isAuthor ? (
            <Link
              href={`/workbench/${encodeURIComponent(scope.code)}`}
              className="hover:text-white"
            >
              ← Workbench
            </Link>
          ) : (
            <Link href="/workbench" className="hover:text-white">
              ← All previews
            </Link>
          )}
          <Link href="/workbench" className="hover:text-white">
            All workbenches
          </Link>
        </div>
      </div>
      <PreviewClient scope={scope} />
    </div>
  );
}

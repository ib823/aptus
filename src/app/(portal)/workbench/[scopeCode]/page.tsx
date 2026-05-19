import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { mapLegacyRole } from "@/lib/auth/role-migration";
import { WorkbenchClient } from "@/components/fts/WorkbenchClient";
import { getScopeItem, scopeCodes } from "@/lib/fts/data";

interface PageProps {
  params: Promise<{ scopeCode: string }>;
}

const AUTHOR_ROLES = new Set([
  "consultant",
  "partner_lead",
  "platform_admin",
  "executive_sponsor",
]);

const READ_ONLY_ROLES = new Set(["project_manager"]);

/**
 * Pre-render every known scope item at build time so navigation is instant
 * and we don't pay runtime cost on each visit. New scope items appear after
 * running emit_ts.py and redeploying.
 */
export async function generateStaticParams() {
  return scopeCodes.map((scopeCode) => ({ scopeCode }));
}

/** Per-page metadata derived from the loaded scope item. */
export async function generateMetadata({ params }: PageProps) {
  const { scopeCode } = await params;
  const scope = getScopeItem(decodeURIComponent(scopeCode));
  if (!scope) return { title: "Scope item not found — Aptus" };
  return {
    title: `${scope.code} ${scope.title} — Workbench`,
    description: scope.overview.slice(0, 160),
  };
}

export default async function WorkbenchPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const role = mapLegacyRole(user.role);
  const { scopeCode } = await params;
  const decodedCode = decodeURIComponent(scopeCode);

  // Read-only roles bounce to the preview rather than the interactive surface;
  // anyone outside both groups goes back to the dashboard.
  if (READ_ONLY_ROLES.has(role)) {
    redirect(`/workbench/${encodeURIComponent(decodedCode)}/preview`);
  }
  if (!AUTHOR_ROLES.has(role)) {
    redirect("/dashboard");
  }

  const scope = getScopeItem(decodedCode);
  if (!scope) notFound();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="bg-slate-900 text-slate-200 text-xs">
        <div className="max-w-6xl mx-auto px-6 py-2 flex items-center justify-between">
          <Link href="/workbench" className="hover:text-white">
            ← All workbenches
          </Link>
          <Link
            href={`/workbench/${encodeURIComponent(scope.code)}/preview`}
            className="hover:text-white"
          >
            Phase 1 stakeholder preview →
          </Link>
        </div>
      </div>
      <WorkbenchClient scope={scope} initialPreparerName={user.name ?? ""} />
    </div>
  );
}

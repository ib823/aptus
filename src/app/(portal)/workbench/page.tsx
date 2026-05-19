import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { mapLegacyRole } from "@/lib/auth/role-migration";
import { scopeItems } from "@/lib/fts/data";

export const metadata = {
  title: "Fit-to-Standard Workbench — Aptus",
  description:
    "Pre-onboarding workbench for SAP S/4HANA Cloud Public Edition scope items.",
};

const AUTHOR_ROLES = new Set([
  "consultant",
  "partner_lead",
  "platform_admin",
  "executive_sponsor",
]);

const READ_ONLY_ROLES = new Set(["project_manager"]);

/**
 * Workbench index — lists every scope item with curated Tier-1 decisions.
 *
 * Visibility:
 *   - Author roles (consultant/partner_lead/platform_admin/executive_sponsor):
 *     each card links to the interactive workbench.
 *   - Read-only roles (project_manager): each card links to the printable
 *     stakeholder preview instead.
 *   - Everyone else: redirected back to /dashboard.
 */
export default async function WorkbenchIndexPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const role = mapLegacyRole(user.role);
  const isAuthor = AUTHOR_ROLES.has(role);
  const isReadOnly = READ_ONLY_ROLES.has(role);
  if (!isAuthor && !isReadOnly) redirect("/dashboard");

  const items = Object.values(scopeItems).sort((a, b) =>
    a.code.localeCompare(b.code),
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="text-xs font-mono text-slate-500 uppercase tracking-wide">
            Aptus · Fit-to-Standard
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">
            Pre-onboarding workbenches
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            {isAuthor
              ? "Pick a scope item to run the executive-sponsor decision walkthrough. Each workbench takes 30–45 minutes and produces a signed baseline plus the Explore-phase backlog."
              : "Pick a scope item to view the stakeholder preview — a printable, read-only summary of the process and the decisions your team will make."}
          </p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => {
            const href = isAuthor
              ? `/workbench/${encodeURIComponent(item.code)}`
              : `/workbench/${encodeURIComponent(item.code)}/preview`;
            return (
              <Link
                key={item.code}
                href={href}
                className="block bg-white rounded-xl border border-slate-200 p-5 hover:border-slate-400 hover:shadow-sm transition"
              >
                <div className="flex items-baseline justify-between mb-2">
                  <span className="font-mono text-xs font-semibold text-slate-500">
                    {item.code}
                  </span>
                  <span className="text-xs text-slate-400">
                    {item.decisions.length} decisions
                  </span>
                </div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {item.title}
                </h2>
                <p className="text-sm text-slate-600 mt-2 line-clamp-3">
                  {item.overview}
                </p>
                <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
                  <span>{item.process_steps.length} steps</span>
                  <span>·</span>
                  <span>{item.business_roles[0]?.name ?? "TBD"}</span>
                </div>
              </Link>
            );
          })}
        </div>

        {items.length === 0 && (
          <div className="text-center text-slate-500 py-12">
            No scope items yet. Run{" "}
            <code className="font-mono">python scripts/emit_ts.py --all</code>{" "}
            to generate the data modules.
          </div>
        )}
      </main>
    </div>
  );
}
